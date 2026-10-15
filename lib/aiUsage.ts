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
import { estimateCostUsd, thinkingTokens } from './aiPricing';

export interface AiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

/**
 * Features that spend the FA's daily Ask FINVA allowance. Everything else
 * (email drafts, term-sheet reads, meeting capture, the market digest...) is
 * still logged so the Admin bill reconciles with Google, but does not use up
 * the allowance shown in the "Tokens left today" meter.
 */
const QUOTA_FEATURES = new Set(['Ask FINVA', 'Client Chat', 'Task Extract', 'Work Check']);
export function countsTowardQuota(feature: string): boolean {
  return QUOTA_FEATURES.has(feature) || feature.startsWith('Blocked');
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_AI_USAGE === 'supabase';
}

export async function logAiUsage(opts: {
  advisorName: string;
  feature: string;          // 'Ask FINVA' | 'Client Chat' | 'Draft Reply' | ...
  usage?: AiUsage;
  question?: string;
  model?: string;     // the model that actually answered (fallbacks are priced differently)
  isTest?: boolean;   // eval / dev test run - kept out of real-usage totals
}): Promise<void> {
  const input  = opts.usage?.promptTokenCount ?? 0;
  const output = opts.usage?.candidatesTokenCount ?? 0;
  const total  = opts.usage?.totalTokenCount ?? (input + output);
  const now    = new Date();
  // Explicit KL tz — Vercel runs functions in UTC and reserves the TZ env var,
  // so ambient formatting would render UTC. Pin it here for a deterministic stamp.
  const stamp  = now.toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' });
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
        isTest:       opts.isTest ?? false,
        model:        opts.model,
        thinkingTokens: thinkingTokens(input, output, total),
        estCostUsd:   estimateCostUsd(opts.model, input, output, total),
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
