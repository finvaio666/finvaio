import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { verifyFormToken } from '@/lib/formToken';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { NW_ITEMS } from '@/lib/networthForm';
import * as sbAssets from '@/lib/repos/assets';

const useSupabase = () => process.env.DATA_SOURCE_ASSETS === 'supabase';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const MARKER = 'client-form'; // Notes marker so re-submission replaces prior client-form rows

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  // 1. Verify token
  const payload = verifyFormToken(String(body.token ?? ''));
  if (!payload) return NextResponse.json({ error: 'This link has expired or is invalid.' }, { status: 400 });

  // 2. Load advisor config
  const config = await getAdvisorConfig(payload.advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 500 });
  const clientName = payload.clientName;

  // 3. Parse amounts  (unchanged — source-independent)
  const num = (v: unknown) => Math.max(0, Number(String(v ?? '0').replace(/[^0-9.]/g, '')) || 0);
  const rows = NW_ITEMS
    .map(it => ({ ...it, value: num(body[it.key]) }))
    .filter(r => r.value > 0);

  let totalAssets = 0, totalLiabilities = 0;
  for (const r of rows) {
    if (r.type === 'Asset') totalAssets += r.value; else totalLiabilities += r.value;
  }

  const summary = {
    success: true,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    count: rows.length,
  };

  if (useSupabase()) {
    try {
      const today = new Date().toISOString().split('T')[0];
      // one call replaces the query→archive→create loop; no sleep() needed —
      // those were Notion rate-limit pacing
      await sbAssets.replaceAssetEntries(config.name, clientName, MARKER, rows.map(r => ({
        name:     r.label,
        client:   clientName,
        type:     r.type,
        category: r.category,
        valueMyr: r.value,
        notes:    `${MARKER} · submitted ${today}`,
        advisor:  config.name,
      })));
      return NextResponse.json(summary);
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // ── Notion path (unchanged) ──
  if (!config.notionApiKey || !config.assetsDbId) {
    return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 500 });
  }
  const notion = new Client({ auth: config.notionApiKey });
  try {
    // 4. Replace prior client-form entries for this client (idempotent re-submit)
    const existing = await notion.databases.query({
      database_id: config.assetsDbId,
      filter: { and: [
        { property: 'Client',  rich_text: { equals: clientName } },
        { property: 'Advisor', select:    { equals: config.name } },
        { property: 'Notes',   rich_text: { contains: MARKER } },
      ] },
      page_size: 100,
    });
    for (const pg of existing.results) {
      if (!isFullPage(pg)) continue;
      await notion.pages.update({ page_id: pg.id, archived: true } as never);
      await sleep(120);
    }

    // 5. Create fresh rows
    const today = new Date().toISOString().split('T')[0];
    for (const r of rows) {
      await notion.pages.create({
        parent: { database_id: config.assetsDbId },
        properties: {
          'Name':        { title: [{ text: { content: r.label } }] },
          'Client':      { rich_text: [{ text: { content: clientName } }] },
          'Type':        { select: { name: r.type } },
          'Category':    { select: { name: r.category } },
          'Value (MYR)': { number: r.value },
          'Advisor':     { select: { name: config.name } },
          'Notes':       { rich_text: [{ text: { content: `${MARKER} · submitted ${today}` } }] },
        } as never,
      });
      await sleep(250);
    }

    return NextResponse.json(summary);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
