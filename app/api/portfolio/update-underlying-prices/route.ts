import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listHoldings } from '@/lib/portfolio';
import { updateHolding } from '@/lib/repos/portfolio';

export const dynamic = 'force-dynamic';

/**
 * Refresh the "Today" price shown per underlying in a structured product's
 * dropdown, from live quotes. Supabase-only (underlying_details has no
 * Notion equivalent — see the 2026-08-21 migration).
 *
 * Ticker is read from "Name (TICKER)" in each stored underlying — same
 * parsing rule used everywhere else this data is consumed (worstVsKo,
 * DonutBreakdown underlying weightage), so a ticker mismatch here would show
 * up there too rather than being a hidden inconsistency.
 */
async function fetchQuote(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    const price = body?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' ? price : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const holdings = await listHoldings(config);
  const structured = holdings.filter(h => h.assetClass === 'Structured Product' && h.underlyingDetails?.underlyings?.length);

  const tickers = new Set<string>();
  for (const h of structured) {
    for (const u of h.underlyingDetails!.underlyings) {
      tickers.add(u.name.match(/\(([^)]+)\)/)?.[1] ?? u.name);
    }
  }

  const prices: Record<string, number> = {};
  const missing: string[] = [];
  const BATCH = 8;
  const list = [...tickers];
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(t => fetchQuote(t)));
    results.forEach((p, idx) => {
      if (p !== null) prices[batch[idx]] = p;
      else missing.push(batch[idx]);
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;
  const failures: string[] = [];
  for (const h of structured) {
    const details = h.underlyingDetails!;
    let changed = false;
    const newUnderlyings = details.underlyings.map(u => {
      const ticker = u.name.match(/\(([^)]+)\)/)?.[1] ?? u.name;
      const price = prices[ticker];
      if (price === undefined) return u;
      changed = true;
      return { ...u, today: price };
    });
    if (!changed) continue;
    try {
      await updateHolding(config, h.id, { underlying_details: { ...details, underlyings: newUnderlyings, priceAsOf: today } });
      updated++;
    } catch (e) {
      failures.push(`${h.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    date: today,
    tickersFetched: Object.keys(prices).length,
    tickersMissing: missing,
    holdingsUpdated: updated,
    holdingsFailed: failures.length,
    failures: failures.slice(0, 5),
  });
}
