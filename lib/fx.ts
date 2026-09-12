/**
 * lib/fx.ts
 * Live FX rates to MYR (ECB via Frankfurter).
 *
 * Shared so the FX refresh route and the note-intake accept route can't drift
 * apart on source or shape. scripts/update-fx-rates.mjs keeps its own copy —
 * it runs outside the Next app and can't import this.
 */

/** `toMyr[ccy]` is how many MYR one unit of `ccy` buys. MYR itself is always 1. */
export async function fetchMyrRates(): Promise<{ date: string; toMyr: Record<string, number> }> {
  const res = await fetch('https://api.frankfurter.app/latest?base=MYR', { cache: 'no-store' });
  if (!res.ok) throw new Error(`FX source returned ${res.status}`);
  const body = await res.json() as { date: string; rates: Record<string, number> };
  const toMyr: Record<string, number> = { MYR: 1 };
  for (const [ccy, perMyr] of Object.entries(body.rates)) {
    if (perMyr > 0) toMyr[ccy] = 1 / perMyr;
  }
  return { date: body.date, toMyr };
}
