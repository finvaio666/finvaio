/**
 * lib/repos/cashflow.ts
 * Supabase data-access layer for the Cashflow Planner (Phase 2, table 2.5).
 *
 * surplus / savingsRate are Notion formulas — recomputed here (not stored).
 * `breakdown` has no Supabase column (the Notion 'Notes' JSON blob is never
 * populated in production and no consumer reads it), so it returns null,
 * matching the current Notion read exactly.
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
    breakdown:   null,
  };
}

/** List cashflow entries scoped to this advisor (Admin sees all), newest month first. */
export async function listCashflow(config: AdvisorConfig): Promise<CashflowEntry[]> {
  const sb = getSupabase();
  let q = sb
    .from(TABLE)
    .select('id, notion_id, entry, month, monthly_income_myr, fixed_expenses_myr, variable_expenses_myr, epf_contribution_myr, advisor')
    .order('month', { ascending: false });
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`cashflow list failed: ${error.message}`);
  return (data as Row[]).map(toEntry);
}
