import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import type { UpdatePageParameters } from '@notionhq/client/build/src/api-endpoints';

export const dynamic = 'force-dynamic';

const PORTFOLIO_DB = '363de6dd-1dfe-8058-b73e-c7fa8bb431fb';

interface NavUpdate {
  fundName: string;   // exact match against "Holding Name"
  newNav:   number;   // new NAV/price per unit
}

type NotionProperties = UpdatePageParameters['properties'];

export async function POST(req: NextRequest) {
  if (!process.env.NOTION_API_KEY) {
    return NextResponse.json({ error: 'NOTION_API_KEY not set' }, { status: 500 });
  }

  const body = await req.json() as { updates: NavUpdate[] };
  if (!body?.updates?.length) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  // ── 1. Fetch all active holdings ──────────────────────────────────────────
  const res = await notion.databases.query({
    database_id: PORTFOLIO_DB,
    page_size: 100,
  });

  const pages = res.results.filter(isFullPage);

  const results: { fundName: string; client: string; oldValue: number; newValue: number; units: number; pageId: string }[] = [];
  const errors:  { fundName: string; client: string; error: string }[] = [];

  for (const update of body.updates) {
    const { fundName, newNav } = update;

    // Find all holdings whose Holding Name matches (case-insensitive trim)
    const matches = pages.filter(page => {
      const title = page.properties['Holding Name']?.type === 'title'
        ? page.properties['Holding Name'].title[0]?.plain_text ?? ''
        : '';
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
        results.push({
          pageId:   page.id,
          fundName,
          client:   '', // resolved client name not critical here
          oldValue: oldValueOrig,
          newValue: newValueOrig,
          units,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ fundName, client: '', error: msg });
      }
    }
  }

  return NextResponse.json({ updated: results.length, results, errors });
}

// ── GET: return unique fund names + current units/NAV for the panel ─────────
export async function GET() {
  if (!process.env.NOTION_API_KEY) {
    return NextResponse.json({ error: 'NOTION_API_KEY not set' }, { status: 500 });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  // Also build client map for display
  const CLIENTS_DB = '362de6dd-1dfe-80e5-9275-e4ce2fc046b2';
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

  // Group by fund name — produce one row per unique fund
  const fundMap: Record<string, {
    fundName: string;
    assetClass: string;
    institution: string;
    currency: string;
    totalUnits: number;
    totalValueOrig: number;
    currentNav: number;
    clients: string[];
    holdingCount: number;
  }> = {};

  res.results.filter(isFullPage).forEach(page => {
    const p = page.properties;
    const status = p['Status']?.type === 'select' ? p['Status'].select?.name ?? '' : '';
    if (status.toLowerCase().includes('redeem')) return;  // skip redeemed

    const fundName  = p['Holding Name']?.type === 'title' ? p['Holding Name'].title[0]?.plain_text ?? '' : '';
    const units     = p['Units']?.type === 'number' ? p['Units'].number ?? 0 : 0;
    const valueOrig = p['Value (Original Currency)']?.type === 'number' ? p['Value (Original Currency)'].number ?? 0 : 0;
    const currency  = p['Currency']?.type === 'select' ? p['Currency'].select?.name ?? 'MYR' : 'MYR';
    const assetClass = p['Asset class']?.type === 'select' ? p['Asset class'].select?.name ?? '' : '';
    const institution = p['Institution']?.type === 'rich_text' ? p['Institution'].rich_text[0]?.plain_text ?? '' : '';

    const clientRelIds = p['👥 Clients']?.type === 'relation' ? p['👥 Clients'].relation.map(r => r.id) : [];
    const clientNames  = clientRelIds.map(id => clientMap[id]).filter(Boolean);

    if (!fundName) return;

    if (!fundMap[fundName]) {
      fundMap[fundName] = { fundName, assetClass, institution, currency, totalUnits: 0, totalValueOrig: 0, currentNav: 0, clients: [], holdingCount: 0 };
    }

    const f = fundMap[fundName];
    f.totalUnits     += units;
    f.totalValueOrig += valueOrig;
    f.holdingCount   += 1;
    clientNames.forEach(n => { if (!f.clients.includes(n)) f.clients.push(n); });
  });

  const funds = Object.values(fundMap).map(f => ({
    ...f,
    currentNav: f.totalUnits > 0 ? parseFloat((f.totalValueOrig / f.totalUnits).toFixed(4)) : 0,
  }));

  return NextResponse.json({ funds });
}
