# 新增 Advisor 的 Onboarding 流程自動化

> 狀態：**✅ 已改造為集中式（2026-06-06 實作）**
> 背景：Sky 問「要加新 FA，他們要先準備/設定什麼才能完整接上 ARIA？」
> 決策：改用集中式 Notion DB（所有 FA 共用同一組庫，記錄用 `Advisor` Select 標記擁有者）。

## ✅ 已完成（集中式改造）
- 6 個共用 DB（Clients/Portfolio/Insurance/Cashflow/MeetingNotes/Tasks）新增 `Advisor` Select 欄位；既有資料全部回填 = "Sky Siew"。
- `.env.local` 新增 `COMPANY_*_DB_ID`（目前指向 Sky 的庫，未來建公司新庫只需改 env）。
- `getAdvisorConfig`：DB ID/Notion key 未填時自動回退公司預設 → 新 FA 免填 DB。
- 所有讀取加 `Advisor` 過濾（一般 FA 只看自己；Admin 看全部）：notion 路由、tasks、meetings、ai、dashboard-assistant、email client-alerts、sync-aum、update-nav、reports/client（含越權防護）。
- 所有寫入蓋章 `Advisor = 該 FA 名`：tasks、meetings、cashflow submit、portfolio-switch。
- Admin overview/clients 改成「查一次共用庫、用 Advisor 標籤歸戶」，不再逐 FA 查庫。
- Onboarding UI（Settings ▸ Users ▸ Add New User）已存在且免填 DB → 現在 2 分鐘加一個 FA。
- import script 加 `ADVISOR_NAME` 參數，匯入時每筆蓋章該 FA；dedup/relation 查詢也按 Advisor 範圍。
- **2026-06-10**：`scripts/add-advisor-option.mjs` 的邏輯已併入 `POST /api/settings/users`（`lib/getAdvisorConfig.ts:addAdvisorSelectOption`）。Add New User 時會自動把該 FA 名字加進 6 個共用 DB 的 `Advisor` Select 選項，不會再出現「select option not found」（TAN TIAN YING 那次的 bug）。`add-advisor-option.mjs` 保留作為「補加舊 FA」的手動工具。

## ⚠️ Sky 待辦（部署後）
1. 把 6 個 `COMPANY_*_DB_ID` 加到 **Vercel 環境變數**（Production/Preview）。
2. 加新 FA：Settings ▸ Users ▸ Add New User，Full Name 要跟匯入時的 Advisor 名一致（系統會自動把名字加進各 DB 的 Advisor 選項）。
3. 匯入該 FA 資料：`ADVISOR_NAME="Alice Tan" node scripts/import-from-excel.mjs`。

---
## （原始討論紀錄，保留供參考）

## 目前現況（Beta 可行，但不可規模化）

### FA 自己要準備的（門檻低）
1. 客戶資料 → 填 4 份 Excel 範本（`FA_Onboarding_Templates/`：Clients、Insurance、Portfolio、CashFlow）。姓名要前後一致才能配對。
2. 登入帳號資訊（email + 密碼）。
3. 要連的 Gmail / Outlook 信箱（登入後自助 OAuth 授權）。
4. 要連的 Google / Outlook 行事曆（登入後自助 OAuth 授權）。

→ FA 登入後能**自助**的只有：連 Email、連 Calendar。

### Admin（Sky）後台要做的一次性設定（門檻高 = 瓶頸）
每加一個 FA 要做 3 件事：
1. **複製一整套該 FA 專屬 Notion 資料庫**（8 個：Clients、Portfolio、Insurance、Cashflow、Meeting Notes、Tasks、Insurance Plans、Funds），並把 Notion integration 分享給新庫。
2. **在 Users 表新增該 FA 記錄**：填 8 個 DB ID、Notion API Key、Role=Advisor、Name、登入帳密。（`lib/getAdvisorConfig.ts` 靠這筆記錄運作）
3. **匯入客戶資料**：跑 `scripts/import-from-excel.mjs` — 但目前 DB IDs 寫死 Bill 自己的（約第 36–39 行），要先改成該 FA 的 DB ID。

### 環境層（已備好，不用每個 FA 重設）
- Google OAuth app（Gmail/Calendar）✅
- Azure app（Outlook）✅，新 FA 首次連需 admin consent
- Vercel env vars ✅

## 已知的坑 / 風險
- **Google OAuth 未過驗證** → 只能加「測試使用者」上限 100 人。Beta 沒問題，正式對外要送審。
- `import-from-excel.mjs` 的 DB IDs 寫死，多 FA 會匯錯庫。
- 每個 FA 約耗 Admin 30–60 分鐘手動後台作業。

## 提案（待 Sky 拍板）
做一支「一鍵 onboard」腳本：輸入 FA 名字 →
1. 自動複製整套 Notion DB
2. 建好 Users 記錄
3. 產生登入帳號
4. import script 自動讀對應 DB ID

預期把 30–60 分鐘 → 約 5 分鐘。

**決策點**：先寫自動化腳本？還是先手動帶完第一個 Beta FA、確認流程順了再自動化？
