/**
 * lib/portfolio.ts
 * Chokepoint for reading Portfolio holdings (Phase 2, table 2.2).
 *
 * Data-source switch. When DATA_SOURCE_PORTFOLIO === 'supabase', holdings are
 * served from Supabase ONLY (straight cutover); otherwise the Notion path below
 * is used unchanged.
 *
 * The client link is exposed as `clientNotionId` (dashless Notion id). Callers
 * join to clients ON notion_id — NOT on the row id — so the resolved clientId
 * stays consistent whether clients come from Notion (page id) or Supabase (uuid).
 * This is what lets cross-table routes work in either data-source mode.
 */

import { Client, isFullPage } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';
import * as sbPortfolio from './repos/portfolio';

export interface PortfolioHolding {
  id:               string;   // Notion page id (notion path) OR Supabase uuid
  notionId:         string;
  clientNotionId:   string;   // join key → clients.notionId
  name:             string;
  assetClass:       string;
  productName:      string;
  institution:      string;
  currency:         string;
  fxRate:           number;
  units:            number;
  purchaseOriginal: number;
  purchaseMyr:      number;
  valueOriginal:    number;
  valueMyr:         number;
  startDate:        string;
  maturityDate:     string;
  status:           string;
  advisorName:      string;
  geography:        string;
  fameAccountNo:    string;
  fundSource:       string;
  fameSyncDate:     string;
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_PORTFOLIO === 'supabase';
}

// ── Notion property readers (real property types of the Portfolio DB) ──
function rt(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : '';
}
function num(p: Record<string, unknown>, k: string): number {
  const v = p[k] as { type: string; number?: number | null } | undefined;
  return v?.type === 'number' ? (v.number ?? 0) : 0;
}
function sel(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; select?: { name: string } } | undefined;
  return v?.type === 'select' ? (v.select?.name ?? '') : '';
}
function dateOf(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; date?: { start: string } | null } | undefined;
  return v?.type === 'date' ? (v.date?.start ?? '') : '';
}
function titleOf(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; title?: { plain_text: string }[] } | undefined;
  return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : '';
}
function relFirst(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; relation?: { id: string }[] } | undefined;
  return v?.type === 'relation' ? (v.relation?.[0]?.id.replace(/-/g, '') ?? '') : '';
}

