import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

interface Body {
  id?: string;
  clientId?: string;
  policyName?: string;
  policyOwner?: string;
  lifeAssured?: string;
  insuranceType?: string;
  benefits?: string[];
  status?: string;
  insurer?: string;
  policyNumber?: string;
  sumAssured?: number;
  lifeCover?: number;
  ciCover?: number;
  paCover?: number;
  tpdCover?: number;
  annualPremium?: number;
  commencementDate?: string;
  maturityDate?: string;
  beneficiary?: string;
  medicalClass?: string;
  medicalCard?: string;
  notes?: string;
}

const txt = (s?: string) => [{ text: { content: (s ?? '').slice(0, 1900) } }];

function buildProps(b: Body, advisorName: string, isCreate: boolean) {
  const p: Record<string, unknown> = {};
  if (isCreate || b.policyName !== undefined) p['Policy Name'] = { title: txt(b.policyName) };
  if (b.policyOwner    !== undefined) p['Policy Owner']      = { rich_text: txt(b.policyOwner) };
  if (b.lifeAssured    !== undefined) p['Life Assured']      = { rich_text: txt(b.lifeAssured) };
  if (b.insuranceType)                p['Insurance Type']    = { select: { name: b.insuranceType } };
  if (b.benefits       !== undefined) p['Benefits']          = { multi_select: (b.benefits ?? []).map(n => ({ name: n })) };
  if (b.status)                       p['Status']            = { select: { name: b.status } };
  if (b.insurer        !== undefined) p['Insurer']           = { rich_text: txt(b.insurer) };
  if (b.policyNumber   !== undefined) p['Policy Number']     = { rich_text: txt(b.policyNumber) };
  if (b.sumAssured     !== undefined) p['Sum Assured (MYR)'] = { number: b.sumAssured || 0 };
  if (b.lifeCover      !== undefined) p['Life Cover (MYR)']  = { number: b.lifeCover || 0 };
  if (b.ciCover        !== undefined) p['CI Cover (MYR)']    = { number: b.ciCover || 0 };
  if (b.paCover        !== undefined) p['PA Cover (MYR)']    = { number: b.paCover || 0 };
  if (b.tpdCover       !== undefined) p['TPD Cover (MYR)']   = { number: b.tpdCover || 0 };
  if (b.annualPremium  !== undefined) p['Annual Premium (MYR)'] = { number: b.annualPremium || 0 };
  if (b.beneficiary    !== undefined) p['Beneficiary']      = { rich_text: txt(b.beneficiary) };
  if (b.medicalClass   !== undefined) p['Medical Class']    = { rich_text: txt(b.medicalClass) };
  if (b.medicalCard    !== undefined) p['Medical Card']     = { rich_text: txt(b.medicalCard) };
  if (b.notes          !== undefined) p['Notes']            = { rich_text: txt(b.notes) };
  if (b.commencementDate !== undefined) p['Commencement Date'] = b.commencementDate ? { date: { start: b.commencementDate } } : { date: null };
  if (b.maturityDate     !== undefined) p['Maturity Date']     = b.maturityDate ? { date: { start: b.maturityDate } } : { date: null };
  if (isCreate) {
    p['Advisor'] = { select: { name: advisorName } };
    if (b.clientId) p['Clients'] = { relation: [{ id: b.clientId }] };
  } else if (b.clientId !== undefined) {
    p['Clients'] = { relation: b.clientId ? [{ id: b.clientId }] : [] };
  }
  return p;
}

async function ctx(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config = advisorId ? await getAdvisorConfig(advisorId) : null;
  return config;
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
  if (!config?.notionApiKey || !config.insuranceDbId) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  const b = await req.json() as Body;
  if (!b.policyName?.trim()) return NextResponse.json({ error: 'Policy name is required' }, { status: 400 });
  const notion = new Client({ auth: config.notionApiKey });
  try {
    const page = await notion.pages.create({ parent: { database_id: config.insuranceDbId }, properties: buildProps(b, config.name, true) as never });
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
