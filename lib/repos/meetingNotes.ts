/**
 * lib/repos/meetingNotes.ts
 * Supabase data-access layer for Meeting Notes (Phase 2, table 2.6).
 *
 * The live table has NO client column — `name` is the composite title
 * "ClientName — Type — Date". clientName is parsed from it (like the Notion
 * path); clientId is always '' (no relation stored).
 */

import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import type { MeetingNote } from '../meetingNotes';

const TABLE = 'meeting_notes';

interface Row {
  id:               string;
  notion_id:        string | null;
  name:             string | null;
  meeting_date:     string | null; // date → 'YYYY-MM-DD'
  meeting_type:     string | null;
  next_review_date: string | null;
  notes:            string | null;
  action_items:     string | null;
  advisor:          string | null;
}

function toMeeting(r: Row): MeetingNote {
  const title = r.name ?? '';
  return {
    id:             r.id,
    clientId:       '',
    clientName:     title.split(' — ')[0]?.trim() ?? '',
    meetingDate:    r.meeting_date ?? '',
    meetingType:    r.meeting_type ?? '',
    notes:          r.notes ?? '',
    actionItems:    r.action_items ?? '',
    nextReviewDate: r.next_review_date ?? '',
    title,
  };
}

/** List meeting notes scoped to this advisor (Admin sees all), newest meeting first. */
export async function listMeetings(config: AdvisorConfig): Promise<MeetingNote[]> {
  const sb = getSupabase();
  let q = sb
    .from(TABLE)
    .select('id, notion_id, name, meeting_date, meeting_type, next_review_date, notes, action_items, advisor')
    .order('meeting_date', { ascending: false });
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`meeting_notes list failed: ${error.message}`);
  return (data as Row[]).map(toMeeting);
}
