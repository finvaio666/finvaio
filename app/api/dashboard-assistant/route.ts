import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig, AdvisorConfig, advisorFilter } from '@/lib/getAdvisorConfig';
import { listTasks, setTaskStatus } from '@/lib/tasks';
import { logAiUsage } from '@/lib/aiUsage';
import { queryAllPages } from '@/lib/notionQueryAll';

export const dynamic = 'force-dynamic';

const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

// ── Property helpers ──────────────────────────────────────────────────────────
function rt(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : '';
}
function sel(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; select?: { name: string } } | undefined;
  return v?.type === 'select' ? (v.select?.name ?? '') : '';
}
function num(p: Record<string, unknown>, k: string): number {
  const v = p[k] as { type: string; number?: number | null } | undefined;
  return v?.type === 'number' ? (v.number ?? 0) : 0;
}
function dt(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; date?: { start: string } | null } | undefined;
  return v?.type === 'date' ? (v.date?.start ?? '') : '';
}
function titleOf(p: Record<string, unknown>): string {
  for (const v of Object.values(p)) {
    const t = v as { type: string; title?: { plain_text: string }[] } | undefined;
    if (t?.type === 'title') return t.title?.[0]?.plain_text ?? '';
  }
  return '';
}
function relIds(p: Record<string, unknown>, k: string): string[] {
  const v = p[k] as { type: string; relation?: { id: string }[] } | undefined;
  return v?.type === 'relation' ? (v.relation ?? []).map(r => r.id) : [];
}

type ClientPage = { id: string; name: string; props: Record<string, unknown> };

