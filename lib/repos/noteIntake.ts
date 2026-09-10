/**
 * lib/repos/noteIntake.ts
 * Supabase data-access for the structured-note intake queue (note_intake).
 *
 * See db/migrations/2026-09-09-create-note-intake.sql for why this staging
 * step exists at all: term-sheet parses are best-effort, and the per-client
 * invested amount is never on the term sheet, so nothing reaches
 * portfolio_holdings without a human supplying that number and confirming
 * the terms.
 *
 * Rows are written by scripts/scan-term-sheets.mjs (which talks to PostgREST
 * directly, since it runs on the advisor's own machine where the PDFs and
 * pypdf live) and read/resolved by the Admin "New Notes" tab.
 */

import { getSupabase } from '../supabase';

const TABLE = 'note_intake';

export interface NoteIntakeRow {
  id:                string;
  fileHash:          string;
  filePath:          string;
  fileName:          string;
  isin:              string;
  clientNotionId:    string;   // '' when the folder matched no known client
  clientMatchSource: string;
  clientHint:        string;
  issuerFamily:      string;
  parsed:            Record<string, unknown> | null;
  parseWarnings:     string[];
  status:            'pending' | 'inserted' | 'ignored';
  holdingIds:        string[];
  reviewedBy:        string;
  reviewedAt:        string;
  firstSeenAt:       string;
  lastSeenAt:        string;
}

interface Row {
  id: string;
  file_hash: string;
  file_path: string;
  file_name: string | null;
  isin: string;
  client_notion_id: string | null;
  client_match_source: string | null;
  client_hint: string | null;
  issuer_family: string | null;
  parsed: Record<string, unknown> | null;
  parse_warnings: string[] | null;
  status: string;
  holding_ids: string[] | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

const COLS = 'id, file_hash, file_path, file_name, isin, client_notion_id, client_match_source, client_hint, issuer_family, parsed, parse_warnings, status, holding_ids, reviewed_by, reviewed_at, first_seen_at, last_seen_at';

function toIntake(r: Row): NoteIntakeRow {
  return {
    id:                r.id,
    fileHash:          r.file_hash,
    filePath:          r.file_path,
    fileName:          r.file_name ?? '',
    isin:              r.isin,
    clientNotionId:    r.client_notion_id ?? '',
    clientMatchSource: r.client_match_source ?? '',
    clientHint:        r.client_hint ?? '',
    issuerFamily:      r.issuer_family ?? '',
    parsed:            r.parsed,
    parseWarnings:     r.parse_warnings ?? [],
    status:            (r.status as NoteIntakeRow['status']) ?? 'pending',
    holdingIds:        r.holding_ids ?? [],
    reviewedBy:        r.reviewed_by ?? '',
    reviewedAt:        r.reviewed_at ?? '',
    firstSeenAt:       r.first_seen_at ?? '',
    lastSeenAt:        r.last_seen_at ?? '',
  };
}

/** Candidates still awaiting review, oldest first — a note sitting unreviewed for weeks is the thing worth seeing. */
export async function listPending(): Promise<NoteIntakeRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select(COLS)
    .eq('status', 'pending')
    .order('first_seen_at', { ascending: true });
  if (error) throw new Error(`note_intake list failed: ${error.message}`);
  return (data as Row[]).map(toIntake);
}

/** One candidate by id (used to validate an accept/ignore against live state). */
export async function getById(id: string): Promise<NoteIntakeRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(`note_intake get failed: ${error.message}`);
  return data ? toIntake(data as Row) : null;
}

/**
 * Ignore a document permanently — every candidate sharing this file hash, not
 * just the row that was clicked.
 *
 * Per-hash rather than per-row because the reasons to ignore ("superseded
 * draft", "duplicate file", "not ours") are properties of the DOCUMENT, and a
 * per-row ignore would leave the same rejected PDF coming back every scan
 * under its other client folders. The caller is expected to tell the reviewer
 * how many rows this will take out — see the Ignore button's label.
 */
export async function ignoreByHash(fileHash: string, reviewedBy: string): Promise<number> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .update({ status: 'ignored', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('file_hash', fileHash)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error(`note_intake ignore failed: ${error.message}`);
  return (data ?? []).length;
}

/** Mark a candidate accepted, recording the holdings it produced. */
export async function markInserted(id: string, holdingIds: string[], reviewedBy: string): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .update({ status: 'inserted', holding_ids: holdingIds, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(`note_intake markInserted failed: ${error.message}`);
  // PostgREST does not error on a zero-row UPDATE. Silence here would mean the
  // holdings were created but the candidate stayed pending — and the next
  // accept would duplicate them — so this has to be loud.
  if (!data || data.length === 0) throw new Error(`note_intake markInserted: no row with id ${id}`);
}
