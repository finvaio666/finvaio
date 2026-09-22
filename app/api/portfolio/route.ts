import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { resolveClientNotionId, getClientById } from '@/lib/clients';
import { buildPortfolioPatch, buildNotionPortfolioProps } from '@/lib/portfolio';
import * as sbPortfolio from '@/lib/repos/portfolio';

export const dynamic = 'force-dynamic';

const useSupabase = () => process.env.DATA_SOURCE_PORTFOLIO === 'supabase';

interface Body {
  id?: string;
  clientId?: string;
  holdingName?: string;
  assetClass?: string;
  institution?: string;
  platform?: string;
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

  // A holding belongs to whichever FA owns the client, not whoever clicked
  // "Add" — matters when an Admin adds a holding from the all-FAs overview
  // for a client that isn't their own. Stamping config.name there would
  // attribute the record to Admin and hide it from the owning FA's book.
  let advisorName = config.name;
  if (config.role === 'Admin' && b.clientId) {
    const client = await getClientById(config, b.clientId);
    if (client?.advisorName) advisorName = client.advisorName;
  }

  if (useSupabase()) {
    let id: string;
    try {
      const patch = buildPortfolioPatch(b, advisorName, true);
      if (b.clientId) patch.client_notion_id = await resolveClientNotionId(b.clientId);
      ({ id } = await sbPortfolio.createHolding(patch));
    } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
    // Supabase already has the new row at this point — a Notion failure here
    // is surfaced, not fatal. Without linkNotionId, this row joins the
    // Supabase-only orphans that PATCH/DELETE below have no Notion page to
    // reach for (see lib/repos/portfolio.ts's file comment).
    let notionWarning: string | undefined;
    try {
      const notion = new Client({ auth: config.notionApiKey });
      const page = await notion.pages.create({ parent: { database_id: config.portfolioDbId }, properties: buildNotionPortfolioProps(b, advisorName, true) as never });
      await sbPortfolio.linkNotionId(id, page.id);
    } catch (e: unknown) {
      notionWarning = `Created, but the Notion copy failed (${e instanceof Error ? e.message : String(e)}) — this holding has no linked Notion page and won't be reachable by future syncs.`;
    }
    return NextResponse.json({ success: true, id, ...(notionWarning ? { warning: notionWarning } : {}) });
  }

  const notion = new Client({ auth: config.notionApiKey });
  try {
    const page = await notion.pages.create({ parent: { database_id: config.portfolioDbId }, properties: buildNotionPortfolioProps(b, advisorName, true) as never });
    return NextResponse.json({ success: true, id: page.id });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  const config = await ctx(req);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  // FAs raise changes with the company admin rather than editing investment
  // records themselves — enforced here, not just hidden in the UI, so it
  // can't be bypassed by calling the API directly.
  if (config.role !== 'Admin') return NextResponse.json({ error: 'Only an admin can edit investment records. Please contact your company admin.' }, { status: 403 });
  const b = await req.json() as Body;
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (useSupabase()) {
    try {
      const patch = buildPortfolioPatch(b, config.name, false);
      if (b.clientId !== undefined) patch.client_notion_id = b.clientId ? await resolveClientNotionId(b.clientId) : null;
      await sbPortfolio.updateHolding(config, b.id, patch);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 });
    }
    // Supabase (authoritative) is already correct at this point — a Notion
    // failure, or no linked page at all (a pre-dual-write orphan row), is
    // surfaced but doesn't undo the edit.
    let notionWarning: string | undefined;
    try {
      const notionId = await sbPortfolio.getNotionId(b.id);
      if (!notionId) {
        notionWarning = 'Updated, but this holding has no linked Notion page (created before Notion sync existed) — the Notion copy is stale and was not touched.';
      } else {
        const notion = new Client({ auth: config.notionApiKey });
        await notion.pages.update({ page_id: notionId, properties: buildNotionPortfolioProps(b, config.name, false) as never });
      }
    } catch (e: unknown) {
      notionWarning = `Updated, but the Notion copy failed to update (${e instanceof Error ? e.message : String(e)}).`;
    }
    return NextResponse.json({ success: true, ...(notionWarning ? { warning: notionWarning } : {}) });
  }

  const notion = new Client({ auth: config.notionApiKey });
  if (!await assertOwner(notion, b.id, config.name, config.role === 'Admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await notion.pages.update({ page_id: b.id, properties: buildNotionPortfolioProps(b, config.name, false) as never });
    return NextResponse.json({ success: true });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const config = await ctx(req);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  // Same admin-only rule as PATCH — see comment there.
  if (config.role !== 'Admin') return NextResponse.json({ error: 'Only an admin can delete investment records. Please contact your company admin.' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (useSupabase()) {
    try {
      await sbPortfolio.deleteHolding(config, id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 });
    }
    // Supabase is already soft-deleted at this point — a Notion failure, or
    // no linked page (a pre-dual-write orphan row), is surfaced but doesn't
    // undo the delete. Archived, not hard-deleted, matching Supabase's
    // soft-delete — both stay recoverable the same way.
    let notionWarning: string | undefined;
    try {
      const notionId = await sbPortfolio.getNotionId(id);
      if (!notionId) {
        notionWarning = 'Deleted, but this holding has no linked Notion page (created before Notion sync existed) — nothing to archive there.';
      } else {
        const notion = new Client({ auth: config.notionApiKey });
        await notion.pages.update({ page_id: notionId, archived: true } as never);
      }
    } catch (e: unknown) {
      notionWarning = `Deleted, but the Notion copy failed to archive (${e instanceof Error ? e.message : String(e)}).`;
    }
    return NextResponse.json({ success: true, ...(notionWarning ? { warning: notionWarning } : {}) });
  }

  const notion = new Client({ auth: config.notionApiKey });
  if (!await assertOwner(notion, id, config.name, config.role === 'Admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await notion.pages.update({ page_id: id, archived: true } as never);
    return NextResponse.json({ success: true });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
