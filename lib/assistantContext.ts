/**
 * lib/assistantContext.ts
 * The shared "brain" behind every Ask FINVA surface.
 *
 * There used to be two assistants with two different sets of abilities: the
 * dashboard widget (/api/dashboard-assistant) could search holdings, read the
 * company knowledge base and create tasks, while the AI Assistant page
 * (/api/ai) could do a deep single-client dive and hold a multi-turn
 * conversation — but neither could do the other's job. An advisor who found
 * one got silently worse answers than one who found the other.
 *
 * Everything that isn't specific to a single surface now lives here, so both
 * routes (and the global launcher) answer identically. Each lookup is gated on
 * a cheap regex so an ordinary question doesn't pay for reads it won't use.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AdvisorConfig } from './getAdvisorConfig';
import { listClients, ClientRecord } from './clients';
import { listHoldings } from './portfolio';
import { listTasks, setTaskStatus } from './tasks';
import { listMeetings } from './meetingNotes';
import { listFunds, listPlans } from './products';
import * as kbEntries from './repos/knowledgeEntries';

export const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

/** This advisor's clients via the data-source abstraction (Notion or Supabase). */
export async function fetchClients(config: AdvisorConfig): Promise<ClientRecord[]> {
  if (!config.notionApiKey || config.notionApiKey === 'DEMO_MODE' || !config.clientsDbId) return [];
  try {
    return (await listClients(config)).filter(c => c.name);
  } catch { return []; }
}

/**
 * Look up any client mentioned in the question and return their profile,
 * contact details and open action items. Falls back to the roster so the model
 * knows who exists rather than inventing names.
 */
