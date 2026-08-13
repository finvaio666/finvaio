-- Migration: 2026-07-12  clients — add columns present in Notion but missing in Supabase
--
-- WHY: Phase 2 (table 2.1 clients). The pre-provisioned Supabase `clients` table
-- was a 20-row test seed (2026-06-21) and omitted several fields that exist in the
-- Notion Clients DB. Full migration authority = Notion (285 clients). User decision
-- (2026-07-12): add ALL missing columns so no field is lost on import.
--
-- Notion property (type)          → column (type)
--   NRIC / Reg No (rich_text)     → nric_reg_no         text
--   EPF Account No (rich_text)    → epf_account_no      text
--   Occupation (rich_text)        → occupation          text
--   Client Type (select)          → client_type         text
--   Invested Capital (MYR) (num)  → invested_capital_myr numeric
--   FAME Accounts (rich_text)     → fame_accounts       text
--   FAME Sync Date (date)         → fame_sync_date      date
--
-- All nullable, additive only — existing code and the live prod app (which still
-- reads clients from Notion) are unaffected.
--
-- Rollback: alter table clients
--   drop column if exists nric_reg_no, drop column if exists epf_account_no,
--   drop column if exists occupation, drop column if exists client_type,
--   drop column if exists invested_capital_myr, drop column if exists fame_accounts,
--   drop column if exists fame_sync_date;

alter table clients add column if not exists fame_accounts        text;
alter table clients add column if not exists invested_capital_myr numeric;
alter table clients add column if not exists fame_sync_date       date;
alter table clients add column if not exists client_type          text;
alter table clients add column if not exists nric_reg_no          text;
alter table clients add column if not exists epf_account_no       text;
alter table clients add column if not exists occupation           text;
