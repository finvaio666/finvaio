# 软删除(soft delete)设计 — Supabase 写路径

- 日期:2026-07-17
- 分支:`feature-switch-to-supabase`
- 关联:MIGRATION.md Phase 2.11(写路径)、§6(回滚)、§7(备份)

## 1. 背景与问题

Notion 时代删除是 `archived: true` —— **软删、可恢复**(回收站 + 版本历史)。
Phase 2.11 迁移的 Supabase 写路径全部实现为 Postgres 硬 `DELETE`:

| repo | 硬删位置 |
|---|---|
| `lib/repos/portfolio.ts` | `deleteHolding` |
| `lib/repos/insurance.ts` | `deletePolicy` |
| `lib/repos/assets.ts` | `deleteAsset`、`replaceAssetEntries`(清旧 marker 行) |
| `lib/repos/cashflow.ts` | `deleteCashflow` |
| `lib/repos/tasks.ts` | `deleteTask` |
| `lib/repos/formsLibrary.ts` | `deleteForm` |

**即:迁移把删除语义从"软"退化成了"硬"。** 叠加两个事实,风险被放大:

1. Supabase free tier 无 PITR / 无自动备份(Pro 才有);
2. cutover 后 Notion 被冻结(直切架构无 mirror),**不是活备份**。

→ 目标:把删除改回可恢复,同时保持 Notion 路径逐字不变。

**非目标:** 本设计**不替代 pg_dump 备份**(§7)。两者互补:
- 软删除挡「在 App 里手滑删了一条」→ 秒级恢复;
- pg_dump 挡 `DROP TABLE` / 迁移改坏 / 裸 SQL 硬删 / 库损坏 / 账号丢失。

## 2. 已定决策

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 范围 | **全部 6 张有删除入口的表**(portfolio / insurance / assets / cashflow / tasks / forms)。语义统一,不用记「哪张表删了能救」。`clients` / `meeting_notes` / `ai_usage_log` / `insurance_plans` / `funds` **本就无删除入口**,不涉及。 |
| 2 | 「替换」类流程旧行 | **也软删**。`replaceAssetEntries`(净值表重存)被顶掉的旧行软删 —— 防住「重存表单把好数据冲掉」这个比误点删除更常见的丢数场景,顺带白送一份净值提交历史。 |
| 3 | 恢复入口 | **只靠 SQL + 文档片段**(YAGNI)。恢复是低频操作,不先建 UI/CLI。 |
| 4 | 清理策略 | **不清理**。整库 12MB / 上限 500MB,死行几乎不花钱;「永久保留」本身即特性。真逼近上限再加,届时有 pg_dump 兜底。 |
| 5 | reconcile 脚本 | **不改**,只写文档。理由见 §7。 |

**实现路线**(3 选 1 已定):**A — `deleted_at` 列 + 每处读显式过滤**。
- ~~B. Postgres VIEW(基表改名 + 同名 view 过滤)~~:读已收敛在 6 个 repo,再上 view 是给很小的面加重机制;且要给准生产表改名、写入走双轨、reconcile/测试全按表名硬编码 → **过度设计**。
- ~~C. repo 层共享 `liveQuery()` 助手~~:各表读差异大(列/排序/分页/advisor scope),硬套抽象反而绕。
- ~~D. RLS 策略~~:**不可行** —— App 用 service_role key,天然绕过 RLS。

真正防「漏加过滤」的不是抽象层,是 **§6 的回归测试**。

## 3. Schema

单个 migration:`db/migrations/2026-07-17-soft-delete-add-deleted-at.sql`

```sql
alter table portfolio_holdings  add column if not exists deleted_at timestamptz;
alter table insurance_policies  add column if not exists deleted_at timestamptz;
alter table assets_liabilities  add column if not exists deleted_at timestamptz;
alter table cashflow_planner    add column if not exists deleted_at timestamptz;
alter table tasks               add column if not exists deleted_at timestamptz;
alter table forms_library       add column if not exists deleted_at timestamptz;
```

- 语义:`null` = 在用;有值 = 已删 + 删除时刻。
- 可空、无默认、**纯增量** → 不改变任何现有行为(生产仍读 Notion)。
- **不加索引**(12MB 数据,YAGNI)。**不加 `deleted_by`**(单人团队,YAGNI)。
- 回滚:`alter table <t> drop column if exists deleted_at;`

## 4. Repo 改动地图

统一写法:
- 软删:`.update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null)`
- 读过滤:`.is('deleted_at', null)`

| repo | 加 `.is('deleted_at', null)`(读 + 更新) | 删除改写 |
|---|---|---|
| `assets.ts` | `listAssets`、`assertOwner`、`updateAsset` | `deleteAsset` → soft;`replaceAssetEntries` 清旧行 → soft |
| `cashflow.ts` | `listCashflow`、`assertOwner`、**`upsertCashflow` 查重** | `deleteCashflow` → soft |
| `insurance.ts` | `listPolicies`、`assertOwner`、`updatePolicy` | `deletePolicy` → soft |
| `portfolio.ts` | `listHoldings`(分页)、`assertOwner`、`setHoldingValue`、`updateHolding` | `deleteHolding` → soft |
| `tasks.ts` | `listTasks`、`setTaskStatus` | `deleteTask` → soft |
| `formsLibrary.ts` | `listForms`、`getForm`、`updateForm` | `deleteForm` → soft |