export async function lookupMentionedClients(
  config: AdvisorConfig,
  question: string,
  clients: ClientRecord[],
): Promise<string> {
  if (clients.length === 0) return '';
  const q = question.toLowerCase();

  // Match clients whose full name OR (first AND last) appears in the question
  const wordIn = (h: string, w: string) => w.length > 1 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(h);
  const matched = clients.filter(c => {
    const n = c.name.toLowerCase();
    if (q.includes(n)) return true;
    const parts = n.split(/\s+/);
    const first = parts[0], last = parts[parts.length - 1];
    return parts.length > 1 && wordIn(q, first) && wordIn(q, last);
  }).slice(0, 3);

  if (matched.length === 0) {
    const roster = clients.map(c => c.name).slice(0, 60).join(', ');
    return `\n# CLIENT ROSTER (${clients.length} clients)\n${roster}`;
  }

  const blocks: string[] = [];
  for (const c of matched) {
    const lines: string[] = [`\n# CLIENT: ${c.name}`];
    if (c.email) lines.push(`Email: ${c.email}`);
    if (c.phone) lines.push(`Phone: ${c.phone}`);
    if (c.status || c.segment || c.risk) lines.push(`Profile: ${[c.status, c.segment, c.risk].filter(Boolean).join(' · ')}`);
    if (c.aum) lines.push(`AUM: RM ${c.aum.toLocaleString()}`);
    if (c.financialGoals.length) lines.push(`Goals: ${c.financialGoals.join(', ')}`);
    if (c.nextReview) lines.push(`Next review: ${c.nextReview}`);
    if (c.lastReview) lines.push(`Last review: ${c.lastReview}`);

    if (config.tasksDbId) {
      try {
        const open = await listTasks(config, { client: c.name, status: 'Open' });
        if (open.length) {
          lines.push('OPEN TASKS (not yet done):');
          open.forEach(t => lines.push(`- ${t.task}${t.due ? ` (due ${t.due})` : ''}`));
        } else {
          lines.push('OPEN TASKS: none — all caught up for this client.');
        }
      } catch { /* ignore */ }
    } else if (config.meetingNotesDbId) {
      try {
        const meetings = (await listMeetings(config)).slice(0, 20);
        const target = c.name.toLowerCase().trim();
        const todos: string[] = [];
        for (const m of meetings) {
          // Match on the meeting's CLIENT field — NOT the action-item text,
          // which caused false matches on short names like "Ng".
          const mClient = (m.clientName || '').toLowerCase().trim();
          if (!mClient) continue;
          const isMatch = mClient === target || mClient.includes(target) || (target.includes(mClient) && mClient.length > 4);
          if (!isMatch) continue;
          if (m.actionItems.trim()) todos.push(`(${m.meetingDate || 'n/a'}) ${m.actionItems.trim()}`);
        }
        if (todos.length) {
          lines.push('ACTION ITEMS (from meeting notes):');
          todos.forEach(t => lines.push(`- ${t}`));
        }
      } catch { /* ignore */ }
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n');
}

// ── Fund / holdings search ────────────────────────────────────────────────────
// Inverse lookup: "which clients bought the Principal Greater China Fund?",
// "who owns FCN under EPF?". Only runs when the question sounds holdings-related
// so ordinary chat doesn't pay for a full portfolio query.
const FUND_TRIGGER = /\b(funds?|holdings?|holds?|own(?:s|ing|ed)?|bought|buy(?:ing)?|purchased?|invest(?:ed|ing|ment)?|etf|reit|notes?|trusts?|units?|portfolio)\b/i;

// Words too generic to identify a specific fund on their own
const GENERIC_FUND_WORDS = new Set(['fund', 'funds', 'the', 'of', 'and', 'a', 'an', 'class', 'myr', 'usd', 'sgd', 'rm', 'bhd', 'berhad', 'cash', 'account']);

/**
 * Match distinct holding names against the question, in two tiers:
 * 1. The question covers most of a holding's significant words — precise, so
 *    "Principal Greater China Fund" finds "Principal Greater China Equity
 *    Fund-MYR" without dragging in "Manulife Investment Greater China Fund".
 * 2. Fallback for partial names: a distinctive two-word phrase from the
 *    holding name appears verbatim in the question, so "the Greater China
 *    fund" returns BOTH Greater China funds rather than nothing.
 */
export function matchHoldingNames(question: string, names: string[]): string[] {
  const q = question.toLowerCase();
  const qWords = q.split(/[^a-z0-9]+/).filter(Boolean);
  const qTokens = new Set(qWords);
  const qNorm = ` ${qWords.join(' ')} `;

  const covered = names.filter(name => {
    const n = name.toLowerCase();
    // Names made purely of generic words ("Cash Account", "ETF", "PRS")
    // can't be searched meaningfully — never match them.
    const sig = [...new Set(n.split(/[^a-z0-9]+/))].filter(w => w.length > 1 && !GENERIC_FUND_WORDS.has(w));
    if (sig.length === 0) return false;
    if (q.includes(n)) return true;
    const hits = sig.filter(w => qTokens.has(w)).length;
    return hits >= Math.min(2, sig.length) && hits / sig.length >= 0.6;
  });
  if (covered.length > 0) return covered;

  return names.filter(name => {
    const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (let i = 0; i < words.length - 1; i++) {
      const a = words[i], b = words[i + 1];
      if (a.length < 2 || b.length < 2 || GENERIC_FUND_WORDS.has(a) || GENERIC_FUND_WORDS.has(b)) continue;
      if (qNorm.includes(` ${a} ${b} `)) return true;
    }
    return false;
  });
}

/**
 * Search Portfolio Holdings for funds named in the question and list every
 * client holding them, tagged with the asset class (Cash / EPF) so the AI can
 * filter by category when asked.
 */
export async function lookupFundHoldings(
  config: AdvisorConfig,
  question: string,
  clients: ClientRecord[],
): Promise<string> {
  if (!config.notionApiKey || config.notionApiKey === 'DEMO_MODE' || !config.portfolioDbId) return '';
  if (!FUND_TRIGGER.test(question)) return '';
  try {
    // Every holding links exactly one client, so clientNotionId == the sole
    // relation id — equivalent to the old relIds('👥 Clients') list.
    const holdings = await listHoldings(config);
    const rows = holdings.map(h => ({
      name:        h.name,
      assetClass:  h.assetClass,
      institution: h.institution,
      status:      h.status,
      value:       h.valueMyr,
      purchase:    h.purchaseMyr,
      clientIds:   h.clientNotionId ? [h.clientNotionId] : [],
    })).filter(r => r.name);

    const distinct = [...new Set(rows.map(r => r.name))];
    const matched = matchHoldingNames(question, distinct);
    if (matched.length === 0) {
      // Give the AI the catalogue so it can say what IS on record instead of guessing
      return `\n# FUND HOLDINGS LOOKUP\nNo holding on record matches a fund named in the question. Distinct holdings on record (${distinct.length}):\n${distinct.slice(0, 80).join('; ')}`;
    }

    const clientMap: Record<string, string> = {};
    clients.forEach(c => { if (c.notionId) clientMap[c.notionId] = c.name; });

    const blocks = ['\n# FUND HOLDINGS LOOKUP (each line: client · category · current value · cost · institution · status)'];
    for (const name of matched.slice(0, 5)) {
      const rs = rows.filter(r => r.name === name);
      const total = rs.reduce((s, r) => s + r.value, 0);
      blocks.push(`## ${name} — ${rs.length} holding(s), total RM ${Math.round(total).toLocaleString()}`);
      for (const r of rs) {
        const client = r.clientIds.map(id => clientMap[id]).filter(Boolean).join(', ') || '(no client linked)';
        blocks.push(`- ${client} · ${r.assetClass || 'Uncategorised'} · RM ${Math.round(r.value).toLocaleString()} (cost RM ${Math.round(r.purchase).toLocaleString()})${r.institution ? ` · ${r.institution}` : ''}${r.status ? ` · ${r.status}` : ''}`);
      }
    }
    return blocks.join('\n');
  } catch { return ''; }
}

// ── Company knowledge base (funds / insurance products) ────────────────────────
// The admin-maintained house catalogue. Distinct from FUND_TRIGGER above: that
// answers "who owns fund X" from a CLIENT's holdings; this answers "which
// fund/plan is best / compare X vs Y" from the CATALOGUE, independent of any
// one client.
const KB_TRIGGER = /\b(compare|comparison|best|top|recommend(?:ed|ation)?|which (?:fund|insurer|insurance|plan)|rank(?:ing|ed)?|performance|return|sum assured|premium|coverage|rider|epf.?approved|sales charge|risk level|asset class)\b/i;

/**
 * Pull the active fund and insurance-plan catalogue (admin-maintained, company-
 * wide) so the AI answers product questions from house data first.
 */
export async function lookupKnowledgeBase(config: AdvisorConfig, question: string): Promise<string> {
  if (!KB_TRIGGER.test(question)) return '';
  try {
    const [funds, plans] = await Promise.all([
      listFunds(config).catch(() => []),
      listPlans(config).catch(() => []),
    ]);

    if (funds.length === 0 && plans.length === 0) {
      return `\n# COMPANY KNOWLEDGE BASE\nEmpty — no funds or insurance plans have been added to the company catalogue yet.`;
    }

    const blocks: string[] = ['\n# COMPANY KNOWLEDGE BASE (admin-maintained house catalogue — authoritative for product questions)'];

    if (funds.length > 0) {
      blocks.push(`\n## Funds (${funds.length} active, each line: name · fund house · asset class · region · risk · 3Y return · min investment · sales charge · EPF approved)`);
      for (const f of funds) {
        blocks.push(`- ${f.name} · ${f.fundHouse} · ${f.assetClass} · ${f.region} · ${f.riskLevel} · ${f.return3Y}% (3Y) · RM ${f.minInvestment.toLocaleString()} min · ${f.salesCharge}% sales charge · ${f.epfApproved ? 'EPF approved' : 'Not EPF approved'}`);
      }
    }

    if (plans.length > 0) {
      blocks.push(`\n## Insurance plans (${plans.length} active, each line: name · insurer · type · age range · sum assured range · est. monthly premium · EPF approved)`);
      for (const p of plans) {
        blocks.push(`- ${p.name} · ${p.insurer} · ${p.type} · ages ${p.minAge}-${p.maxAge} · RM ${p.minSumAssured.toLocaleString()}-${p.maxSumAssured.toLocaleString()} sum assured · ${p.estMonthlyPremium || 'n/a'}/mo · ${p.epfApproved ? 'EPF approved' : 'Not EPF approved'}${p.keyFeatures ? ` · ${p.keyFeatures}` : ''}`);
      }
    }

    return blocks.join('\n');
  } catch { return ''; }
}

// ── FINVA Master Brain — the firm's own FAQ + case-study memory ───────────────
// Broad on purpose: a hard-won lesson (e.g. a bond default) is most needed on
// questions that never say the word "bond" — "client wants low risk, 6%" is
// exactly when someone is about to walk into it. Firm-level "big lessons" are
// few by design, so carrying them on any advisory-shaped question is cheap
// insurance against the AI reaching for a higher-yield product it shouldn't.
const CASE_TRIGGER =
  /\b(case|experience|before|previously|handled|happened|lesson|learn|advice|advise|recommend|suggest|propose|option|invest|investment|risk|return|yield|bond|fcn|note|structured|fund|insurance|policy|client|objection|complain|surrender|claim|default|fd|fixed deposit|process|procedure|how do (?:i|we))\b|案例|經驗|教訓|處理|建議|投資|風險|報酬|債券|違約|定存|流程/i;

/** Words worth scoring on — drops noise so a long question doesn't match everything. */
function keywordsOf(text: string): string[] {
  return Array.from(new Set(
    (text.toLowerCase().match(/[a-z]{4,}|[一-鿿]{2,}/g) ?? [])
      .filter(w => !['this', 'that', 'with', 'from', 'have', 'what', 'when', 'they', 'their', 'about', 'would', 'should', 'could', 'client', 'looking'].includes(w)),
  ));
}

/**
 * Published FAQ + case studies from the firm's knowledge base.
 * Big lessons always ride along; the rest are scored on keyword overlap so an
 * unrelated question doesn't drag the whole library into the prompt.
 */
export async function lookupCaseStudies(question: string): Promise<string> {
  if (!CASE_TRIGGER.test(question)) return '';
  try {
    const all = await kbEntries.listPublished();
    if (all.length === 0) return '';

    const qWords = keywordsOf(question);
    const scored = all.map(e => {
      const hay = keywordsOf(`${e.title} ${e.tags.join(' ')} ${e.keyTakeaway} ${e.category}`);
      const hits = qWords.filter(w => hay.some(h => h.includes(w) || w.includes(h))).length;
      return { e, hits };
    });

    const picked = [
      ...scored.filter(s => s.e.isBigLesson).map(s => s.e),
      ...scored.filter(s => !s.e.isBigLesson && s.hits > 0)
        .sort((a, b) => b.hits - a.hits).slice(0, 4).map(s => s.e),
    ];
    if (picked.length === 0) return '';

    const blocks = ['\n# FIRM KNOWLEDGE BASE — FAQ & CASE STUDIES (real experience from this firm\'s advisors; cite the contributor when you use one)'];
    for (const e of picked) {
      blocks.push(`\n## ${e.isBigLesson ? '⭐ BIG LESSON — ' : ''}${e.title}`);
      blocks.push(`Type: ${e.entryType} · Category: ${e.category}${e.authorAdvisor ? ` · Contributed by: ${e.authorAdvisor}` : ''}`);
      if (e.keyTakeaway) blocks.push(`KEY TAKEAWAY: ${e.keyTakeaway}`);
      if (e.situation)   blocks.push(`Situation: ${e.situation}`);
      if (e.resolution)  blocks.push(`How it was handled: ${e.resolution}`);
    }
    return blocks.join('\n');
  } catch { return ''; }
}

/**
 * Everything that isn't tied to one selected client: mentioned-client profiles,
 * holdings search, the company catalogue and the firm's case-study memory. Run
 * in parallel; each failure is swallowed so one slow source can't take the
 * whole answer down.
 */
export async function buildSharedContext(
  config: AdvisorConfig,
  question: string,
  clients: ClientRecord[],
): Promise<string> {
  const [clientData, fundData, kbData, caseData] = await Promise.all([
    lookupMentionedClients(config, question, clients).catch(() => ''),
    lookupFundHoldings(config, question, clients).catch(() => ''),
    lookupKnowledgeBase(config, question).catch(() => ''),
    lookupCaseStudies(question).catch(() => ''),
  ]);
  return [clientData, fundData, kbData, caseData].filter(Boolean).join('\n');
}

/** Prompt rules for the sections buildSharedContext produces. */
export const SHARED_DATA_RULES = `- When asked which clients own / bought / hold a particular fund or product, answer from the "FUND HOLDINGS LOOKUP" section: list each client with the current value and category (Cash / EPF). If the advisor asks for one category only (e.g. "under EPF" or "cash only"), filter to that asset class and say how many were excluded. If SEVERAL funds match the name the advisor used (e.g. two "Greater China" funds), present each fund's holders under its own heading and note they may want to be more specific. If the lookup says no holding matched, tell the advisor the fund isn't in the holdings records — and if a similar name appears in the distinct list, suggest it ("did you mean …?").
- COMPANY KNOWLEDGE BASE: for questions about which fund/insurance plan is best, comparisons between products, returns, sum assured, premiums, EPF approval, risk level, or "what should I recommend" — answer FIRST from the "COMPANY KNOWLEDGE BASE" section. This is the firm's own curated, admin-maintained catalogue and is authoritative — treat it as the house view, not just background info. Only bring in general market/product knowledge if the catalogue doesn't cover what was asked, and say so explicitly when you do (e.g. "not in our catalogue, but generally…"). If the catalogue section says it's empty, tell the advisor no funds/plans have been added yet rather than answering from general knowledge as if it were house data.
- FIRM KNOWLEDGE BASE (FAQ & CASE STUDIES): this is real, hard-won experience from this firm's own advisors — treat it as more authoritative than general market knowledge, and ALWAYS attribute it ("this is X's case from the firm's knowledge base"), so the advisor knows it is a colleague's real experience and can go ask them for detail. An entry marked "⭐ BIG LESSON" is a firm-level lesson: surface it whenever it is even loosely relevant, and never contradict it.
- ⚠️ RISK-TIER SAFETY RULE (this overrides any impulse to be helpful with a bigger number). When the advisor's question signals LOW RISK — "low risk", "conservative", "capital preservation", "safe", "FD alternative", "定存", "保守", "穩健", "低風險" — you must answer ONLY from instruments in that risk tier (cash, government bonds, investment-grade corporate bonds). NEVER present a higher-yielding product (structured notes/FCN, equities, leveraged products) as a way to "hit the target return". FCNs carry knock-in risk: in the worst case the client takes delivery of a collapsed stock and loses a large part of their principal — they are NOT a low-risk instrument no matter how attractive the coupon looks. If the firm's low-risk holdings cannot reach the return the client wants, SAY SO PLAINLY and explain the gap. An honest "we can't reach that at this risk level" is the correct answer; reaching up the risk ladder to produce a nicer number is a harmful one. If you do mention a higher-risk instrument for context, you must state explicitly that it sits in a different risk tier and name the specific risk mechanism.
- ⚠️ DEFAULTED / DISTRESSED POSITIONS. Before citing any holding as a live option, check its state — a bond can still read as "Active" with no maturity date and yet be in default. If the current value is drastically below cost, treat it as defaulted/distressed: never present it as an available yield, and if it is relevant, cite it as a cautionary case with its recovery rate. (Concrete precedent in the firm: a 6.3% corporate bond that defaulted and recovered ~0.1% of capital.)
- You describe what the firm has done and what it currently runs; you never tell the advisor what their client should buy. Investment recommendations are the licensed advisor's call, made through the firm's own suitability and compliance process.`;

// ── Task intents (mark done / create) ─────────────────────────────────────────

export interface PendingTask { task: string; client: string; due: string }
export type TaskIntentResult =
  | { kind: 'answer'; answer: string }
  | { kind: 'pending'; pendingTasks: PendingTask[] }
  | null;

/**
 * Handle "mark X done" and "remind me to …" phrasing before falling through to
 * a normal AI answer. Returns null when the question isn't a task intent (or
 * nothing confidently matched), so the caller carries on as usual.
 */
export async function handleTaskIntents(
  config: AdvisorConfig,
  question: string,
  geminiKey: string,
  todayLabel: string,
): Promise<TaskIntentResult> {
  if (!config.tasksDbId) return null;

  // ── Mark a task done ───────────────────────────────────────────────────────
  if (/\b(mark|set|complete[d]?|finish(?:ed)?|done|tick)\b/i.test(question)) {
    try {
      const open = await listTasks(config, { status: 'Open' });
      const q = question.toLowerCase();
      // Score each open task by how many of its significant words appear
      const scored = open.map(t => {
        const words = t.task.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const hits = words.filter(w => q.includes(w)).length;
        return { t, score: words.length ? hits / words.length : 0, hits };
      }).filter(s => s.hits >= 2 || s.score >= 0.6)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score > 0.25)) {
        await setTaskStatus(config, scored[0].t.id, true);
        return { kind: 'answer', answer: `✅ Marked done: **${scored[0].t.task}**${scored[0].t.client ? ` (${scored[0].t.client})` : ''}.` };
      }
      if (scored.length > 1) {
        const list = scored.slice(0, 5).map(s => `- ${s.t.task}${s.t.client ? ` (${s.t.client})` : ''}`).join('\n');
        return { kind: 'answer', answer: `I found a few tasks that could match — which one?\n${list}\n\nReply with more of the exact task wording.` };
      }
      // no confident match → fall through
    } catch { /* fall through */ }
  }

  // ── Add / record task(s) ───────────────────────────────────────────────────
  if (/\b(add|create|record|note( down)?|put down|remind me|new task|to-?do)\b/i.test(question) &&
      !/\b(mark|complete[d]?|finish(?:ed)?|done)\b/i.test(question)) {
    try {
      const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }); // YYYY-MM-DD in MYT
      const extractPrompt = `Today is ${todayLabel} (${todayISO}). Extract every to-do task from the advisor's message below.
Return ONLY a JSON array (no markdown) of objects: {"task": "...", "client": "...", "due": "YYYY-MM-DD or empty"}.
- "task": the action, concise.
- "client": a client's name if clearly mentioned, else "".
- "due": resolve relative dates ("Friday", "tomorrow", "next Monday", "by 20th") to an absolute YYYY-MM-DD; else "".
If there are no real tasks, return [].

Message: "${question}"`;

      const genAI = new GoogleGenerativeAI(geminiKey);
      let raw = '';
      for (const modelId of MODEL_FALLBACKS) {
        try { raw = (await genAI.getGenerativeModel({ model: modelId }).generateContent(extractPrompt)).response.text(); break; }
        catch { continue; }
      }
      const json = raw.replace(/^```json\s*|```$/gim, '').trim();
      const items = (JSON.parse(json) as { task: string; client?: string; due?: string }[])
        .filter(i => i.task?.trim())
        .map(i => ({ task: i.task.trim(), client: (i.client ?? '').trim(), due: (i.due ?? '').trim() }));

      // Propose for review — do NOT create yet.
      if (items.length > 0) return { kind: 'pending', pendingTasks: items };
    } catch { /* fall through */ }
  }

  return null;
}
