# MIGRATION — Notion → Supabase (Postgres)

> 目标：把当前用 Notion 当数据库的架构，逐张表迁到 Supabase（纯 Postgres）。
> 原则：**绞杀者模式**，一张表一张表迁，迁一张测一张，Notion 保留做后备直到验证通过。
> 状态图例：⬜ 未开始 · 🟨 进行中 · ✅ 已测通 · ⏸ 暂停

最后更新：2026-07-09

---

## 0. 已锁定的决策

| 决策 | 结论 |
|---|---|
| 查询层 | **supabase-js**（server-side，service_role key） |
| 认证 | **保留现有 JWT**（jose）；Supabase 只当纯 Postgres，不用 Supabase Auth |
| 多租户 | `advisor_id` 列 + 服务端手动过滤（沿用现有 `advisorFilter()` 逻辑）；RLS 暂不上，留待第二阶段 |
| 迁移策略 | 绞杀者模式，表级切换，env 开关控制走 Notion 还是 Supabase，可回滚 |
| 清理 | Phase 4 **不删** Notion 代码，改为注释掉 + 登记到 `NOTION_CLEANUP.md`，稳定后再清 |

---

## 0.5 工作守则（每一步都必须遵守）

> 这两条优先级最高，凌驾于「快点做完」之上。

1. **每完成一个重大改动 + 测试通过后 → 提醒 Commit。**
   - 由 Claude 在测通后主动提醒「现在可以 commit 了」，附上建议的 commit message。
   - 每个 Phase / 每张表切换都是一个独立 commit，粒度小、可回滚。
   - 遇到问题时可以直接 `git revert` / 回到上一个 commit，绝不在没提交的状态下堆积多个改动。

2. **不碰现有逻辑。**
   - 迁移一律用「新增」方式：新建 `lib/repos/*`、新 schema、用 `DATA_SOURCE_*` env 开关切换，旧的 Notion 路径原样保留。
   - **如果某个改动不得不动到现有逻辑** → 先停下，把「哪里必须改、为什么、影响什么」讲清楚，通知你，由你拍板后才动。绝不擅自改现有行为。

---

## 1. 命名与 schema 约定

- 表名、列名一律 **snake_case**（Notion 里带空格/emoji 的属性名一律清洗，如 `Value (MYR)` → `value_myr`，`👥 Clients` → `client_id`）。
- 每张业务表都带：
  - `id uuid primary key default gen_random_uuid()`
  - `advisor_id uuid not null references advisors(id)` （多租户隔离键）
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Notion 的 relation → Postgres 外键（`references`）。
- Notion 的 select → 直接存 text（如需约束再加 CHECK 或 enum）。
- 迁移期每张业务表额外保留 `notion_page_id text unique`，用于数据搬迁时对账 + 关系映射，稳定后可删（登记在 NOTION_CLEANUP.md）。

