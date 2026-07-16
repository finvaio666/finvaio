/**
 * lib/repos/clients.ts
 * Supabase data-access layer for Clients (Phase 2, table 2.1 — the dependency root).
 *
 * Straight cutover (same model as tasks): when DATA_SOURCE_CLIENTS='supabase',
 * Supabase is the single source of truth; no Notion writes happen here. Safety:
 * reconcile + count-check before switching, instant rollback via the flag, and
 * the frozen Notion copy (re-syncable via the notion_id column if ever needed).
 *
 * Column names match the EXISTING Supabase schema (client_name / aum_myr /
 * risk_profile / client_segment / next_review_date / advisor / notion_id),
 * not the draft names in MIGRATION.md.
 */

import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import type { ClientRecord } from '../clients';

const TABLE = 'clients';

interface Row {
  id: string;
  notion_id: string | null;
  client_name: string | null;
  phone: string | null;
  email: string | null;
  client_segment: string | null;
  risk_profile: string | null;
  aum_myr: number | string | null;
  monthly_income_myr: number | string | null;
  financial_goals: string[] | null;
  status: string | null;
  next_review_date: string | null;
  last_review_date: string | null;
  onboarding_date: string | null;
  date_of_birth: string | null;
  advisor: string | null;
}

function toClient(r: Row): ClientRecord {
  return {
    id:             r.id,
    notionId:       r.notion_id ?? '',
    name:           r.client_name ?? '',
    advisorName:    r.advisor ?? '',
    aum:            r.aum_myr != null ? Number(r.aum_myr) : 0,
    risk:           r.risk_profile ?? '',
    segment:        r.client_segment ?? '',
    status:         r.status ?? '',
    nextReview:     r.next_review_date ?? '',
    lastReview:     r.last_review_date ?? '',
    onboardingDate: r.onboarding_date ?? '',
    dob:            r.date_of_birth ?? '',
    monthlyIncome:  r.monthly_income_myr != null ? Number(r.monthly_income_myr) : 0,
    financialGoals: r.financial_goals ?? [],
    phone:          r.phone ?? '',
    email:          r.email ?? '',
    lastEdited:     '',   // no last_edited column in Supabase clients yet
  };
}

const CLIENT_COLS = 'id, notion_id, client_name, phone, email, client_segment, risk_profile, aum_myr, monthly_income_myr, financial_goals, status, next_review_date, last_review_date, onboarding_date, date_of_birth, advisor';

/** List clients. Admin sees all (optionally filtered to one FA); others see own. */
export async function listClients(
  config: AdvisorConfig,
  opts: { advisorName?: string } = {},
): Promise<ClientRecord[]> {
  const sb = getSupabase();
  let q = sb.from(TABLE).select(CLIENT_COLS);
  // Centralized model: scope to this advisor (Admin sees all; Admin may narrow to one FA).
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  else if (opts.advisorName)   q = q.eq('advisor', opts.advisorName);

  const { data, error } = await q;
  if (error) throw new Error(`clients list failed: ${error.message}`);
  return (data as Row[]).map(toClient);
}

/** A single client by uuid, or null. Unscoped — callers enforce ownership. */
export async function getClientById(clientId: string): Promise<ClientRecord | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select(CLIENT_COLS).eq('id', clientId).maybeSingle();
  if (error) throw new Error(`clients getById failed: ${error.message}`);
  return data ? toClient(data as Row) : null;
}

/** Update a single client's AUM (MYR). `clientId` is the Supabase row uuid. */
export async function setClientAum(clientId: string, aum: number): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update({ aum_myr: aum }).eq('id', clientId);
  if (error) throw new Error(`clients setAum failed: ${error.message}`);
}

/** Resolve a Supabase client uuid → its dashless notion_id (cross-table join key). '' if not found. */
export async function getNotionIdById(id: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('notion_id').eq('id', id).maybeSingle();
  if (error) throw new Error(`clients notion_id lookup failed: ${error.message}`);
  return (data as { notion_id: string | null } | null)?.notion_id ?? '';
}

/**
 * Write a client's review dates (meetings write-back). `lastReview` is always
 * set. `nextReview`: a date string sets it, null clears it, undefined leaves it
 * untouched — mirroring the Notion path's set / clear / skip semantics.
 */
export async function setClientReviewDates(
  clientId: string,
  lastReview: string,
  nextReview: string | null | undefined,
): Promise<void> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = { last_review_date: lastReview };
  if (nextReview !== undefined) patch.next_review_date = nextReview; // null clears, string sets
  const { error } = await sb.from(TABLE).update(patch).eq('id', clientId);
  if (error) throw new Error(`clients setReviewDates failed: ${error.message}`);
}
