/**
 * lib/meetingNotes.ts
 * Chokepoint for reading Meeting Notes (Phase 2, table 2.6).
 *
 * Data-source switch. When DATA_SOURCE_MEETINGS === 'supabase', notes are served
 * from Supabase ONLY (straight cutover); otherwise the Notion path is used.
 *
 * clientName is parsed from the title "ClientName — Type — Date" (this DB has no
 * dedicated Client column); clientId is '' on both paths. Callers that need a
 * per-client view filter on clientName/title themselves (see ai / tasks-sync).
 *
 * NOTE: reads only. The meetings write (POST /api/meetings — creates a note and
 * writes back the client's review dates) is deferred to the write-path phase;
 * it also hits the clientId-format incompatibility (Notion page id vs Supabase
 * uuid) that must be resolved there.
 */

import { Client } from '@notionhq/client';
import { AdvisorConfig, advisorFilter } from './getAdvisorConfig';
import { queryAllPages } from './notionQueryAll';
import * as sbMeetings from './repos/meetingNotes';

export interface MeetingNote {
  id:             string;
  clientId:       string;
  clientName:     string;
  meetingDate:    string;
  meetingType:    string;
  notes:          string;
  actionItems:    string;
  nextReviewDate: string;
  title:          string;
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_MEETINGS === 'supabase';
}

function rt(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : '';
}
function sel(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; select?: { name: string } | null } | undefined;
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
function relId(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; relation?: { id: string }[] } | undefined;
  return v?.type === 'relation' ? (v.relation?.[0]?.id ?? '') : '';
}

/** List meeting notes scoped to this advisor (Admin sees all), newest meeting first. */
export async function listMeetings(config: AdvisorConfig): Promise<MeetingNote[]> {
  if (useSupabase()) return sbMeetings.listMeetings(config);
  if (!config.meetingNotesDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];

  const notion = new Client({ auth: config.notionApiKey });
  const f = advisorFilter(config);
  let pages;
  try {
    pages = await queryAllPages(notion, {
      database_id: config.meetingNotesDbId,
      ...(f ? { filter: f } : {}),
      sorts: [{ property: 'Meeting Date', direction: 'descending' }],
    });
  } catch (e) {
    // The "Advisor" select option is auto-created on the first meeting save.
    // Until then, filtering by it makes Notion throw a validation_error — that
    // just means this advisor has no meetings yet. Return empty quietly.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found for property')) return [];
    throw e;
  }

  return pages.map(page => {
    const p = page.properties as Record<string, unknown>;
    const title = titleOf(p, 'Name');
    // clientName: prefer a dedicated 'Client Name' field; else parse the title.
    const clientName = rt(p, 'Client Name') || title.split(' — ')[0]?.trim() || '';
    return {
      id:             page.id,
      clientId:       relId(p, 'Client'),
      clientName,
      meetingDate:    dateOf(p, 'Meeting Date'),
      meetingType:    sel(p, 'Meeting Type'),
      notes:          rt(p, 'Notes'),
      actionItems:    rt(p, 'Action Items'),
      nextReviewDate: dateOf(p, 'Next Review Date'),
      title,
    };
  });
}
