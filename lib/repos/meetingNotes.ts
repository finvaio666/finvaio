/**
 * lib/repos/meetingNotes.ts
 * Supabase data-access layer for Meeting Notes (Phase 2, tables 2.6 read + 2.11
 * write).
 *
 * The live table has NO client column — `name` is the composite title
 * "ClientName — Type — Date". clientName is parsed from it (like the Notion
 * path); clientId is always '' (no relation stored). The meeting's client
 * linkage therefore lives only in the title; the client review-date write-back
 * is a separate write on the clients table (see lib/clients.setClientReviewDates).
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

export interface MeetingWrite {
  title:          string;        // "ClientName — Type — Date"
  meetingDate:    string;        // 'YYYY-MM-DD'
  meetingType:    string;
  notes:          string;
  actionItems:    string;
  nextReviewDate: string | null; // '' / null → column left null
  advisor:        string;
}

/**
 * Insert one meeting note. Supabase-native rows carry no notion_id and no client
 * relation (the table has no client column — clientName lives in the title).
 */
export async function createMeeting(w: MeetingWrite): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).insert({
    name:             w.title,
    meeting_date:     w.meetingDate,
    meeting_type:     w.meetingType,
    notes:            w.notes || null,
    action_items:     w.actionItems || null,
    next_review_date: w.nextReviewDate || null,
    advisor:          w.advisor,
  }).select('id').single();
  if (error) throw new Error(`meeting_notes insert failed: ${error.message}`);
  return { id: (data as { id: string }).id };
}
