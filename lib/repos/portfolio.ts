/**
 * lib/repos/portfolio.ts
 * Supabase data-access layer for Portfolio holdings (Phase 2, table 2.2).
 *
 * Supabase is authoritative when DATA_SOURCE_PORTFOLIO='supabase' — every
 * read goes through here. Writes ALSO reach Notion (app/api/portfolio/route.ts
 * calls getNotionId/linkNotionId around each Supabase write) — the comment
 * that used to sit here said "no Notion writes", and that gap is exactly
 * what let a redeemed note drift back to Active weeks later when something
 * synced from Notion's stale copy (found 2026-09-22, see confirm-note-exit).
 * Notion isn't read live, but it has to stay truthful for backups, manual
 * lookups, and any future reconcile — a write path that quietly stops
 * updating it is worse than no Notion copy at all.
 *
 * The client link is `client_notion_id` (= clients.notion_id), NOT a uuid FK.
 * Callers join to clients on notion_id so `clientId` stays consistent across
 * sources (see lib/portfolio.ts).
 */

import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import type { PortfolioHolding } from '../portfolio';

const TABLE = 'portfolio_holdings';

interface Row {
  id: string;
  notion_id: string | null;
  holding_name: string | null;
  client_notion_id: string | null;
  asset_class: string | null;
  product_name: string | null;
  institution: string | null;
  platform: string | null;
  currency: string | null;
  fx_rate_to_myr: number | string | null;
  units: number | string | null;
  purchase_price_original: number | string | null;
  purchase_price_myr: number | string | null;
  value_original_currency: number | string | null;
  value_myr: number | string | null;
  start_date: string | null;
  maturity_date: string | null;
  status: string | null;
  advisor: string | null;
  geography: string | null;
  fame_account_no: string | null;
  fund_source: string | null;
  fame_sync_date: string | null;
  underlying_details: PortfolioHolding['underlyingDetails'];
}

const n = (v: number | string | null): number => (v == null ? 0 : Number(v));

function toHolding(r: Row): PortfolioHolding {
  return {
    id:               r.id,
    notionId:         r.notion_id ?? '',
    clientNotionId:   r.client_notion_id ?? '',
    name:             r.holding_name ?? '',
    assetClass:       r.asset_class ?? '',
    productName:      r.product_name ?? '',
    institution:      r.institution ?? '',
    platform:         r.platform ?? '',
    currency:         r.currency ?? '',
    fxRate:           n(r.fx_rate_to_myr),
    units:            n(r.units),
    purchaseOriginal: n(r.purchase_price_original),
    purchaseMyr:      n(r.purchase_price_myr),
    valueOriginal:    n(r.value_original_currency),
    valueMyr:         n(r.value_myr),
    startDate:        r.start_date ?? '',
    maturityDate:     r.maturity_date ?? '',
    status:           r.status ?? '',
    advisorName:      r.advisor ?? '',
    geography:        r.geography ?? '',
    fameAccountNo:    r.fame_account_no ?? '',
    fundSource:       r.fund_source ?? '',
    fameSyncDate:     r.fame_sync_date ?? '',
    underlyingDetails: r.underlying_details ?? null,
  };
}

const COLS = 'id, notion_id, holding_name, client_notion_id, asset_class, product_name, institution, platform, currency, fx_rate_to_myr, units, purchase_price_original, purchase_price_myr, value_original_currency, value_myr, start_date, maturity_date, status, advisor, geography, fame_account_no, fund_source, fame_sync_date, underlying_details';
const PAGE = 1000; // PostgREST caps a single response at 1000 rows — paginate past it.

/** List holdings scoped to this advisor (Admin sees all). Paginated (portfolio > 1000 rows). */
export async function listHoldings(config: AdvisorConfig): Promise<PortfolioHolding[]> {
  const sb = getSupabase();
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(TABLE).select(COLS).is('deleted_at', null).range(from, from + PAGE - 1);
    if (config.role !== 'Admin') q = q.eq('advisor', config.name);
    const { data, error } = await q;
    if (error) throw new Error(`portfolio list failed: ${error.message}`);
    const batch = data as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows.map(toHolding);
}

