import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAdvisorConfig, AdvisorConfig } from '@/lib/getAdvisorConfig';
import { listTasks } from '@/lib/tasks';
import { listClients } from '@/lib/clients';
import { listHoldings } from '@/lib/portfolio';
import { listPolicies } from '@/lib/insurance';
import { listMeetings } from '@/lib/meetingNotes';
import { logAiUsage } from '@/lib/aiUsage';
import { DEMO_CLIENTS, DEMO_PORTFOLIO, DEMO_INSURANCE } from '@/lib/demoData';

// Simple in-process cache — key includes advisorId to prevent cross-advisor leakage
const cache = new Map<string, { context: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtRM(n: number): string {
  if (n >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `RM ${(n / 1_000).toFixed(0)}K`;
  return `RM ${n.toFixed(0)}`;
}

function buildDemoClientContext(clientName: string): string {
  const client = DEMO_CLIENTS.find(c =>
    c.name.toLowerCase().includes(clientName.toLowerCase()) ||
    clientName.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())
  );
  if (!client) return `Demo client "${clientName}" not found.`;

  const today = new Date();
  const birth = new Date(client.dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;

  const holdings = DEMO_PORTFOLIO.filter(p => p.clientId === client.id);
  const policies = DEMO_INSURANCE.filter(i => i.clientId === client.id && i.status === 'Active');
  const totalAUM = holdings.reduce((s, h) => s + h.value, 0);

  const lines: string[] = [];
  lines.push(`Current client context: ${client.name} [DEMO DATA]`);
  lines.push(`- Status: ${client.status}, Segment: ${client.segment}, Risk profile: ${client.risk}`);
  lines.push(`- Age: ${age} (DOB: ${client.dob}) · Target retirement: 60 · ${Math.max(60 - age, 0)} years remaining`);
  lines.push(`- AUM: ${fmtRM(client.aum)}`);
  lines.push(`- Monthly income: ${fmtRM(client.income)}`);
  if (client.goals.length) lines.push(`- Financial goals: ${client.goals.join(', ')}`);
  if (client.nextReview) lines.push(`- Next review: ${client.nextReview}`);

  if (holdings.length) {
    lines.push(''); lines.push('Portfolio holdings (Active):');
    for (const h of holdings) {
      let line = `- ${h.name} [${h.assetClass}] · ${h.institution}: ${fmtRM(h.value)}`;
      if (h.returnPct !== 0) line += ` · ${h.returnPct > 0 ? '+' : ''}${h.returnPct}% return`;
      if (h.maturity) line += ` · matures ${h.maturity}`;
      lines.push(line);
    }
    lines.push(`Total portfolio: ${fmtRM(totalAUM)}`);
  }

  if (policies.length) {
    lines.push(''); lines.push('Insurance policies (Active):');
    for (const pol of policies) {
      let line = `- ${pol.policyName} (${pol.insurer})`;
      if (pol.benefits.length) line += ` · ${pol.benefits.join(', ')}`;
      if (pol.lifeCover > 0) line += ` · Life: ${fmtRM(pol.lifeCover)}`;
      if (pol.ciCover  > 0) line += ` · CI: ${fmtRM(pol.ciCover)}`;
      if (pol.tpdCover > 0) line += ` · TPD: ${fmtRM(pol.tpdCover)}`;
      if (pol.annualPremium > 0) line += ` · ${fmtRM(pol.annualPremium)}/yr`;
      lines.push(line);
    }
  }
  return lines.join('\n');
}

async function buildClientContext(
  clientName: string,
  config: AdvisorConfig,
  advisorId: string,
): Promise<string> {
  // Demo mode — skip Notion entirely
  if (config.notionApiKey === 'DEMO_MODE') return buildDemoClientContext(clientName);

  const cacheKey = `${advisorId}:${clientName.toLowerCase()}`;
  const cached   = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.context;

  if (!config.notionApiKey || !config.clientsDbId) return '';

  // ── 1. Find client by name (via the clients abstraction; advisor-scoped) ────
  const first       = clientName.split(' ')[0].toLowerCase();
  const allClients  = await listClients(config).catch(() => []);
  const nameMatches = allClients.filter(c => c.name.toLowerCase().includes(first));
  const client      = nameMatches.find(c =>
    c.name.toLowerCase().includes(clientName.toLowerCase()) ||
    clientName.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())
  ) ?? nameMatches[0];

  if (!client) {
    return `Client "${clientName}" not found in Notion. Please verify the name.`;
  }

  const name      = client.name || clientName;
  const dob       = client.dob;
  const age       = calcAge(dob);
  const risk      = client.risk;
  const segment   = client.segment;
  const aum       = client.aum;
  const income    = client.monthlyIncome;
  const goals     = client.financialGoals;
  const nextRev   = client.nextReview;
  const lastRev   = client.lastReview;
  const status    = client.status;
  // Join key for portfolio/insurance (source-agnostic) + name for text fallback.
  const clientKey = client.notionId;
  const firstName = name.split(' ')[0].toLowerCase();

  // ── 2. Portfolio for this client — join on clientNotionId, name fallback ────
  const allHoldings = await listHoldings(config).catch(() => []);
  let clientHoldings = allHoldings.filter(h => h.clientNotionId && h.clientNotionId === clientKey);
  if (clientHoldings.length === 0) {
    // Fallback: holdings that mention the client by name (holding name / institution).
    clientHoldings = allHoldings.filter(h =>
      h.name.toLowerCase().includes(firstName) || h.institution.toLowerCase().includes(firstName));
  }
  const holdings = clientHoldings
    .filter(h => {
      const s = (h.status || '').toLowerCase();
      return s === 'active' || s === ''; // no/blank status = include, case-insensitive
    })
    .map(h => {
      const valueMYR = h.valueMyr || (h.valueOriginal * h.fxRate);
      const purchMYR = h.purchaseMyr;
      const ret      = purchMYR > 0 ? Math.round(((valueMYR - purchMYR) / purchMYR) * 100) : 0;
      return {
        holdName:    h.name,
        assetClass:  h.assetClass,
        currency:    h.currency || 'MYR',
        valueOrig:   h.valueOriginal,
        valueMYR,
        purchMYR,
        ret,
        maturity:    h.maturityDate,
        institution: h.institution,
        units:       h.units,
      };
    });

  // ── 3. Insurance for this client — join on clientNotionId, name fallback ────
  type PolicyRow = { policyName: string; insurer: string; benefits: string[]; status: string; annualPremium: number; lifeCover: number; ciCover: number; paCover: number; tpdCover: number; medicalClass: string; policyOwner: string; lifeAssured: string };
  const allPolicies = await listPolicies(config).catch(() => []);
  let clientPolicies = allPolicies.filter(p => p.clientNotionId && p.clientNotionId === clientKey);
  if (clientPolicies.length === 0) {
    clientPolicies = allPolicies.filter(p =>
      p.policyName.toLowerCase().includes(firstName) ||
      p.insurer.toLowerCase().includes(firstName) ||
      p.policyOwner.toLowerCase().includes(firstName) ||
      p.lifeAssured.toLowerCase().includes(firstName));
  }
  const policies: PolicyRow[] = clientPolicies.map(p => ({
    policyName:    p.policyName,
    insurer:       p.insurer,
    benefits:      p.benefits,
    status:        p.status,
    annualPremium: p.annualPremium,
    lifeCover:     p.lifeCover,
    ciCover:       p.ciCover,
    paCover:       p.paCover,
    tpdCover:      p.tpdCover,
    medicalClass:  p.medicalClass,
    policyOwner:   p.policyOwner,
    lifeAssured:   p.lifeAssured,
  }));

  // ── 4. Meeting notes for this client (latest 10 → name match → last 5) ──────
  type MeetingRow = { meetingDate: string; meetingType: string; notes: string; actionItems: string; nextReviewDate: string };
  const recentMeetings = (await listMeetings(config).catch(() => [])).slice(0, 10);
  const meetings: MeetingRow[] = recentMeetings
    .filter(m => {
      // Match by client name in the meeting title or its Client Name field.
      const haystack = `${m.title} ${m.clientName}`.toLowerCase();
      return haystack.includes(firstName) || haystack.includes(name.toLowerCase());
    })
    .slice(0, 5) // last 5 meetings
    .map(m => ({
      meetingDate:    m.meetingDate,
      meetingType:    m.meetingType,
      notes:          m.notes,
      actionItems:    m.actionItems,
      nextReviewDate: m.nextReviewDate,
    }));

  // ── 5. Assemble context string ─────────────────────────────────────────────
  const lines: string[] = [];
  lines.push(`Current client context: ${name}`);
  lines.push(`- Status: ${status || 'Active'}, Segment: ${segment || 'N/A'}, Risk profile: ${risk || 'N/A'}`);
  if (age !== null) {
    lines.push(`- Age: ${age}${dob ? ` (DOB: ${dob})` : ''} · Target retirement: 60 · ${60 - age} years remaining`);
  }
  lines.push(`- AUM: ${fmtRM(aum)}`);
  if (income > 0) lines.push(`- Monthly income: ${fmtRM(income)}`);
  if (goals.length > 0) lines.push(`- Financial goals: ${goals.join(', ')}`);
  if (nextRev) lines.push(`- Next review: ${nextRev}`);
  if (lastRev) lines.push(`- Last review: ${lastRev}`);

  if (holdings.length > 0) {
    lines.push('');
    lines.push('Portfolio holdings (Active):');
    for (const h of holdings) {
      let line = `- ${h.holdName}`;
      if (h.assetClass) line += ` [${h.assetClass}]`;
      if (h.institution) line += ` · ${h.institution}`;
      line += `: ${fmtRM(h.valueMYR)}`;
      if (h.currency !== 'MYR' && h.valueOrig > 0) line += ` (${h.currency} ${h.valueOrig.toLocaleString()})`;
      if (h.ret !== 0) line += ` · ${h.ret > 0 ? '+' : ''}${h.ret}% return`;
      if (h.maturity) line += ` · matures ${h.maturity}`;
      if (h.units > 0) line += ` · ${h.units.toLocaleString()} units`;
      lines.push(line);
    }
    const totalMYR = holdings.reduce((s, h) => s + h.valueMYR, 0);
    lines.push(`Total portfolio: ${fmtRM(totalMYR)}`);
  } else {
    lines.push('');
    lines.push('Portfolio: No active holdings on record.');
  }

  // Outstanding to-dos — the AUTHORITATIVE list (reflects done/not-done from the
  // Tasks DB). Past meeting action items are history and may already be done, so
  // they must NOT be presented as current to-dos — only these open tasks are.
  let openTasks: { task: string; due: string }[] = [];
  if (config.tasksDbId) {
    try {
      const t = await listTasks(config, { client: name, status: 'Open' });
      openTasks = t.map(x => ({ task: x.task, due: x.due }));
    } catch { /* ignore */ }
  }
  lines.push('');
  lines.push('OUTSTANDING TO-DOS for this client (authoritative — these are the ONLY open items; completed ones are excluded):');
  if (openTasks.length === 0) lines.push('  None — all tasks for this client are done.');
  else for (const t of openTasks) lines.push(`  - ${t.task}${t.due ? ` (due ${t.due})` : ''}`);

  // Meeting notes — HISTORY ONLY
  if (meetings.length > 0) {
    lines.push('');
    lines.push(`Meeting history (last ${meetings.length} meetings) — for context only. Action items below are a historical record and MAY ALREADY BE DONE; do NOT list them as current to-dos (use the OUTSTANDING TO-DOS list above for that):`);
    for (const m of meetings) {
      lines.push(`\n[${m.meetingDate}${m.meetingType ? ' · ' + m.meetingType : ''}]`);
      if (m.notes)          lines.push(`  Notes: ${m.notes}`);
      if (m.actionItems)    lines.push(`  Action items (historical): ${m.actionItems}`);
      if (m.nextReviewDate) lines.push(`  Next review set: ${m.nextReviewDate}`);
    }
  } else {
    lines.push('');
    lines.push('Meeting history: No meeting notes recorded yet.');
  }

  const activePolicies = policies.filter(p => p.status === 'Active');
  if (activePolicies.length > 0) {
    lines.push('');
    lines.push('Insurance policies (Active):');
    for (const pol of activePolicies) {
      let line = `- ${pol.policyName}`;
      if (pol.insurer) line += ` (${pol.insurer})`;
      if (pol.policyOwner && pol.lifeAssured && pol.policyOwner !== pol.lifeAssured)
        line += ` · Owner: ${pol.policyOwner}, Assured: ${pol.lifeAssured}`;
      else if (pol.lifeAssured) line += ` · Life Assured: ${pol.lifeAssured}`;
      if (pol.benefits.length) line += ` · ${pol.benefits.join(', ')}`;
      if (pol.lifeCover > 0) line += ` · Life: ${fmtRM(pol.lifeCover)}`;
      if (pol.ciCover > 0)   line += ` · CI: ${fmtRM(pol.ciCover)}`;
      if (pol.tpdCover > 0)  line += ` · TPD: ${fmtRM(pol.tpdCover)}`;
      if (pol.paCover > 0)   line += ` · PA: ${fmtRM(pol.paCover)}`;
      if (pol.medicalClass)  line += ` · Medical Class ${pol.medicalClass}`;
      if (pol.annualPremium > 0) line += ` · ${fmtRM(pol.annualPremium)}/yr premium`;
      lines.push(line);
    }
  } else {
    lines.push('');
    lines.push('Insurance: No active policies on record.');
  }

  const context = lines.join('\n');
  cache.set(cacheKey, { context, ts: Date.now() });
  return context;
}

const BASE_PROMPT = `You are FINVA — an AI assistant embedded in a financial consulting dashboard in Malaysia. You assist the financial advisor with client analysis, financial planning, and document generation.

Give concise, practical, Malaysia-specific advice. Use RM for currency. Be direct and professional. Default to max 300 words unless asked for detail. Use local terms where appropriate (KWSP/EPF, OPR, PDPA, unit trust, Bursa).

For calculations: use 3.5% inflation, 6–8% equity fund returns, 3–4% FD/bond returns, 5.5% EPF dividend. Show working when doing projections.

SCOPE: Only help with the advisor's professional work — client analysis, financial/retirement/education planning, portfolio, insurance, cash flow, net worth, market/economy, and document drafting for the practice. If asked anything unrelated (general trivia, coding, personal chit-chat, entertainment), politely decline in one line: "I can only help with your financial advisory work." Do not answer the off-topic question.

TO-DOS / ACTION ITEMS: When asked for outstanding tasks, action items, or "what to do", use ONLY the "OUTSTANDING TO-DOS" list in the client context. Meeting "Action items (historical)" are a past record and may already be completed — never present them as current/outstanding to-dos. If the outstanding list says "None", say the client is all caught up rather than repeating old meeting action items.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, clientName } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });
    }

    // ── Resolve advisor config from middleware header ────────────────────────
    const advisorId = req.headers.get('x-advisor-id') ?? '';
    const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

    // ── Build system prompt — inject live client context if selected ─────────
    let systemPrompt = BASE_PROMPT;
    if (clientName && typeof clientName === 'string' && clientName.trim() && config) {
      try {
        const clientContext = await buildClientContext(clientName.trim(), config, advisorId);
        if (clientContext) systemPrompt = `${BASE_PROMPT}\n\n${clientContext}`;
      } catch (notionErr) {
        console.error('Notion context fetch failed:', notionErr);
      }
    }

    const genAI   = new GoogleGenerativeAI(GEMINI_KEY);
    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const lastMessage = messages[messages.length - 1];

    // Try models in order — fall back on 503 overload
    const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
    let content = '';
    let usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
    let lastErr: unknown;
    for (const modelId of MODEL_FALLBACKS) {
      try {
        const model  = genAI.getGenerativeModel({ model: modelId, systemInstruction: systemPrompt });
        const chat   = model.startChat({ history });
        const result = await chat.sendMessage(lastMessage.content);
        content = result.response.text();
        usage   = result.response.usageMetadata;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastErr = err;
        if (msg.includes('503') || msg.includes('high demand') || msg.includes('overloaded')) {
          console.warn(`${modelId} overloaded, trying next model…`);
          continue;
        }
        throw err;
      }
    }
    if (!content) throw lastErr;

    await logAiUsage({ advisorName: config?.name ?? 'Unknown', feature: 'Client Chat', usage, question: lastMessage?.content });
    return NextResponse.json({ content });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('AI route error:', msg);
    return NextResponse.json({ error: `AI service error: ${msg}` }, { status: 500 });
  }
}
