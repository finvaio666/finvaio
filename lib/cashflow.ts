/**
 * lib/cashflow.ts
 * Chokepoint for reading the Cashflow Planner (Phase 2, table 2.5).
 *
 * Data-source switch. When DATA_SOURCE_CASHFLOW === 'supabase', entries are
 * served from Supabase ONLY (straight cutover); otherwise the Notion path is
 * used. surplus / savingsRate are computed here (Notion stores them as
 * formulas). `breakdown` comes from an optional Notion 'Notes' JSON blob; it is
 * unpopulated in production and has no consumer, so it is typically null.
 *
 * NOTE: this covers READS only. The cashflow writes (POST /api/cashflow,
 * DELETE, and the client form at /api/cashflow/submit) still hit Notion and are
 * deferred to the write-path phase.
 */

import { Client } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';
import { queryAllPages } from './notionQueryAll';
import * as sbCashflow from './repos/cashflow';

export interface CashflowEntry {
  id:          string;
  entry:       string;
  month:       string;   // YYYY-MM-DD
  income:      number;
  fixed:       number;
  variable:    number;
  epf:         number;
  surplus:     number;   // computed: income - fixed - variable - epf
  savingsRate: number;   // computed: round(surplus / income * 100)
  breakdown:   Record<string, Record<string, number>> | null;
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_CASHFLOW === 'supabase';
}

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k] as { type: string; number?: number | null } | undefined;
  return v?.type === 'number' ? (v.number ?? 0) : 0;
}
function titleOf(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; title?: { plain_text: string }[] } | undefined;
  return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : '';
}
function dateOf(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; date?: { start: string } | null } | undefined;
  return v?.type === 'date' ? (v.date?.start ?? '') : '';
}
function parseBreakdown(p: Record<string, unknown>): Record<string, Record<string, number>> | null {
  const v = p['Notes'] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  const raw = v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : '';
  if (raw.startsWith('{')) { try { return JSON.parse(raw); } catch { /* not JSON */ } }
  return null;
}

/** List cashflow entries scoped to this advisor (Admin sees all), newest month first. */
export async function listCashflow(config: AdvisorConfig): Promise<CashflowEntry[]> {
  if (useSupabase()) return sbCashflow.listCashflow(config);
  if (!config.cashflowDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];

  const notion = new Client({ auth: config.notionApiKey });
  const filter = config.role !== 'Admin'
    ? { property: 'Advisor', select: { equals: config.name } }
    : undefined;

  const pages = await queryAllPages(notion, {
    database_id: config.cashflowDbId,
    ...(filter ? { filter } : {}),
    sorts: [{ property: 'Month', direction: 'descending' }],
  });

  return pages.map(page => {
    const p = page.properties as Record<string, unknown>;
    const income   = num(p, 'Monthly income (MYR)');
    const fixed    = num(p, 'Fixed expenses (MYR)');
    const variable = num(p, 'Variable expenses (MYR)');
    const epf      = num(p, 'EPF contribution (MYR)');
    const surplus  = income - fixed - variable - epf;
    return {
      id:          page.id,
      entry:       titleOf(p, 'Entry'),
      month:       dateOf(p, 'Month'),
      income, fixed, variable, epf, surplus,
      savingsRate: income > 0 ? Math.round((surplus / income) * 100) : 0,
      breakdown:   parseBreakdown(p),
    };
  });
}
