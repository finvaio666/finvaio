-- Migration: 2026-08-03  public.users — add platform_groups_json column (Phase 3.5c)
--
-- WHY: Phase 3.5c — lib/platformGroups.ts stores a company-wide platform→group
-- mapping as a JSON blob on the admin's users record (mirrors institutions_json).
-- This column is its Supabase home so the file can gate on DATA_SOURCE_USERS.
--
-- Additive, nullable, no backfill. users already has RLS enabled — this is an
-- `alter table`, NOT a `create table`, so per AGENTS.md do NOT add an
-- `enable row level security` line.
--
-- Rollback: alter table public.users drop column if exists platform_groups_json;

alter table public.users add column if not exists platform_groups_json text;
