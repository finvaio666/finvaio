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
  isTest?:      boolean;
  model?:       string;
  thinkingTokens?: number;
  estCostUsd?:  number;
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
    is_test:         row.isTest ?? false,
    model:           row.model ?? null,
    thinking_tokens: row.thinkingTokens ?? 0,
    est_cost_usd:    row.estCostUsd ?? null,
  });
  if (error) throw new Error(`ai_usage insert failed: ${error.message}`);
}

export interface UsageRecord {
  id: string; date: string; advisor: string; feature: string; question: string;
  inputTokens: number; outputTokens: number; thinkingTokens: number; totalTokens: number;
  estCostUsd: number; isTest: boolean; model: string; createdAt: string;
}

/** Every logged call on/after `since` (YYYY-MM-DD), newest first. Paginated past PostgREST's 1000-row cap. */
export async function listUsageSince(since: string): Promise<UsageRecord[]> {
  const sb = getSupabase();
  const out: UsageRecord[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('ai_usage_log')
      .select('id, date, advisor, feature, question, input_tokens, output_tokens, thinking_tokens, total_tokens, est_cost_usd, is_test, model, created_at')
      .gte('date', since).order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(`ai_usage list failed: ${error.message}`);
    for (const r of data as Record<string, unknown>[]) {
      out.push({
        id: String(r.id), date: String(r.date ?? ''), advisor: String(r.advisor ?? ''), feature: String(r.feature ?? ''),
        question: String(r.question ?? ''),
        inputTokens: Number(r.input_tokens ?? 0), outputTokens: Number(r.output_tokens ?? 0),
        thinkingTokens: Number(r.thinking_tokens ?? 0), totalTokens: Number(r.total_tokens ?? 0),
        estCostUsd: Number(r.est_cost_usd ?? 0), isTest: Boolean(r.is_test), model: String(r.model ?? ''),
        createdAt: String(r.created_at ?? ''),
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}
