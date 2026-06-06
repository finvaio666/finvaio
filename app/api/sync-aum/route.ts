import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig, advisorFilter } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

  if (!config?.notionApiKey || !config.clientsDbId || !config.portfolioDbId) {
    return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 401 });
  }

  const notion = new Client({ auth: config.notionApiKey });
  const DB = { clients: config.clientsDbId, portfolio: config.portfolioDbId };
  const f = advisorFilter(config);

  try {
    // Step 1: Sum Value (MYR) per client from Portfolio
    const aumByClient: Record<string, number> = {};
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({
        database_id: DB.portfolio,
        start_cursor: cursor,
        ...(f ? { filter: f } : {}),
      });
      for (const page of res.results.filter(isFullPage)) {
        const relations = page.properties['👥 Clients']?.type === 'relation'
          ? page.properties['👥 Clients'].relation : [];
        const valueMYR = page.properties['Value (MYR)']?.type === 'number'
          ? page.properties['Value (MYR)'].number ?? 0 : 0;
        for (const rel of relations) {
          aumByClient[rel.id] = (aumByClient[rel.id] ?? 0) + valueMYR;
        }
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);

    // Step 2: Update each client's AUM (MYR)
    const clientRes = await notion.databases.query({ database_id: DB.clients, ...(f ? { filter: f } : {}) });
    const updated: { name: string; aum: number }[] = [];

    for (const page of clientRes.results.filter(isFullPage)) {
      const aum = aumByClient[page.id];
      if (aum === undefined) continue;
      const name = page.properties['Client Name']?.type === 'title'
        ? page.properties['Client Name'].title[0]?.plain_text ?? page.id : page.id;
      await notion.pages.update({
        page_id: page.id,
        properties: { 'AUM (MYR)': { number: Math.round(aum) } },
      });
      updated.push({ name, aum: Math.round(aum) });
      await sleep(300);
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    console.error('sync-aum error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
