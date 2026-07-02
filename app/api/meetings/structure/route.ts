import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { logAiUsage } from '@/lib/aiUsage';

export const dynamic = 'force-dynamic';

const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

export interface StructuredMeeting {
  transcript?:    string;   // present when input was audio
  summary:        string;
  actionItems:    { task: string; due: string }[];
  nextReviewDate: string;
  email:          { subject: string; body: string };
}

/**
 * Turns raw post-meeting input (typed notes or a voice memo) into a structured
 * record: clean summary, discrete action items with due dates, proposed next
 * review date, and a ready-to-send client follow-up email.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

  let body: {
    notes?:       string;
    audio?:       { data: string; mimeType: string };  // base64 voice memo
    clientName?:  string;
    meetingDate?: string;
    meetingType?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body.notes?.trim() && !body.audio?.data) {
    return NextResponse.json({ error: 'Provide notes text or an audio recording.' }, { status: 400 });
  }

  const config      = await getAdvisorConfig(advisorId);
  const advisorName = config?.name || 'the advisor';
  const todayISO    = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const today       = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });

  const isAudio = !!body.audio?.data;
  const prompt = `You are FINVA, assistant to ${advisorName}, a licensed financial advisor in Malaysia. Today is ${today} (${todayISO}).

The advisor just finished a meeting${body.clientName ? ` with client ${body.clientName}` : ''}${body.meetingDate ? ` on ${body.meetingDate}` : ''}${body.meetingType ? ` (${body.meetingType})` : ''} and recorded ${isAudio ? 'a voice memo' : 'quick notes'} about it.

${isAudio ? 'First transcribe the voice memo faithfully (it may mix English, Malay and Chinese — transcribe in the language spoken).' : ''}Then structure it. Return ONLY a JSON object (no markdown fences) with exactly these keys:
{
  ${isAudio ? '"transcript": "faithful transcription of the recording",' : ''}
  "summary": "clean professional meeting note, 2-6 sentences, third person, capturing what was discussed, decisions made and client concerns. Write in English.",
  "actionItems": [{"task": "concise imperative action", "due": "YYYY-MM-DD or empty string"}],
  "nextReviewDate": "YYYY-MM-DD or empty string",
  "email": {"subject": "...", "body": "..."}
}

Rules:
- actionItems: only real commitments/follow-ups the ADVISOR must do. Resolve relative dates ("Friday", "next week", "by month end") against today ${todayISO}. If no deadline stated, use "".
- nextReviewDate: only if a next meeting/review was agreed or clearly implied (e.g. "review again in October" → first weekday of that month). Else "".
- email: a warm, professional follow-up FROM ${advisorName} TO the client${body.clientName ? ` (${body.clientName})` : ''}: thank them for their time, recap key decisions in 2-4 short bullet points, state what happens next, invite questions. Use RM for amounts. No placeholders like [Name] — use the actual client name. Sign off with "${advisorName}". Keep under 180 words.
- Never invent facts, amounts or commitments that are not in the notes.
- If the notes mention nothing actionable, return an empty actionItems array.

${isAudio ? '' : `Advisor's notes:\n"""${body.notes}"""`}`;

  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (isAudio) parts.push({ inlineData: { mimeType: body.audio!.mimeType || 'audio/webm', data: body.audio!.data } });
  parts.push({ text: prompt });

  try {
    const genAI = new GoogleGenerativeAI(key);
    let raw = '';
    let usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
    let lastErr: unknown;
    for (const modelId of MODEL_FALLBACKS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId, generationConfig: { responseMimeType: 'application/json' } });
        const res   = await model.generateContent(parts);
        raw   = res.response.text();
        usage = res.response.usageMetadata;
        break;
      } catch (e) { lastErr = e; continue; }
    }
    if (!raw) throw lastErr ?? new Error('All models failed');

    const json = raw.replace(/^```json\s*|```$/gim, '').trim();
    const parsed = JSON.parse(json) as StructuredMeeting;

    // Defensive normalisation — never let a malformed field break the client UI
    const out: StructuredMeeting = {
      ...(parsed.transcript ? { transcript: String(parsed.transcript) } : {}),
      summary:        String(parsed.summary ?? ''),
      actionItems:    Array.isArray(parsed.actionItems)
        ? parsed.actionItems.filter(a => a?.task?.trim()).map(a => ({ task: String(a.task).trim(), due: /^\d{4}-\d{2}-\d{2}$/.test(a.due ?? '') ? a.due : '' }))
        : [],
      nextReviewDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed.nextReviewDate ?? '') ? parsed.nextReviewDate : '',
      email: {
        subject: String(parsed.email?.subject ?? ''),
        body:    String(parsed.email?.body ?? ''),
      },
    };

    await logAiUsage({ advisorName, feature: 'Meeting Capture', usage, question: isAudio ? '(voice memo)' : body.notes?.slice(0, 200) });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Meeting structure error:', msg);
    return NextResponse.json({ error: `Could not structure the notes: ${msg}` }, { status: 500 });
  }
}