async function fetchClientPages(config: AdvisorConfig): Promise<ClientPage[]> {
  if (!config.notionApiKey || config.notionApiKey === 'DEMO_MODE' || !config.clientsDbId) return [];
  const notion = new Client({ auth: config.notionApiKey });
  try {
    const f = advisorFilter(config);
    const pages = await queryAllPages(notion, { database_id: config.clientsDbId, ...(f ? { filter: f } : {}) });
    return pages.map(pg => {
      const props = pg.properties as Record<string, unknown>;
      const name = (props['Client Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.type === 'title'
        ? ((props['Client Name'] as { title: { plain_text: string }[] }).title[0]?.plain_text ?? '')
        : titleOf(props);
      return { id: pg.id, name, props };
    }).filter(c => c.name);
  } catch { return []; }
}

/**
 * Look up any client mentioned in the question and return their full profile,
 * contact details and open action items (todo list) from Notion.
 */
async function lookupMentionedClients(config: AdvisorConfig, question: string, clientPages: ClientPage[]): Promise<string> {
  if (!config.notionApiKey || config.notionApiKey === 'DEMO_MODE' || !config.clientsDbId) return '';
  if (clientPages.length === 0) return '';
  const notion = new Client({ auth: config.notionApiKey });
  const q = question.toLowerCase();

  // Match clients whose full name OR (first AND last) appears in the question
  const wordIn = (h: string, w: string) => w.length > 1 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(h);
  const matched = clientPages.filter(c => {
    const n = c.name.toLowerCase();
    if (q.includes(n)) return true;
    const parts = n.split(/\s+/);
    const first = parts[0], last = parts[parts.length - 1];
    return parts.length > 1 && wordIn(q, first) && wordIn(q, last);
  }).slice(0, 3);

  if (matched.length === 0) {
    // No specific match — give the AI the roster so it knows who exists
    const roster = clientPages.map(c => c.name).slice(0, 60).join(', ');
    return `\n# CLIENT ROSTER (${clientPages.length} clients)\n${roster}`;
  }

  const blocks: string[] = [];
  for (const c of matched) {
    const p = c.props;
    const lines: string[] = [`\n# CLIENT: ${c.name}`];
    const email = rt(p, 'Email') || rt(p, 'Email Address') || rt(p, 'Email address');
    const phone = rt(p, 'Phone') || rt(p, 'Phone Number') || rt(p, 'Mobile') || rt(p, 'Contact');
    if (email) lines.push(`Email: ${email}`);
    if (phone) lines.push(`Phone: ${phone}`);
    const status = sel(p, 'Status') || sel(p, 'Client Status');
    const segment = sel(p, 'Client Segment') || sel(p, 'Segment');
    const risk = sel(p, 'Risk Profile') || sel(p, 'Risk');
    const aum = num(p, 'AUM (MYR)') || num(p, 'AUM') || num(p, 'Total AUM');
    if (status || segment || risk) lines.push(`Profile: ${[status, segment, risk].filter(Boolean).join(' · ')}`);
    if (aum) lines.push(`AUM: RM ${aum.toLocaleString()}`);
    const goalsProp = p['Financial goals'] as { type: string; multi_select?: { name: string }[] } | undefined;
    if (goalsProp?.type === 'multi_select' && goalsProp.multi_select?.length) {
      lines.push(`Goals: ${goalsProp.multi_select.map(g => g.name).join(', ')}`);
    }
    const nextRev = dt(p, 'Next review date'), lastRev = dt(p, 'Last review date');
    if (nextRev) lines.push(`Next review: ${nextRev}`);
    if (lastRev) lines.push(`Last review: ${lastRev}`);

    // Open tasks (preferred) — from the Tasks database
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
      // Fallback: raw action items from meeting notes
      try {
        const mf = advisorFilter(config);
        const mres = await notion.databases.query({
          database_id: config.meetingNotesDbId,
          ...(mf ? { filter: mf } : {}),
          sorts: [{ property: 'Meeting Date', direction: 'descending' }],
          page_size: 20,
        });
        const target = c.name.toLowerCase().trim();
        const todos: string[] = [];
        for (const m of mres.results) {
          if (!isFullPage(m)) continue;
          const mp = m.properties as Record<string, unknown>;
          // Match on the meeting's CLIENT field (or the client portion of the
          // title "Client — Type — Date") — NOT the action-item text, which
          // caused false matches on short names like "Ng".
          const mClient = (rt(mp, 'Client Name') || titleOf(mp).split(' — ')[0] || '').toLowerCase().trim();
          if (!mClient) continue;
          const isMatch = mClient === target || mClient.includes(target) || (target.includes(mClient) && mClient.length > 4);
          if (!isMatch) continue;
          const action = rt(mp, 'Action Items');
          const mdate  = dt(mp, 'Meeting Date');
          if (action.trim()) todos.push(`(${mdate || 'n/a'}) ${action.trim()}`);
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
const GENERIC_FUND_WORDS = new Set(['fund', 'funds', 'the', 'of', 'and', 'a', 'an', 'class', 'myr', 'usd', 'sgd', 'rm', 'bhd', 'berhad']);

/**
 * Match distinct holding names against the question by significant words, so
 * "Principal Greater China Fund" finds "Principal Greater China Equity Fund-MYR"
 * without also dragging in "Manulife Investment Greater China Fund".
 */
function matchHoldingNames(question: string, names: string[]): string[] {
  const q = question.toLowerCase();
  const qTokens = new Set(q.split(/[^a-z0-9]+/));
  return names.filter(name => {
    const n = name.toLowerCase();
    if (q.includes(n)) return true;
    const sig = [...new Set(n.split(/[^a-z0-9]+/))].filter(w => w.length > 1 && !GENERIC_FUND_WORDS.has(w));
    if (sig.length === 0) return false;
    const hits = sig.filter(w => qTokens.has(w)).length;
    return hits >= Math.min(2, sig.length) && hits / sig.length >= 0.6;
  });
}

/**
 * Search the Portfolio Holdings DB for funds named in the question and list
 * every client holding them, tagged with the asset class (Cash / EPF) so the
 * AI can filter by category when asked.
 */
async function lookupFundHoldings(config: AdvisorConfig, question: string, clientPages: ClientPage[]): Promise<string> {
  if (!config.notionApiKey || config.notionApiKey === 'DEMO_MODE' || !config.portfolioDbId) return '';
  if (!FUND_TRIGGER.test(question)) return '';
  const notion = new Client({ auth: config.notionApiKey });
  try {
    const f = advisorFilter(config);
    const pages = await queryAllPages(notion, { database_id: config.portfolioDbId, ...(f ? { filter: f } : {}) });
    const rows = pages.map(pg => {
      const p = pg.properties as Record<string, unknown>;
      return {
        name:        titleOf(p),
        assetClass:  sel(p, 'Asset class'),
        institution: rt(p, 'Institution'),
        status:      sel(p, 'Status'),
        value:       num(p, 'Value (MYR)'),
        purchase:    num(p, 'Purchase price (MYR)'),
        clientIds:   relIds(p, '👥 Clients'),
      };
    }).filter(r => r.name);

    const distinct = [...new Set(rows.map(r => r.name))];
    const matched = matchHoldingNames(question, distinct);
    if (matched.length === 0) {
      // Give the AI the catalogue so it can say what IS on record instead of guessing
      return `\n# FUND HOLDINGS LOOKUP\nNo holding on record matches a fund named in the question. Distinct holdings on record (${distinct.length}):\n${distinct.slice(0, 80).join('; ')}`;
    }

    const clientMap: Record<string, string> = {};
    clientPages.forEach(c => { clientMap[c.id] = c.name; });

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

  // ── Intent: mark a task done from chat ──────────────────────────────────────
  // e.g. "mark Sell IFAST done for Ng Mei Ching" / "completed the EPF submission"
  if (config?.tasksDbId && /\b(mark|set|complete[d]?|finish(?:ed)?|done|tick)\b/i.test(body.question)) {
    try {
      const open = await listTasks(config, { status: 'Open' });
      const q = body.question.toLowerCase();
      // Score each open task by how many of its significant words appear in the question
      const scored = open.map(t => {
        const words = t.task.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const hits = words.filter(w => q.includes(w)).length;
        return { t, score: words.length ? hits / words.length : 0, hits };
      }).filter(s => s.hits >= 2 || s.score >= 0.6)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score > 0.25)) {
        await setTaskStatus(config, scored[0].t.id, true);
        return NextResponse.json({ answer: `✅ Marked done: **${scored[0].t.task}**${scored[0].t.client ? ` (${scored[0].t.client})` : ''}.` });
      }
      if (scored.length > 1) {
        const list = scored.slice(0, 5).map(s => `- ${s.t.task}${s.t.client ? ` (${s.t.client})` : ''}`).join('\n');
        return NextResponse.json({ answer: `I found a few tasks that could match — which one?\n${list}\n\nReply with more of the exact task wording.` });
      }
      // no match → fall through to normal AI answer
    } catch { /* fall through */ }
  }

  // ── Intent: add / record task(s) from chat ─────────────────────────────────
  // e.g. "remind me to call Karen Friday", "add these todos: ...", "note down ..."
  if (config?.tasksDbId &&
      /\b(add|create|record|note( down)?|put down|remind me|new task|to-?do)\b/i.test(body.question) &&
      !/\b(mark|complete[d]?|finish(?:ed)?|done)\b/i.test(body.question)) {
    try {
      const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }); // YYYY-MM-DD in MYT
      const extractPrompt = `Today is ${today} (${todayISO}). Extract every to-do task from the advisor's message below.
Return ONLY a JSON array (no markdown) of objects: {"task": "...", "client": "...", "due": "YYYY-MM-DD or empty"}.
- "task": the action, concise.
- "client": a client's name if clearly mentioned, else "".
- "due": resolve relative dates ("Friday", "tomorrow", "next Monday", "by 20th") to an absolute YYYY-MM-DD; else "".
If there are no real tasks, return [].

Message: "${body.question}"`;

      const genAI = new GoogleGenerativeAI(key);
      let raw = '';
      for (const modelId of MODEL_FALLBACKS) {
        try { raw = (await genAI.getGenerativeModel({ model: modelId }).generateContent(extractPrompt)).response.text(); break; }
        catch { continue; }
      }
      const json = raw.replace(/^```json\s*|```$/gim, '').trim();
      const items = (JSON.parse(json) as { task: string; client?: string; due?: string }[])
        .filter(i => i.task?.trim())
        .map(i => ({ task: i.task.trim(), client: (i.client ?? '').trim(), due: (i.due ?? '').trim() }));

      if (items.length > 0) {
        // Propose tasks for the advisor to review & confirm — do NOT create yet.
        return NextResponse.json({ pendingTasks: items });
      }
      // nothing extracted → fall through to normal answer
    } catch { /* fall through */ }
  }

  // Look up any client mentioned in the question (full profile, contact, todos)
  // and any fund/holding named in it (which clients own it, Cash vs EPF).
  const clientPages = config ? await fetchClientPages(config) : [];
  const [clientData, fundData] = config
    ? await Promise.all([
        lookupMentionedClients(config, body.question, clientPages).catch(() => ''),
        lookupFundHoldings(config, body.question, clientPages).catch(() => ''),
      ])
    : ['', ''];

  const systemPrompt = `You are FINVA, the daily co-pilot for ${advisorName}, a licensed financial advisor in Malaysia. Today is ${today}.

You answer from the advisor's live data below: a dashboard snapshot of today's priorities, PLUS detailed records for any client mentioned in the question. Be concise, specific and action-oriented — like a sharp executive assistant.

RULES:
- Use the actual names, dates, emails and figures from the data. Never invent clients, contacts or tasks.
- When asked for a client's email / contact / to-do list, read it from the "CLIENT:" section below and present it clearly. If a field is blank, say it isn't on record.
- When asked which clients own / bought / hold a particular fund or product, answer from the "FUND HOLDINGS LOOKUP" section: list each client with the current value and category (Cash / EPF). If the advisor asks for one category only (e.g. "under EPF" or "cash only"), filter to that asset class and say how many were excluded. If the lookup says no holding matched, tell the advisor the fund isn't in the holdings records — and if a similar name appears in the distinct list, suggest it ("did you mean …?").
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
${clientData}
${fundData}`;

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
