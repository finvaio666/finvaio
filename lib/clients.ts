/**
 * lib/clients.ts
 * Chokepoint for reading Clients, backed by a Notion "Clients" database.
 *
 * Phase 2 (table 2.1): clients reads were scattered across ~10 API routes,
 * each doing its own Notion query + inline mapping. This module centralizes that
 * read so a single flag can switch the data source, exactly like lib/tasks.ts.
 *
 * Data-source switch. When DATA_SOURCE_CLIENTS === 'supabase', Clients are served
 * from Supabase ONLY (straight cutover) — there is NO Notion mirror; the Notion
 * Clients DB stays frozen as a pre-cutover backup. Any other value (incl. unset)
 * keeps the original Notion path below unchanged. Flipping back to 'notion' is a
 * READ-ONLY rollback.
 *
 * Notion mapping uses the REAL property types: Email=email, Phone=phone_number,
 * 'Next review date' / 'Last review date' / 'Onboarding date' / 'Date of Birth'.
 * (The old admin/clients route read Phone/Email as rich_text → always blank; that
 * latent bug is fixed here now that this is the single source of the mapping.)
 *
 * ⚠️ The `id` field differs by source (Notion page id vs Supabase uuid). Every
 * clients-consuming route must be converted before the flag is flipped in any
 * environment users click through, or client-detail links will break.
 */

import { Client, isFullPage } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';
import * as sbClients from './repos/clients';

export interface ClientRecord {
  id:             string;   // Notion page id (notion path) OR Supabase uuid (supabase path)
  notionId:       string;   // dashless 32-hex, '' if unknown
  name:           string;
  advisorName:    string;
  aum:            number;
  risk:           string;
  segment:        string;
  status:         string;
  nextReview:     string;   // ISO date or ''
  lastReview:     string;
  onboardingDate: string;
  dob:            string;
  monthlyIncome:  number;
  financialGoals: string[];
  phone:          string;
  email:          string;
  lastEdited:     string;   // Notion page last_edited_time; '' from Supabase (no such column yet)
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_CLIENTS === 'supabase';
}

// ── Notion property readers (real property types of the Clients DB) ──
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
function email(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; email?: string | null } | undefined;
  return v?.type === 'email' ? (v.email ?? '') : '';
}
function phone(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; phone_number?: string | null } | undefined;
  return v?.type === 'phone_number' ? (v.phone_number ?? '') : '';
}
function titleOf(p: Record<string, unknown>): string {
  for (const val of Object.values(p)) {
    const t = val as { type: string; title?: { plain_text: string }[] } | undefined;
    if (t?.type === 'title') return t.title?.[0]?.plain_text ?? '';
  }
  return '';
}
function dateOf(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; date?: { start: string } | null } | undefined;
  return v?.type === 'date' ? (v.date?.start ?? '') : '';
}

/**
 * List clients. Admin sees all (optionally narrowed to one FA via opts.advisorName);
 * a non-Admin advisor sees only their own. Matches the scoping the routes already use.
 */
export async function listClients(
  config: AdvisorConfig,
  opts: { advisorName?: string } = {},
): Promise<ClientRecord[]> {
  if (useSupabase()) return sbClients.listClients(config, opts);
  if (!config.clientsDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];

  const notion = new Client({ auth: config.notionApiKey });
  // Non-Admin → own records; Admin → all, or one FA when opts.advisorName is set.
  const scopeName = config.role !== 'Admin' ? config.name : (opts.advisorName ?? '');
  const filter = scopeName ? { property: 'Advisor', select: { equals: scopeName } } : undefined;

  const out: ClientRecord[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: config.clientsDbId,
      page_size: 100,
      start_cursor: cursor,
      ...(filter ? { filter } : {}),
    });
    for (const cp of res.results) {
      if (!isFullPage(cp)) continue;
      const p = cp.properties as Record<string, unknown>;
      out.push({
        id:             cp.id,
        notionId:       cp.id.replace(/-/g, ''),
        name:           titleOf(p),
        advisorName:    sel(p, 'Advisor'),
        aum:            num(p, 'AUM (MYR)'),
        risk:           sel(p, 'Risk Profile'),
        segment:        sel(p, 'Client Segment'),
        status:         sel(p, 'Status'),
        nextReview:     dateOf(p, 'Next review date'),
        lastReview:     dateOf(p, 'Last review date'),
        onboardingDate: dateOf(p, 'Onboarding date'),
        dob:            dateOf(p, 'Date of Birth'),
        monthlyIncome:  num(p, 'Monthly income (MYR)'),
        financialGoals: ms(p, 'Financial goals'),
        phone:          phone(p, 'Phone'),
        email:          email(p, 'Email'),
        lastEdited:     cp.last_edited_time,
      });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

/**
 * Write a client's AUM (MYR) back to the store. `clientId` is the
 * source-appropriate id exactly as returned by listClients().id — a Notion page
 * id on the Notion path, a Supabase uuid on the Supabase path. Notion path is
 * byte-identical to the original inline sync-aum update.
 */
export async function setClientAum(config: AdvisorConfig, clientId: string, aum: number): Promise<void> {
  if (useSupabase()) return sbClients.setClientAum(clientId, aum);
  const notion = new Client({ auth: config.notionApiKey });
  await notion.pages.update({
    page_id: clientId,
    properties: { 'AUM (MYR)': { number: aum } },
  });
}

/**
 * Write a client's review dates from a saved meeting (meetings POST write-back).
 * `clientId` is the source-appropriate id exactly as returned by listClients().id
 * — a Notion page id on the Notion path, a Supabase uuid on the Supabase path —
 * which resolves the Notion-page-id-vs-uuid mismatch the old inline
 * `notion.pages.update` had once clients moved to Supabase. `Last review date`
 * is always set; `Next review date` is set from nextReviewDate, cleared when
 * clearNextReview, else left untouched. Notion path is byte-identical to the
 * original inline update in app/api/meetings.
 */
export async function setClientReviewDates(
  config: AdvisorConfig,
  clientId: string,
  meetingDate: string,
  nextReviewDate?: string,
  clearNextReview?: boolean,
): Promise<void> {
  if (useSupabase()) {
    const next = nextReviewDate ? nextReviewDate : (clearNextReview ? null : undefined);
    return sbClients.setClientReviewDates(clientId, meetingDate, next);
  }
  const notion = new Client({ auth: config.notionApiKey });
  const updateProps: Record<string, unknown> = {
    'Last review date': { date: { start: meetingDate } },
  };
  if (nextReviewDate)     updateProps['Next review date'] = { date: { start: nextReviewDate } };
  else if (clearNextReview) updateProps['Next review date'] = { date: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await notion.pages.update({ page_id: clientId, properties: updateProps as any });
}
