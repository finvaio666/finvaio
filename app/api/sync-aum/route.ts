import { NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';

export const dynamic = 'force-dynamic';

const DB = {
  clients:   '362de6dd-1dfe-80e5-9275-e4ce2fc046b2',
  portfolio: '363de6dd-1dfe-8058-b73e-c7fa8bb431fb',
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST() {
  if (!process.env.NOTION_API_KEY) {
    return NextResponse.json({ error: 'NOTION_API_KEY not set' }, { status: 500 });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  try {
    // Step 1: Sum Value (MYR) per client from Portfolio
    const aumByClient: Record<string, number> = {};
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({
        database_id: DB.portfolio,
        start_cursor: cursor,
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
    const clientRes = await notion.databases.query({ database_id: DB.clients });
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