/** List holdings scoped to this advisor (Admin sees all). */
export async function listHoldings(config: AdvisorConfig): Promise<PortfolioHolding[]> {
  if (useSupabase()) return sbPortfolio.listHoldings(config);
  if (!config.portfolioDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];

  const notion = new Client({ auth: config.notionApiKey });
  const filter = config.role !== 'Admin'
    ? { property: 'Advisor', select: { equals: config.name } }
    : undefined;

  const out: PortfolioHolding[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: config.portfolioDbId,
      page_size: 100,
      start_cursor: cursor,
      ...(filter ? { filter } : {}),
    });
    for (const cp of res.results) {
      if (!isFullPage(cp)) continue;
      const p = cp.properties as Record<string, unknown>;
      out.push({
        id:               cp.id,
        notionId:         cp.id.replace(/-/g, ''),
        clientNotionId:   relFirst(p, '👥 Clients'),
        name:             titleOf(p, 'Holding Name'),
        assetClass:       sel(p, 'Asset class'),
        productName:      rt(p, 'Product name'),
        institution:      rt(p, 'Institution'),
        currency:         sel(p, 'Currency'),
        fxRate:           num(p, 'FX Rate to MYR'),
        units:            num(p, 'Units'),
        purchaseOriginal: num(p, 'Purchase price (original currency)'),
        purchaseMyr:      num(p, 'Purchase price (MYR)'),
        valueOriginal:    num(p, 'Value (Original Currency)'),
        valueMyr:         num(p, 'Value (MYR)'),
        startDate:        dateOf(p, 'Start date'),
        maturityDate:     dateOf(p, 'Maturity date'),
        status:           sel(p, 'Status'),
        advisorName:      sel(p, 'Advisor'),
        geography:        rt(p, 'Geography'),
        fameAccountNo:    rt(p, 'FAME Account No'),
        fundSource:       rt(p, 'Fund Source'),
        fameSyncDate:     dateOf(p, 'FAME Sync Date'),
      });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

/**
 * Write a holding's value (original currency + MYR) back to the store.
 * `holdingId` is the source-appropriate id from listHoldings().id (Notion page
 * id or Supabase uuid). Notion path is byte-identical to the original inline
 * update-nav write.
 */
export async function setHoldingValue(config: AdvisorConfig, holdingId: string, valueOriginal: number, valueMyr: number): Promise<void> {
  if (useSupabase()) return sbPortfolio.setHoldingValue(holdingId, valueOriginal, valueMyr);
  const notion = new Client({ auth: config.notionApiKey });
  await notion.pages.update({
    page_id: holdingId,
    properties: {
      'Value (Original Currency)': { number: valueOriginal },
      'Value (MYR)':               { number: valueMyr },
    },
  });
}

/** Fields a caller may set on a holding. Superset shared by the CRUD route and
 *  the switch route — both map to columns through buildPortfolioPatch so the
 *  column names exist in exactly one place. */
export interface PortfolioPatchInput {
  holdingName?:  string;
  assetClass?:   string;
  institution?:  string;
  status?:       string;
  currency?:     string;
  valueOrig?:    number;
  purchaseOrig?: number;
  fxRate?:       number;
  valueMyr?:     number;
  purchaseMyr?:  number;
  units?:        number;
  maturityDate?: string;
}

/** Map caller fields → portfolio_holdings columns. `isCreate` forces the name
 *  and stamps the owning advisor; on update, only provided fields are patched. */
export function buildPortfolioPatch(b: PortfolioPatchInput, advisorName: string, isCreate: boolean): Record<string, unknown> {
  const t = (s?: string) => (s ?? '').slice(0, 1900);
  const p: Record<string, unknown> = {};
  if (isCreate || b.holdingName !== undefined) p.holding_name = t(b.holdingName);
  if (b.assetClass)               p.asset_class            = b.assetClass;
  if (b.institution !== undefined) p.institution           = t(b.institution);
  if (b.status)                   p.status                 = b.status;
  if (b.currency)                 p.currency               = b.currency;
  if (b.valueOrig    !== undefined) p.value_original_currency = b.valueOrig || 0;
  if (b.purchaseOrig !== undefined) p.purchase_price_original = b.purchaseOrig || 0;
  if (b.fxRate       !== undefined) p.fx_rate_to_myr          = b.fxRate || 1;
  if (b.valueMyr     !== undefined) p.value_myr               = b.valueMyr || 0;
  if (b.purchaseMyr  !== undefined) p.purchase_price_myr      = b.purchaseMyr || 0;
  if (b.units        !== undefined) p.units                   = b.units || 0;
  if (b.maturityDate !== undefined) p.maturity_date           = b.maturityDate || null;
  if (isCreate) p.advisor = advisorName;
  return p;
}

/**
 * Map a fund-switch new-fund payload → PortfolioPatchInput.
 *
 * Shared by portfolio-switch and its test for the same reason as buildAssetRows:
 * a test that retypes the mapping asserts against itself, not the route.
 * The fxRate/derived-MYR defaults live here so both callers inherit them.
 */
export function newFundToPatchInput(fund: {
  name: string; assetClass?: string; institution?: string; currency?: string;
  valueOrig: number; purchaseOrig: number; fxRate: number;
  valueMyr?: number; purchaseMyr?: number;
}): PortfolioPatchInput {
  const fxRate = fund.fxRate || 1;
  return {
    holdingName:  fund.name,
    assetClass:   fund.assetClass,
    institution:  fund.institution,
    currency:     fund.currency || 'MYR',
    status:       'Active',
    valueOrig:    fund.valueOrig,
    purchaseOrig: fund.purchaseOrig,
    fxRate,
    valueMyr:     fund.valueMyr    || fund.valueOrig    * fxRate,
    purchaseMyr:  fund.purchaseMyr || fund.purchaseOrig * fxRate,
  };
}
