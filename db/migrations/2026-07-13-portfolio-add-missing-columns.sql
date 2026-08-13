-- Migration: 2026-07-13  portfolio_holdings — add columns present in Notion but missing in Supabase
--
-- WHY: Phase 2 (table 2.2 portfolio). The pre-provisioned Supabase table was a
-- 107-row seed; real data = 1038 in Notion. User decision (2026-07-13): add the
-- missing DATA columns; SKIP the Notion formula columns (Return %, Gain/Loss MYR)
-- since those are derived from purchase_price / value and would only go stale.
--
-- Notion property (type)         → column (type)
--   Geography (rich_text)        → geography        text
--   FAME Account No (rich_text)  → fame_account_no  text
--   Fund Source (rich_text)      → fund_source      text
--   FAME Sync Date (date)        → fame_sync_date   date
--
-- All nullable, additive only — existing code and the live prod app (which still
-- reads portfolio from Notion) are unaffected.
--
-- Rollback: alter table portfolio_holdings
--   drop column if exists geography, drop column if exists fame_account_no,
--   drop column if exists fund_source, drop column if exists fame_sync_date;

alter table portfolio_holdings add column if not exists geography       text;
alter table portfolio_holdings add column if not exists fame_account_no text;
alter table portfolio_holdings add column if not exists fund_source     text;
alter table portfolio_holdings add column if not exists fame_sync_date  date;
