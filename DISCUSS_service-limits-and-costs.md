# ARIA — 各服務免費額度 vs 何時升級（成本規劃）

> 記錄日期：2026-07-06。數字會變動，正式決策前請以各廠商官方 pricing 頁為準。
> 關鍵前提：ARIA 用「一個 Notion integration」讀寫，**FA 不需登入 Notion → 加 FA 不增加 Notion 人頭費**。

## 對照表

| 服務 | 免費額度重點 | 主要限制 / 風險 | 何時要升級 | 約略費用 |
|------|------------|----------------|-----------|---------|
| Notion | 個人頁面/區塊基本無上限；API 免費 | API ~3 req/秒；單檔 5MB；版本史 7 天。FA 不佔座位 | 只有要真人進 Notion 共編才需付費座位 | Plus ≈ US$10/人/月（多半用不到） |
| Vercel | Hobby：100GB 流量/月、Cron 有限、函式有限 | ⚠️ Hobby 條款限「非商業」；Beta 給真實顧問＝商業 | 一開始收費/正式 Beta 就升 Pro | Pro ≈ US$20/月 |
| Gemini AI | 免費層有 RPM/RPD 上限 | ⚠️ 免費層可能用資料做訓練；對客戶資料＋PDPA 有風險 | 有真實客戶資料就轉付費層；量大時 | 按用量（Flash 很便宜） |
| Google API (Gmail/Calendar) | 配額充足、免費 | ⚠️ OAuth 未驗證 App 上限 100 人；gmail.modify 敏感範圍需 Google 驗證(可能含 CASA) | 超過 ~100 使用者前送審 | 驗證免費；CASA 可能收費 |
| Microsoft Graph (Outlook) | 免費、配額充足 | 需 Azure App + admin consent；多租戶需 publisher verification | 對接多家公司 Outlook 時 | 免費 |

## 三個最該注意（優先序）
1. **Vercel 升 Pro (~US$20/月)** — 商用＋資源；最先做。
2. **Gemini 轉付費層** — PDPA／客戶資料隱私；免費層恐拿資料訓練。正式上線前切換。
3. **Google OAuth 驗證 + 100 人上限** — 規模化前要提早送審（敏感範圍審核慢）。

## 結論
- 擴展 FA 在 Notion 端不增加人頭費。
- 主要固定成本：Vercel Pro；變動成本：少量 AI 用量。
- 合規重點：Gemini 付費層（資料不被訓練）＋ Google App 驗證。

---

# 三項行動細節（2026-07-06 補充）

## 1. Gemini 付費層設定（資料不被訓練）
- 事實：免費層 Google 可能用 prompt/回應改善產品；**付費層（開帳單）= 不用於訓練**。程式碼不改，同一把 `GEMINI_API_KEY`。
- 步驟：
  1. AI Studio → API Keys → 看 key 屬哪個 Google Cloud 專案
  2. Cloud Console → Billing → 該專案綁付費帳戶（信用卡）
  3. AI Studio 確認 key 顯示 "Paid tier"
  4. Cloud Billing → Budgets & alerts 設月上限（例 US$30）警示
  5. （選用）更嚴格可改 Vertex AI；Beta 用付費 Developer API 即可

## 2. Google OAuth 驗證送審清單
- 範圍：gmail.modify=Restricted（最嚴）、calendar.readonly=Sensitive、openid/email/profile=一般
- **Beta(5 FA)先不用送審**：OAuth consent 用 Testing 模式，把 5 位 FA email 加 Test users（上限 100）。
- 送審前要備：Production 模式、網域驗證、首頁/隱私/條款 URL、Logo、scope 理由、示範影片、Limited Use 聲明、**CASA 第三方安全評估（restricted 必須）**。
- 時程：sensitive ~數天–2 週；restricted+CASA ~數週–2-3 個月（提早排）。
- 可選減負：若不需 gmail.modify 可降範圍（但目前用來標記已讀/結案）。

## 3. Beta 每月成本（5 FA）
| 項目 | 費用 |
|------|------|
| Vercel Pro | ~US$20/月（固定，商用必須） |
| Gemini 付費層 | ~US$5–30/月（用量，Flash 很便宜） |
| Notion | US$0（FA 不佔座位） |
| Google/MS API | US$0 |
| 自訂網域(選用) | ~US$10–15/年 |
| **合計** | **≈ US$25–50/月** |
- 規模化邊際成本低：每加 1 FA 固定費不變，只多一點 AI 用量。
