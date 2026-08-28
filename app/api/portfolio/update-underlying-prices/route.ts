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

/**
 * Historical daily closes for a ticker, keyed by "YYYY-MM-DD" (UTC), covering
 * [fromDate, today]. Used to resolve a KO observation date against its ACTUAL
 * closing price instead of guessing from today's live price — a note trading
 * above KO today says nothing about whether it cleared KO on a past
 * observation date (see the 27 Jul false-positive incident, 2026-08-23).
 */
async function fetchHistoricalCloses(ticker: string, fromDate: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const period1 = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000) - 5 * 86400; // a few days' slack for the nearest-prior-trading-day lookup
    const period2 = Math.floor(Date.now() / 1000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' },
    );
    if (!res.ok) return out;
    const body = await res.json();
    const result = body?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
    if (!timestamps || !closes) return out;
    timestamps.forEach((ts, i) => {
      const c = closes[i];
      if (typeof c === 'number') out.set(new Date(ts * 1000).toISOString().slice(0, 10), c);
    });
  } catch {
    // leave out empty — caller treats a missing date as "can't resolve yet"
  }
  return out;
}

/** Closing price on `date`, or the nearest earlier trading day within 5 days
 * (weekends/holidays) — null if nothing found in that window. */
function closeOnOrBefore(closes: Map<string, number>, date: string): number | null {
  const d = new Date(`${date}T00:00:00Z`);
  for (let i = 0; i <= 5; i++) {
    const key = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10);
    const c = closes.get(key);
    if (c !== undefined) return c;
  }
  return null;
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
  const isPast = (date: string) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1); // same 1-day timezone buffer as the client flag
    return today >= d.toISOString().slice(0, 10);
  };

  // Earliest date each ticker needs historical data from, across every
  // holding's unresolved past KO obs entries — one fetch per ticker covers
  // every holding that shares it, instead of re-fetching per holding.
  const earliestNeeded = new Map<string, string>();
  for (const h of structured) {
    for (const s of h.underlyingDetails!.schedule) {
      if (!s.label.startsWith('KO obs') || s.resolved || !isPast(s.date)) continue;
      for (const u of h.underlyingDetails!.underlyings) {
        const ticker = u.name.match(/\(([^)]+)\)/)?.[1] ?? u.name;
        const prev = earliestNeeded.get(ticker);
        if (!prev || s.date < prev) earliestNeeded.set(ticker, s.date);
      }
    }
  }
  const historicalByTicker = new Map<string, Map<string, number>>();
  const tickersNeeded = [...earliestNeeded.entries()];
  for (let i = 0; i < tickersNeeded.length; i += BATCH) {
    const batch = tickersNeeded.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(([ticker, from]) => fetchHistoricalCloses(ticker, from)));
    batch.forEach(([ticker], idx) => historicalByTicker.set(ticker, results[idx]));
  }

  let updated = 0;
  let koObsResolved = 0;
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

    // Resolve KO obs dates chronologically against ACTUAL historical closes.
    // Stop at the first one that clears KO — anything after is moot once the
    // note has knocked out (still just a hint; only an admin's "Confirm exit"
    // actually changes status — see PortfolioPage.tsx isExitedNote/confirmExit).
    let stillOpen = true;
    const newSchedule = details.schedule.map(s => {
      if (!stillOpen || !s.label.startsWith('KO obs') || s.resolved || !isPast(s.date)) return s;
      const closesOnDate = details.underlyings.map(u => {
        const ticker = u.name.match(/\(([^)]+)\)/)?.[1] ?? u.name;
        const closes = historicalByTicker.get(ticker);
        return closes ? closeOnOrBefore(closes, s.date) : null;
      });
      if (closesOnDate.some(c => c === null)) return s; // missing data — leave unresolved, retry next run
      // Step-down notes lower the autocall barrier at each observation, so the
      // test is against THIS date's barrier (entry x triggerPct), not the single
      // `ko` on the underlying — comparing a later, lower step against the
      // initial 100% level silently misses real knock-outs. Rows with no
      // recorded triggerPct keep the old `ko` comparison.
      const cleared = details.underlyings.every((u, i) =>
        (closesOnDate[i] as number) >= (typeof s.triggerPct === 'number' ? u.entry * s.triggerPct / 100 : u.ko));
      changed = true;
      koObsResolved++;
      if (cleared) stillOpen = false;
      return { ...s, resolved: true, cleared };
    });

    if (!changed) continue;
    try {
      await updateHolding(config, h.id, { underlying_details: { ...details, underlyings: newUnderlyings, schedule: newSchedule, priceAsOf: today } });
      updated++;
    } catch (e) {
      failures.push(`${h.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    date: today,
    tickersFetched: Object.keys(prices).length,
    koObsResolved,
    tickersMissing: missing,
    holdingsUpdated: updated,
    holdingsFailed: failures.length,
    failures: failures.slice(0, 5),
  });
}
