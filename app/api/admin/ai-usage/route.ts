import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listUsageSince, type UsageRecord } from '@/lib/repos/aiUsage';

export const dynamic = 'force-dynamic';

/**
 * AI usage and estimated cost, whole company, Admin only.
 * Real advisor use and test runs (eval harness / dev) are reported separately so
 * a day of testing can't be mistaken for a day of FA activity - or hide inside it.
 * Costs are list-price estimates (lib/aiPricing.ts), not the Google invoice.
 */

export interface UsageTotals { calls: number; inputTokens: number; outputTokens: number; thinkingTokens: number; totalTokens: number; costUsd: number }
export interface UsageGroup extends UsageTotals { key: string }

export interface AiUsageReport {
  since:     string;
  days:      number;
  real:      UsageTotals;
  test:      UsageTotals;
  byDay:     (UsageGroup & { testCostUsd: number })[];
  byAdvisor: UsageGroup[];
  byFeature: UsageGroup[];
  byModel:   UsageGroup[];
  recent:    UsageRecord[];
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

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await listUsageSince(since);

  const realRows = rows.filter(r => !r.isTest), testRows = rows.filter(r => r.isTest);
  const real = zero(), test = zero();
  realRows.forEach(r => add(real, r)); testRows.forEach(r => add(test, r));

  const byDay = group(rows, r => r.date).map(g => ({
    ...round(g),
    testCostUsd: Math.round(testRows.filter(r => r.date === g.key).reduce((s, r) => s + r.estCostUsd, 0) * 10000) / 10000,
  })).sort((a, b) => b.key.localeCompare(a.key));

  const report: AiUsageReport = {
    since, days,
    real: round(real), test: round(test),
    byDay,
    byAdvisor: group(realRows, r => r.advisor).map(round).sort((a, b) => b.costUsd - a.costUsd),
    byFeature: group(realRows, r => r.feature).map(round).sort((a, b) => b.costUsd - a.costUsd),
    byModel:   group(rows, r => r.model || 'unknown').map(round).sort((a, b) => b.costUsd - a.costUsd),
    recent: rows.slice(0, 40).map(r => ({ ...r, question: r.question.slice(0, 160) })),
    note: 'Costs are list-price estimates of the Gemini calls FINVA made, not the Google invoice. Calls made on the free tier show the cost they would have had on the paid tier. Failed or rate-limited calls are not logged.',
  };
  return NextResponse.json(report);
}
