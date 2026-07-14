/**
 * lib/repos/products.ts
 * Supabase data-access layer for the product catalogues (Phase 2, table 2.7):
 * insurance_plans + funds. Both are currently EMPTY (no advisor has configured a
 * source DB), so these reads return [] until products is enabled for someone.
 * Matches the Notion read: only Status='Active', scoped to the advisor.
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
