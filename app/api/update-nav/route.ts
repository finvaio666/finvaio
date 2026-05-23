import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import type { UpdatePageParameters } from '@notionhq/client/build/src/api-endpoints';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

interface NavUpdate {
  fundName: string;
  newNav:   number;
}

type NotionProperties = UpdatePageParameters['properties'];

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

  if (!config?.notionApiKey || !config.portfolioDbId) {
    return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 401 });
  }

  const notion       = new Client({ auth: config.notionApiKey });
  const PORTFOLIO_DB = config.portfolioDbId;

  const body = await req.json() as { updates: NavUpdate[] };
  if (!body?.updates?.length) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const res   = await notion.databases.query({ database_id: PORTFOLIO_DB, page_size: 100 });
  const pages = res.results.filter(isFullPage);

  const results: { fundName: string; client: string; oldValue: number; newValue: number; units: number; pageId: string }[] = [];
  const errors:  { fundName: string; client: string; error: string }[] = [];

  for (const update of body.updates) {
    const { fundName, newNav } = update;

    const matches = pages.filter(page => {
      const title = page.properties['Holding Name']?.type === 'title'
        ? page.properties['Holding Name'].title[0]?.plain_text ?? '' : '';
      return title.trim().toLowerCase() === fundName.trim().toLowerCase();
    });

    for (const page of matches) {
      const p = page.properties;
      const units    = p['Units']?.type === 'number'    ? p['Units'].number    ?? 0 : 0;
      const currency = p['Currency']?.type === 'select' ? p['Currency'].select?.name ?? 'MYR' : 'MYR';
      const fxRate   = p['FX Rate to MYR']?.type === 'number' ? p['FX Rate to MYR'].number ?? 1 : 1;

      if (units <= 0) {
        errors.push({ fundName, client: '', error: `No units on record — skip` });
        continue;
      }

      const newValueOrig = units * newNav;
      const newValueMYR  = currency === 'MYR' ? newValueOrig : newValueOrig * fxRate;
      const oldValueOrig = p['Value (Original Currency)']?.type === 'number'
        ? p['Value (Original Currency)'].number ?? 0 : 0;

      const props: NotionProperties = {
        'Value (Original Currency)': { number: parseFloat(newValueOrig.toFixed(2)) },
        'Value (MYR)':               { number: parseFloat(newValueMYR.toFixed(2))  },
      };

      try {
        await notion.pages.update({ page_id: page.id, properties: props });
        results.push({ pageId: page.id, fundName, client: '', oldValue: oldValueOrig, newValue: newValueOrig, units });
      } catch (e: unknown) {
        errors.push({ fundName, client: '', error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return NextResponse.json({ updated: results.length, results, errors });
}

// ── GET: return unique fund names + current units/NAV for the panel ─────────
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

  if (!config?.notionApiKey || !config.portfolioDbId) {
    return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 401 });
  }

  const notion       = new Client({ auth: config.notionApiKey });
  const PORTFOLIO_DB = config.portfolioDbId;
  const CLIENTS_DB   = config.clientsDbId;

  const clientRes  = await notion.databases.query({ database_id: CLIENTS_DB });
  const clientMap: Record<string, string> = {};
  clientRes.results.filter(isFullPage).forEach(page => {
    const name = page.properties['Client Name']?.type === 'title'
      ? page.properties['Client Name'].title[0]?.plain_text ?? '' : '';
    if (name) clientMap[page.id] = name;
  });

  const res = await notion.databases.query({
    database_id: PORTFOLIO_DB,
    page_size: 100,
    sorts: [{ property: 'Holding Name', direction: 'ascending' }],
  });

  const fundMap: Record<string, {
    fundName: string; assetClass: string; institution: string; currency: string;
    totalUnits: number; totalValueOrig: number; currentNav: number;
    clients: string[]; holdingCount: number;
  }> = {};

  res.results.filter(isFullPage).forEach(page => {
    const p      = page.properties;
    const status = p['Status']?.type === 'select' ? p['Status'].select?.name ?? '' : '';
    if (status.toLowerCase().includes('redeem')) return;

    const fundName   = p['Holding Name']?.type === 'title'  ? p['Holding Name'].title[0]?.plain_text ?? '' : '';
    const units      = p['Units']?.type === 'number'         ? p['Units'].number ?? 0 : 0;
    const valueOrig  = p['Value (Original Currency)']?.type === 'number' ? p['Value (Original Currency)'].number ?? 0 : 0;
    const currency   = p['Currency']?.type === 'select'      ? p['Currency'].select?.name ?? 'MYR' : 'MYR';
    const assetClass = p['Asset class']?.type === 'select'   ? p['Asset class'].select?.name ?? '' : '';
    const institution = p['Institution']?.type === 'rich_text' ? p['Institution'].rich_text[0]?.plain_text ?? '' : '';

    const clientRelIds = p['👥 Clients']?.type === 'relation' ? p['👥 Clients'].relation.map(r => r.id) : [];
    const clientNames  = clientRelIds.map(id => clientMap[id]).filter(Boolean);

    if (!fundName) return;
    if (!fundMap[fundName]) {
      fundMap[fundName] = { fundName, assetClass, institution, currency, totalUnits: 0, totalValueOrig: 0, currentNav: 0, clients: [], holdingCount: 0 };
    }

    const f = fundMap[fundName];
    f.totalUnits      += units;
    f.totalValueOrig  += valueOrig;
    f.holdingCount    += 1;
    clientNames.forEach(n => { if (!f.clients.includes(n)) f.clients.push(n); });
  });

  const funds = Object.values(fundMap).map(f => ({
    ...f,
    currentNav: f.totalUnits > 0 ? parseFloat((f.totalValueOrig / f.totalUnits).toFixed(4)) : 0,
  }));

  return NextResponse.json({ funds });
}
