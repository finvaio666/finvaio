-- db/schema.sql
-- FINVA Notion→Postgres migration — schema reference (source of truth = the
-- LIVE Supabase database, which was already provisioned and data-imported
-- before this app-layer work started).
--
-- ⚠️ These tables ALREADY EXIST in Supabase with data. This file documents the
-- real schema for reference. Every statement is IF NOT EXISTS, so running it
-- against the live DB is a safe no-op. Do NOT "fix" column names here to match
-- MIGRATION.md — the live DB is authoritative; MIGRATION.md is being realigned
-- to it instead.
--
-- Convention in the live schema: every table carries `notion_id` (link back to
-- the source Notion page, used by the dual-write mirror); relations are stored
-- as `*_notion_id` text; the owning advisor is stored as `advisor` text (name).

-- ─────────────────────────────────────────────────────────────────────────
-- tasks  (Phase 1 pilot) — mirrors lib/tasks.ts Task shape.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists tasks (
  id          uuid        primary key default gen_random_uuid(),
  notion_id   text,                                 -- source Notion page id (import/reconcile link)
  task        text,
  client      text,                                 -- client name string
  status      text,                                 -- CHECK: 'Open' | 'Done'
  type        text,                                 -- CHECK: 'Client' | 'Admin' | null  (see migration 2026-07-07)
  due_date    date,
  done_date   date,
  source      text,                                 -- e.g. 'Meeting 2026-05-26' | 'Manual'
  advisor     text,                                 -- owning advisor (name)
  created_at  timestamptz default now()
);
-- constraints (already live): status IN ('Open','Done'); type IN ('Client','Admin')
--   NOTE: type check was changed 'FA'→'Client' on 2026-07-07 to match the app.
--   See db/migrations/2026-07-07-tasks-type-fa-to-client.sql

create index if not exists tasks_advisor_idx on tasks (advisor);
create index if not exists tasks_status_idx  on tasks (status);
create index if not exists tasks_notion_idx  on tasks (notion_id);

-- ─────────────────────────────────────────────────────────────────────────
-- clients  (Phase 2, table 2.1 — dependency root) — mirrors lib/clients.ts.
-- Migration authority = Notion (285 clients). The 7 fame_*/nric/epf/etc. columns
-- were added 2026-07-12 (see db/migrations/2026-07-12-clients-add-missing-columns.sql).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists clients (
  id                   uuid        primary key default gen_random_uuid(),
  notion_id            text,                       -- source Notion page id (import/reconcile link)
  client_name          text,                       -- Notion "Client Name" (title)
  phone                text,                       -- Notion "Phone" (phone_number)
  email                text,                       -- Notion "Email" (email)
  date_of_birth        date,                       -- Notion "Date of Birth"
  client_segment       text,                       -- Notion "Client Segment" (select)
  risk_profile         text,                       -- Notion "Risk Profile" (select)
  aum_myr              numeric,                    -- ⚠️ recomputed from portfolio post-migration, NOT copied from Notion
  monthly_income_myr   numeric,                    -- Notion "Monthly income (MYR)"
  financial_goals      text[],                     -- Notion "Financial goals" (multi_select)
  status               text,                       -- Notion "Status" (select)
  onboarding_date      date,                       -- Notion "Onboarding date"
  last_review_date     date,                       -- Notion "Last review date"
  next_review_date     date,                       -- Notion "Next review date"
  advisor              text,                       -- owning advisor (name)
  created_at           timestamptz default now(),
  -- added 2026-07-12 (Notion fields missing from the original seed):
  fame_accounts        text,                       -- Notion "FAME Accounts" (rich_text)
  invested_capital_myr numeric,                    -- Notion "Invested Capital (MYR)"
  fame_sync_date       date,                       -- Notion "FAME Sync Date"
  client_type          text,                       -- Notion "Client Type" (select)
  nric_reg_no          text,                       -- Notion "NRIC / Reg No" (rich_text) — sensitive PII
  epf_account_no       text,                       -- Notion "EPF Account No" (rich_text) — sensitive PII
  occupation           text                        -- Notion "Occupation" (rich_text)
);
create index if not exists clients_advisor_idx on clients (advisor);
create index if not exists clients_notion_idx  on clients (notion_id);

-- ─────────────────────────────────────────────────────────────────────────
-- portfolio_holdings  (Phase 2, table 2.2) — mirrors lib/portfolio.ts.
-- Migration authority = Notion (1038 holdings). Relation to clients is stored as
-- client_notion_id text (= clients.notion_id), NOT a uuid FK. geography/fame_*/
-- fund_source added 2026-07-13 (see db/migrations/2026-07-13-portfolio-add-missing-columns.sql).
-- Formula columns (Return %, Gain/Loss) are NOT stored — derived from price/value.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists portfolio_holdings (
  id                      uuid        primary key default gen_random_uuid(),
  notion_id               text,                    -- source Notion page id
  holding_name            text,                    -- Notion "Holding Name" (title)
  client_notion_id        text,                    -- Notion "👥 Clients" relation[0] → clients.notion_id
  asset_class             text,                    -- Notion "Asset class" (select)
  product_name            text,                    -- Notion "Product name" (rich_text)
  institution             text,                    -- Notion "Institution" (rich_text)
  currency                text,                    -- CHECK: MYR/AUD/SGD/USD (or null)
  fx_rate_to_myr          numeric,
  units                   numeric,
  purchase_price_original numeric,
  purchase_price_myr      numeric,
  value_original_currency numeric,
  value_myr               numeric,
  start_date              date,
  maturity_date           date,
  status                  text,
  advisor                 text,                    -- owning advisor (name)
  created_at              timestamptz default now(),
  -- added 2026-07-13 (Notion fields missing from the original seed):
  geography               text,                    -- Notion "Geography" (rich_text)
  fame_account_no         text,                    -- Notion "FAME Account No" (rich_text)
  fund_source             text,                    -- Notion "Fund Source" (rich_text)
  fame_sync_date          date                     -- Notion "FAME Sync Date"
);
create index if not exists portfolio_client_idx  on portfolio_holdings (client_notion_id);
create index if not exists portfolio_advisor_idx on portfolio_holdings (advisor);
create index if not exists portfolio_notion_idx  on portfolio_holdings (notion_id);

-- Other tables already live in Supabase (not re-declared here yet):
--   insurance_policies, assets_liabilities, cashflow_planner,
--   meeting_notes, ai_usage_log, forms_library, users
-- (product catalogs insurance_plans / funds not yet created).
