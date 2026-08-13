-- Migration: 2026-07-17  soft delete — add deleted_at to every table with a delete entry point
--
-- WHY: Phase 2.11 shipped all Supabase deletes as hard DELETE, regressing the
-- Notion-era `archived: true` (soft, recoverable) semantics. Supabase free tier
-- has no PITR and Notion is frozen after cutover, so an accidental in-app delete
-- is currently unrecoverable without restoring a pg_dump.
-- Spec: docs/superpowers/specs/2026-07-17-soft-delete-design.md
--
-- Semantics: null = live; timestamp = deleted, and when.
-- Additive + nullable → no behaviour change (production still reads Notion).
-- No index (12MB DB, YAGNI). No deleted_by (solo team, YAGNI).
--
-- Rollback: alter table <t> drop column if exists deleted_at;

alter table portfolio_holdings add column if not exists deleted_at timestamptz;
alter table insurance_policies add column if not exists deleted_at timestamptz;
alter table assets_liabilities add column if not exists deleted_at timestamptz;
alter table cashflow_planner   add column if not exists deleted_at timestamptz;
alter table tasks              add column if not exists deleted_at timestamptz;
alter table forms_library      add column if not exists deleted_at timestamptz;
