import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { fetchClients } from '@/lib/assistantContext';
import { suggestToKb } from '@/lib/kbSuggest';

export const dynamic = 'force-dynamic';

/**
 * POST /api/kb/suggest - any FA: "Suggest to KB" under an Ask FINVA answer.
 * Body: { question, answer, note? }. The answer is de-identified (the FA's own
 * client names + NRIC/phone/email/account numbers), drafted into KB fields and
 * saved as a DRAFT for Admin review. Nothing reaches the AI until approved.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

  let body: { question?: string; answer?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const question = String(body.question ?? '').trim();
  const answer = String(body.answer ?? '').trim();
  const note = String(body.note ?? '').trim();
  if (!question || (!answer && !note)) return NextResponse.json({ error: 'A question and an answer or note are required.' }, { status: 400 });

  try {
    const clients = await fetchClients(config).catch(() => []);
    const r = await suggestToKb({ question, answer, note, advisorName: config.name, clientNames: clients.map(c => c.name), apiKey: key });
    return NextResponse.json({ ok: true, id: r.id, title: r.title, similarTitle: r.similarTitle ?? null });
  } catch (e) {
    console.error('kb suggest failed:', e);
    return NextResponse.json({ error: 'Could not save the suggestion. Please try again.' }, { status: 500 });
  }
}
