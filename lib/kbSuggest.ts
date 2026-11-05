/**
 * lib/kbSuggest.ts
 * Turns an FA's "Suggest to KB" click into a draft knowledge entry for Admin
 * review (self-learning KB, Phase 1).
 *
 *   1. De-identify in code first: the advisor's own client names, NRIC, phone,
 *      email and long account numbers are replaced before anything is stored
 *      or sent to the model. (PDPA: the KB is read company-wide.)
 *   2. The model rewrites question + answer + FA note into the KB's fields as a
 *      general, reusable lesson, and removes any identifier the code missed.
 *   3. The closest existing entry is attached so the Admin can spot duplicates.
 *
 * The result is always a DRAFT - it never reaches Ask FINVA until an Admin
 * approves it in Admin > KB Review.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logAiUsage } from './aiUsage';
import { stripDisclaimer } from './disclaimer';
import * as kb from './repos/knowledgeEntries';

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const CATEGORIES = ['client_objection', 'product_regulatory', 'operations', 'insurance', 'investment'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Removes client names and personal identifiers. Code-side, so it never depends on the model. */
export function deidentify(text: string, clientNames: string[]): string {
  let out = text;
  // Longest names first so "Tan Ah Kow Jr" goes before "Tan Ah Kow".
  for (const name of [...new Set(clientNames.filter(n => n && n.trim().split(/\s+/).length >= 2))].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\b${escapeRe(name.trim())}\\b`, 'gi'), 'the client');
    // "Doris Chiew Jing Tze" is often shortened to "Doris Chiew".
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 3) out = out.replace(new RegExp(`\\b${escapeRe(parts.slice(0, 2).join(' '))}\\b`, 'gi'), 'the client');
  }
  return out
    .replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, '[NRIC removed]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email removed]')
    .replace(/(?:\+?6?0)1\d[\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[phone removed]')
    .replace(/\b\d{9,}\b/g, '[number removed]');
}

const words = (t: string) => new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(w => !['this', 'that', 'with', 'from', 'have', 'what', 'when', 'they', 'their', 'about', 'would', 'should', 'could', 'client'].includes(w)));

/** Closest existing entry by word overlap on title + tags + takeaway (Jaccard). */
export function closestEntry(draft: { title: string; tags: string[]; keyTakeaway: string }, existing: kb.KnowledgeEntry[]): { id: string; title: string; score: number } | null {
  const a = words(`${draft.title} ${draft.tags.join(' ')} ${draft.keyTakeaway}`);
  let best: { id: string; title: string; score: number } | null = null;
  for (const e of existing) {
    if (e.status === 'rejected') continue;
    const b = words(`${e.title} ${e.tags.join(' ')} ${e.keyTakeaway}`);
    const inter = [...a].filter(w => b.has(w)).length;
    const score = inter / (a.size + b.size - inter || 1);
    if (!best || score > best.score) best = { id: e.id, title: e.title, score };
  }
  return best && best.score >= 0.15 ? best : null;
}

interface Drafted { title: string; situation: string; resolution: string; keyTakeaway: string; tags: string[]; category: string; entryType: 'faq' | 'case_study' }

async function draftWithAi(q: string, a: string, note: string, advisorName: string, apiKey: string): Promise<Drafted | null> {
  const prompt = `You turn a question an advisor asked FINVA (an internal assistant for licensed financial advisors at Bill Morrisons, Malaysia), FINVA's answer and the advisor's own note into ONE reusable knowledge-base entry for every advisor in the firm.

Rules:
- Write it as a general lesson, not about one client. Remove every personal identifier that is still there: names of clients or colleagues, NRIC, phone, email, account or policy numbers, exact addresses. Refer to "the client".
- The ADVISOR'S NOTE is the most valuable part: if it corrects or adds to FINVA's answer, the entry must follow the note, not the answer.
- Keep it short and practical. resolution = numbered steps or short bullets, plain English, no markdown headings.
- Do not invent facts, figures or firm rules that are not in the inputs.
- category: one of ${CATEGORIES.join(', ')}. entryType: "faq" for a how-to, "case_study" for something that happened.

Return ONLY JSON: {"title": "the question an advisor would actually ask", "situation": "...", "resolution": "...", "keyTakeaway": "one sentence", "tags": ["5-10 lowercase search words"], "category": "...", "entryType": "faq"}

ADVISOR'S QUESTION:
${q}

FINVA'S ANSWER:
${a.slice(0, 6000)}

ADVISOR'S NOTE:
${note || '(none)'}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  for (const model of MODELS) {
    try {
      const res = await genAI.getGenerativeModel({ model, generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }).generateContent(prompt);
      await logAiUsage({ advisorName, feature: 'KB Suggest', usage: res.response.usageMetadata, model, question: q });
      const j = JSON.parse(res.response.text()) as Partial<Drafted>;
      if (!j.title || !j.resolution) continue;
      return {
        title: String(j.title).slice(0, 300), situation: String(j.situation ?? ''), resolution: String(j.resolution),
        keyTakeaway: String(j.keyTakeaway ?? ''),
        tags: Array.isArray(j.tags) ? j.tags.map(t => String(t).toLowerCase()).slice(0, 12) : [],
        category: CATEGORIES.includes(String(j.category)) ? String(j.category) : 'operations',
        entryType: j.entryType === 'case_study' ? 'case_study' : 'faq',
      };
    } catch { continue; }
  }
  return null;
}

/** De-identify, draft, attach the closest existing entry, and save as a DRAFT suggestion. */
export async function suggestToKb(p: {
  question: string; answer: string; note: string; advisorName: string; clientNames: string[]; apiKey: string;
}): Promise<{ id: string; title: string; similarTitle?: string }> {
  const q = deidentify(p.question.trim(), p.clientNames).slice(0, 2000);
  const a = deidentify(stripDisclaimer(p.answer).trim(), p.clientNames).slice(0, 12000);
  const note = deidentify(p.note.trim(), p.clientNames).slice(0, 4000);

  const drafted = await draftWithAi(q, a, note, p.advisorName, p.apiKey);
  // If the model is unavailable the suggestion is still kept, unformatted, for the Admin.
  const d: Drafted = drafted ?? {
    title: q.slice(0, 200), situation: '', resolution: note ? `${note}\n\n(FINVA's answer is attached below.)` : a.slice(0, 4000),
    keyTakeaway: '', tags: [], category: 'operations', entryType: 'faq',
  };
  // Second pass: whatever the model wrote is de-identified too.
  for (const k of ['title', 'situation', 'resolution', 'keyTakeaway'] as const) d[k] = deidentify(d[k], p.clientNames);

  const similar = closestEntry(d, await kb.listAll().catch(() => []));
  const { id } = await kb.createSuggestion({
    ...d, suggestedBy: p.advisorName, originalQuestion: q, originalAnswer: a, faNote: note,
    similarEntryId: similar?.id, similarEntryTitle: similar?.title,
  });
  return { id, title: d.title, similarTitle: similar?.title };
}
