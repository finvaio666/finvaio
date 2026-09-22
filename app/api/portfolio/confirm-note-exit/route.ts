import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import * as sbPortfolio from '@/lib/repos/portfolio';

export const dynamic = 'force-dynamic';

const useSupabase = () => process.env.DATA_SOURCE_PORTFOLIO === 'supabase';

/**
 * Every page in the Portfolio DB matching this ISIN and not already Redeemed,
 * flipped to Redeemed. Company-wide (not advisor-filtered) — a KO/maturity is
 * a fact about the note itself, same reasoning as the Supabase path below.
 */
async function redeemInNotion(config: { notionApiKey?: string; portfolioDbId?: string }, productName: string): Promise<string[]> {
  if (!config.notionApiKey || !config.portfolioDbId) throw new Error('Notion not configured');
  const notion = new Client({ auth: config.notionApiKey });
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: config.portfolioDbId,
      start_cursor: cursor,
      filter: {
        and: [
          { property: 'Product name', rich_text: { equals: productName } },
          { property: 'Status', select: { does_not_equal: 'Redeemed' } },
        ],
      },
    });
    for (const pg of res.results) {
      if (!isFullPage(pg)) continue;
      await notion.pages.update({ page_id: pg.id, properties: { Status: { select: { name: 'Redeemed' } } } as never });
      ids.push(pg.id);
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return ids;
}

/**
 * Admin-only. Marks EVERY live holding sharing this ISIN as Redeemed, across
 * every advisor and client at once — the bulk counterpart to the single-row
 * PATCH /api/portfolio. A shared structured note (several clients each
 * holding their own slice of the same tranche) is one row per client; a KO
 * or maturity is a fact about the note itself, so confirming it has to reach
 * every one of those rows, not just the one an admin happened to click —
 * otherwise every other client's identical copy sits Active as if nothing
 * happened.
 *
 * Writes BOTH stores even on the Supabase path. Confirmed live 2026-09-22:
 * a note redeemed here weeks earlier was still 🟢 Active in Notion, because
 * this route used to update Supabase only. scripts/reconcile-portfolio.ts
 * syncs Notion → Supabase and refuses to run once DATA_SOURCE_PORTFOLIO=
 * supabase — but that guard only fires if that env var is actually loaded in
 * whatever shell runs it, and a run where it silently wasn't would overwrite
 * Supabase's correct Redeemed status right back to Notion's stale Active,
 * resurrecting the note in Needs Action with no trace of what happened. The
 * Notion write here closes that gap: once both stores agree, a stray
 * reconcile has nothing stale to revert to.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (config.role !== 'Admin') return NextResponse.json({ error: 'Only an admin can confirm a note exit.' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { productName?: string };
  const productName = body.productName?.trim();
  if (!productName) return NextResponse.json({ error: 'productName is required' }, { status: 400 });

  if (useSupabase()) {
    let ids: string[];
    try {
      ids = await sbPortfolio.redeemByProductName(productName);
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
    // Supabase is authoritative and already has the correct status at this
    // point — a Notion failure here is surfaced but not fatal to the confirm.
    let notionWarning: string | undefined;
    try {
      await redeemInNotion(config, productName);
    } catch (e: unknown) {
      notionWarning = `Redeemed in the live system, but the Notion copy failed to update (${e instanceof Error ? e.message : String(e)}) — it may still show Active there until this is retried.`;
    }
    return NextResponse.json({ success: true, updated: ids.length, ids, ...(notionWarning ? { warning: notionWarning } : {}) });
  }

  try {
    const ids = await redeemInNotion(config, productName);
    return NextResponse.json({ success: true, updated: ids.length, ids });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