> 注:`deleteTask` 现状**无 ownership 检查**(与其余表不同)。属既有行为,本次不改动 —— 只把硬删换成软删。

**为什么 `updateX` 也要过滤:** `assertOwner` 对 **Admin 直接放行**,不加这层 Admin 就能编辑到已删行。已删行 = 不可编辑。

**聚合自动继承(chokepoint 红利):** sync-aum 汇总 AUM、update-nav 基金面板、forms prefill 的保单/持仓 join 都调 `listHoldings` / `listPolicies` → **过滤一次全覆盖,无需单独改**。

## 5. 三个必须点名的坑

1. **`upsertCashflow` 查重(最危险)**
   它按 `(entry, advisor)` 找现有行。若不排除软删行:用户删掉某月现金流 → 再提交同月 → 命中那条**已删**行做 update → 行仍是已删 → **新提交凭空消失**。必须过滤。

2. **`replaceAssetEntries` 清旧范围**
   需加 `.is('deleted_at', null)`,否则重复「删已删行」会把 `deleted_at` 刷成新时刻,丢失原始删除时间。

3. **`forms.active` ≠ `deleted_at`**
   `active=false` = 下架(FA 看不到,Admin 仍可见/可切回);`deleted_at` = 删除。两者并存、互不干扰。`listForms({activeOnly})` 是 FA 过滤,软删过滤对 FA 与 Admin 两个列表都生效。

## 6. Notion 路径 & flag

Notion 分支**一行不动**(仍 `archived: true`)。软删只在 Supabase 分支生效,照旧受各表 `DATA_SOURCE_*` 门控。

副作用(正面):两路径语义**更接近** —— Notion archive ≈ Supabase soft delete,把「迁移把软删退化成硬删」的回退修回来。

## 7. reconcile 脚本(不改的理由)

9 个 `scripts/reconcile-*.ts` 走裸 SQL,其「孤儿检测」(Supabase 有、Notion 无 → 硬删)不与软删冲突:

- reconcile 是 **cutover 前**工具(Notion 权威 → 灌 Supabase)。那时各表 flag 仍为 `notion`,App 根本不往 Supabase 写 → **不存在软删行**。
- cutover 后脚本本身拒绝 `--apply`。
- 且在 cutover 前那个阶段,「孤儿硬删」是**正确的**(清陈旧种子行);改成软删反而留垃圾。

**已知残留风险(接受):** 该防呆只读本地 `.env.local`(MIGRATION.md 已标注此弱点)。若有人在 cutover 后硬跑 `--apply`,可能把软删行的数据用 Notion 旧值覆盖回去(行仍保持已删)。属低概率 + 后果有限,记录在案不额外加防御。

**另一处已知交互:** `cashflow_planner.notion_id` 有唯一约束。软删行仍占用该 `notion_id`,若 reconcile 重插同 `notion_id` 会撞唯一约束 —— 同样只在「cutover 后误跑」时可能发生,不额外处理。

## 8. 测试(防「漏加过滤」的真正兜底)

沿用 Phase 2.11 的 repo 级平滑测试套路:**打真库、自清、跑完行数还原**。

**每张表通用三连:**
1. 建行 → 软删 → 断言**所有 `list*` / `get*` 都看不见**;
2. 断言行**仍在库里**且 `deleted_at` 有值;
3. 清 `deleted_at` → **重新可见**(即验证 §9 恢复路径真的可用)。

**专项:**
- **cashflow**:软删后 upsert 同 `(entry, advisor)` → 必须**新建一行**(新 id),不是复活/更新旧行 → 覆盖 §5.1 的坑。
- **assets**:重存 → 旧 marker 行带 `deleted_at`、新集在用、`listAssets` 只见新集 → 覆盖 §5.2。
- **portfolio**:软删一条持仓 → `listHoldings` 汇总金额**不含它** → 验聚合继承(§4)。
- **forms**:软删 → `getForm` 返回 null(→ fill 走 404);且 `active` 与 `deleted_at` 互不干扰 → 覆盖 §5.3。
- **Admin 越权**:Admin 对已删行执行 `updateX` → 不生效(§4)。

**通过标准:** 全部断言绿 + `tsc --noEmit` 全绿 + 各表行数还原(0 残留)。

## 9. 恢复(SQL 片段,写进 MIGRATION.md)

```sql
-- 看某表最近删的 20 条
select id, deleted_at, *
from insurance_policies
where deleted_at is not null
order by deleted_at desc
limit 20;

-- 恢复某行
update insurance_policies set deleted_at = null where id = '<uuid>';
```
(把 `insurance_policies` 换成目标表即可;6 张表用法一致。)

## 10. 落地节奏

| commit | 内容 |
|---|---|
| 1 | migration(6 列)—— 纯增量,无行为变化 |
| 2 | 6 个 repo 改动 + 测试 + MIGRATION.md(§9 恢复片段 + §7 reconcile 说明) |

reconcile 9 脚本:**不改**。

## 11. 验收标准

- [ ] 6 张表均有 `deleted_at`,migration 已应用
- [ ] 6 处删除全部改为软删;`replaceAssetEntries` 清旧行改为软删
- [ ] §4 表格列出的所有读/更新点均已加 `.is('deleted_at', null)`
- [ ] §8 全部测试通过,含 cashflow / assets / portfolio / forms 四项专项
- [ ] Notion 分支逐字未改
- [ ] `tsc --noEmit` 全绿
- [ ] MIGRATION.md 含恢复片段 + reconcile 交互说明