### 环境变量（新增）
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# 迁移开关：每张表用一个 flag 控制走哪边（示例）
DATA_SOURCE_TASKS=notion        # notion | supabase
DATA_SOURCE_CLIENTS=notion
# ...
```

---

## 2. 分阶段进度

### Phase 0 — 地基（不改任何行为）  ✅ 完成 2026-07-07
- [x] 建 Supabase 项目（region `ap-northeast-1` 东京），连接串进 `.env.local`（`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`）
- [x] 装 `@supabase/supabase-js`
- [x] `lib/supabase.ts`：导出 server-side 单例 client（service_role，`persistSession:false`）
- [x] 定 migration 目录 → **`db/schema.sql`**（单文件手动跑，暂不引入 Supabase CLI；Phase 1 建 `tasks` 时正式启用）
- [x] 冒烟测试：连通验证通过（PGRST205 探针 = 成功到达 PostgREST）
- ✅ 通过标准：本地能连、能查 —— **已达成**
- 💾 测通后 → 提醒 Commit（`chore: add supabase client + connection`）

### Phase 1 — 试点表 Tasks  🟩 代码测通 + Preview 验证通过（生产 cutover 并入末尾统一切换）
- [x] `tasks` 表（Supabase 预置已存在；type CHECK 已改 FA→Client，见 db/migrations/）
- [x] `lib/repos/tasks.ts`（数据访问层，封装 CRUD；直切模式，无 Notion mirror）
- [x] 用 env 开关切 tasks 相关路由到 Supabase（`DATA_SOURCE_TASKS`，现 = notion/off）
- [x] E2E 测通（scripts/e2e-tasks-http.ts，走完整 HTTP 栈）+ reconcile 对账 100% 同步（2026-07-08）
- [x] reconcile 加 post-cutover 防呆（2026-07-09）
- [x] **Preview 验证通过（supabase.finva.io，2026-07-12）**：该域名绑 `feature-switch-to-supabase` 分支，Vercel env 已配好（`SUPABASE_URL`/`SERVICE_ROLE_KEY`/`DATA_SOURCE_TASKS=supabase`/`AUTH_SECRET` 与本地一致）。只读探针：GET /api/tasks 200、23/23 全来自 Supabase。写路径 E2E 打线上部署栈全绿（建/读/标完成/删，type=Client、notion_id=null、self-clean 归零，0 残留）。
- [ ] 生产 cutover —— **不单独切**。按下方策略并入整个 migration 完成后的一次性 cutover（见 §5 顶部「切换策略」）。tasks 侧代码 + preview 已就绪，等其余表都 ready。
- ✅ 通过标准：UI 里 Task 增删改查行为与 Notion 一致
- 💾 测通后 → 提醒 Commit（`feat(migrate): tasks on supabase behind flag`）——已完成，commit 5dc82e7 / 4d66d7c / e1fb629 / 95009df

### Phase 2 — 业务表（按依赖顺序，逐个独立测）
> 顺序理由：被依赖的表（clients）先建，relation 才能转外键。

- [ ] 2.1 `clients` 🟨 — 被依赖方，先建
  - [x] `lib/clients.ts` 读抽象 + `lib/repos/clients.ts`(Supabase 层)+ `DATA_SOURCE_CLIENTS` flag(默认 off)
  - [x] 补 7 列(nric/epf/occupation/client_type/invested_capital/fame_accounts/fame_sync_date)
  - [x] `scripts/reconcile-clients.ts` 全量导入:285 条 Notion→Supabase(正确属性映射;空 select→null)
  - [x] **纯 clients 读路由全部转抽象层**:`admin/clients`、`email/client-alerts`、`admin/overview`、`notion?type=clients`。顺带修好既有 bug(phone/email 之前按 rich_text 读→空;现按 email/phone_number 正确类型)。
  - [ ] `getAdvisorConfig`:**非 clients 消费方**(只存 clientsDbId),不用转。
  - [ ] **跨表/写路由 → 随各自搭档表迁,不在 2.1 单转**(单转会造成 uuid vs Notion relation 对不上):
    - `ai` / `dashboard-assistant`:跨表读(client + portfolio/insurance,靠 Notion relation)→ 随 2.2/2.3
    - `sync-aum`:AUM 重算本身(读 portfolio 写 clients)→ 2.2 portfolio（即"AUM 回填"那步）
    - `update-nav`:NAV 写(portfolio+clients)→ 2.2
    - `meetings`:建 meeting_note + 回写 client review 日期 → 2.6 meetings（届时给抽象层加 write 方法）
  - [ ] AUM:portfolio(2.2)迁完后由 sync-aum 改写版 recalc 回填(现 265 条 aum=null)
  - ⚠️ 全部路由转完 + AUM 回填后才能纳入统一 cutover(id 语义随源切换)
- [ ] 2.2 `portfolio` 🟨 — 关联用 `client_notion_id`(= clients.notion_id),非 uuid FK
  - [x] `lib/portfolio.ts` 读抽象 + `lib/repos/portfolio.ts`(分页,过 PostgREST 1000 行上限)+ `DATA_SOURCE_PORTFOLIO` flag
  - [x] 补 4 列(geography/fame_account_no/fund_source/fame_sync_date;跳过公式列)
  - [x] `scripts/reconcile-portfolio.ts` 全量导入:1038 条(1019 insert + 19 update + 88 删陈旧种子;引用完整性满分)
  - [x] 转 `notion?type=portfolio`:clients+holdings **join on notion_id** → clientId 跨模式一致(解开跨表 id 难题)
  - [ ] 跨表路由(依赖 clients+portfolio 都在 Supabase):`ai`、`dashboard-assistant`、`sync-aum`(AUM 重算)、`update-nav`
  - [x] **AUM 回填完成**(`scripts/backfill-client-aum.ts`):从 portfolio_holdings 重算 240 个有持仓客户的 aum_myr(221 个补上 null);无持仓 45 个不动(TEO 保留 2M、44 个留 null)。clients.aum_myr 合计 9,550,350。
- [x] 2.3 `insurance` 🟩 — 关联用 `client_notion_id`
  - [x] schema 已完整(无需补列);CHECK insurance_type/status;benefits=text[]
  - [x] `scripts/reconcile-insurance.ts` 导入 81 条(24 insert + 57 update 修 client 键;全部 join 到客户)
  - [x] `lib/insurance.ts` 抽象 + `lib/repos/insurance.ts` + `DATA_SOURCE_INSURANCE` flag
  - [x] 转 `notion?type=insurance`(join clients 拿 name+income);两路径验证一致(sum assured 13,424,000)
  - 🔧 摸查时发现并修复:首次 clients 导入漏了 20 个真客户(名字后填),重跑 reconcile-clients → 305
- [x] 2.4 `assets` 🟩 — 净值 Assets & Liabilities（`client` 是名字串,非 relation）
  - [x] 种子已完全同步(Notion 8 = Supabase 8,0 diff — 无需导入)
  - [x] `lib/assets.ts` + `lib/repos/assets.ts` + `DATA_SOURCE_ASSETS` + `reconcile-assets.ts`
  - [x] 转 `notion?type=assets`;两路径验证一致(8 项,sum 3,450,000)
- [x] 2.5 `cashflow` ✅ — 读+写路径完成（决策点 C 已落，见 Phase 2.11）
  - [x] `lib/cashflow.ts` 抽象 + `lib/repos/cashflow.ts` + `DATA_SOURCE_CASHFLOW` flag + `reconcile-cashflow.ts`
  - [x] 转 `notion?type=cashflow`;surplus/savingsRate 代码算（Notion 是 formula）；两路径逐字段一致（2 条）
  - [x] 🔧 摸查发现:种子 2 行 `notion_id` 都带 3 字符垃圾前缀（35 字符 vs 干净 32）——唯一脏库表。行数据本身已同步；`reconcile-cashflow --apply` 已跑（insert 2 干净 + 删 2 脏孤儿），两 id 现为干净 32 字符、重跑 0/0/0 幂等（cashflow 无入向引用,churn 无害）
  - ⚠️ `breakdown`:老行读侧返回 null（Notion 老数据无 Notes JSON）；**决策点 C 已加 `breakdown jsonb` 列**，新写入会落 breakdown、`CashflowPage` 展开面板消费它
  - [x] **写路径完成**（POST /api/cashflow、DELETE、submit 表单）:**决策点 C 已落**——详见 Phase 2.11
- [x] 2.6 `meeting_notes` ✅ — 读+写路径完成（写详见 Phase 2.11）
  - [x] `lib/meetingNotes.ts` 抽象 + `lib/repos/meetingNotes.ts` + `DATA_SOURCE_MEETINGS` flag + `reconcile-meeting-notes.ts`
  - [x] 转 `meetings` GET;Notion 路径（queryAllPages + advisor scope + 空 option 守卫）验证等价旧内联；两路径 6=6 逐字段一致
  - [x] `reconcile-meeting-notes --apply` 已跑（insert 6 + 删 3 脏孤儿）→ 6 行干净、重跑 0/0/0 幂等
  - 🔧 摸查发现:① Notion 6 vs Supabase 3 = 3 条新 Annual Review 漂移（种子后新增）；② 旧 3 行 `notion_id` 带**长度不定 2 字符前缀**（`26/21/25`,34 字符,剥不了固定前缀）→ 按干净 id 重键规范化。meeting_notes 无入向引用（tasks 按 client|task 去重）,churn 安全
  - ⚠️ live 表**无 client 列**,`name`="Client — Type — Date";clientName 从标题拆、clientId 恒 ''（Notion 该 DB 也无 Client Name/relation 属性）。meeting_type CHECK 六值,selN 空→null
  - ⏭️ **跨表读延后到"整体转"**（ai / dashboard-assistant / tasks-sync 各自内联查 meeting → 届时点向 `listMeetings`；meeting_notes 是它们最后依赖的表，现已解锁）
  - [x] **写路径完成**（POST /api/meetings 建 note + 回写 client review 日期）:clientId 格式不兼容已化解——详见 Phase 2.11
- [x] 2.7 `products` ✅ — Insurance Plans + Funds 两张产品目录读+写完成（写详见 Phase 2.11；休眠功能）
  - 🔍 摸查:products 与前 6 张表**架构不同**——per-advisor + feature-gated,DB id 只从顾问 Notion 记录读（**无 env fallback**）,`addAdvisorSelectOption` 也不含它。**8 个顾问无人配置** Insurance Plans/Funds DB、无人开 `products` feature → 无源数据、读路由本就返回 []
  - [x] 建 `insurance_plans` + `funds` 两张**空表**（schema 由读路由输出 + POST save 形状完全确定）。File: `db/migrations/2026-07-14-create-products-tables.sql`（已应用）
  - [x] `lib/products.ts` 抽象（`listPlans`/`listFunds`,`DATA_SOURCE_PRODUCTS` flag）+ `lib/repos/products.ts`（`status='Active'` + advisor scope）
  - [x] 转 `notion?type=insurance-products` / `funds`;两路径均返回 []（parity）。顺手清掉 notion route 里因全分支抽象化而死掉的 `notion`/`Client`/`queryAllPages`
  - ⏭️ **无 reconcile**（无公司源 DB）——若将来有顾问启用 products,需按该顾问的 DB id 做一次性 per-advisor 导入
  - [x] **写完成**：POST /api/products（`action:save`；`extract` 纯 AI 不碰）——详见 Phase 2.11
- [x] 2.8 `ai_usage` 🟩 — 只写日志表（**首个写转换**）
  - 🔍 摸查:`ai_usage_log` 是**纯只写**——`logAiUsage()` 每次 AI 调用记一条,全 app **无任何读消费者**（3 处调用方都只写）。50 行 notion_id 全干净 32 字符
  - [x] **写转换**:`logAiUsage` 加 flag 门控 Supabase 分支（`DATA_SOURCE_AI_USAGE=supabase` 时写库,否则 Notion 原样,best-effort 不变）+ `lib/repos/aiUsage.ts insertUsage`。Supabase-native 行无 notion_id
  - [x] 写 E2E 验证:flag 开→落 Supabase(tokens/question 正确);flag 关→不落库;测试行已清理
  - [x] `scripts/reconcile-ai-usage.ts`（dry-run 显示 Notion 86 vs Supabase 50 = 36 条新用量漂移）
  - ⏭️ reconcile `--apply` **留到最终 cutover**:只写表的行会持续涨,中途导入必漂移;cutover 时一次导入 Notion 累积 + 翻写即可（现在导也行,preview 库会更全,但会再漂）
  - 💡 这确立了**写路径模式**:repo insert + `lib/*.ts` 里 flag 门控分支 + best-effort 保持
- [x] 2.9 `forms_library` 🟩 — 元数据/索引（PDF 本体在 Google Drive）
  - 🔍 摸查:公司共享表(有 `COMPANY_FORMS_DB_ID`,读无 advisor 过滤);**Notion 0 / Supabase 0**(功能已配置但无表单上传);`toFormRecord` 在 forms + admin 两路由**重复定义**
  - [x] `lib/formsLibrary.ts` 加 `listForms`/`getForm` chokepoint(`DATA_SOURCE_FORMS` flag)+ 合并共享 `toFormRecord` + `lib/repos/formsLibrary.ts`(field_mapping JSON 解析、tags text[])
  - [x] 转 3 个自身读:`forms` GET(FA list,Active 过滤,轻量子集)、`forms/[id]` GET(单表单,查 active)、`admin/forms-library` GET(全部+driveConnected)。两路径均 [](parity);清掉转换后死掉的 toFormRecord/rt/isFullPage
  - [x] `scripts/reconcile-forms-library.ts`(0/0 no-op,备好;form_type CHECK selN,tags multi_select→text[])
  - ⏭️ **延后**:`forms/[id]/prefill`(点查 form+client+insurance+portfolio,按 page-id → **归写路径**,详见 Phase 2.10)、`forms/[id]/fill`(Drive 下载 PDF)、admin 写(POST/PATCH/DELETE + Drive 上传)
- ✅ **Phase 2 数据表 9/9 全绿**(2.1–2.7 读+reconcile;2.8 写;2.9 读)——只剩跨表读整体转 + 写路径收尾
- ✅ 每张表通过标准：对应页面 CRUD 正常 + 多顾问隔离正确
- 💾 **每张表**测通后独立 Commit（如 `feat(migrate): portfolio on supabase`），再做下一张

### Phase 2.10 — 跨表读整体转  🟩 3/4 完成（prefill 归写路径）
> 所有依赖表(clients/portfolio/insurance/meeting_notes/tasks)都已有抽象层后，把多表联查的读路由一次性接到 chokepoint。不改组装/输出逻辑，只换数据源。
- [x] `tasks/sync`（`lib/tasks.ts syncTasksFromMeetings`）→ 读 meeting 改走 `listMeetings(config).slice(0,50)`（保留原 page_size:50「最近 50」语义）；clientName/actionItems/meetingDate 与 `MeetingNote` 字节一致
- [x] `ai`（`buildClientContext`）→ client/portfolio/insurance/meeting 全走 `listClients`/`listHoldings`/`listPolicies`/`listMeetings`；**join 改用源无关的 `clientNotionId`**
  - 🔬 **等价性已证**：审计线上数据 portfolio 1025 / insurance 1080 条**全部恰好关联 1 个 client**（0 多关联）→ 首个 relation == relation-contains，主 join 零行为差异；name-fallback 仅在主 join 返 0 时触发（数据 100% 已关联，实为死路径）；meeting 过滤(最近 10→取 5)、模糊 client 匹配、assembly 输出全保留
- [x] `dashboard-assistant` → clients(roster+profile)/portfolio(fund lookup)/meeting(fallback) 全走抽象；fund lookup 客户归属改 join `clientNotionId`
  - 🔬 **join 已验**：1025 holdings 100% resolve 到 client 名；client profile 读 `ClientRecord` 规范字段（原多 key 兜底 `AUM/Total AUM`、`Email Address` 等收敛到规范列——线上用的就是规范列，差异可忽略）
- ⏭️ **`forms/[id]/prefill` 归写路径**：它不是批量读而是**按 page-id 点查**（`notion.pages.retrieve(clientId/formId)`），带 Notion-page-id vs Supabase-uuid 的 id 模型耦合，且与 `forms/[id]/fill`(Drive) 同属一条填表流、forms 表当前为空——与 fill/写一起转更合理
- ⏭️ 写路径的跨表读（`sync-aum` AUM 重算、`update-nav`）→ 见 Phase 2.11

### Phase 2.11 — 写路径  ✅ 完成（9/9 + forms 收尾）
> 写模式（2.8 ai_usage 立的范本）：repo 写函数 + `lib/*.ts` 里 flag 门控分支（Notion 路径保持逐字一致）+ best-effort/错误语义保留。`id` 用 `listX().id`（源自适配：Notion page id 或 Supabase uuid）避免跨模型耦合。
- [x] `sync-aum`（重算 AUM 写回 clients）→ 读 `listHoldings` 汇总（join `clientNotionId`）+ 写 `setClientAum` chokepoint（`DATA_SOURCE_CLIENTS`）
  - 🔬 **已验**：求和 parity 240 clients 0 mismatch（新按 clientNotionId 汇总 == 旧按 relation.id）；Supabase 写平滑测试幂等写回 `aum_myr`（列+id 匹配，值不变）；Notion 写路径与原内联 `pages.update` 字节一致
- [x] `update-nav`（POST 按新 NAV 重算持仓 value 写回 portfolio；GET 聚合基金面板）→ 写 `setHoldingValue` chokepoint（`DATA_SOURCE_PORTFOLIO`）；读 `listHoldings`/`listClients`
  - 🔬 **已验**：GET 基金聚合 parity 102 funds 0 mismatch（units/valueOrig/holdingCount/clients 全等）；Supabase 写平滑测试 `setHoldingValue` 按 id 改 value_original_currency+value_myr（测试改动已还原）；Notion 写路径与原内联 `pages.update` 字节一致；保留 currency/fxRate 默认（`|| 'MYR'`/`|| 1`）+ 基金排序
- [x] `cashflow` POST / DELETE / submit → **决策点 C 已落**（`breakdown jsonb` 列 [migration 2026-07-16] + 真 UPSERT）；写 `upsertCashflow`/`deleteCashflow` chokepoint（`DATA_SOURCE_CASHFLOW`）
  - **决策点 C 定案**：① 加 `breakdown jsonb` 列（读路径改为返回它；老行 null 不变）；② Supabase 写用真 **UPSERT (entry, advisor) == client+month+advisor**（`entry` 编码 客户名—月标签，两端算法一致）→ POST 与 submit 统一为「每月一条、保留历史」，对齐 `CashflowPage` 的多月历史 UI；③ **submit 语义变更**（推荐项）：客户表单从 Notion 的「archive 该客户所有月份只留一条」改为每月 upsert 保留历史——仅 Supabase 分支生效
  - **Notion 路径逐字不变**：POST/submit/DELETE 的 Notion 代码原样保留（submit 仍 archive-all），只在计算完总额/breakdown 后插入 flag 门控早返回分支；cutover 后只剩 Supabase 生效
  - `client_notion_id` best-effort 保真：仅在有 clientId 时写、绝不清空（POST 无 clientId 更新不会抹掉 submit 设的关联）
  - 🔬 **已验**（repo 级平滑测试打真库，自清 2→2 行 0 残留）：insert 返回 id；listCashflow 读回（surplus/savingsRate 重算正确、breakdown jsonb 往返一致）；同 entry 二次 upsert **原地更新**（同 id、仍恰好 1 行）；null-clientId 更新**保留** client_notion_id；非 owner 删除被 `Forbidden` 拒；owner 删除后行数还原。`tsc --noEmit` 全绿
- [x] `meetings` POST（建 note + 回写 client review 日期）→ 写 `createMeeting`（`DATA_SOURCE_MEETINGS`）+ `setClientReviewDates` chokepoint（`DATA_SOURCE_CLIENTS`）
  - **clientId 不兼容问题化解**：meeting note 表**无 client 列**（clientName 只存标题），故 note insert 不碰 clientId；review 日期回写改走 `lib/clients.setClientReviewDates` chokepoint —— clientId 是 `listClients().id`（源自适配：Notion page id 或 Supabase uuid），两个写各用**各自 flag 对应源**的 id，彻底消除旧内联 `notion.pages.update({page_id:clientId})` 在 clients 转 Supabase 后必崩的 page-id/uuid 冲突
  - 两写**独立门控**：note 建在 `DATA_SOURCE_MEETINGS`、review 回写在 `DATA_SOURCE_CLIENTS`（可任意组合，各自正确）
  - review 日期语义：`Last review date` 恒设；`Next review date` 有值则设、`clearNextReview` 则清（null）、否则不动（undefined）——与 Notion 三态一致
  - Notion 路径逐字不变（note 建 create+retry-on-"is not a property" 原样保留；review 回写内联块移入 chokepoint 的 Notion 分支、字节一致）
  - ⚠️ `meeting_type` Supabase 有 CHECK 约束，取值 = 前端 `MEETING_TYPES` 枚举（Annual Review/Follow-up/Phone Call/Video Call/Ad-hoc/Onboarding）——已核对一致，合法提交不会被拒
  - 🔬 **已验**（repo 级平滑测试打真库，自清 meeting_notes 6→6、client 还原、0 残留）：createMeeting 插入+listMeetings 读回（标题解析 clientName、字段往返、空串→NULL）；setClientReviewDates 三态（both set / clear next / undefined 不动）+ 还原。`tsc --noEmit` 全绿
- [x] `products` POST（Gemini 抽取 + 存回，`action: extract|save`）→ 写 `createPlan`/`createFund`（`DATA_SOURCE_PRODUCTS`）
  - `action:extract` 纯 Gemini AI、**无数据源**，迁移不碰；只有 `action:save`（insurance→`insurance_plans`、fund→`funds`）走 flag 分支
  - Supabase 分支跳过 Notion DB id 检查（Supabase 不需要），feature gate（`config.features.includes('products')`）在路由顶层已把关、源无关；advisor 名戳进行内做读隔离
  - 默认值与 Notion save 一致：insurance Insurer→Unknown/Type→Others/Status→Active；fund Fund House→Unknown/Asset Class→Others/Region→Malaysia/Risk Level→Moderate/Status→Active；数值缺省→null（读侧 `num()` 再套默认，如 minInvestment 1000）
  - Notion 路径逐字不变（两 productType 的 `pages.create` 块原样保留，Supabase 分支插在 DEMO 检查后、建 notion client 前）
  - ⚠️ 休眠功能：8 顾问无人配 DB、无人开 products feature → 两表恒空，实战无源数据；写路径备好待启用
  - 🔬 **已验**（repo 级平滑测试打真库、自清两表回 0 行）：createPlan/createFund 全字段+极简（默认值套用、缺省数值→null）；listPlans/listFunds 读回往返；advisor 隔离（他人看不到、Admin 看全部）。`tsc --noEmit` 全绿
- [ ] `forms` 写：admin POST/PATCH/DELETE（+ Drive 上传）、`forms/[id]/prefill`（点查）、`forms/[id]/fill`（Drive 下载填 PDF）
- [x] **clients 表写已全完成**：`admin/clients` **无 CRUD 端点**（client 记录在 Notion 里人工管，前端只读+sync-aum）→ clients 表的写只有 `sync-aum`(AUM) + `meetings`(review 日期) 两条 write-back，均已完成。无独立 client 建/改/删可迁
- [x] `networth` POST/PATCH/DELETE（`assets_liabilities`）→ 写 `replaceAssetEntries`/`updateAsset`/`deleteAsset`（`DATA_SOURCE_ASSETS`）
  - POST = 「archive 该 client 的 marker 行（Notes 含 `advisor-entry`）→ 建新集」；Supabase 分支用**硬 DELETE** 替 archive（迁移已知取舍），再 insert；`type` CHECK=Asset|Liability（与 NW_ITEMS 一致）
  - PATCH `buildAssetPatch` 逐字段镜像 Notion `buildProps`（同条件、advisor 恒戳）；PATCH/DELETE 带 advisor ownership 守卫（非 owner→`Forbidden`，Admin 可改任意）
  - Notion 三个 handler 逐字不变，Supabase 分支插在各自 id/参数校验后、建 notion client 前
  - 🔬 **已验**（repo 级平滑测试打真库，自清 8→8）：replace 建 2 行+listAssets 读回（字段往返、advisor scope）；二次 replace 删旧 marker 留新集；PATCH 改 value；非 owner PATCH+DELETE 被 Forbidden、Admin 可改；DELETE 删行；空集 replace 只删不插。`tsc --noEmit` 全绿
- [x] `insurance` POST/PATCH/DELETE（`insurance_policies`）→ 写 `createPolicy`/`updatePolicy`/`deletePolicy`（`DATA_SOURCE_INSURANCE`）
  - 🐞 **发现并修 CHECK 太窄 bug**：`insurance_type`/`status` 的 CHECK 由 81 条种子数据推得，比前端 `InsuranceFormModal` 允许值窄（Medical/Whole Life/Critical Illness/Personal Accident/Annuity/Other、status Matured 都会被拒）→ Supabase 写合法输入必崩。Notion 是自由 select 无枚举限制 → **用户定案：删两个 CHECK**（migration `2026-07-16-insurance-drop-narrow-checks.sql`，已应用）
  - **client FK 跨源解析**：`client_notion_id` 存**去横线 Notion id**（读侧 join `clients.notion_id` 得 clientName）；前端 combobox 送的 `clientId` 是 `listClients().id`（源自适配 page-id 或 uuid）→ 新增 `lib/clients.resolveClientNotionId`（按 `DATA_SOURCE_CLIENTS`：Notion 去横线、Supabase uuid 查 `clients` 表得 notion_id）+ repo `getNotionIdById`。此解析器 portfolio 写也复用
  - `buildInsurancePatch` 逐字段镜像 Notion `buildProps`（含 date 三态 `|| null`、数值 `|| 0`、benefits→text[]、advisor 仅 create 戳、PATCH 不改 advisor）；PATCH/DELETE 带 ownership 守卫
  - Notion 三 handler 逐字不变，Supabase 分支插在各自校验后、建 notion client 前
  - 🔬 **已验**（repo 级平滑测试打真库、自清 81→81）：resolveClientNotionId 两分支（notion 去横线 / supabase uuid→notion_id）；createPolicy 接受 Medical+Matured（CHECK 已删）；listPolicies 读回（enum/数值/benefits[]/client_notion_id 往返）；FK join 还原 clientName=真客户；PATCH 改值+清 client 链；非 owner PATCH+DELETE→Forbidden、Admin 可改；DELETE 删行。`tsc --noEmit` 全绿
- [x] `portfolio` POST/PATCH/DELETE（`portfolio_holdings`）→ 写 `createHolding`/`updateHolding`/`deleteHolding`（`DATA_SOURCE_PORTFOLIO`；`setHoldingValue` 之前 update-nav 已加）
  - 🐞 **同类 CHECK 太窄 bug**：`currency` CHECK=MYR/AUD/SGD/USD，但前端 `PortfolioFormModal` 的 `CURRENCIES` 含 GBP/EUR/JPY → 沿用 insurance 决策**删 currency CHECK**（migration `2026-07-16-portfolio-drop-currency-check.sql`，已应用）
  - 复用 `resolveClientNotionId`（client FK 同 insurance：`👥 Clients` relation → `client_notion_id` 去横线 Notion id）
  - `buildPortfolioPatch` 逐字段镜像 Notion `buildProps`（数值默认 valueOrig/valueMyr/… `|| 0`、fxRate `|| 1`、date 三态 `|| null`、advisor 仅 create、PATCH 不改 advisor）；PATCH/DELETE ownership 守卫
  - Notion 三 handler 逐字不变
  - 🔬 **已验**（repo 级平滑测试打真库、自清 1038→1038）：resolveClientNotionId supabase 分支；createHolding 接受 GBP（CHECK 已删）；listHoldings 读回（currency/valueMyr/units/client_notion_id 往返）；FK join 还原真客户；PATCH 改值+清 client 链；非 owner PATCH+DELETE→Forbidden、Admin 可改；DELETE 删行。`tsc --noEmit` 全绿
- **本 bucket 收尾**：clients 表写（无 CRUD，只 AUM/review 两 write-back，已完成）+ networth/insurance/portfolio 三表 CRUD 全部完成 ✅
- [x] `forms` 元数据写 + fill → 写 `createForm`/`updateForm`/`deleteForm`（`DATA_SOURCE_FORMS`）
  - admin `POST`（建）/`[id] PATCH`（改 field_mapping+active）/`[id] DELETE`（archive→硬删）：Drive 上传/下载**不属迁移**、原样保留；只 DB 元数据记录走 flag 分支。`field_mapping` 存 JSON 字符串（text 列，读侧 JSON.parse）、`tags` text[]、`last_updated` 每次 bump
  - `forms/[id]/fill`：把读表单的 `notion.pages.retrieve` 换成 `getForm(config,id)`（取 active/pdfUrl/name），其余 Drive 下载 + pdf-lib 填充不变
  - ✅ `form_type` CHECK（Fillable PDF/Scanned PDF）**与前端 `<option>` 一致**，无 CHECK-窄 bug
  - Notion 三 handler + fill 的 Notion 分支逐字不变
  - ⚠️ 公司级共享表、无 advisor scope；表**恒空**（功能已配 Drive 但无表单上传）——写路径备好待启用
  - 🔬 **已验**（repo 级平滑测试打真库、自清 0→0）：createForm（Fillable+Scanned）；getForm/listForms 读回（scalar/tags[]/field_mapping JSON 往返、空 category→null、activeOnly 过滤）；updateForm（翻 active+换 mapping、partial 只改 active 保留 mapping）；deleteForm。`tsc --noEmit` 全绿
- [x] `forms/[id]/prefill`（跨表点查 GET）→ **收尾完成**：整条内联 Notion 跨表读改走抽象——`getForm(config,id)` + 新 `getClientById(config,clientId)` + `listPolicies`/`listHoldings`（各源按自身 flag），保单/持仓按 `clientNotionId === client.notionId` 关联（源无关）
  - 新增 `lib/clients.getClientById`（chokepoint，Notion `pages.retrieve`→`mapClientPage`／Supabase repo `getClientById` 按 uuid）+ 抽出 `mapClientPage` 供 listClients/getClientById 共用；repo 抽 `CLIENT_COLS` 常量
  - ownership：非 admin 且 `client.advisorName` 与自己不符→403（镜像旧内联行为）；insurance/portfolio 查询失败 `.catch(()=>[])` 保留旧 best-effort；`sumAssured || undefined` 与旧 `?? undefined` 一致（0/缺省→''）
  - 无独立 flag——纯读、各抽象自带 flag（Phase 2.10「整体转」模式），任意 flag 组合都对
  - 🔬 **已验**（平滑测试打真库、自清；四 flag 全 supabase）：复刻路由逻辑 end-to-end——getForm 取 mapping、getClientById(uuid)→真客户+notionId 关联键、listPolicies/listHoldings 按 cnid 过滤命中种子保单/持仓、resolvePrefill 解析 client.name/policy.planName/policy.sumAssured/account.fundName/advisor.name/__manual 全对；ownership 403 逻辑；种子行全清。`tsc --noEmit` 全绿
- ✅ **Phase 2.11 写路径全部完成**（sync-aum·update-nav·cashflow·meetings·products·networth·insurance·portfolio·forms + prefill 收尾）。Notion→Supabase 代码层双源改造完毕，剩 §7 备份 + 最终 cutover

### Phase 3 — 配置 / Users  ✅ 完成（2026-07-19，代码测通，cutover 并入统一切换）
- [x] `public.users`（已预置 8 行）+ `features` 列（migration 2026-07-19）；`scripts/reconcile-users.ts`（dry-run 拉齐，含 password_hash）
- [x] `lib/repos/users.ts` + `getAdvisorConfig` Supabase 分支（`DATA_SOURCE_USERS`）——身份键 **仍用 notion_id**（dashed advisorId 读时归一化 → 老 session 不失效）；字段映射逐字段镜像 `stored || env.COMPANY_*` fallback
- [x] 读:login（bcrypt/JWT 不变）、me（继承）、settings/users GET、admin/clients FA-map
- [x] 写:6 token 写回 + settings/password + settings/profile（name+gmailAddress）+ settings/users POST（生成 dashless notion_id 当身份）/PATCH;`addAdvisorSelectOption` 在 supabase 为 no-op
- [x] 测试 `scripts/test-users-supabase.ts`（打真库、自清、绝不碰真实 8 用户）
- ✅ 通过标准:登录正常、数据隔离正确;此步做完即可切断 Notion 主链路（cutover 时统一翻 flag）
- ⏭️ **延后（future）**:OAuth token 加密（安全审查 #2,紧接的独立一步）;UUID 身份迁移（可选;滚动 login-backfill + `keyType` JWT claim,因 Notion page id 与 uuid 同为 dashed 不可格式区分）

### Phase 4 — 清理（暂缓执行）  ⏸
> **本轮不删代码。** 改为：把 Notion 相关调用注释掉并加标记，逐条登记到 `NOTION_CLEANUP.md`。
> 等系统在 Supabase 上稳定运行一段时间后，再按那份清单统一清理。
- [ ] 所有 Notion 旧路径用 `// [NOTION-LEGACY]` 标记 + 注释
- [ ] 逐条登记进 `NOTION_CLEANUP.md`
- [ ] （稳定后再做）移除 `@notionhq/client`、`lib/notionQueryAll.ts`、相关 env

---

## 3. 表清单（12 张）

| # | Notion DB | 目标表 | env（现） | 关系 |
|---|---|---|---|---|
| 1 | Clients | `clients` | COMPANY_CLIENTS_DB_ID | 被 portfolio/insurance 等引用 |
| 2 | Portfolio | `portfolio` | COMPANY_PORTFOLIO_DB_ID | → clients |
| 3 | Insurance | `insurance` | COMPANY_INSURANCE_DB_ID | → clients |
| 4 | Assets（净值） | `assets` | COMPANY_ASSETS_DB_ID | → clients |
| 5 | Cashflow | `cashflow` | COMPANY_CASHFLOW_DB_ID | → clients |
| 6 | Meeting Notes | `meeting_notes` | COMPANY_MEETING_NOTES_DB_ID | → clients |
| 7 | Tasks | `tasks` | COMPANY_TASKS_DB_ID | → clients（可空） |
| 8 | Insurance Plans | `insurance_plans` | (per-advisor) | 产品目录 |
| 9 | Funds | `funds` | (per-advisor) | 产品目录 |
| 10 | Users | `advisors` | NOTION_USERS_DB_ID | 多租户根 |
| 11 | AI Usage | `ai_usage` | COMPANY_AI_USAGE_DB_ID | → advisors |
| 12 | Forms Library | `forms_library` | COMPANY_FORMS_DB_ID | PDF 在 Drive |

---

## 4. 字段映射（做一张表填一张，别提前臆测）

> 规则：迁某张表时，先打开对应路由把「Notion 属性名 → 列名 → 类型」列全，评审通过再写 schema。
> 下面先放两张**已从代码核实**的作为范例，其余留空待填。

### 4.x portfolio（已核实，来源 `app/api/portfolio/route.ts`）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Holding Name (title) | `holding_name` | text | |
| Asset class (select) | `asset_class` | text | |
| Institution (rich_text) | `institution` | text | |
| Status (select) | `status` | text | |
| Currency (select) | `currency` | text | |
| Value (Original Currency) | `value_orig` | numeric | |
| Purchase price (original currency) | `purchase_orig` | numeric | |
| FX Rate to MYR | `fx_rate` | numeric | 默认 1 |
| Value (MYR) | `value_myr` | numeric | |
| Purchase price (MYR) | `purchase_myr` | numeric | |
| Units | `units` | numeric | |
| Maturity date (date) | `maturity_date` | date | 可空 |
| FAME Account No (rich_text) | `fame_account_no` | text | 只读路由用；写路由未覆盖 |
| Fund Source (rich_text) | `fund_source` | text | 只读路由用；写路由未覆盖 |
| Advisor (select) | `advisor_id` | uuid FK | 由名称映射到 id |
| 👥 Clients (relation) | `client_id` | uuid FK | 可空 |

### 4.y advisors（已核实，来源 `lib/getAdvisorConfig.ts`）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Name (title) | `name` | text | |
| Role (select) | `role` | text | Admin / Advisor |
| Features | `features` | text[] | 逗号串 → 数组 |
| Email Provider | `email_provider` | text | gmail / outlook |
| Gmail Refresh Token | `gmail_refresh_token` | text | **加密存** |
| Gmail Address | `gmail_address` | text | |
| Outlook Refresh Token | `outlook_refresh_token` | text | **加密存** |
| Outlook Address | `outlook_address` | text | |
| Calendar Provider/Token/Address | `calendar_*` | text | Token **加密存** |
| Drive Refresh Token | `drive_refresh_token` | text | **加密存** |
| Institutions JSON | `institutions` | jsonb | |
| (登录) Username / Password Hash | `username` / `password_hash` | text | 来自 Users DB |
| ~~各 *DB ID~~ | — | — | 迁移后**废弃**，单一 schema 不再需要 |

### 4.1 clients（来源 `app/api/notion/route.ts` GET + `app/api/admin/clients` + `app/api/meetings` 回写）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Client Name (title) | `name` | text | |
| Status (select) | `status` | text | |
| Client Segment (select) | `segment` | text | |
| AUM (MYR) (number) | `aum_myr` | numeric | admin 路由还兼容 `AUM`/`Total AUM` 旧名——迁移时统一成这一列 |
| Monthly income (MYR) (number) | `monthly_income_myr` | numeric | |
| Risk Profile (select) | `risk_profile` | text | admin 兼容 `Risk` 旧名 |
| Next review date (date) | `next_review_date` | date | meetings POST 会回写此列 |
| Last review date (date) | `last_review_date` | date | meetings POST 会回写此列 |
| Onboarding date (date) | `onboarding_date` | date | |
| Financial goals (multi_select) | `financial_goals` | text[] | |
| Phone (phone_number) | `phone` | text | admin 兼容 `Phone Number`/`Mobile` |
| Email (email) | `email` | text | admin 兼容 `Email Address` |
| Date of Birth (date) | `date_of_birth` | date | 生日提醒用 |
| Advisor (select) | `advisor_id` | uuid FK | |

> **决策点 A —— 统一客户表列名（结论：采纳，风险近乎零）**
>
> **根因**：读客户字段分两派——「规范派」（`notion`/`ai`/`reports`/`sync-aum`/`meetings`，也是所有**写入**用的名字）用标准列名；「回退派」仅 3 处（`admin/clients`、`admin/overview`、`dashboard-assistant`）带一串 `||` 别名兜底（`Total AUM`/`Risk`/`Mobile`/`Email Address`/`Client Status`/`Next Review`）。
> **关键**：这些别名**只被读、从不被写**——是「每顾问独立 DB」时代的遗留。
> **已确认**：现在是**单一共享 Clients DB（集中模式）** → 别名列几乎肯定不存在，回退是**死代码**，统一后风险≈0。
> **顺带修 bug**：`admin/clients` 读 `Next Review`，但全 app 写 `Next review date` → 该列对 app 客户长期为空；统一到 `next_review_date` 后自动修好。
> **改动影响**：迁移后删掉那 3 处 `||` 兜底链，全部直读规范列；运行时零影响，只是更简单、数据不再可能分叉。
> **一次性动作**：import 前跑一次「列名审计」确认共享 DB 实际列名（保险），导完对一下每顾问 AUM 合计即可。规范列名 = 见上表。

### 4.2 insurance（来源 `app/api/insurance/route.ts` + notion GET）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Policy Name (title) | `policy_name` | text | |
| Policy Owner (rich_text) | `policy_owner` | text | |
| Life Assured (rich_text) | `life_assured` | text | |
| Insurance Type (select) | `insurance_type` | text | |
| Benefits (multi_select) | `benefits` | text[] | |
| Status (select) | `status` | text | |
| Insurer (rich_text) | `insurer` | text | |
| Policy Number (rich_text) | `policy_number` | text | |
| Sum Assured (MYR) | `sum_assured_myr` | numeric | |
| Life Cover (MYR) | `life_cover_myr` | numeric | |
| CI Cover (MYR) | `ci_cover_myr` | numeric | |
| PA Cover (MYR) | `pa_cover_myr` | numeric | |
| TPD Cover (MYR) | `tpd_cover_myr` | numeric | |
| Annual Premium (MYR) | `annual_premium_myr` | numeric | |
| Beneficiary (rich_text) | `beneficiary` | text | |
| Medical Class (rich_text) | `medical_class` | text | |
| Medical Card (rich_text) | `medical_card` | text | |
| Notes (rich_text) | `notes` | text | |
| Commencement Date (date) | `commencement_date` | date | |
| Maturity Date (date) | `maturity_date` | date | |
| Advisor (select) | `advisor_id` | uuid FK | |
| Clients (relation) | `client_id` | uuid FK | 注意属性名是 `Clients`（无 emoji），与 portfolio 的 `👥 Clients` 不同 |

### 4.3 assets（净值；来源 `app/api/networth/route.ts` + notion GET，分类枚举见 `lib/networthForm.ts`）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Name (title) | `name` | text | 行项目名，如 "Saving Accounts" |
| Client (rich_text) | `client_name` | text | ⚠️ 存的是**客户名字符串**，不是 relation |
| Type (select) | `item_type` | text | Asset / Liability |
| Category (select) | `category` | text | 枚举见下 |
| Value (MYR) (number) | `value_myr` | numeric | |
| Notes (rich_text) | `notes` | text | 含 `advisor-entry` 标记，用于「重存时替换旧行」 |
| Advisor (select) | `advisor_id` | uuid FK | |

> Category 枚举：Cash & Deposits / Other Investment / Other Asset / EPF / Retirement / Property / Business（资产）；Credit Card / Car Loan / Personal Loan / Study Loan / Mortgage / Other Liability（负债）。
> **决策点 B —— assets/tasks 客户关联（结论：采纳）**
> 现状：`Client` 存**客户名字符串**，非外键。
> 定案：Postgres 加 `client_id uuid`（迁移时按名字解析到 clients）+ **保留 `client_name text` 兜底**（名字对不上、或客户已删时仍可显示）。
> 迁移脚本：名字解析失败的行**记进日志**供人工核对，不静默丢弃。tasks 表同此处理。

### 4.4 cashflow（来源 `app/api/cashflow/route.ts` + submit + notion GET）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Entry (title) | `entry` | text | "ClientName — Month Year" |
| Month (date) | `month` | date | |
| Monthly income (MYR) | `monthly_income_myr` | numeric | 汇总值 |
| Fixed expenses (MYR) | `fixed_expenses_myr` | numeric | 汇总值 |
| Variable expenses (MYR) | `variable_expenses_myr` | numeric | 汇总值 |
| EPF contribution (MYR) | `epf_contribution_myr` | numeric | 汇总值 |
| Notes (rich_text = JSON) | `breakdown` | jsonb | ⚠️ 目前把逐项 breakdown JSON 塞在 Notes 里 |
| Advisor (select) | `advisor_id` | uuid FK | |

> **决策点 C —— cashflow 明细存储（结论：采纳）**
> 现状：逐项 breakdown JSON 塞在 `Notes` 文本里。
> 定案：改成独立 `breakdown jsonb` 列（干净、可查询）；汇总值仍保留为独立 numeric 列（income/fixed/variable/epf）。
> upsert 键 = client + month + advisor（对应现在的 `Entry` 标题去重逻辑）。
> 迁移脚本：把 Notes 里的 JSON 解析后写进 `breakdown`；解析失败的行记日志。
> ⏭️ **延后到 cashflow 写路径阶段**（读侧 2.5 已完成、不依赖它）。摸查发现当前 Notion cashflow DB 根本没有 `Notes` 属性、0 条 breakdown 数据、前端无 `.breakdown` 消费者——故读侧 `breakdown` 恒 null 即与现状一致；`breakdown jsonb` 列与真 UPSERT 随写路径一起落地。

### 4.5 meeting_notes（来源 `app/api/meetings/route.ts`）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Name (title) | `title` | text | "Client — Type — Date" |
| Client Name (rich_text) | `client_name` | text | 可选列 |
| Client (relation) | `client_id` | uuid FK | 可选列，可空 |
| Meeting Date (date) | `meeting_date` | date | |
| Meeting Type (select) | `meeting_type` | text | |
| Notes (rich_text) | `notes` | text | |
| Action Items (rich_text) | `action_items` | text | tasks 同步会解析它 |
| Next Review Date (date) | `next_review_date` | date | |
| Advisor (select) | `advisor_id` | uuid FK | |

### 4.6 tasks（来源 `lib/tasks.ts`）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Task (title) | `task` | text | |
| Client (rich_text) | `client_name` | text | 名字字符串（同 assets） |
| Status (select) | `status` | text | Open / Done |
| Due (date) | `due` | date | 可空 |
| Source (rich_text) | `source` | text | 如 "Meeting 2026-05-26" / "Manual" |
| Done (date) | `done_date` | date | 完成时写入（代码属性名是 `Done`，非注释里的 `Done Date`） |
| Type (select) | `type` | text | Admin / Client（空=Client） |
| Advisor (select) | `advisor_id` | uuid FK | |

### 4.7a insurance_plans（产品目录；来源 `app/api/products` + notion GET）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Name (title) | `name` | text | |
| Insurer (select) | `insurer` | text | 读路由兼容 rich_text |
| Type (select) | `type` | text | Life/CI/Medical/… |
| Min Age / Max Age (number) | `min_age` / `max_age` | int | |
| Min/Max Sum Assured (number) | `min_sum_assured` / `max_sum_assured` | numeric | |
| Est Monthly Premium (rich_text) | `est_monthly_premium` | text | 如 "RM 150–400" |
| Key Features (rich_text) | `key_features` | text | |
| EPF Approved (checkbox) | `epf_approved` | boolean | |
| Status (select) | `status` | text | Active/… |
| — | `advisor_id` | uuid FK | ⚠️ 见决策点 D |

### 4.7b funds（产品目录）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Name (title) | `name` | text | |
| Fund House (select) | `fund_house` | text | |
| Asset Class (select) | `asset_class` | text | |
| Region (select) | `region` | text | |
| Risk Level (select) | `risk_level` | text | |
| 3Y Return % (number) | `return_3y_pct` | numeric | |
| Min Investment (number) | `min_investment` | numeric | |
| Sales Charge % (number) | `sales_charge_pct` | numeric | |
| EPF Approved (checkbox) | `epf_approved` | boolean | |
| Status (select) | `status` | text | |
| Description (rich_text) | `description` | text | |
| — | `advisor_id` | uuid FK | ⚠️ 见决策点 D |

> **决策点 D —— 产品目录归属（结论：采纳）**
> 现状：insurance_plans / funds 是**每顾问独立 Notion DB**（DB ID 存用户页，无 env 后备），记录本身**无 Advisor 标签**。
> 定案：统一 schema 加 `advisor_id`；迁移时靠「记录来自哪个顾问的 DB」推断归属并回填。
> 注意：迁移脚本需**遍历每个有填产品 DB ID 的顾问**，逐库导入并打上对应 advisor_id。

### 4.8 ai_usage（来源 `lib/aiUsage.ts`）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Entry (title) | `entry` | text | "Advisor · Feature · 时间" |
| Advisor (select) | `advisor_id` | uuid FK | 目前存名字，迁移解析成 id |
| Feature (select) | `feature` | text | Ask FINVA / Client Chat / … |
| Input Tokens (number) | `input_tokens` | int | |
| Output Tokens (number) | `output_tokens` | int | |
| Total Tokens (number) | `total_tokens` | int | |
| Date (date) | `logged_at` | timestamptz | |
| Question (rich_text) | `question` | text | 可选，截断 280 字 |

### 4.9 forms_library（来源 `app/api/admin/forms-library/route.ts`；PDF 本体在 Google Drive）
| Notion 属性 | 列 | 类型 | 备注 |
|---|---|---|---|
| Name (title) | `name` | text | |
| Provider (select) | `provider` | text | |
| Category (select) | `category` | text | 可空 |
| Tags (multi_select) | `tags` | text[] | |
| Form Type (select) | `form_type` | text | Fillable PDF / Scanned |
| PDF URL (rich_text) | `pdf_url` | text | 指向 Drive 文件 |
| Field Mapping (rich_text = JSON) | `field_mapping` | jsonb | AcroForm 字段映射 |
| Active (checkbox) | `active` | boolean | |
| Last Updated (date) | `last_updated` | date | |

> 说明：forms_library 是**公司级共享、仅 Admin 可管**，无 Advisor 标签，也无客户关联；PDF 存 Google Drive，本表只迁元数据/索引。

---

## 5. 数据搬迁计划（代码都通了再执行）

> **切换策略（2026-07-12 定）：整体在 preview 完成，末尾一次性 cutover —— 不逐表切生产。**
> 所有表都在 `feature-switch-to-supabase` 分支开发，在 **supabase.finva.io**（绑该分支）逐个验证。
> 全部表 ready + 测通、且 §7 备份方案已上线后，才 `feature-switch-to-supabase` → **main** 一次合并、
> 一次 cutover 到 app.finva.io。在那之前**绝不合并、不碰 app.finva.io / dev.finva.io**（都在运行中）。
> 下方第 7 步的「立即翻 flag」时序针对最终那次统一 cutover；每张表的 preview 验证不涉及生产。



一个 **一次性、可重跑（幂等）、带 dry-run** 的 Node 脚本：

1. **导出**：用 Notion API `queryAllPages` 全量拉每张 DB。
2. **映射**：按第 4 节对照表把属性 → 列。
3. **关系两趟导入**：
   - 第一趟导 `clients`，记录 `notion_page_id → clients.id` 映射。
   - 第二趟导 portfolio/insurance/… 时用该映射填 `client_id`。
4. **advisor 转换**：`Advisor` select 值 → `advisors.id`。
5. **保真**：保留 `created_time`、Notes 里的 JSON breakdown 等。
6. **对账**：逐表比对行数 + 抽样比对金额合计。
7. **切换（cutover）** —— 按此顺序执行，消灭"写入丢失窗口"：
   1. 代码先全部部署到生产（flag 仍 = `notion`，行为不变）。
   2. 选低使用时段，确认没人在用（solo 团队：直接问一圈）。
   3. 跑 `reconcile --apply`（最后增量；此刻起到翻 flag 前，任何 Notion 写入都会丢，所以下一步要立刻做）。
   4. **立即**在 Vercel 改 `DATA_SOURCE_<TABLE>=supabase` 并 **redeploy**（⚠️ Vercel 改 env 不会自动生效，必须 redeploy，全程 ≈ 1–2 分钟）。
   5. 验证：UI 冒烟 + Vercel function logs 无报错。
   6. 观察期后退役该表的 Notion 写入路径（登记 NOTION_CLEANUP.md）。
   - ⚠️ **cutover 之后严禁再跑 `reconcile --apply`**——会用 Notion 旧值覆盖 Supabase 新数据。脚本已加防呆（检测到 `DATA_SOURCE_TASKS=supabase` 拒绝 --apply），但防呆只能看到本地 .env.local，生产 flag 状态要自己核对。

---

## 6. 回滚（⚠️ 只对"读"无损，不是全量无损）

- 每张表切换由 `DATA_SOURCE_<TABLE>` env 控制；Phase 4 之前 Notion 代码完整保留。
- **但要清楚代价**：直切架构下 Notion 在 cutover 后是**冻结**的（没有 mirror 同步）。翻回 `notion` 的瞬间，切换期间在 Supabase 新建/完成/删除的数据全部从 UI 消失（它们只存在于 Supabase，没丢，但看不见）。
- 所以：**回滚窗口 = 切换后 1–2 天内**。越晚回滚，Notion 越旧、代价越大。过了观察期就只往前走，不回头。
- 真要回滚时：先翻 flag 止血 → 再人工把切换期间的 Supabase 增量补回 Notion（量小手动补；`notion_id IS NULL` 的行就是切换后新建的）。
- 回滚操作本身 = Vercel 改 env + redeploy，≈ 1–2 分钟，**不是秒级**。

---

## 7. 备份  🟨 本机 launchd 已上线；云端 GitHub Actions 待你完成三步（见 7.1）

> Notion 自带版本历史 + 回收站；Postgres **什么都没有**。Supabase free tier 无 PITR、无每日备份（Pro 才有）。
> 且新代码的删除是硬 `DELETE`（Notion 时代是 archive 可恢复）——误删即永久丢失。

**方案：本机 launchd 每日 `pg_dump`（cutover 前置已满足）**
- `scripts/backup-supabase.sh`：读 `.env.local` 的 `PG*` 连接（不硬编码密钥）→ `pg_dump --format=custom --compress=9`（含 schema+data 全量）→ 存 `~/finvaio-backups/finvaio-<时间戳>.dump`，保留最近 `KEEP`（默认 14）份、自动轮转。可手跑：`bash scripts/backup-supabase.sh`。
- `scripts/io.finva.supabase-backup.plist`：launchd agent，每日 **02:00**。装到 `~/Library/LaunchAgents/` 并 `launchctl bootstrap gui/$(id -u) …`（plist 头部有安装/状态/卸载命令）。
- **前置**：`pg_dump` 需 ≥ 服务端主版本。服务端 PG 17.6；本机用 `brew install libpq`（pg_dump 18.4，向下兼容 dump 17）。
- **已验**：手跑 + launchd kickstart 均 exit 0、产出 352K dump；`pg_restore --list` 含全部 11 张表 TABLE DATA；轮转 KEEP=1 生效。dump 存在**仓库外** `~/finvaio-backups`（不入 git）。
- ⚠️ **局限**：只在 Mac 开机/唤醒时跑（launchd 会在唤醒后补跑一次错过的日程）；dump 仅在本机 → 故迁往云端，见下。
- 恢复：`pg_restore --no-owner --no-privileges -d "<目标连接>" finvaio-….dump`（custom 格式支持选择性恢复：`pg_restore --list` 先看目录）。

### 7.1 迁往 GitHub Actions 云端（2026-07-17，🟨 待你完成三步）

> 目的：不依赖 Mac 开机，随时在线。`.github/workflows/supabase-backup.yml`（已写好，未 push）。

**流程**：每日 16:00 UTC（= 02:00 AEST）→ 装 pg_dump 17 → dump → **校验完整性**（`pg_restore --list` 必须含 clients/portfolio/insurance/tasks 的 TABLE DATA + 体积下限）→ **gpg AES256 加密** → 传 artifact（留 90 天）。另有 `workflow_dispatch` 可手动触发。

**⚠️ 两个致命坑（已在 workflow 注释中标明）**
1. **连接必须走 session pooler**：直连 `db.<ref>.supabase.co` 是 **IPv6-only**（已验证：无 A 记录，只有 AAAA），而 **GitHub runner 是 IPv4-only** → 直连必失败。须用 `aws-0-<region>.pooler.supabase.com:**5432**`（Dashboard → Connect → Session pooler）。**不能用 transaction pooler（6543）——它不支持 pg_dump。**
2. **`schedule` 只从默认分支（main）触发**：workflow 待在 `feature-switch-to-supabase` 上永远不会按时跑。

**需你手动完成（我不经手任何密钥）**
- [ ] 加 GitHub Secret `SUPABASE_DB_URL`（session pooler 连接串）
- [ ] 加 GitHub Secret `BACKUP_GPG_PASSPHRASE`（**存在 GitHub 之外的地方**——没它备份就是废文件）
- [ ] 把 workflow 合进 **main**（可单开一个只含该文件的小 PR），再用 **Run workflow** 手动验证一次跑通

**⚠️ 拆本机 launchd 的时序**：**必须等云端实跑成功一次之后再拆**。拆早了 = cutover 前零备份真空期。
拆除命令：`launchctl bootout gui/$(id -u)/io.finva.supabase-backup && rm ~/Library/LaunchAgents/io.finva.supabase-backup.plist`

**副作用提醒**：`deploy.yml` 在 push 到 `main` 时会部署生产。合这个 PR 进 main 会触发一次生产 redeploy（代码没变，等于原样重部署）。

### 7.2 Future work（已定方向，未做）
- [ ] **第二家云端副本：Google Drive**（决定：先不做，记入计划）。价值不只冗余——GH artifact **最多留 90 天**，Drive 可无限期。
  - 项目已有 Drive 集成（`lib/drive.ts`，OAuth2 + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`COMPANY_DRIVE_REFRESH_TOKEN`，scope `drive.file`）。
  - ⚠️ 复用现有 OAuth 有两个脆点：① Admin 在 Forms 页重连 Drive → refresh token 变化 → 备份**静默失效**；② 若该 Google OAuth 应用仍是 **Testing** 发布状态，**refresh token 每 7 天过期**（需先去 Google Cloud Console 确认）。
  - → 若要做，**建议改用 Service Account**（密钥不过期、与 App 的 Drive 连接解耦；需把一个 Drive 文件夹共享给该 SA）。
- [ ] 视情况：artifact 90 天上限不够时，改传对象存储（R2/S3，静态密钥、自定义保留期）。

~~备选：升级 Supabase Pro（每日备份 + 7 天 PITR）~~ —— 未采用，先用免费的 pg_dump 方案。
- Phase 4 退役 Notion 后，Notion 的"隐性备份"也没了——届时本方案即为唯一备份。

---

## 8. 软删除（soft delete）  ✅ 已上线（2026-07-17）

> 设计：`docs/superpowers/specs/2026-07-17-soft-delete-design.md`
> 计划：`docs/superpowers/plans/2026-07-17-soft-delete.md`

**背景**：Phase 2.11 把删除实现成了 Postgres 硬 `DELETE`，比 Notion 时代的 `archived: true`（软删、可恢复）**退化**了。叠加「free tier 无 PITR」+「cutover 后 Notion 冻结」→ 误删即永久丢失。现已改回可恢复。

**做法**：6 张有删除入口的表（`portfolio_holdings` / `insurance_policies` / `assets_liabilities` / `cashflow_planner` / `tasks` / `forms_library`）各加一列 `deleted_at timestamptz`（`null` = 在用，有值 = 已删 + 删除时刻）。删除改为盖时间戳；各 repo 的读/更新一律加 `.is('deleted_at', null)`。

- **聚合自动继承**：sync-aum 汇总 AUM、update-nav 基金面板、forms prefill 的跨表 join 都走 `listHoldings` / `listPolicies` → 过滤一次全覆盖。
- **Notion 路径逐字未动**；软删只在 Supabase 分支生效，仍受各表 `DATA_SOURCE_*` 门控。这让两路径语义**更接近**（Notion archive ≈ Supabase soft delete）。
- **回归测试**：`node --env-file=.env.local --import tsx scripts/test-soft-delete.ts`（打真库、自清、行数还原）。软删设计唯一的失败模式就是「某处读漏加过滤 → 已删记录复活」，这个脚本就是防线。**改任何 repo 读路径后请重跑它。**
- **不清理**：软删行永久保留（整库 12MB / 上限 500MB，死行几乎不花钱）。真逼近上限再议，届时有 pg_dump 兜底。

### 8.1 恢复（软删行怎么捞回来）

```sql
-- 1) 看某表最近删的 20 条
select id, deleted_at, *
from insurance_policies
where deleted_at is not null
order by deleted_at desc
limit 20;

-- 2) 恢复某行
update insurance_policies set deleted_at = null where id = '<uuid>';
```
把 `insurance_policies` 换成目标表即可，6 张表用法一致。

> ⚠️ **软删除不替代 §7 的 pg_dump 备份**，两者互补：软删除挡「在 App 里手滑删了一条」（秒级恢复）；pg_dump 挡 `DROP TABLE` / 迁移改坏 / 裸 SQL 硬删 / 库损坏 / 账号丢失。

### 8.2 与 reconcile 脚本的关系（**已决定不改**）

9 个 `scripts/reconcile-*.ts` 走裸 SQL，其「孤儿检测」（Supabase 有、Notion 无 → 硬删）**不与软删冲突**：

- reconcile 是 **cutover 前**工具（Notion 权威 → 灌 Supabase）。那时各表 flag 仍为 `notion`，App 根本不往 Supabase 写 → **不存在软删行**。
- cutover 后脚本本身拒绝 `--apply`。
- 且在 cutover 前那个阶段，「孤儿硬删」是**正确的**（清陈旧种子行）；改成软删反而留垃圾。

**已知残留风险（接受）**：
1. 该防呆只读本地 `.env.local`。若有人在 cutover 后硬跑 `--apply`，可能把软删行的数据用 Notion 旧值覆盖回去（行仍保持已删）。
2. `cashflow_planner.notion_id` 有唯一约束，软删行仍占用它；若 reconcile 重插同 `notion_id` 会撞约束。同样只在「cutover 后误跑」时可能发生。
