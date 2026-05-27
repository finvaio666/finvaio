import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface FsmFactsheetResponse {
  status: string;
  errorMessage?: string;
  data?: {
    fundName: string;
    fundCurrencyCode: string;
    latestNavPrice?: {
      bidPrice: number;
      navPrice: number;
      percentRate: number;
      dailyPricePk?: {
        fundid: string;
        showDate: number; // Unix ms timestamp
      };
    };
  };
}

export interface FsmNavResult {
  code: string;
  fundName?: string;
  currency?: string;
  bidPrice?: number;
  priceDate?: number | null;
  percentChange?: number;
  error?: string;
}

// ── GET /api/fetch-nav?codes=MYRII005,MYABC001 ──────────────────────────────
// Fetches the latest NAV/bid price from FSMOne for one or more fund codes.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codesParam = searchParams.get('codes');

  if (!codesParam?.trim()) {
    return NextResponse.json({ error: 'No fund codes provided. Use ?codes=CODE1,CODE2' }, { status: 400 });
  }

  const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean);
  if (!codes.length) {
    return NextResponse.json({ error: 'No valid codes' }, { status: 400 });
  }

  // Fetch each code in parallel from FSMOne (no auth required — public endpoint)
  const settled = await Promise.allSettled(
    codes.map(async (code): Promise<FsmNavResult> => {
      const res = await fetch(
        `https://www.fsmone.com.my/rest/fund/get-factsheet?paramSedolnumber=${encodeURIComponent(code)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': 'https://www.fsmone.com.my/',
            'Origin': 'https://www.fsmone.com.my',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          body: '{}',
        }
      );

      if (!res.ok) throw new Error(`FSMOne returned HTTP ${res.status}`);

      const json: FsmFactsheetResponse = await res.json();

      if (json.status !== 'SUCCESS' || !json.data) {
        throw new Error(json.errorMessage || `Code "${code}" not found on FSMOne`);
      }

      const d = json.data;
      const nav = d.latestNavPrice;

      // bidPrice is the unit price (NAV) for Malaysian unit trust funds
      const bidPrice = nav?.bidPrice ?? nav?.navPrice ?? 0;

      return {
        code,
        fundName: d.fundName,
        currency: d.fundCurrencyCode,
        bidPrice,
        priceDate: nav?.dailyPricePk?.showDate ?? null,
        percentChange: nav?.percentRate ?? 0,
      };
    })
  );

  const results: FsmNavResult[] = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { code: codes[i], error: r.reason?.message ?? 'Unknown error' }
  );

  const successCount = results.filter(r => !r.error).length;
  const failCount    = results.filter(r =>  r.error).length;

  return NextResponse.json({ results, successCount, failCount });
}
