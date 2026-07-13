/**
 * lib/insurance.ts
 * Chokepoint for reading Insurance policies (Phase 2, table 2.3).
 *
 * Data-source switch. When DATA_SOURCE_INSURANCE === 'supabase', policies are
 * served from Supabase ONLY (straight cutover); otherwise the Notion path below
 * is used unchanged.
 *
 * Client link is exposed as `clientNotionId` — callers join to clients ON
 * notion_id (see lib/portfolio.ts for the rationale).
 */

import { Client, isFullPage } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';
import * as sbInsurance from './repos/insurance';

export interface InsurancePolicy {
  id:              string;
  notionId:        string;
  clientNotionId:  string;
  policyName:      string;
  policyNumber:    string;
  policyOwner:     string;
  lifeAssured:     string;
  insurer:         string;
  insuranceType:   string;
  benefits:        string[];
  annualPremium:   number;
  sumAssured:      number;
  lifeCover:       number;
  ciCover:         number;
  tpdCover:        number;
  paCover:         number;
  medicalCard:     string;
  medicalClass:    string;
  beneficiary:     string;
  commencementDate: string;
  maturityDate:    string;
  status:          string;
  notes:           string;
  advisorName:     string;
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_INSURANCE === 'supabase';
}

// ── Notion property readers (real property types of the Insurance DB) ──
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
function ms(p: Record<string, unknown>, k: string): string[] {
  const v = p[k] as { type: string; multi_select?: { name: string }[] } | undefined;
  return v?.type === 'multi_select' ? (v.multi_select ?? []).map(o => o.name) : [];
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

/** List policies scoped to this advisor (Admin sees all). */
export async function listPolicies(config: AdvisorConfig): Promise<InsurancePolicy[]> {
  if (useSupabase()) return sbInsurance.listPolicies(config);
  if (!config.insuranceDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];

  const notion = new Client({ auth: config.notionApiKey });
  const filter = config.role !== 'Admin'
    ? { property: 'Advisor', select: { equals: config.name } }
    : undefined;

  const out: InsurancePolicy[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: config.insuranceDbId,
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
        clientNotionId:   relFirst(p, 'Clients'),
        policyName:       titleOf(p, 'Policy Name'),
        policyNumber:     rt(p, 'Policy Number'),
        policyOwner:      rt(p, 'Policy Owner'),
        lifeAssured:      rt(p, 'Life Assured'),
        insurer:          rt(p, 'Insurer'),
        insuranceType:    sel(p, 'Insurance Type'),
        benefits:         ms(p, 'Benefits'),
        annualPremium:    num(p, 'Annual Premium (MYR)'),
        sumAssured:       num(p, 'Sum Assured (MYR)'),
        lifeCover:        num(p, 'Life Cover (MYR)'),
        ciCover:          num(p, 'CI Cover (MYR)'),
        tpdCover:         num(p, 'TPD Cover (MYR)'),
        paCover:          num(p, 'PA Cover (MYR)'),
        medicalCard:      rt(p, 'Medical Card'),
        medicalClass:     rt(p, 'Medical Class'),
        beneficiary:      rt(p, 'Beneficiary'),
        commencementDate: dateOf(p, 'Commencement Date'),
        maturityDate:     dateOf(p, 'Maturity Date'),
        status:           sel(p, 'Status'),
        notes:            rt(p, 'Notes'),
        advisorName:      sel(p, 'Advisor'),
      });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}
