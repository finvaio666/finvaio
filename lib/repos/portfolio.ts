/**
 * lib/repos/portfolio.ts
 * Supabase data-access layer for Portfolio holdings (Phase 2, table 2.2).
 *
 * Straight cutover (same model as clients/tasks): when DATA_SOURCE_PORTFOLIO=
 * 'supabase', Supabase is the single source of truth; no Notion writes here.
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
  };
}

const COLS = 'id, notion_id, holding_name, client_notion_id, asset_class, product_name, institution, currency, fx_rate_to_myr, units, purchase_price_original, purchase_price_myr, value_original_currency, value_myr, start_date, maturity_date, status, advisor, geography, fame_account_no, fund_source, fame_sync_date';
const PAGE = 1000; // PostgREST caps a single response at 1000 rows — paginate past it.

/** List holdings scoped to this advisor (Admin sees all). Paginated (portfolio > 1000 rows). */
export async function listHoldings(config: AdvisorConfig): Promise<PortfolioHolding[]> {
  const sb = getSupabase();
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(TABLE).select(COLS).range(from, from + PAGE - 1);
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
  const { error } = await sb.from(TABLE)
    .update({ value_original_currency: valueOriginal, value_myr: valueMyr })
    .eq('id', holdingId);
  if (error) throw new Error(`portfolio setValue failed: ${error.message}`);
}
