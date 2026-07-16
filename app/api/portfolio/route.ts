import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { resolveClientNotionId } from '@/lib/clients';
import * as sbPortfolio from '@/lib/repos/portfolio';

export const dynamic = 'force-dynamic';

const useSupabase = () => process.env.DATA_SOURCE_PORTFOLIO === 'supabase';

interface Body {
  id?: string;
  clientId?: string;
  holdingName?: string;
  assetClass?: string;
  institution?: string;
  status?: string;
  currency?: string;
  valueOrig?: number;
  purchaseOrig?: number;
  fxRate?: number;
  valueMyr?: number;
  purchaseMyr?: number;
  units?: number;
  maturityDate?: string;
}

const txt = (s?: string) => [{ text: { content: (s ?? '').slice(0, 1900) } }];

function buildProps(b: Body, advisorName: string, isCreate: boolean) {
  const p: Record<string, unknown> = {};
  if (isCreate || b.holdingName !== undefined) p['Holding Name'] = { title: txt(b.holdingName) };
  if (b.assetClass)               p['Asset class']  = { select: { name: b.assetClass } };
  if (b.institution !== undefined) p['Institution'] = { rich_text: txt(b.institution) };
  if (b.status)                   p['Status']       = { select: { name: b.status } };
  if (b.currency)                 p['Currency']     = { select: { name: b.currency } };
  if (b.valueOrig    !== undefined) p['Value (Original Currency)']          = { number: b.valueOrig || 0 };
  if (b.purchaseOrig !== undefined) p['Purchase price (original currency)'] = { number: b.purchaseOrig || 0 };
  if (b.fxRate       !== undefined) p['FX Rate to MYR']                     = { number: b.fxRate || 1 };
  if (b.valueMyr     !== undefined) p['Value (MYR)']                        = { number: b.valueMyr || 0 };
  if (b.purchaseMyr  !== undefined) p['Purchase price (MYR)']               = { number: b.purchaseMyr || 0 };
  if (b.units        !== undefined) p['Units']                             = { number: b.units || 0 };
  if (b.maturityDate !== undefined) p['Maturity date'] = b.maturityDate ? { date: { start: b.maturityDate } } : { date: null };
  if (isCreate) {
    p['Advisor'] = { select: { name: advisorName } };
    if (b.clientId) p['👥 Clients'] = { relation: [{ id: b.clientId }] };
  } else if (b.clientId !== undefined) {
    p['👥 Clients'] = { relation: b.clientId ? [{ id: b.clientId }] : [] };
  }
  return p;
}

/** Supabase column patch — mirrors buildProps() field-for-field (client linkage set by caller). */
function buildPortfolioPatch(b: Body, advisorName: string, isCreate: boolean): Record<string, unknown> {
  const t = (s?: string) => (s ?? '').slice(0, 1900);
  const p: Record<string, unknown> = {};
  if (isCreate || b.holdingName !== undefined) p.holding_name = t(b.holdingName);
  if (b.assetClass)               p.asset_class            = b.assetClass;
  if (b.institution !== undefined) p.institution           = t(b.institution);
  if (b.status)                   p.status                 = b.status;
  if (b.currency)                 p.currency               = b.currency;
  if (b.valueOrig    !== undefined) p.value_original_currency = b.valueOrig || 0;
  if (b.purchaseOrig !== undefined) p.purchase_price_original = b.purchaseOrig || 0;
  if (b.fxRate       !== undefined) p.fx_rate_to_myr          = b.fxRate || 1;
  if (b.valueMyr     !== undefined) p.value_myr               = b.valueMyr || 0;
  if (b.purchaseMyr  !== undefined) p.purchase_price_myr      = b.purchaseMyr || 0;
  if (b.units        !== undefined) p.units                   = b.units || 0;
  if (b.maturityDate !== undefined) p.maturity_date           = b.maturityDate || null;
  if (isCreate) p.advisor = advisorName;
  return p;
}

async function ctx(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  return advisorId ? await getAdvisorConfig(advisorId) : null;
}

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
  if (!config?.notionApiKey || !config.portfolioDbId) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  const b = await req.json() as Body;
  if (!b.holdingName?.trim()) return NextResponse.json({ error: 'Holding name is required' }, { status: 400 });

  if (useSupabase()) {
    try {
      const patch = buildPortfolioPatch(b, config.name, true);
      if (b.clientId) patch.client_notion_id = await resolveClientNotionId(b.clientId);
      const { id } = await sbPortfolio.createHolding(patch);
      return NextResponse.json({ success: true, id });
    } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  }

  const notion = new Client({ auth: config.notionApiKey });
  try {
    const page = await notion.pages.create({ parent: { database_id: config.portfolioDbId }, properties: buildProps(b, config.name, true) as never });
    return NextResponse.json({ success: true, id: page.id });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  const config = await ctx(req);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  const b = await req.json() as Body;
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (useSupabase()) {
    try {
      const patch = buildPortfolioPatch(b, config.name, false);
      if (b.clientId !== undefined) patch.client_notion_id = b.clientId ? await resolveClientNotionId(b.clientId) : null;
      await sbPortfolio.updateHolding(config, b.id, patch);
      return NextResponse.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 });
    }
  }

  const notion = new Client({ auth: config.notionApiKey });
  if (!await assertOwner(notion, b.id, config.name, config.role === 'Admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await notion.pages.update({ page_id: b.id, properties: buildProps(b, config.name, false) as never });
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
      await sbPortfolio.deleteHolding(config, id);
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
