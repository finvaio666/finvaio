/**
 * lib/repos/products.ts
 * Supabase data-access layer for the product catalogues (Phase 2, tables 2.7
 * read + 2.11 write): insurance_plans + funds. Both are currently EMPTY (no
 * advisor has configured a source DB), so reads return [] until products is
 * enabled for someone. Matches the Notion read: only Status='Active', scoped to
 * the advisor. Writes (createPlan/createFund) mirror the Notion save handler's
 * defaults and stamp the owning advisor for scoping.
 */

import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import type { InsurancePlan, Fund } from '../products';

const num = (v: number | string | null | undefined, d = 0): number => (v == null ? d : Number(v));

interface PlanRow {
  id: string; name: string | null; insurer: string | null; type: string | null;
  min_age: number | null; max_age: number | null; min_sum_assured: number | string | null;
  max_sum_assured: number | string | null; est_monthly_premium: string | null;
  key_features: string | null; epf_approved: boolean | null; status: string | null;
}
interface FundRow {
  id: string; name: string | null; fund_house: string | null; asset_class: string | null;
  region: string | null; risk_level: string | null; return_3y: number | string | null;
  min_investment: number | string | null; sales_charge: number | string | null;
  epf_approved: boolean | null; status: string | null; description: string | null;
}

function toPlan(r: PlanRow): InsurancePlan {
  return {
    id:                r.id,
    name:              r.name ?? '',
    insurer:           r.insurer ?? '',
    type:              r.type ?? '',
    minAge:            num(r.min_age, 0),
    maxAge:            num(r.max_age, 99),
    minSumAssured:     num(r.min_sum_assured, 0),
    maxSumAssured:     num(r.max_sum_assured, 0),
    estMonthlyPremium: r.est_monthly_premium ?? '',
    keyFeatures:       r.key_features ?? '',
    epfApproved:       r.epf_approved ?? false,
    status:            r.status ?? 'Active',
  };
}

function toFund(r: FundRow): Fund {
  return {
    id:            r.id,
    name:          r.name ?? '',
    fundHouse:     r.fund_house ?? '',
    assetClass:    r.asset_class ?? '',
    region:        r.region ?? '',
    riskLevel:     r.risk_level ?? '',
    return3Y:      num(r.return_3y, 0),
    minInvestment: num(r.min_investment, 1000),
    salesCharge:   num(r.sales_charge, 0),
    epfApproved:   r.epf_approved ?? false,
    status:        r.status ?? 'Active',
    description:   r.description ?? '',
  };
}

/** Active insurance plans for this advisor (Admin sees all), ordered by insurer. */
export async function listPlans(config: AdvisorConfig): Promise<InsurancePlan[]> {
  const sb = getSupabase();
  let q = sb
    .from('insurance_plans')
    .select('id, name, insurer, type, min_age, max_age, min_sum_assured, max_sum_assured, est_monthly_premium, key_features, epf_approved, status')
    .eq('status', 'Active')
    .order('insurer', { ascending: true });
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`insurance_plans list failed: ${error.message}`);
  return (data as PlanRow[]).map(toPlan);
}

/** Active investment funds for this advisor (Admin sees all), ordered by fund house. */
export async function listFunds(config: AdvisorConfig): Promise<Fund[]> {
  const sb = getSupabase();
  let q = sb
    .from('funds')
    .select('id, name, fund_house, asset_class, region, risk_level, return_3y, min_investment, sales_charge, epf_approved, status, description')
    .eq('status', 'Active')
    .order('fund_house', { ascending: true });
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`funds list failed: ${error.message}`);
  return (data as FundRow[]).map(toFund);
}

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Insert one insurance plan (POST /api/products, action=save). Defaults mirror
 * the Notion save handler (Insurer→Unknown, Type→Others, Status→Active); numeric
 * fields are null when absent. `advisor` stamps ownership for read scoping.
 */
export async function createPlan(advisor: string, product: Record<string, unknown>): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from('insurance_plans').insert({
    name:                String(product.name ?? ''),
    insurer:             String(product.insurer ?? 'Unknown'),
    type:                String(product.type ?? 'Others'),
    min_age:             numOrNull(product.minAge),
    max_age:             numOrNull(product.maxAge),
    min_sum_assured:     numOrNull(product.minSumAssured),
    max_sum_assured:     numOrNull(product.maxSumAssured),
    est_monthly_premium: product.estMonthlyPremium ? String(product.estMonthlyPremium) : null,
    key_features:        product.keyFeatures ? String(product.keyFeatures) : null,
    epf_approved:        Boolean(product.epfApproved),
    status:              'Active',
    advisor,
  }).select('id').single();
  if (error) throw new Error(`insurance_plans insert failed: ${error.message}`);
  return { id: (data as { id: string }).id };
}

/**
 * Insert one investment fund (POST /api/products, action=save). Defaults mirror
 * the Notion save handler (Fund House→Unknown, Asset Class→Others, Region→
 * Malaysia, Risk Level→Moderate, Status→Active); numeric fields null when absent.
 */
export async function createFund(advisor: string, product: Record<string, unknown>): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from('funds').insert({
    name:           String(product.name ?? ''),
    fund_house:     String(product.fundHouse ?? 'Unknown'),
    asset_class:    String(product.assetClass ?? 'Others'),
    region:         String(product.region ?? 'Malaysia'),
    risk_level:     String(product.riskLevel ?? 'Moderate'),
    return_3y:      numOrNull(product.return3Y),
    min_investment: numOrNull(product.minInvestment),
    sales_charge:   numOrNull(product.salesCharge),
    epf_approved:   Boolean(product.epfApproved),
    status:         'Active',
    description:    product.description ? String(product.description) : null,
    advisor,
  }).select('id').single();
  if (error) throw new Error(`funds insert failed: ${error.message}`);
  return { id: (data as { id: string }).id };
}
