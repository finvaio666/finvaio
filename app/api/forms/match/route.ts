import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listForms } from '@/lib/formsLibrary';
import { keywordMatch, isConfident, MatchForm } from '@/lib/formMatch';
import { logAiUsage } from '@/lib/aiUsage';

export const dynamic = 'force-dynamic';

interface Body { letterText?: string; provider?: string; }

/**
 * POST /api/forms/match
 * Body: { letterText, provider? }
 * Maps a deferment/requirements letter to matching forms. HYBRID:
 *   1. keyword pass (zero-token) — returned if confident;
 *   2. otherwise a single Gemini call over the COMPACT form index (never PDFs).
 * Returns { matches: MatchForm[], usedAI: boolean }.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { letterText, provider } = (await req.json()) as Body;
  const letter = (letterText ?? '').trim();
  if (letter.length < 10) return NextResponse.json({ error: 'Paste the letter text first.' }, { status: 400 });

  // Candidate pool = active forms, pre-filtered to the letter's provider if given.
  const all = await listForms(config, { activeOnly: true });
  const pool: MatchForm[] = all
    .filter(f => !provider || f.provider.toLowerCase() === provider.toLowerCase())
    .map(f => ({ id: f.id, name: f.name, provider: f.provider, category: f.category, tags: f.tags, formType: f.formType }));

  if (pool.length === 0) return NextResponse.json({ matches: [], usedAI: false });

  // ── 1. Keyword pass ───────────────────────────────────────────────────────────
  const scored = keywordMatch(letter, pool);
  if (isConfident(scored)) {
    return NextResponse.json({ matches: scored.slice(0, 10).map(stripScore), usedAI: false });
  }

  // ── 2. AI fallback — compact index only, single call ──────────────────────────
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    // No AI available — return the best keyword guesses (may be empty).
    return NextResponse.json({ matches: scored.slice(0, 10).map(stripScore), usedAI: false });
  }

  const index = pool.map(f => ({ id: f.id, name: f.name, provider: f.provider, category: f.category, tags: f.tags }));
  const systemPrompt =
    'You match an insurer deferment/requirements letter to the forms an adviser must submit. ' +
    'You are given the letter text and a JSON list of available forms (id, name, provider, category, tags). ' +
    'Return ONLY a JSON array of the matching form ids, most relevant first, e.g. ["id1","id2"]. ' +
    'Include a form only when the letter clearly requires it. If none match, return [].';
  const userMsg = `LETTER:\n${letter}\n\nAVAILABLE FORMS (JSON):\n${JSON.stringify(index)}`;

  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
  let ids: string[] = [];
  let usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
  let lastErr: unknown;
  for (const modelId of MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId, systemInstruction: systemPrompt });
      const result = await model.generateContent(userMsg);
      const text = result.response.text();
      usage = result.response.usageMetadata;
      ids = parseIds(text);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = err;
      if (msg.includes('503') || msg.includes('high demand') || msg.includes('overloaded')) continue;
      console.error('forms/match AI error:', msg);
      // Fall back to keyword guesses on any AI failure.
      return NextResponse.json({ matches: scored.slice(0, 10).map(stripScore), usedAI: false });
    }
  }
  if (ids.length === 0 && lastErr) {
    return NextResponse.json({ matches: scored.slice(0, 10).map(stripScore), usedAI: false });
  }

  await logAiUsage({ advisorName: config.name ?? 'Unknown', feature: 'Form Match', usage, question: letter.slice(0, 200) });

  const byId = new Map(pool.map(f => [f.id, f]));
  const matches = ids.map(id => byId.get(id)).filter((f): f is MatchForm => !!f).slice(0, 10);
  return NextResponse.json({ matches, usedAI: true });
}

function stripScore(f: { id: string; name: string; provider: string; category: string; tags: string[]; formType: string }): MatchForm {
  return { id: f.id, name: f.name, provider: f.provider, category: f.category, tags: f.tags, formType: f.formType };
}

/** Extract a JSON string array from the model's reply, tolerating code fences/prose. */
function parseIds(text: string): string[] {
  const m = text.match(/\[[\s\S]*?\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
