/**
 * lib/marketData.ts
 * Live Malaysian market data from Bank Negara Malaysia's free Open API
 * (api.bnm.gov.my). Authoritative, no API key required. Used to ground the
 * Market Digest so it reflects real day-to-day figures instead of stale AI memory.
 */

import { generateText } from './emailClassifier';

const BNM = 'https://api.bnm.gov.my/public';
const HEADERS = { Accept: 'application/vnd.BNM.API.v1+json' };

async function bnm(path: string): Promise<{ data?: unknown }> {
  const r = await fetch(`${BNM}${path}`, { headers: HEADERS, cache: 'no-store' });
  if (!r.ok) throw new Error(`BNM ${path} ${r.status}`);
  return r.json();
}

export interface FxRate { code: string; unit: number; rate: number; date: string }
export interface MarketData {
  opr:  { level: number; change: number; date: string } | null;
  fx:   FxRate[];
  gold: { oneOzSelling: number; oneOzBuying: number; date: string } | null;
  dataDate: string;  // most recent date across the figures (YYYY-MM-DD)
}

const FX_WANT = ['USD', 'SGD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD'];

/** Pull OPR, FX and gold from BNM. Tolerant: any failed part is simply omitted. */
export async function getBnmMarketData(): Promise<MarketData> {
  const out: MarketData = { opr: null, fx: [], gold: null, dataDate: '' };
  const dates: string[] = [];

  const [oprR, fxR, goldR] = await Promise.allSettled([
    bnm('/opr'),
    bnm('/exchange-rate?quote=rm'),
    bnm('/kijang-emas'),
  ]);

  if (oprR.status === 'fulfilled') {
    const d = oprR.value.data as { new_opr_level?: number; change_in_opr?: number; date?: string } | undefined;
    if (d && typeof d.new_opr_level === 'number') {
      out.opr = { level: d.new_opr_level, change: d.change_in_opr ?? 0, date: d.date ?? '' };
      if (d.date) dates.push(d.date);
    }
  }

  if (fxR.status === 'fulfilled') {
    const arr = (fxR.value.data as Array<{ currency_code: string; unit: number; rate?: { buying_rate?: number; selling_rate?: number; middle_rate?: number | null; date?: string } }>) ?? [];
    for (const c of arr) {
      if (!FX_WANT.includes(c.currency_code)) continue;
      const b = c.rate?.buying_rate, s = c.rate?.selling_rate, m = c.rate?.middle_rate;
      const rate = (typeof m === 'number' ? m : (typeof b === 'number' && typeof s === 'number' ? (b + s) / 2 : (s ?? b)));
      if (typeof rate === 'number') {
        out.fx.push({ code: c.currency_code, unit: c.unit || 1, rate: Math.round(rate * 10000) / 10000, date: c.rate?.date ?? '' });
        if (c.rate?.date) dates.push(c.rate.date);
      }
    }
  }

  if (goldR.status === 'fulfilled') {
    const d = goldR.value.data as { one_oz?: { buying?: number; selling?: number }; effective_date?: string } | undefined;
    if (d?.one_oz) {
      out.gold = { oneOzSelling: d.one_oz.selling ?? 0, oneOzBuying: d.one_oz.buying ?? 0, date: d.effective_date ?? '' };
      if (d.effective_date) dates.push(d.effective_date);
    }
  }

  out.dataDate = dates.sort().reverse()[0] ?? new Date().toISOString().slice(0, 10);
  return out;
}

/** Human-readable figures block (also used as a no-AI fallback). */
export function formatFigures(d: MarketData): string {
  const lines: string[] = [];
  if (d.opr) lines.push(`• OPR: ${d.opr.level.toFixed(2)}% (last change ${d.opr.change >= 0 ? '+' : ''}${d.opr.change} bps, decided ${d.opr.date})`);
  for (const f of d.fx) lines.push(`• ${f.unit > 1 ? `${f.unit} ` : ''}${f.code}/MYR: ${f.rate.toFixed(4)}`);
  if (d.gold) lines.push(`• Kijang Emas (1oz): sell RM ${d.gold.oneOzSelling.toLocaleString()} / buy RM ${d.gold.oneOzBuying.toLocaleString()}`);
  return lines.join('\n');
}

/** Generate an advisor-facing digest grounded ONLY in the live BNM figures. */
export async function generateMarketDigest(d: MarketData): Promise<string> {
  const figures = formatFigures(d);
  const prompt = `You are a market analyst writing a short daily market digest for a Malaysian financial advisory team (Bill Morrisons).

Use ONLY these LIVE figures from Bank Negara Malaysia (as of ${d.dataDate}). Do NOT invent any other numbers, index levels, or statistics — if you don't have a figure, speak qualitatively instead.

LIVE FIGURES:
${figures}

Write a concise digest in markdown:
- Start with "**Malaysia Market Snapshot — ${d.dataDate}**"
- A short bullet list restating the key live figures above in plain language
- 2-3 sentences of neutral context an advisor can share with clients (e.g. what a stable OPR / current MYR levels generally mean) — clearly general, no fabricated data
- End with one practical "Advisor note:" line
Keep it under 180 words. No disclaimers about being an AI.`;

  try {
    return (await generateText(prompt)).trim();
  } catch {
    // No-AI fallback — still fresh, just unformatted
    return `**Malaysia Market Snapshot — ${d.dataDate}**\n\n${figures}\n\n_AI commentary unavailable; figures are live from Bank Negara Malaysia._`;
  }
}
