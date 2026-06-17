/**
 * lib/aiUsage.ts
 * Logs each AI request to the "AI Usage Log" Notion DB for per-advisor cost
 * tracking. Best-effort: failures never block the AI response.
 */

import { Client } from '@notionhq/client';

export interface AiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export async function logAiUsage(opts: {
  advisorName: string;
  feature: string;          // 'Ask FINVA' | 'Client Chat' | 'Draft Reply' | ...
  usage?: AiUsage;
  question?: string;
}): Promise<void> {
  const key   = process.env.NOTION_API_KEY;
  const dbId  = process.env.COMPANY_AI_USAGE_DB_ID;
  if (!key || !dbId) return;

  const input  = opts.usage?.promptTokenCount ?? 0;
  const output = opts.usage?.candidatesTokenCount ?? 0;
  const total  = opts.usage?.totalTokenCount ?? (input + output);
  const now    = new Date();
  const stamp  = now.toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short' });

  try {
    const notion = new Client({ auth: key });
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        'Entry':        { title: [{ text: { content: `${opts.advisorName} · ${opts.feature} · ${stamp}` } }] },
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
