/**
 * lib/repos/aiUsage.ts
 * Supabase write layer for the AI usage log (Phase 2, table 2.8).
 * Append-only — one row per AI call. Best-effort (caller swallows errors).
 * Supabase-native rows carry no notion_id (there is no Notion page).
 */

import { getSupabase } from '../supabase';

export interface UsageRow {
  entry:        string;
  advisor:      string;
  date:         string; // 'YYYY-MM-DD'
  feature:      string;
  question:     string;
  inputTokens:  number;
  outputTokens: number;
  totalTokens:  number;
}

export async function insertUsage(row: UsageRow): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from('ai_usage_log').insert({
    entry:         row.entry,
    advisor:       row.advisor,
    date:          row.date,
    feature:       row.feature,
    question:      row.question || null,
    input_tokens:  row.inputTokens,
    output_tokens: row.outputTokens,
    total_tokens:  row.totalTokens,
  });
  if (error) throw new Error(`ai_usage insert failed: ${error.message}`);
}
