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

-- Other tables already live in Supabase (not re-declared here yet):
--   clients, portfolio_holdings, insurance_policies, assets_liabilities,
--   cashflow_planner, meeting_notes, ai_usage_log, forms_library, users
-- (product catalogs insurance_plans / funds not yet created).
