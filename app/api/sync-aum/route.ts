import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients, setClientAum } from '@/lib/clients';
import { listHoldings } from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

  if (!config?.notionApiKey || !config.clientsDbId || !config.portfolioDbId) {
    return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 401 });
  }

  try {
    // Step 1: Sum Value (MYR) per client from Portfolio, keyed on the
    // source-agnostic clientNotionId (every holding links exactly one client,
    // so this matches the old per-relation sum). Data source per each flag.
    const aumByClient: Record<string, number> = {};
    const holdings = await listHoldings(config);
    for (const h of holdings) {
      if (!h.clientNotionId) continue;
      aumByClient[h.clientNotionId] = (aumByClient[h.clientNotionId] ?? 0) + h.valueMyr;
    }

    // Step 2: Write each client's AUM (MYR) back (only clients that have holdings).
    const clients = await listClients(config);
    const updated: { name: string; aum: number }[] = [];

    for (const c of clients) {
      const aum = aumByClient[c.notionId];
      if (aum === undefined) continue;
      await setClientAum(config, c.id, Math.round(aum));
      updated.push({ name: c.name || c.id, aum: Math.round(aum) });
      await sleep(300);
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    console.error('sync-aum error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
