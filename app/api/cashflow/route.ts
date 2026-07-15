import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import * as sbCashflow from '@/lib/repos/cashflow';

const useSupabase = () => process.env.DATA_SOURCE_CASHFLOW === 'supabase';

export const dynamic = 'force-dynamic';

interface Body {
  clientName?: string;
  month?:      string; // YYYY-MM-DD (any day within the month)
  // Income
  salary?: number; business?: number; rental?: number; investment?: number; otherIncome?: number;
  // Fixed expenses
  housing?: number; carLoan?: number; insurancePremium?: number; education?: number; internet?: number; subscriptions?: number; otherFixed?: number;
  // Variable expenses
  food?: number; diningOut?: number; transport?: number; entertainment?: number; healthcare?: number; clothing?: number; selfDevelopment?: number; travel?: number; gifts?: number; otherVariable?: number;
  // EPF / savings
  epfEmployee?: number; epfEmployer?: number; otherSavings?: number;
  notes?: string;
}

const num = (v: unknown) => Math.max(0, Number(v) || 0);

async function ctx(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  return advisorId ? await getAdvisorConfig(advisorId) : null;
}

export async function POST(req: NextRequest) {
  const config = await ctx(req);
  if (!config?.notionApiKey || !config.cashflowDbId) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  const b = await req.json() as Body;
  if (!b.clientName?.trim()) return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  if (!b.month)              return NextResponse.json({ error: 'Month is required' }, { status: 400 });

  const notion = new Client({ auth: config.notionApiKey });
  const monthLabel = new Date(b.month + 'T00:00:00').toLocaleString('en-MY', { month: 'long', year: 'numeric' });
  const entryTitle = `${b.clientName} — ${monthLabel}`;

  const totalIncome   = num(b.salary) + num(b.business) + num(b.rental) + num(b.investment) + num(b.otherIncome);
  const totalFixed    = num(b.housing) + num(b.carLoan) + num(b.insurancePremium) + num(b.education) + num(b.internet) + num(b.subscriptions) + num(b.otherFixed);
  const totalVariable = num(b.food) + num(b.diningOut) + num(b.transport) + num(b.entertainment) + num(b.healthcare) + num(b.clothing) + num(b.selfDevelopment) + num(b.travel) + num(b.gifts) + num(b.otherVariable);
  const totalEPF      = num(b.epfEmployee) + num(b.otherSavings);

  const breakdown = {
    income: {
      salary: num(b.salary), business: num(b.business), rental: num(b.rental), investment: num(b.investment), otherIncome: num(b.otherIncome),
    },
    fixed: {
      housing: num(b.housing), carLoan: num(b.carLoan), insurancePremium: num(b.insurancePremium), education: num(b.education),
      internet: num(b.internet), subscriptions: num(b.subscriptions), otherFixed: num(b.otherFixed),
    },
    variable: {
      food: num(b.food), diningOut: num(b.diningOut), transport: num(b.transport), entertainment: num(b.entertainment),
      healthcare: num(b.healthcare), clothing: num(b.clothing), selfDevelopment: num(b.selfDevelopment), travel: num(b.travel),
      gifts: num(b.gifts), otherVariable: num(b.otherVariable),
    },
    epf: { epfEmployee: num(b.epfEmployee), epfEmployer: num(b.epfEmployer), otherSavings: num(b.otherSavings) },
    advisorNotes: b.notes ?? '',
  };

  // ── Supabase write path (Phase 2.11) — upsert on (entry, advisor) == client+month+advisor.
  if (useSupabase()) {
    try {
      const res = await sbCashflow.upsertCashflow({
        entry: entryTitle, month: b.month, advisor: config.name, clientNotionId: null,
        income: totalIncome, fixed: totalFixed, variable: totalVariable, epf: totalEPF, breakdown,
      });
      return NextResponse.json({ success: true, id: res.id, entry: res.entry });
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  const properties: Record<string, unknown> = {
    'Entry':                   { title: [{ text: { content: entryTitle } }] },
    'Month':                   { date: { start: b.month } },
    'Monthly income (MYR)':    { number: totalIncome },
    'Fixed expenses (MYR)':    { number: totalFixed },
    'Variable expenses (MYR)': { number: totalVariable },
    'EPF contribution (MYR)':  { number: totalEPF },
    'Advisor':                 { select: { name: config.name } },
    'Notes':                   { rich_text: [{ text: { content: JSON.stringify(breakdown).slice(0, 2000) } }] },
  };

  try {
    // Upsert: replace any existing entry for this client + month + advisor
    const existing = await notion.databases.query({
      database_id: config.cashflowDbId,
      filter: {
        and: [
          { property: 'Entry',   title:  { equals: entryTitle } },
          { property: 'Advisor', select: { equals: config.name } },
        ],
      },
      page_size: 1,
    });
    const match = existing.results.find(isFullPage);
    if (match) {
      await notion.pages.update({ page_id: match.id, properties: properties as never });
      return NextResponse.json({ success: true, id: match.id, entry: entryTitle });
    }
    const page = await notion.pages.create({ parent: { database_id: config.cashflowDbId }, properties: properties as never });
    return NextResponse.json({ success: true, id: page.id, entry: entryTitle });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const config = await ctx(req);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // ── Supabase delete path (Phase 2.11) — hard DELETE; non-admins limited to own rows.
  if (useSupabase()) {
    try {
      await sbCashflow.deleteCashflow(config, id);
      return NextResponse.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg === 'Forbidden' ? 403 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  }

  const notion = new Client({ auth: config.notionApiKey });
  if (config.role !== 'Admin') {
    try {
      const pg = await notion.pages.retrieve({ page_id: id });
      const owner = isFullPage(pg) ? (pg.properties['Advisor'] as { select?: { name: string } })?.select?.name ?? '' : '';
      if (owner !== config.name) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  }
  try {
    await notion.pages.update({ page_id: id, archived: true } as never);
    return NextResponse.json({ success: true });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
