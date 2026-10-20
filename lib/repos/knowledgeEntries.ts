/**
 * lib/repos/knowledgeEntries.ts
 * Supabase data-access layer for the FINVA Master Brain — the firm's internal
 * knowledge base of FAQs and FA case studies.
 * Plan: 100_Todo/plans/2026-08-22-finva-master-brain-kb.md
 *
 * Deliberately NOT advisor-scoped on reads: one FA's hard-won lesson is meant to
 * become every FA's knowledge. `author_advisor` is credit/provenance, not a
 * access boundary.
 *
 * ONLY `published` rows are ever returned to the AI assistant — `draft` is both a
 * quality gate and a de-identification (PDPA) gate.
 */

import { getSupabase } from '../supabase';

const TABLE = 'knowledge_entries';

export interface KnowledgeEntry {
  id:            string;
  entryType:     'faq' | 'case_study';
  category:      string;
  title:         string;
  situation:     string;
  resolution:    string;
  keyTakeaway:   string;
  tags:          string[];
  status:        'draft' | 'published' | 'rejected';
  isBigLesson:   boolean;
  source:        string;
  authorAdvisor: string;
  helpfulCount:  number;
  createdAt:     string;
}

/** Review fields - Admin console only, never sent to the AI. */
export interface ReviewEntry extends KnowledgeEntry {
  suggestedBy:       string;
  originalQuestion:  string;
  originalAnswer:    string;
  faNote:            string;
  similarEntryId:    string;
  similarEntryTitle: string;
  reviewedBy:        string;
  reviewedAt:        string;
  reviewNote:        string;
  updatedAt:         string;
}

interface Row {
  id: string;
  entry_type: string | null;
  category: string | null;
  title: string | null;
  situation: string | null;
  resolution: string | null;
  key_takeaway: string | null;
  tags: string[] | null;
  status: string | null;
  is_big_lesson: boolean | null;
  source: string | null;
  author_advisor: string | null;
  helpful_count: number | null;
  created_at: string | null;
}

const COLS =
  'id, entry_type, category, title, situation, resolution, key_takeaway, tags, status, is_big_lesson, source, author_advisor, helpful_count, created_at';

function toEntry(r: Row): KnowledgeEntry {
  return {
    id:            r.id,
    entryType:     (r.entry_type as KnowledgeEntry['entryType']) ?? 'case_study',
    category:      r.category ?? '',
    title:         r.title ?? '',
    situation:     r.situation ?? '',
    resolution:    r.resolution ?? '',
    keyTakeaway:   r.key_takeaway ?? '',
    tags:          r.tags ?? [],
    status:        (r.status as KnowledgeEntry['status']) ?? 'draft',
    isBigLesson:   r.is_big_lesson ?? false,
    source:        r.source ?? 'manual',
    authorAdvisor: r.author_advisor ?? '',
    helpfulCount:  r.helpful_count ?? 0,
    createdAt:     r.created_at ?? '',
  };
}

/** Every published entry (company-wide). Big lessons first, then newest. */
export async function listPublished(): Promise<KnowledgeEntry[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select(COLS)
    .eq('status', 'published')
    .order('is_big_lesson', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`knowledge_entries listPublished failed: ${error.message}`);
  return (data as Row[]).map(toEntry);
}

const REVIEW_COLS = `${COLS}, suggested_by, original_question, original_answer, fa_note, similar_entry_id, similar_entry_title, reviewed_by, reviewed_at, review_note, updated_at`;

function toReview(r: Row & Record<string, unknown>): ReviewEntry {
  const s = (k: string) => (r[k] == null ? '' : String(r[k]));
  return {
    ...toEntry(r),
    suggestedBy: s('suggested_by'), originalQuestion: s('original_question'), originalAnswer: s('original_answer'),
    faNote: s('fa_note'), similarEntryId: s('similar_entry_id'), similarEntryTitle: s('similar_entry_title'),
    reviewedBy: s('reviewed_by'), reviewedAt: s('reviewed_at'), reviewNote: s('review_note'), updatedAt: s('updated_at'),
  };
}

