# NOTION_CLEANUP — 迁移后待清理清单

> 迁到 Supabase 后，Notion 相关代码**先不删**，只注释掉并加标记 `// [NOTION-LEGACY]`。
> 系统在 Supabase 上稳定运行一段时间后，再按本清单统一清理。
> 状态：⬜ 待清 · ✅ 已清

最后更新：2026-07-07

---

## 清理前置条件（全部满足才开始清）
- [ ] `MIGRATION.md` 里 Phase 0–3 全部 ✅ 已测通
- [ ] 数据搬迁已完成且对账通过
- [ ] 所有表的 `DATA_SOURCE_*` 开关已切到 `supabase` 且稳定运行 ≥ 约定观察期
- [ ] 生产环境无 Notion 相关报错

---

## 待清理项（迁移过程中逐条登记）

> 每当把某处 Notion 代码注释掉，就在这里加一行，写清文件、位置、替代物。

| # | 文件 / 位置 | 内容 | 替代为 | 状态 |
|---|---|---|---|---|
| 例 | `app/api/portfolio/route.ts` | `new Client({auth})` + `buildProps` Notion 映射 | `lib/repos/portfolio.ts`（supabase） | ⬜ |
|  |  |  |  |  |

---

## 依赖 / 配置层面待清理

- [ ] `package.json`：移除 `@notionhq/client`
- [ ] `lib/notionQueryAll.ts`：删除（SQL 分页不需要）
- [ ] `lib/getAdvisorConfig.ts`：删除所有 Notion 读写分支，只留 Supabase 版
- [ ] env 清理（生产 + `.env.local.example`）：
  > ⚠️ **在此之前一个 Notion env 都不能删**——跨源期间旧 env 仍被依赖，删了会**静默失效不报错**。
  > 已知案例：`syncTasksFromMeetings`（lib/tasks.ts）开头 `if (!config.tasksDbId || !config.meetingNotesDbId) return 0;`
  > ——tasks 切到 Supabase 后它仍要读 Notion 会议 + 依赖 `COMPANY_TASKS_DB_ID` 存在；删了该 env，会议同步直接静默返回 0。
  > 结论：所有 env 等 Phase 0–3 全部完成后**一批**清，不逐个清。
  - [ ] `NOTION_API_KEY`
  - [ ] `NOTION_USERS_DB_ID`
  - [ ] `COMPANY_CLIENTS_DB_ID`
  - [ ] `COMPANY_PORTFOLIO_DB_ID`
  - [ ] `COMPANY_INSURANCE_DB_ID`
  - [ ] `COMPANY_CASHFLOW_DB_ID`
  - [ ] `COMPANY_ASSETS_DB_ID`
  - [ ] `COMPANY_MEETING_NOTES_DB_ID`
  - [ ] `COMPANY_TASKS_DB_ID` ⚠️ 见上——meeting→task 同步的守卫依赖它
  - [ ] `COMPANY_AI_USAGE_DB_ID`
  - [ ] `COMPANY_FORMS_DB_ID`
- [ ] 各业务表的迁移辅助列 `notion_page_id`：确认不再需要后 drop
- [ ] `addAdvisorSelectOption()` 等 Notion 专属逻辑：删除

---

## 备注
- 清理是**破坏性**操作，动手前先建分支 + 确认可回滚。
- 清一类就在对应项打 ✅，保留记录方便追溯。
