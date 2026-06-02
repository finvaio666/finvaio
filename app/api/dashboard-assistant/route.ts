import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

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
  const today = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const systemPrompt = `You are ARIA, the daily co-pilot for ${advisorName}, a licensed financial advisor in Malaysia. Today is ${today}.

You are answering from their live dashboard data (below). Be concise, specific and action-oriented — like a sharp executive assistant giving a morning briefing.

RULES:
- Use the actual names, dates and figures from the data. Never invent clients or tasks.
- Prioritise by urgency: overdue items first, then due-soon, then upcoming.
- Use RM for money. Keep it tight — short bullet points, no preamble.
- If asked "what's today's agenda" or "what's urgent", give a ranked action list (max 5 items), each with the client name and why it matters.
- If the data shows nothing relevant, say so plainly rather than padding.
- You advise the advisor on what to DO; you never contact clients directly.

=== LIVE DASHBOARD DATA ===
${body.context || '(no data provided)'}`;

  try {
    const genAI = new GoogleGenerativeAI(key);
    let answer = '';
    let lastErr: unknown;
    for (const modelId of MODEL_FALLBACKS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId, systemInstruction: systemPrompt });
        const res   = await model.generateContent(body.question);
        answer = res.response.text();
        break;
      } catch (e) { lastErr = e; continue; }
    }
    if (!answer) throw lastErr ?? new Error('All models failed');
    return NextResponse.json({ answer });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 });
  }
}