/** Every entry with its review fields, newest first - Admin KB Review only. */
export async function listForReview(): Promise<ReviewEntry[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select(REVIEW_COLS).order('created_at', { ascending: false });
  if (error) throw new Error(`knowledge_entries listForReview failed: ${error.message}`);
  return (data as (Row & Record<string, unknown>)[]).map(toReview);
}

/** An FA's suggestion: always a draft, so nothing reaches the AI before an Admin approves it. */
export async function createSuggestion(input: {
  entryType: string; category: string; title: string; situation: string; resolution: string;
  keyTakeaway: string; tags: string[]; suggestedBy: string; originalQuestion: string;
  originalAnswer: string; faNote: string; similarEntryId?: string; similarEntryTitle?: string;
}): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).insert({
    entry_type: input.entryType, category: input.category, title: input.title,
    situation: input.situation, resolution: input.resolution, key_takeaway: input.keyTakeaway,
    tags: input.tags, status: 'draft', is_big_lesson: false, source: 'fa_suggestion',
    author_advisor: input.suggestedBy, suggested_by: input.suggestedBy,
    original_question: input.originalQuestion, original_answer: input.originalAnswer, fa_note: input.faNote,
    similar_entry_id: input.similarEntryId || null, similar_entry_title: input.similarEntryTitle || null,
  }).select('id').single();
  if (error) throw new Error(`knowledge_entries suggestion insert failed: ${error.message}`);
  return { id: (data as { id: string }).id };
}

/** All entries including drafts — Admin review console only. */
export async function listAll(): Promise<KnowledgeEntry[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select(COLS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`knowledge_entries listAll failed: ${error.message}`);
  return (data as Row[]).map(toEntry);
}

export async function createEntry(input: {
  entryType: string;
  category: string;
  title: string;
  situation: string;
  resolution: string;
  keyTakeaway: string;
  tags: string[];
  status?: string;
  isBigLesson?: boolean;
  source?: string;
  sourceMeetingId?: string;
  authorAdvisor: string;
}): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).insert({
    entry_type:        input.entryType,
    category:          input.category,
    title:             input.title,
    situation:         input.situation,
    resolution:        input.resolution,
    key_takeaway:      input.keyTakeaway,
    tags:              input.tags,
    status:            input.status ?? 'draft',
    is_big_lesson:     input.isBigLesson ?? false,
    source:            input.source ?? 'manual',
    source_meeting_id: input.sourceMeetingId ?? null,
    author_advisor:    input.authorAdvisor,
  }).select('id').single();
  if (error) throw new Error(`knowledge_entries insert failed: ${error.message}`);
  return { id: (data as { id: string }).id };
}

/** Admin edit: publish/unpublish, flag a big lesson, or correct the text. */
export async function updateEntry(id: string, patch: Partial<{
  entryType: string; category: string; title: string; situation: string;
  resolution: string; keyTakeaway: string; tags: string[]; status: string; isBigLesson: boolean;
  source: string; reviewedBy: string; reviewNote: string;
}>): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.entryType   !== undefined) row.entry_type    = patch.entryType;
  if (patch.category    !== undefined) row.category      = patch.category;
  if (patch.title       !== undefined) row.title         = patch.title;
  if (patch.situation   !== undefined) row.situation     = patch.situation;
  if (patch.resolution  !== undefined) row.resolution    = patch.resolution;
  if (patch.keyTakeaway !== undefined) row.key_takeaway  = patch.keyTakeaway;
  if (patch.tags        !== undefined) row.tags          = patch.tags;
  if (patch.status      !== undefined) row.status        = patch.status;
  if (patch.isBigLesson !== undefined) row.is_big_lesson = patch.isBigLesson;
  if (patch.source      !== undefined) row.source        = patch.source;
  if (patch.reviewNote  !== undefined) row.review_note   = patch.reviewNote;
  if (patch.reviewedBy  !== undefined) { row.reviewed_by = patch.reviewedBy; row.reviewed_at = new Date().toISOString(); }

  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update(row).eq('id', id);
  if (error) throw new Error(`knowledge_entries update failed: ${error.message}`);
}

export async function deleteEntry(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`knowledge_entries delete failed: ${error.message}`);
}
