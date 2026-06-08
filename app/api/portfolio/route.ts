import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

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
  const notion = new Client({ auth: config.notionApiKey });
  if (!await assertOwner(notion, id, config.name, config.role === 'Admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await notion.pages.update({ page_id: id, archived: true } as never);
    return NextResponse.json({ success: true });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
