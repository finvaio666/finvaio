import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { logAiUsage } from '@/lib/aiUsage';
import {
  MODEL_FALLBACKS,
  fetchClients,
  buildSharedContext,
  handleTaskIntents,
  SHARED_DATA_RULES,
} from '@/lib/assistantContext';

export const dynamic = 'force-dynamic';

/**
 * Ask FINVA — the dashboard widget's single-shot Q&A.
 *
 * The data lookups, task intents and product rules live in
 * lib/assistantContext.ts so this and /api/ai (the full chat surface, used by
 * the AI Assistant page and the global launcher) answer identically.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

  let body: { question: string; context: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!body.question?.trim()) return NextResponse.json({ error: 'Question required' }, { status: 400 });

  const config = await getAdvisorConfig(advisorId);
  const advisorName = config?.name || 'the advisor';
  const today = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });

  // ── Task intents: "mark X done" / "remind me to …" ─────────────────────────
  if (config) {
    const intent = await handleTaskIntents(config, body.question, key, today).catch(() => null);
    if (intent?.kind === 'answer')  return NextResponse.json({ answer: intent.answer });
    if (intent?.kind === 'pending') return NextResponse.json({ pendingTasks: intent.pendingTasks });
  }

  // Client mentions + fund/holdings search + company knowledge base
  const clients   = config ? await fetchClients(config) : [];
  const sharedCtx = config ? await buildSharedContext(config, body.question, clients).catch(() => '') : '';

  const systemPrompt = `You are FINVA, the daily co-pilot for ${advisorName}, a licensed financial advisor in Malaysia. Today is ${today}.

You answer from the advisor's live data below: a dashboard snapshot of today's priorities, PLUS detailed records for any client mentioned in the question. Be concise, specific and action-oriented — like a sharp executive assistant.

RULES:
- Use the actual names, dates, emails and figures from the data. Never invent clients, contacts or tasks.
- When asked for a client's email / contact / to-do list, read it from the "CLIENT:" section below and present it clearly. If a field is blank, say it isn't on record.
${SHARED_DATA_RULES}
- Prioritise by urgency: overdue first, then due-soon, then upcoming.
- Use RM for money. Keep it tight — short bullet points, no preamble.
- If asked "what's urgent" / "today's agenda", give a ranked action list (up to 6), each with the client name and why it matters.
- IMPORTANT: "OPEN TASKS" is the ONLY authoritative to-do list — it already reflects what's done vs outstanding. Treat ONLY these as outstanding tasks. NEVER list items from "RECENT MEETINGS" (or their action items) as to-dos; those may already be completed. Recent meetings are background context only.
- Tasks the advisor created (in "OPEN TASKS") are always actionable — never silently omit them. If one doesn't make the ranked urgent list (e.g. no due date), append "Also on your list: <task> (<client>), …" so nothing is dropped.
- Factor in CALENDAR APPOINTMENTS: when planning the day or answering "what's my schedule / what's on today / tomorrow / this week", list the appointments for the day(s) asked, with their times. Appointments are tagged "TODAY," or "TOMORROW," when they fall on those days — use those tags to answer day-specific questions directly. An appointment may be timed or "(all day)". If the advisor asks about a specific day and there is genuinely nothing on the list for it, say there's nothing scheduled for that day (do not claim the calendar is empty if other days have entries). In the morning plan, mention today's meetings up top so the advisor can plan around them.
- If asked to "draft my morning plan", structure it: lead with today's **📅 Appointments** (times), then **🔴 Do first**, **🟡 Today**, **🟢 Nice to have** — one-line actions with client names. Put created tasks with no due date under 🟢. End with one motivating sentence.
- SCOPE: You only assist with this advisor's professional work — clients, financial planning, portfolio, insurance, cash flow, market/economy, meetings, tasks and admin of their advisory practice. If asked something unrelated (general trivia, coding, personal chit-chat, entertainment, etc.), politely decline in one line: "I can only help with your advisory work — clients, planning, portfolio, insurance, market and admin." Do not answer the off-topic question.
- If the data truly shows nothing, say so plainly. Do not pad.
- NEVER assume a client's gender. Use the client's name or "they/their" — never "he/his/she/her" unless the data explicitly states the gender. (Source action-item text may contain pronouns; when summarising in your own words, stay neutral.)
- You advise the advisor on what to DO; you never contact clients directly.

=== LIVE DASHBOARD DATA ===
${body.context || '(no data provided)'}
${sharedCtx}`;

  try {
    const genAI = new GoogleGenerativeAI(key);
    let answer = '';
    let lastErr: unknown;
    let usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
    for (const modelId of MODEL_FALLBACKS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId, systemInstruction: systemPrompt });
        const res   = await model.generateContent(body.question);
        answer = res.response.text();
        usage  = res.response.usageMetadata;
        break;
      } catch (e) { lastErr = e; continue; }
    }
    if (!answer) throw lastErr ?? new Error('All models failed');
    await logAiUsage({ advisorName, feature: 'Ask FINVA', usage, question: body.question });
    return NextResponse.json({ answer });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 });
  }
}
