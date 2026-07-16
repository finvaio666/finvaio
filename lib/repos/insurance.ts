/**
 * lib/repos/insurance.ts
 * Supabase data-access layer for Insurance policies (Phase 2, tables 2.3 read +
 * 2.11 write).
 *
 * Straight cutover (same model as clients/portfolio). Client link is
 * `client_notion_id` (= clients.notion_id); callers join on notion_id. Writes
 * (createPolicy/updatePolicy/deletePolicy) take a column patch already mapped by
 * the route and enforce advisor ownership (Admin may touch any row). The
 * insurance_type / status CHECK constraints were dropped (migration 2026-07-16)
 * to match the Notion free-select and the app's wider input set.
 */

import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import type { InsurancePolicy } from '../insurance';

const TABLE = 'insurance_policies';
const COLS = 'id, notion_id, policy_name, client_notion_id, policy_number, policy_owner, life_assured, insurer, insurance_type, benefits, annual_premium_myr, sum_assured_myr, life_cover_myr, ci_cover_myr, tpd_cover_myr, pa_cover_myr, medical_card, medical_class, beneficiary, commencement_date, maturity_date, status, notes, advisor';

interface Row {
  id: string;
  notion_id: string | null;
  policy_name: string | null;
  client_notion_id: string | null;
  policy_number: string | null;
  policy_owner: string | null;
  life_assured: string | null;
  insurer: string | null;
  insurance_type: string | null;
  benefits: string[] | null;
  annual_premium_myr: number | string | null;
  sum_assured_myr: number | string | null;
  life_cover_myr: number | string | null;
  ci_cover_myr: number | string | null;
  tpd_cover_myr: number | string | null;
  pa_cover_myr: number | string | null;
  medical_card: string | null;
  medical_class: string | null;
  beneficiary: string | null;
  commencement_date: string | null;
  maturity_date: string | null;
  status: string | null;
  notes: string | null;
  advisor: string | null;
}

const n = (v: number | string | null): number => (v == null ? 0 : Number(v));

function toPolicy(r: Row): InsurancePolicy {
  return {
    id:               r.id,
    notionId:         r.notion_id ?? '',
    clientNotionId:   r.client_notion_id ?? '',
    policyName:       r.policy_name ?? '',
    policyNumber:     r.policy_number ?? '',
    policyOwner:      r.policy_owner ?? '',
    lifeAssured:      r.life_assured ?? '',
    insurer:          r.insurer ?? '',
    insuranceType:    r.insurance_type ?? '',
    benefits:         r.benefits ?? [],
    annualPremium:    n(r.annual_premium_myr),
    sumAssured:       n(r.sum_assured_myr),
    lifeCover:        n(r.life_cover_myr),
    ciCover:          n(r.ci_cover_myr),
    tpdCover:         n(r.tpd_cover_myr),
    paCover:          n(r.pa_cover_myr),
    medicalCard:      r.medical_card ?? '',
    medicalClass:     r.medical_class ?? '',
    beneficiary:      r.beneficiary ?? '',
    commencementDate: r.commencement_date ?? '',
    maturityDate:     r.maturity_date ?? '',
    status:           r.status ?? '',
    notes:            r.notes ?? '',
    advisorName:      r.advisor ?? '',
  };
}

/** List policies scoped to this advisor (Admin sees all). */
export async function listPolicies(config: AdvisorConfig): Promise<InsurancePolicy[]> {
  const sb = getSupabase();
  let q = sb.from(TABLE).select(COLS);
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`insurance list failed: ${error.message}`);
  return (data as Row[]).map(toPolicy);
}

/** Guard: non-admins may only touch their own rows. Throws 'Forbidden' otherwise. */
async function assertOwner(config: AdvisorConfig, id: string): Promise<void> {
  if (config.role === 'Admin') return;
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('advisor').eq('id', id).maybeSingle();
  if (error) throw new Error(`insurance owner lookup failed: ${error.message}`);
  if (!data || (data as { advisor: string }).advisor !== config.name) throw new Error('Forbidden');
}

/** Insert one policy (columns already mapped by the route). Returns the new id. */
export async function createPolicy(patch: Record<string, unknown>): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).insert(patch).select('id').single();
  if (error) throw new Error(`insurance insert failed: ${error.message}`);
  return { id: (data as { id: string }).id };
}

/** Update one policy (partial column patch, advisor-scoped). */
export async function updatePolicy(config: AdvisorConfig, id: string, patch: Record<string, unknown>): Promise<void> {
  await assertOwner(config, id);
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`insurance update failed: ${error.message}`);
}

/** Hard-delete one policy (advisor-scoped). */
export async function deletePolicy(config: AdvisorConfig, id: string): Promise<void> {
  await assertOwner(config, id);
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`insurance delete failed: ${error.message}`);
}
