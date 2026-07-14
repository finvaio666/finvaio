/**
 * lib/aiUsage.ts
 * Logs each AI request to the AI usage log for per-advisor cost tracking.
 * Best-effort: failures never block the AI response.
 *
 * Data-source switch. When DATA_SOURCE_AI_USAGE === 'supabase', rows are appended
 * to Supabase; otherwise they go to the "AI Usage Log" Notion DB. Write-only —
 * the app has no in-app reader of this table.
 */

import { Client } from '@notionhq/client';
import * as sbUsage from './repos/aiUsage';

export interface AiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_AI_USAGE === 'supabase';
}

export async function logAiUsage(opts: {
  advisorName: string;
  feature: string;          // 'Ask FINVA' | 'Client Chat' | 'Draft Reply' | ...
  usage?: AiUsage;
  question?: string;
}): Promise<void> {
  const input  = opts.usage?.promptTokenCount ?? 0;
  const output = opts.usage?.candidatesTokenCount ?? 0;
  const total  = opts.usage?.totalTokenCount ?? (input + output);
  const now    = new Date();
  const stamp  = now.toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short' });
  const entry  = `${opts.advisorName} · ${opts.feature} · ${stamp}`;

  try {
    if (useSupabase()) {
      await sbUsage.insertUsage({
        entry,
        advisor:      opts.advisorName || 'Unknown',
        date:         now.toISOString().slice(0, 10),
        feature:      opts.feature,
        question:     opts.question?.slice(0, 280) ?? '',
        inputTokens:  input,
        outputTokens: output,
        totalTokens:  total,
      });
      return;
    }

    const key  = process.env.NOTION_API_KEY;
    const dbId = process.env.COMPANY_AI_USAGE_DB_ID;
    if (!key || !dbId) return;

    const notion = new Client({ auth: key });
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        'Entry':        { title: [{ text: { content: entry } }] },
        'Advisor':      { select: { name: opts.advisorName || 'Unknown' } },
        'Feature':      { select: { name: opts.feature } },
        'Input Tokens': { number: input },
        'Output Tokens':{ number: output },
        'Total Tokens': { number: total },
        'Date':         { date: { start: now.toISOString() } },
        ...(opts.question ? { 'Question': { rich_text: [{ text: { content: opts.question.slice(0, 280) } }] } } : {}),
      } as never,
    });
  } catch { /* logging is best-effort */ }
}
