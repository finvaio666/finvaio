import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import * as sbPortfolio from '@/lib/repos/portfolio';

export const dynamic = 'force-dynamic';

const useSupabase = () => process.env.DATA_SOURCE_PORTFOLIO === 'supabase';

/**
 * Admin-only. Marks EVERY live holding sharing this ISIN as Redeemed, across
 * every advisor and client at once — the bulk counterpart to the single-row
 * PATCH /api/portfolio. A shared structured note (several clients each
 * holding their own slice of the same tranche) is one row per client; a KO
 * or maturity is a fact about the note itself, so confirming it has to reach
 * every one of those rows, not just the one an admin happened to click —
 * otherwise every other client's identical copy sits Active as if nothing
 * happened.
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
    try {
      const ids = await sbPortfolio.redeemByProductName(productName);
      return NextResponse.json({ success: true, updated: ids.length, ids });
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // Notion path: query every page across the whole Portfolio DB (not
  // advisor-filtered — this is a company-wide action) matching this ISIN
  // and not already Redeemed, and flip each one.
  if (!config.notionApiKey || !config.portfolioDbId) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const notion = new Client({ auth: config.notionApiKey });
  const ids: string[] = [];
  try {
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
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), updated: ids.length, ids }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: ids.length, ids });
}
