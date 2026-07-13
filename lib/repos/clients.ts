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
  status: string | null;
  next_review_date: string | null;
  advisor: string | null;
}

function toClient(r: Row): ClientRecord {
  return {
    id:          r.id,
    notionId:    r.notion_id ?? '',
    name:        r.client_name ?? '',
    advisorName: r.advisor ?? '',
    aum:         r.aum_myr != null ? Number(r.aum_myr) : 0,
    risk:        r.risk_profile ?? '',
    segment:     r.client_segment ?? '',
    status:      r.status ?? '',
    nextReview:  r.next_review_date ?? '',
    phone:       r.phone ?? '',
    email:       r.email ?? '',
    lastEdited:  '',   // no last_edited column in Supabase clients yet
  };
}

/** List clients. Admin sees all (optionally filtered to one FA); others see own. */
export async function listClients(
  config: AdvisorConfig,
  opts: { advisorName?: string } = {},
): Promise<ClientRecord[]> {
  const sb = getSupabase();
  let q = sb.from(TABLE).select(
    'id, notion_id, client_name, phone, email, client_segment, risk_profile, aum_myr, status, next_review_date, advisor',
  );
  // Centralized model: scope to this advisor (Admin sees all; Admin may narrow to one FA).
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  else if (opts.advisorName)   q = q.eq('advisor', opts.advisorName);

  const { data, error } = await q;
  if (error) throw new Error(`clients list failed: ${error.message}`);
  return (data as Row[]).map(toClient);
}
