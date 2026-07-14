/**
 * lib/products.ts
 * Chokepoint for reading the product catalogues (Phase 2, table 2.7):
 * insurance_plans + funds.
 *
 * Data-source switch. When DATA_SOURCE_PRODUCTS === 'supabase', catalogues are
 * served from Supabase ONLY (straight cutover); otherwise the Notion path is used.
 *
 * products is a per-advisor, FEATURE-GATED capability — the source DB IDs come
 * only from the advisor's Notion record (no company env fallback). As of the
 * migration no advisor has configured one, so both tables are empty and both
 * paths return []. The Notion path faithfully mirrors the old notion?type=
 * insurance-products / funds branches (Status='Active', sorted).
 *
 * NOTE: reads only. The product write (POST /api/products — AI extract + save to
 * Notion) is deferred to the write-path phase.
 */

import { Client } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';
import { queryAllPages } from './notionQueryAll';
import * as sbProducts from './repos/products';

export interface InsurancePlan {
  id:                string;
  name:              string;
  insurer:           string;
  type:              string;
  minAge:            number;
  maxAge:            number;
  minSumAssured:     number;
  maxSumAssured:     number;
  estMonthlyPremium: string;
  keyFeatures:       string;
  epfApproved:       boolean;
  status:            string;
}

export interface Fund {
  id:            string;
  name:          string;
  fundHouse:     string;
  assetClass:    string;
  region:        string;
  riskLevel:     string;
  return3Y:      number;
  minInvestment: number;
  salesCharge:   number;
  epfApproved:   boolean;
  status:        string;
  description:   string;
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_PRODUCTS === 'supabase';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function notionClient(config: AdvisorConfig): Client | null {
  if (!config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return null;
  return new Client({ auth: config.notionApiKey });
}

/** Active insurance plans (Notion or Supabase per flag), ordered by insurer. */
export async function listPlans(config: AdvisorConfig): Promise<InsurancePlan[]> {
  if (useSupabase()) return sbProducts.listPlans(config);
  const notion = notionClient(config);
  if (!notion || !config.insurancePlansDbId) return [];

  const pages = await queryAllPages(notion, {
    database_id: config.insurancePlansDbId,
    filter: { property: 'Status', select: { equals: 'Active' } },
    sorts: [{ property: 'Insurer', direction: 'ascending' }],
  });
  return pages.map(page => {
    const p = page.properties as Record<string, any>;
    return {
      id:                page.id,
      name:              p['Name']?.title?.[0]?.plain_text ?? '',
      insurer:           p['Insurer']?.select?.name ?? p['Insurer']?.rich_text?.[0]?.plain_text ?? '',
      type:              p['Type']?.select?.name ?? '',
      minAge:            p['Min Age']?.number ?? 0,
      maxAge:            p['Max Age']?.number ?? 99,
      minSumAssured:     p['Min Sum Assured']?.number ?? 0,
      maxSumAssured:     p['Max Sum Assured']?.number ?? 0,
      estMonthlyPremium: p['Est Monthly Premium']?.rich_text?.[0]?.plain_text ?? '',
      keyFeatures:       p['Key Features']?.rich_text?.[0]?.plain_text ?? '',
      epfApproved:       p['EPF Approved']?.checkbox ?? false,
      status:            p['Status']?.select?.name ?? 'Active',
    };
  });
}

/** Active investment funds (Notion or Supabase per flag), ordered by fund house. */
export async function listFunds(config: AdvisorConfig): Promise<Fund[]> {
  if (useSupabase()) return sbProducts.listFunds(config);
  const notion = notionClient(config);
  if (!notion || !config.fundsDbId) return [];

  const pages = await queryAllPages(notion, {
    database_id: config.fundsDbId,
    filter: { property: 'Status', select: { equals: 'Active' } },
    sorts: [{ property: 'Fund House', direction: 'ascending' }],
  });
  return pages.map(page => {
    const p = page.properties as Record<string, any>;
    return {
      id:            page.id,
      name:          p['Name']?.title?.[0]?.plain_text ?? '',
      fundHouse:     p['Fund House']?.select?.name ?? p['Fund House']?.rich_text?.[0]?.plain_text ?? '',
      assetClass:    p['Asset Class']?.select?.name ?? '',
      region:        p['Region']?.select?.name ?? '',
      riskLevel:     p['Risk Level']?.select?.name ?? '',
      return3Y:      p['3Y Return %']?.number ?? 0,
      minInvestment: p['Min Investment']?.number ?? 1000,
      salesCharge:   p['Sales Charge %']?.number ?? 0,
      epfApproved:   p['EPF Approved']?.checkbox ?? false,
      status:        p['Status']?.select?.name ?? 'Active',
      description:   p['Description']?.rich_text?.[0]?.plain_text ?? '',
    };
  });
}
