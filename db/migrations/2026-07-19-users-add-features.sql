-- Migration: 2026-07-19  public.users — add features column (Phase 3)
--
-- WHY: getAdvisorConfig exposes `features` (comma-separated feature flags, gate
-- real functionality; admin user-create writes them). The Supabase public.users
-- table was seeded without this column. Additive + nullable — no behaviour change
-- (production still reads Users from Notion until DATA_SOURCE_USERS flips).
-- Spec: docs/superpowers/specs/2026-07-19-phase3-users-config-design.md
--
-- Rollback: alter table public.users drop column if exists features;

alter table public.users add column if not exists features text;
