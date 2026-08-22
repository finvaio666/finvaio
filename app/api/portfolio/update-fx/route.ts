import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listHoldings, setFxRate } from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

// Same source and tolerance as scripts/update-fx-rates.mjs (the standalone
// one-time backfill this route replaces for day-to-day use). Kept in sync by
// hand — the script runs outside the Next app and can't import this route.
const TOLERANCE = 0.005; // 0.5% — skip a row already this close, don't churn it every refresh

async function fetchMyrRates(): Promise<{ date: string; toMyr: Record<string, number> }> {
  const res = await fetch('https://api.frankfurter.app/latest?base=MYR', { cache: 'no-store' });
  if (!res.ok) throw new Error(`FX source returned ${res.status}`);
  const body = await res.json() as { date: string; rates: Record<string, number> };
  const toMyr: Record<string, number> = { MYR: 1 };
  for (const [ccy, perMyr] of Object.entries(body.rates)) {
    if (perMyr > 0) toMyr[ccy] = 1 / perMyr;
  }
  return { date: body.date, toMyr };
}

/**
 * Refresh stored FX rates from live market rates (ECB via Frankfurter).
 *
 * Deliberately writes ONLY fx_rate_to_myr, never value_myr. In this book
 * value_myr is not derived from rate × value_orig — it arrives independently
 * from the FAME/iFAST syncs and is the trustworthy figure, while
 * value_original_currency is frequently 0 or stale. The app already prefers
 * stored value_myr and only falls back to value_orig × fx when it's absent, so
 * a holding whose valuation genuinely depends on the rate is held back and
 * reported rather than silently repriced by a routine refresh.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let rates: Awaited<ReturnType<typeof fetchMyrRates>>;
  try {
    rates = await fetchMyrRates();
  } catch (e) {
    return NextResponse.json({ error: `FX source unavailable: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }

  const holdings = await listHoldings(config);

  const toUpdate: { id: string; ccy: string; from: number; to: number }[] = [];
  const heldBack: { name: string; ccy: string; before: number; after: number }[] = [];
  let skippedNoCcy = 0;

  for (const h of holdings) {
    const ccy = (h.currency || '').trim().toUpperCase();
    if (!ccy) { skippedNoCcy++; continue; }
    const target = rates.toMyr[ccy];
    if (!target) { skippedNoCcy++; continue; }

    const current = h.fxRate ?? 0;
    const off = current > 0 ? Math.abs(current - target) / target : 1;
    if (off <= TOLERANCE) continue;

    // A holding with no stored MYR value is priced BY the rate — changing it
    // would move reported AUM, so surface it instead of writing silently.
    if (!(h.valueMyr > 0) && (h.valueOriginal ?? 0) > 0) {
      heldBack.push({
        name: h.name, ccy,
        before: h.valueOriginal * current,
        after:  h.valueOriginal * target,
      });
      continue;
    }

    toUpdate.push({ id: h.id, ccy, from: current, to: target });
  }

  // Write in small concurrent batches — sequential would be slow for an
  // Admin refreshing the whole book, unbounded Promise.all would hammer the
  // DB/Notion API.
  const BATCH = 15;
  let updated = 0;
  const failures: string[] = [];
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(u => setFxRate(config, u.id, u.to)));
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') updated++;
      else failures.push(`${batch[idx].ccy} ${batch[idx].id}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    });
  }

  const byCcy: Record<string, { count: number; rate: number }> = {};
  for (const u of toUpdate) byCcy[u.ccy] = { count: (byCcy[u.ccy]?.count ?? 0) + 1, rate: u.to };

  return NextResponse.json({
    date: rates.date,
    updated,
    failed: failures.length,
    failures: failures.slice(0, 5),
    byCcy,
    skippedNoCcy,
    heldBack: heldBack.slice(0, 20),
    heldBackCount: heldBack.length,
  });
}
