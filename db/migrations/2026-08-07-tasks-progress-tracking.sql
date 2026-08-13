-- Migration: 2026-08-07  tasks — progress stages + movement log
--
-- WHY: A task was binary (Open/Done) with no record of what happened in
-- between, so an advisor preparing a client review could not tell whether an
-- outstanding item had been started, was blocked on the client, or had never
-- been touched. Three changes:
--   1. status widens from Open/Done to four stages;
--   2. progress_log holds an append-only history, one entry per line
--      ("2026-08-07 · Submitted to Allianz") — see lib/taskModel.ts;
--   3. updated_at records the last movement, which drives the "no movement in
--      N days" hint in the UI.
--
-- Existing rows only ever hold 'Open' or 'Done', both still valid, so the
-- widened CHECK accepts all current data unchanged. progress_log/updated_at are
-- additive + nullable: rows predating this migration read back with an empty
-- log and no last-moved date, which the UI renders as "no updates logged yet".
--
-- No new table → no RLS clause needed (see AGENTS.md; RLS is already enabled
-- on `tasks`).
--
-- Rollback:
--   alter table tasks drop constraint tasks_status_check;
--   alter table tasks add  constraint tasks_status_check check (status in ('Open','Done'));
--   -- (rollback of the CHECK requires no 'In Progress'/'Waiting on Client' rows)
--   alter table tasks drop column if exists progress_log;
--   alter table tasks drop column if exists updated_at;

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add  constraint tasks_status_check
  check (status in ('Open', 'In Progress', 'Waiting on Client', 'Done'));

alter table tasks add column if not exists progress_log text;
alter table tasks add column if not exists updated_at   date;
