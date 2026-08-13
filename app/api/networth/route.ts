import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { NW_ITEMS } from '@/lib/networthForm';
import * as sbAssets from '@/lib/repos/assets';

export const dynamic = 'force-dynamic';

const useSupabase = () => process.env.DATA_SOURCE_ASSETS === 'supabase';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const MARKER = 'advisor-entry'; // Notes marker so re-saving replaces prior advisor-entered rows

interface Body {
  id?: string;
  clientName?: string;
  items?: Record<string, number | undefined>; // keyed by NW_ITEMS[].key
  // legacy single-item fields (PATCH/DELETE)
  name?: string;
  itemType?: 'Asset' | 'Liability';
  category?: string;
  value?: number;
  notes?: string;
}

const txt = (s?: string) => [{ text: { content: (s ?? '').slice(0, 1900) } }];

function buildProps(b: Body, advisorName: string) {
  const p: Record<string, unknown> = {};
  if (b.name !== undefined)     p['Name'] = { title: txt(b.name) };
  if (b.clientName !== undefined) p['Client'] = { rich_text: txt(b.clientName) };
  if (b.itemType)               p['Type']   = { select: { name: b.itemType } };
  if (b.category !== undefined) p['Category'] = { select: { name: b.category } };
  if (b.value !== undefined)    p['Value (MYR)'] = { number: b.value || 0 };
  if (b.notes !== undefined)    p['Notes'] = { rich_text: txt(b.notes) };
  p['Advisor'] = { select: { name: advisorName } };
  return p;
}

/** Supabase column patch — mirrors buildProps() field-for-field (advisor always stamped). */
function buildAssetPatch(b: Body, advisorName: string): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (b.name !== undefined)       p.name     = (b.name ?? '').slice(0, 1900);
  if (b.clientName !== undefined) p.client   = (b.clientName ?? '').slice(0, 1900);
  if (b.itemType)                 p.type     = b.itemType;
  if (b.category !== undefined)   p.category = b.category;
  if (b.value !== undefined)      p.value_myr = b.value || 0;
  if (b.notes !== undefined)      p.notes    = (b.notes ?? '').slice(0, 1900);
  p.advisor = advisorName;
  return p;
}

async function ctx(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  return advisorId ? await getAdvisorConfig(advisorId) : null;
}

/** Verify the record belongs to this advisor (Admin may edit any). */
async function assertOwner(notion: Client, pageId: string, name: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  try {
    const pg = await notion.pages.retrieve({ page_id: pageId });
    if (!isFullPage(pg)) return false;
    const owner = (pg.properties['Advisor'] as { select?: { name: string } })?.select?.name ?? '';
    return owner === name;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const config = await ctx(req);
  if (!config?.notionApiKey || !config.assetsDbId) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  const b = await req.json() as Body;
  if (!b.clientName?.trim()) return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  if (!b.items) return NextResponse.json({ error: 'items is required' }, { status: 400 });

  const notion = new Client({ auth: config.notionApiKey });
  const num = (v: unknown) => Math.max(0, Number(v) || 0);
  const rows = NW_ITEMS
    .map(it => ({ ...it, value: num(b.items?.[it.key]) }))
    .filter(r => r.value > 0);

  // ── Supabase write path (Phase 2.11) — replace prior marker rows, insert fresh.
  if (useSupabase()) {
    const stamp = new Date().toISOString().split('T')[0];
    try {
      const count = await sbAssets.replaceAssetEntries(config.name, b.clientName, MARKER,
        rows.map(r => ({
          name: r.label, client: b.clientName!, type: r.type, category: r.category,
          valueMyr: r.value, notes: `${MARKER} · saved ${stamp}`, advisor: config.name,
        })));
      return NextResponse.json({ success: true, count });
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  try {
    // Replace prior advisor-entry rows for this client
    const existing = await notion.databases.query({
      database_id: config.assetsDbId,
      filter: { and: [
        { property: 'Client',  rich_text: { equals: b.clientName } },
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

    const today = new Date().toISOString().split('T')[0];
    for (const r of rows) {
      await notion.pages.create({
        parent: { database_id: config.assetsDbId },
        properties: {
          'Name':        { title: [{ text: { content: r.label } }] },
          'Client':      { rich_text: [{ text: { content: b.clientName } }] },
          'Type':        { select: { name: r.type } },
          'Category':    { select: { name: r.category } },
          'Value (MYR)': { number: r.value },
          'Advisor':     { select: { name: config.name } },
          'Notes':       { rich_text: [{ text: { content: `${MARKER} · saved ${today}` } }] },
        } as never,
      });
      await sleep(250);
    }

    return NextResponse.json({ success: true, count: rows.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const config = await ctx(req);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  const b = await req.json() as Body;
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (useSupabase()) {
    try {
      await sbAssets.updateAsset(config, b.id, buildAssetPatch(b, config.name));
      return NextResponse.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 });
    }
  }

  const notion = new Client({ auth: config.notionApiKey });
  if (!await assertOwner(notion, b.id, config.name, config.role === 'Admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await notion.pages.update({ page_id: b.id, properties: buildProps(b, config.name) as never });
    return NextResponse.json({ success: true });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const config = await ctx(req);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (useSupabase()) {
    try {
      await sbAssets.deleteAsset(config, id);
      return NextResponse.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 });
    }
  }

  const notion = new Client({ auth: config.notionApiKey });
  if (!await assertOwner(notion, id, config.name, config.role === 'Admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await notion.pages.update({ page_id: id, archived: true } as never);
    return NextResponse.json({ success: true });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
