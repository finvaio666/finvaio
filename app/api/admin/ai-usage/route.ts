import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listUsageSince, type UsageRecord } from '@/lib/repos/aiUsage';
import { klDayStartIso } from '@/lib/aiGuard';
import { countsTowardQuota } from '@/lib/aiUsage';
import { USD_TO_MYR } from '@/lib/aiPricing';
import { getBnmMarketData } from '@/lib/marketData';

/** Market rate from Bank Negara for the RM figures; the fixed fallback only if BNM is unreachable. */
async function usdToMyrNow(): Promise<{ rate: number; date: string }> {
  try {
    const usd = (await getBnmMarketData()).fx.find(f => f.code === 'USD');
    if (usd?.rate) return { rate: usd.rate / (usd.unit || 1), date: usd.date };
  } catch { /* fall back */ }
  return { rate: USD_TO_MYR, date: '' };
}

export const dynamic = 'force-dynamic';

/**
 * AI usage and estimated cost, whole company, Admin only.
 * Real advisor use and test runs (eval harness / dev) are reported separately so
 * a day of testing can't be mistaken for a day of FA activity - or hide inside it.
 * Costs are list-price estimates (lib/aiPricing.ts), not the Google invoice.
 *
 * Filters (all optional, all applied server-side so every total on the page agrees):
 *   from, to   YYYY-MM-DD (inclusive). Falls back to `days` (default 30) ending today.
 *   advisor, feature, model   exact match ('' = all)
 *   scope      real | test | all   (default all; the cards still split real vs test)
 *   q          text search over question, advisor and feature
 *   format=csv every matching call as a CSV download
 */

export interface UsageTotals { calls: number; inputTokens: number; outputTokens: number; thinkingTokens: number; totalTokens: number; costUsd: number }
export interface UsageGroup extends UsageTotals { key: string }

export interface AiUsageFilters { from: string; to: string; advisor: string; feature: string; model: string; scope: 'real' | 'test' | 'all'; q: string }

export interface AiUsageReport {
  since:     string;
  days:      number;
  filters:   AiUsageFilters;
  /** Choices for the filter dropdowns - every value seen in the date range, before the other filters. */
  options:   { advisors: string[]; features: string[]; models: string[] };
  usdToMyr:  number;
  real:      UsageTotals;
  test:      UsageTotals;
  byDay:     (UsageGroup & { testCostUsd: number })[];
  byAdvisor: UsageGroup[];
  byFeature: UsageGroup[];
  byModel:   UsageGroup[];
  /** Matching calls, newest first (capped - use the CSV for everything). */
  calls:     UsageRecord[];
  callsTotal: number;
  /** Every question asked on `questionsDate` (Malaysia day), newest first, with who/what/cost and whether it was blocked. */
  questionsDate: string;
  questions: UsageRecord[];
  note:      string;
}

