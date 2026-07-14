-- Phase 2, table 2.7 — product catalogues (insurance_plans + funds).
-- These tables did NOT exist in Supabase (unlike every prior table). products is a
-- per-advisor, feature-gated capability: DB IDs come only from the advisor's Notion
-- record (no company env fallback), and as of 2026-07-14 NO advisor has configured
-- an Insurance Plans / Funds DB — so both tables are created EMPTY (no source data
-- to import). Column shapes are derived from the read routes (notion?type=
-- insurance-products / funds) and the POST /api/products save handler.
-- Scoping mirrors the other tables: `advisor` name column, Admin sees all.

create table if not exists insurance_plans (
  id                  uuid        primary key default gen_random_uuid(),
  notion_id           text,                       -- source Notion page id (import/reconcile link)
  name                text,                       -- Notion "Name" (title)
  insurer             text,                       -- Notion "Insurer" (select)
  type                text,                       -- Life/Critical Illness/Medical/Investment-Linked/Takaful/Personal Accident/Others
  min_age             integer,                    -- Notion "Min Age"
  max_age             integer,                    -- Notion "Max Age"
  min_sum_assured     numeric,                    -- Notion "Min Sum Assured"
  max_sum_assured     numeric,                    -- Notion "Max Sum Assured"
  est_monthly_premium text,                       -- Notion "Est Monthly Premium" (rich_text, e.g. "RM 180–420")
  key_features        text,                       -- Notion "Key Features" (rich_text, "·"-joined)
  epf_approved        boolean     default false,  -- Notion "EPF Approved" (checkbox)
  status              text        default 'Active',-- Notion "Status" (select)
  advisor             text,                       -- owning advisor (name)
  created_at          timestamptz default now()
);

create index if not exists insurance_plans_advisor_idx on insurance_plans (advisor);
create index if not exists insurance_plans_status_idx   on insurance_plans (status);
create index if not exists insurance_plans_notion_idx   on insurance_plans (notion_id);

create table if not exists funds (
  id             uuid        primary key default gen_random_uuid(),
  notion_id      text,                            -- source Notion page id (import/reconcile link)
  name           text,                            -- Notion "Name" (title)
  fund_house     text,                            -- Notion "Fund House" (select)
  asset_class    text,                            -- Equity/Bond/Mixed/Money Market/Real Estate/Others
  region         text,                            -- Malaysia/Asia Pacific/Global/Regional/Others
  risk_level     text,                            -- Conservative/Moderate/Aggressive
  return_3y      numeric,                         -- Notion "3Y Return %"
  min_investment numeric,                         -- Notion "Min Investment"
  sales_charge   numeric,                         -- Notion "Sales Charge %"
  epf_approved   boolean     default false,       -- Notion "EPF Approved" (checkbox)
  status         text        default 'Active',    -- Notion "Status" (select)
  description    text,                            -- Notion "Description" (rich_text)
  advisor        text,                            -- owning advisor (name)
  created_at     timestamptz default now()
);

create index if not exists funds_advisor_idx on funds (advisor);
create index if not exists funds_status_idx   on funds (status);
create index if not exists funds_notion_idx   on funds (notion_id);
