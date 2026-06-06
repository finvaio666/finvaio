import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import type { UpdatePageParameters, CreatePageParameters } from '@notionhq/client/build/src/api-endpoints';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

interface RedeemedItem {
  id: string;
  action: 'full' | 'partial';
  newValueOrig?: number;
  newValueMyr?: number;
}

interface NewFund {
  clientId: string;
  name: string;
  assetClass: string;
  institution: string;
  currency: string;
  valueOrig: number;
  purchaseOrig: number;
  fxRate: number;
  valueMyr: number;
  purchaseMyr: number;
}

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

  if (!config?.notionApiKey || !config.portfolioDbId) {
    return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 401 });
  }

  const notion = new Client({ auth: config.notionApiKey });
  const PORTFOLIO_DB = config.portfolioDbId;

  let body: { redeemed: RedeemedItem[]; newFunds: NewFund[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { redeemed = [], newFunds = [] } = body;
  const results: { action: string; id?: string; name?: string; ok: boolean; error?: string }[] = [];

  // ── 1. Process redeemed / partially switched holdings ────────────────────
  for (const item of redeemed) {
    try {
      if (item.action === 'full') {
        await notion.pages.update({
          page_id: item.id,
          properties: { 'Status': { select: { name: 'Redeemed' } } },
        });
        results.push({ action: 'redeem', id: item.id, ok: true });
      } else {
        const props: UpdatePageParameters['properties'] = {
          'Value (Original Currency)': { number: item.newValueOrig ?? 0 },
          'Value (MYR)':               { number: item.newValueMyr  ?? 0 },
        };
        await notion.pages.update({ page_id: item.id, properties: props });
        results.push({ action: 'partial', id: item.id, ok: true });
      }
    } catch (e) {
      results.push({ action: item.action, id: item.id, ok: false, error: String(e) });
    }
  }

  // ── 2. Create new fund holdings ──────────────────────────────────────────
  for (const fund of newFunds) {
    try {
      const fxRate = fund.fxRate || 1;
      const props: CreatePageParameters['properties'] = {
        'Holding Name': { title: [{ text: { content: fund.name } }] },
        '👥 Clients':   { relation: [{ id: fund.clientId }] },
        'Status':       { select: { name: 'Active' } },
        'Currency':     { select: { name: fund.currency || 'MYR' } },
        'Value (Original Currency)':          { number: fund.valueOrig    },
        'Purchase price (original currency)': { number: fund.purchaseOrig },
        'FX Rate to MYR':                     { number: fxRate            },
        'Value (MYR)':                        { number: fund.valueMyr  || fund.valueOrig  * fxRate },
        'Purchase price (MYR)':               { number: fund.purchaseMyr || fund.purchaseOrig * fxRate },
        // Centralized model: stamp owning advisor
        'Advisor':                            { select: { name: config.name } },
      };
      if (fund.assetClass) props['Asset class']  = { select:    { name: fund.assetClass } };
      if (fund.institution) props['Institution'] = { rich_text: [{ text: { content: fund.institution } }] };

      const page = await notion.pages.create({
        parent: { database_id: PORTFOLIO_DB },
        properties: props,
      });
      results.push({ action: 'create', id: page.id, name: fund.name, ok: true });
    } catch (e) {
      results.push({ action: 'create', name: fund.name, ok: false, error: String(e) });
    }
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}