const zero = (): UsageTotals => ({ calls: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, costUsd: 0 });
function add(t: UsageTotals, r: UsageRecord) {
  t.calls++; t.inputTokens += r.inputTokens; t.outputTokens += r.outputTokens;
  t.thinkingTokens += r.thinkingTokens; t.totalTokens += r.totalTokens; t.costUsd += r.estCostUsd;
}
function group(rows: UsageRecord[], keyOf: (r: UsageRecord) => string): UsageGroup[] {
  const m = new Map<string, UsageGroup>();
  for (const r of rows) {
    const k = keyOf(r) || '—';
    const g = m.get(k) ?? { key: k, ...zero() };
    add(g, r); m.set(k, g);
  }
  return [...m.values()];
}
const round = <T extends UsageTotals>(t: T): T => ({ ...t, costUsd: Math.round(t.costUsd * 10000) / 10000 });
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const klToday = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const days = Math.min(Math.max(Number(sp.get('days')) || 30, 1), 365);
  const to = isDate(sp.get('to')) ? sp.get('to')! : klToday;
  const from = isDate(sp.get('from')) ? sp.get('from')! : new Date(new Date(`${to}T00:00:00Z`).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const scopeParam = sp.get('scope');
  const filters: AiUsageFilters = {
    from, to,
    advisor: sp.get('advisor') ?? '', feature: sp.get('feature') ?? '', model: sp.get('model') ?? '',
    scope: scopeParam === 'real' || scopeParam === 'test' ? scopeParam : 'all',
    q: (sp.get('q') ?? '').trim().toLowerCase(),
  };

  // The question log can reach outside the summary window.
  const qDate = isDate(sp.get('date')) ? sp.get('date')! : klToday;
  const [rows, fx] = await Promise.all([listUsageSince(qDate < from ? qDate : from), usdToMyrNow()]);

  const inRange = rows.filter(r => r.date >= from && r.date <= to);
  const matching = inRange.filter(r =>
    (!filters.advisor || r.advisor === filters.advisor) &&
    (!filters.feature || r.feature === filters.feature) &&
    (!filters.model || (r.model || 'unknown') === filters.model) &&
    (filters.scope === 'all' || (filters.scope === 'test') === r.isTest) &&
    (!filters.q || `${r.question} ${r.advisor} ${r.feature}`.toLowerCase().includes(filters.q)));

  if (sp.get('format') === 'csv') {
    const head = ['created_at_kl', 'date', 'advisor', 'feature', 'model', 'test_run', 'counts_toward_daily_limit', 'input_tokens', 'output_tokens', 'thinking_tokens', 'total_tokens', 'est_cost_usd', 'est_cost_myr', 'question'];
    const lines = matching.map(r => [
      new Date(r.createdAt).toLocaleString('en-CA', { timeZone: 'Asia/Kuala_Lumpur', hour12: false }),
      r.date, r.advisor, r.feature, r.model || 'unknown', r.isTest ? 'yes' : 'no', countsTowardQuota(r.feature) ? 'yes' : 'no',
      r.inputTokens, r.outputTokens, r.thinkingTokens, r.totalTokens,
      r.estCostUsd.toFixed(6), (r.estCostUsd * fx.rate).toFixed(4), r.question,
    ].map(csvCell).join(','));
    return new NextResponse([head.join(','), ...lines].join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="finva-ai-usage_${from}_to_${to}.csv"`,
      },
    });
  }

  const realRows = matching.filter(r => !r.isTest), testRows = matching.filter(r => r.isTest);
  const real = zero(), test = zero();
  realRows.forEach(r => add(real, r)); testRows.forEach(r => add(test, r));

  const byDay = group(matching, r => r.date).map(g => ({
    ...round(g),
    testCostUsd: Math.round(testRows.filter(r => r.date === g.key).reduce((s, r) => s + r.estCostUsd, 0) * 10000) / 10000,
  })).sort((a, b) => b.key.localeCompare(a.key));

  // The Malaysia day [00:00, 24:00) the question log is showing. Work Check rows
  // are the gatekeeper's own call for a question that is listed anyway.
  const dayStart = klDayStartIso(new Date(`${qDate}T12:00:00+08:00`));
  const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 3600_000).toISOString();
  const sortedUniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();

  const report: AiUsageReport = {
    since: from, days, filters,
    options: {
      advisors: sortedUniq(inRange.map(r => r.advisor)),
      features: sortedUniq(inRange.map(r => r.feature)),
      models:   sortedUniq(inRange.map(r => r.model || 'unknown')),
    },
    usdToMyr: fx.rate,
    real: round(real), test: round(test),
    byDay,
    byAdvisor: group(matching, r => r.advisor).map(round).sort((a, b) => b.costUsd - a.costUsd),
    byFeature: group(matching, r => r.feature).map(round).sort((a, b) => b.costUsd - a.costUsd),
    byModel:   group(matching, r => r.model || 'unknown').map(round).sort((a, b) => b.costUsd - a.costUsd),
    calls: matching.slice(0, 300).map(r => ({ ...r, question: r.question.slice(0, 200) })),
    callsTotal: matching.length,
    questionsDate: qDate,
    questions: rows.filter(r => r.createdAt >= dayStart && r.createdAt < dayEnd && r.feature !== 'Work Check'),
    note: `Costs are list-price estimates of the Gemini calls FINVA made, not the Google invoice (RM shown at ${fx.date ? `Bank Negara's rate of RM${fx.rate.toFixed(4)} per US$1 on ${fx.date}` : `about RM${fx.rate} per US$1 - live rate unavailable`}). Calls made on the free tier show the cost they would have had on the paid tier. Failed or rate-limited calls are not logged. Only chat features (Ask FINVA, Client Chat, task extraction, the work check) count toward an FA's daily limit; email drafts, term-sheet reads, meeting capture and similar are logged here but do not use up the limit.`,
  };
  return NextResponse.json(report);
}
