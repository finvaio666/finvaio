/**
 * lib/repos/cashflow.ts
 * Supabase data-access layer for the Cashflow Planner (Phase 2, tables 2.5 read
 * + 2.11 write).
 *
 * surplus / savingsRate are Notion formulas — recomputed here (not stored).
 * `breakdown` (income/fixed/variable/epf line items + advisorNotes) lives in the
 * `breakdown jsonb` column (Decision Point C, migration 2026-07-16). Old rows
 * reconciled from Notion have it null (the Notion 'Notes' blob is unpopulated),
 * so they read back as null — identical to before.
 *
 * Writes (2.11): upsertCashflow keys on (entry, advisor) == (client + month +
 * advisor), since `entry` encodes "client — monthLabel". Update in place if a
 * matching row exists, else insert. Supabase-native rows carry no notion_id.
 */

import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import type { CashflowEntry } from '../cashflow';

const TABLE = 'cashflow_planner';

interface Row {
  id:                    string;
  notion_id:             string | null;
  entry:                 string | null;
  month:                 string | null; // date → 'YYYY-MM-DD'
  monthly_income_myr:    number | string | null;
  fixed_expenses_myr:    number | string | null;
  variable_expenses_myr: number | string | null;
  epf_contribution_myr:  number | string | null;
  advisor:               string | null;
  breakdown:             CashflowEntry['breakdown'];
}

const n = (v: number | string | null): number => (v == null ? 0 : Number(v));

function toEntry(r: Row): CashflowEntry {
  const income   = n(r.monthly_income_myr);
  const fixed    = n(r.fixed_expenses_myr);
  const variable = n(r.variable_expenses_myr);
  const epf      = n(r.epf_contribution_myr);
  const surplus  = income - fixed - variable - epf;
  return {
    id:          r.id,
    entry:       r.entry ?? '',
    month:       r.month ?? '',
    income, fixed, variable, epf, surplus,
    savingsRate: income > 0 ? Math.round((surplus / income) * 100) : 0,
    breakdown:   r.breakdown ?? null,
  };
}

/** List cashflow entries scoped to this advisor (Admin sees all), newest month first. */
export async function listCashflow(config: AdvisorConfig): Promise<CashflowEntry[]> {
  const sb = getSupabase();
  let q = sb
    .from(TABLE)
    .select('id, notion_id, entry, month, monthly_income_myr, fixed_expenses_myr, variable_expenses_myr, epf_contribution_myr, advisor, breakdown')
    .order('month', { ascending: false });
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`cashflow list failed: ${error.message}`);
  return (data as Row[]).map(toEntry);
}

export interface CashflowWrite {
  entry:          string;        // "client — monthLabel"
  month:          string;        // 'YYYY-MM-DD'
  advisor:        string;
  clientNotionId: string | null; // dashless Notion page id, when known (else preserved/absent)
  income:         number;
  fixed:          number;
  variable:       number;
  epf:            number;
  breakdown:      Record<string, unknown>;
}

/**
 * Upsert one cashflow entry keyed on (entry, advisor) == (client + month +
 * advisor). Mirrors the Notion POST upsert and gives the client form per-month
 * history (Decision Point C — replaces the Notion "archive all months" path).
 * client_notion_id is only written when provided, never cleared, so a POST
 * update (no client id) won't wipe a relation set by an earlier form submit.
 */
export async function upsertCashflow(w: CashflowWrite): Promise<{ id: string; entry: string }> {
  const sb = getSupabase();

  const values: Record<string, unknown> = {
    entry:                 w.entry,
    month:                 w.month,
    advisor:               w.advisor,
    monthly_income_myr:    w.income,
    fixed_expenses_myr:    w.fixed,
    variable_expenses_myr: w.variable,
    epf_contribution_myr:  w.epf,
    breakdown:             w.breakdown,
  };
  if (w.clientNotionId) values.client_notion_id = w.clientNotionId;

  const { data: found, error: selErr } = await sb
    .from(TABLE).select('id').eq('entry', w.entry).eq('advisor', w.advisor).limit(1).maybeSingle();
  if (selErr) throw new Error(`cashflow upsert lookup failed: ${selErr.message}`);

  if (found) {
    const { error } = await sb.from(TABLE).update(values).eq('id', found.id);
    if (error) throw new Error(`cashflow update failed: ${error.message}`);
    return { id: found.id as string, entry: w.entry };
  }
  const { data: ins, error } = await sb.from(TABLE).insert(values).select('id').single();
  if (error) throw new Error(`cashflow insert failed: ${error.message}`);
  return { id: (ins as { id: string }).id, entry: w.entry };
}

/** Delete a cashflow row by id. Non-admins may only delete their own (advisor match). */
export async function deleteCashflow(config: AdvisorConfig, id: string): Promise<void> {
  const sb = getSupabase();
  if (config.role !== 'Admin') {
    const { data, error } = await sb.from(TABLE).select('advisor').eq('id', id).maybeSingle();
    if (error) throw new Error(`cashflow delete lookup failed: ${error.message}`);
    if (!data || (data as { advisor: string }).advisor !== config.name) throw new Error('Forbidden');
  }
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`cashflow delete failed: ${error.message}`);
}
