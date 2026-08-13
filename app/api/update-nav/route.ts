import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listHoldings, setHoldingValue } from '@/lib/portfolio';
import { listClients } from '@/lib/clients';

export const dynamic = 'force-dynamic';

interface NavUpdate {
  fundName: string;
  newNav:   number;
}

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

  if (!config?.notionApiKey || !config.portfolioDbId) {
    return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 401 });
  }

  const body = await req.json() as { updates: NavUpdate[] };
  if (!body?.updates?.length) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  // Holdings via the portfolio abstraction (Notion or Supabase per flag).
  const holdings = await listHoldings(config);

  const results: { fundName: string; client: string; oldValue: number; newValue: number; units: number; pageId: string }[] = [];
  const errors:  { fundName: string; client: string; error: string }[] = [];

  for (const update of body.updates) {
    const { fundName, newNav } = update;

    const matches = holdings.filter(h => h.name.trim().toLowerCase() === fundName.trim().toLowerCase());

    for (const h of matches) {
      const units    = h.units;
      const currency = h.currency || 'MYR';
      const fxRate   = h.fxRate || 1;

      if (units <= 0) {
        errors.push({ fundName, client: '', error: `No units on record — skip` });
        continue;
      }

      const newValueOrig = units * newNav;
      const newValueMYR  = currency === 'MYR' ? newValueOrig : newValueOrig * fxRate;
      const oldValueOrig = h.valueOriginal;

      try {
        await setHoldingValue(config, h.id, parseFloat(newValueOrig.toFixed(2)), parseFloat(newValueMYR.toFixed(2)));
        results.push({ pageId: h.id, fundName, client: '', oldValue: oldValueOrig, newValue: newValueOrig, units });
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

  // Clients (for name attribution) + holdings via the abstractions, joined on
  // clientNotionId — every holding links exactly one client, so this matches the
  // old relation-id → name map.
  const clients = await listClients(config);
  const clientMap: Record<string, string> = {};
  clients.forEach(c => { if (c.notionId && c.name) clientMap[c.notionId] = c.name; });

  // Sort by holding name asc to preserve the original fund insertion order.
  const holdings = [...await listHoldings(config)].sort((a, b) => a.name.localeCompare(b.name));

  const fundMap: Record<string, {
    fundName: string; assetClass: string; institution: string; currency: string;
    totalUnits: number; totalValueOrig: number; currentNav: number;
    clients: string[]; holdingCount: number;
  }> = {};

  holdings.forEach(h => {
    if (h.status.toLowerCase().includes('redeem')) return;

    const fundName    = h.name;
    const clientNames = h.clientNotionId ? [clientMap[h.clientNotionId]].filter(Boolean) : [];

    if (!fundName) return;
    if (!fundMap[fundName]) {
      fundMap[fundName] = { fundName, assetClass: h.assetClass, institution: h.institution, currency: h.currency || 'MYR', totalUnits: 0, totalValueOrig: 0, currentNav: 0, clients: [], holdingCount: 0 };
    }

    const f = fundMap[fundName];
    f.totalUnits      += h.units;
    f.totalValueOrig  += h.valueOriginal;
    f.holdingCount    += 1;
    clientNames.forEach(n => { if (!f.clients.includes(n)) f.clients.push(n); });
  });

  const funds = Object.values(fundMap).map(f => ({
    ...f,
    currentNav: f.totalUnits > 0 ? parseFloat((f.totalValueOrig / f.totalUnits).toFixed(4)) : 0,
  }));

  return NextResponse.json({ funds });
}
