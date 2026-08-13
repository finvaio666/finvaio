-- Migration: 2026-07-16  cashflow_planner — add breakdown jsonb (Decision Point C)
--
-- WHY: Phase 2.11 cashflow write path. Both write endpoints build a structured
-- `breakdown` object (income/fixed/variable/epf line items + advisorNotes) and,
-- on the Notion side, stuff it as a JSON string into a 'Notes' rich_text field.
-- Supabase had no home for it, so the read path (repos/cashflow.ts) returned
-- breakdown=null. But CashflowPage.tsx DOES render this breakdown (per-row
-- expand panel). Decision Point C: give it a first-class `breakdown jsonb`
-- column so the write path can persist it and the read path can return it.
--
-- Notion 'Notes' (rich_text = JSON string) → breakdown (jsonb)
--
-- Nullable, additive only. Existing rows (2, reconciled from Notion where the
-- Notes blob is unpopulated) stay null → UI shows "No detailed breakdown
-- available", identical to today. The live prod app still reads cashflow from
-- Notion and is unaffected.
--
-- Rollback: alter table cashflow_planner drop column if exists breakdown;

alter table cashflow_planner add column if not exists breakdown jsonb;
