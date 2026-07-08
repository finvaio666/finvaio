-- Migration: 2026-07-07  tasks.type  'FA' → 'Client'
--
-- WHY: The app (lib/tasks.ts, app/api/tasks/route.ts, components/MeetingCapture.tsx)
-- uses type ∈ {'Admin','Client'}. The pre-built Supabase schema used
-- CHECK (type IN ('FA','Admin')) — 'FA' (Financial Advisor) was the schema
-- author's name for the same bucket the app calls 'Client'. There were ZERO
-- 'FA' rows (only null×18, Admin×1), so this realigns the DB to the app's
-- vocabulary with no data conflict and no app/Notion changes.
--
-- ⚠️ MARKER: if any type-related task bug appears after this date, check here
-- first — this is the only schema change made to `tasks` during Phase 1.
--
-- Rollback: alter table tasks drop constraint tasks_type_check;
--           alter table tasks add constraint tasks_type_check check (type in ('FA','Admin'));

alter table tasks drop constraint if exists tasks_type_check;
alter table tasks add  constraint tasks_type_check check (type in ('Client', 'Admin'));