/** Update a holding's value (original currency + MYR). `holdingId` is the Supabase uuid. */
export async function setHoldingValue(holdingId: string, valueOriginal: number, valueMyr: number): Promise<void> {
  const sb = getSupabase();
  // PostgREST does not error on a zero-row UPDATE, so a switch against a stale
  // or soft-deleted holding id would otherwise resolve silently with nothing
  // written; the Notion path 404s on a bad page id and portfolio-switch's
  // per-item ok/207 reporting depends on that distinction, so we throw instead.
  const { data, error } = await sb.from(TABLE)
    .update({ value_original_currency: valueOriginal, value_myr: valueMyr })
    .eq('id', holdingId)
    .is('deleted_at', null)
    .select('id');
  if (error) throw new Error(`portfolio setHoldingValue failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`portfolio setHoldingValue: no live holding with id ${holdingId}`);
}

/** Guard: non-admins may only touch their own rows. Throws 'Forbidden' otherwise. */
async function assertOwner(config: AdvisorConfig, id: string): Promise<void> {
  if (config.role === 'Admin') return;
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('advisor').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(`portfolio owner lookup failed: ${error.message}`);
  if (!data || (data as { advisor: string }).advisor !== config.name) throw new Error('Forbidden');
}

/** The linked Notion page id for a Supabase row, or null if it was never linked (e.g. created before this dual-write existed). */
export async function getNotionId(id: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('notion_id').eq('id', id).maybeSingle();
  if (error) throw new Error(`portfolio getNotionId failed: ${error.message}`);
  return (data as { notion_id: string | null } | null)?.notion_id ?? null;
}

/** Record which Notion page a just-created Supabase row corresponds to. */
export async function linkNotionId(id: string, notionId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update({ notion_id: notionId }).eq('id', id);
  if (error) throw new Error(`portfolio linkNotionId failed: ${error.message}`);
}

/** Insert one holding (columns already mapped by the route). Returns the new id. */
export async function createHolding(patch: Record<string, unknown>): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).insert(patch).select('id').single();
  if (error) throw new Error(`portfolio insert failed: ${error.message}`);
  return { id: (data as { id: string }).id };
}

/** Update one holding (partial column patch, advisor-scoped). */
export async function updateHolding(config: AdvisorConfig, id: string, patch: Record<string, unknown>): Promise<void> {
  await assertOwner(config, id);
  const sb = getSupabase();
  // PostgREST does not error on a zero-row UPDATE, so a switch against a stale
  // or soft-deleted holding id would otherwise resolve silently with nothing
  // written; the Notion path 404s on a bad page id and portfolio-switch's
  // per-item ok/207 reporting depends on that distinction, so we throw instead.
  const { data, error } = await sb.from(TABLE).update(patch).eq('id', id).is('deleted_at', null).select('id');
  if (error) throw new Error(`portfolio update failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`portfolio update: no live holding with id ${id}`);
}

/**
 * Redeem every LIVE holding that shares this ISIN, across every advisor and
 * client — the bulk counterpart to updateHolding, for a shared structured
 * note. A note held by several clients is one row per client; confirming a
 * KO/maturity is a fact about the NOTE, so it has to land on every one of
 * those rows at once, not just the single row an admin happened to click.
 * No per-row ownership check (unlike updateHolding/deleteHolding) — this
 * intentionally crosses advisor boundaries, so it's gated by requiring Admin
 * at the route level instead. Returns the ids actually updated.
 */
export async function redeemByProductName(productName: string): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .update({ status: 'Redeemed' })
    .eq('product_name', productName)
    .is('deleted_at', null)
    .neq('status', 'Redeemed')
    .select('id');
  if (error) throw new Error(`portfolio redeemByProductName failed: ${error.message}`);
  return (data ?? []).map(r => (r as { id: string }).id);
}

/** Soft-delete one holding (advisor-scoped; recoverable — clear deleted_at to restore). */
export async function deleteHolding(config: AdvisorConfig, id: string): Promise<void> {
  await assertOwner(config, id);
  const sb = getSupabase();
  const { error } = await sb.from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new Error(`portfolio delete failed: ${error.message}`);
}
