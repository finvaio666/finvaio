import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client, isFullPage } from '@notionhq/client';

const DB = {
  clients:   '362de6dd-1dfe-80e5-9275-e4ce2fc046b2',
  portfolio: '363de6dd-1dfe-8058-b73e-c7fa8bb431fb',
  insurance: process.env.NOTION_INSURANCE_DB_ID ?? '',
};

// Simple in-process cache (cleared on cold start; good enough for dev + low-traffic prod)
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

async function buildClientContext(clientName: string): Promise<string> {
  // Check cache
  const cached = cache.get(clientName.toLowerCase());
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.context;

  if (!process.env.NOTION_API_KEY) return '';
  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  // ── 1. Find client by name ──────────────────────────────────────────────────
  const clientRes = await notion.databases.query({
    database_id: DB.clients,
    filter: { property: 'Client Name', title: { contains: clientName.split(' ')[0] } },
  });

  const clientPages = clientRes.results.filter(isFullPage);
  const clientPage = clientPages.find(p => {
    const n = p.properties['Client Name']?.type === 'title'
      ? p.properties['Client Name'].title[0]?.plain_text ?? '' : '';
    return n.toLowerCase().includes(clientName.toLowerCase()) ||
           clientName.toLowerCase().includes(n.split(' ')[0].toLowerCase());
  }) ?? clientPages[0];

  if (!clientPage) {
    return `Client "${clientName}" not found in Notion. Please verify the name.`;
  }

  const cp = clientPage.properties;
  const name    = cp['Client Name']?.type === 'title'            ? cp['Client Name'].title[0]?.plain_text ?? clientName : clientName;
  const dob     = cp['Date of Birth']?.type === 'date'           ? cp['Date of Birth'].date?.start ?? ''                : '';
  const age     = calcAge(dob);
  const risk    = cp['Risk Profile']?.type === 'select'          ? cp['Risk Profile'].select?.name ?? ''                : '';
  const segment = cp['Client Segment']?.type === 'select'        ? cp['Client Segment'].select?.name ?? ''             : '';
  const aum     = cp['AUM (MYR)']?.type === 'number'             ? cp['AUM (MYR)'].number ?? 0                         : 0;
  const income  = cp['Monthly income (MYR)']?.type === 'number'  ? cp['Monthly income (MYR)'].number ?? 0              : 0;
  const goals   = cp['Financial goals']?.type === 'multi_select' ? cp['Financial goals'].multi_select.map((g: { name: string }) => g.name) : [];
  const nextRev = cp['Next review date']?.type === 'date'        ? cp['Next review date'].date?.start ?? ''            : '';
  const lastRev = cp['Last review date']?.type === 'date'        ? cp['Last review date'].date?.start ?? ''            : '';
  const status  = cp['Status']?.type === 'select'                ? cp['Status'].select?.name ?? ''                     : '';

  // ── 2. Fetch portfolio for this client ─────────────────────────────────────
  const portfolioRes = await notion.databases.query({
    database_id: DB.portfolio,
    filter: { property: '👥 Clients', relation: { contains: clientPage.id } },
  });

  const holdings = portfolioRes.results.filter(isFullPage)
    .filter(p => (p.properties['Status']?.type === 'select' ? p.properties['Status'].select?.name : '') === 'Active')
    .map(p => {
      const pr = p.properties;
      const holdName    = pr['Holding Name']?.type === 'title'      ? pr['Holding Name'].title[0]?.plain_text ?? ''         : '';
      const assetClass  = pr['Asset class']?.type === 'select'      ? pr['Asset class'].select?.name ?? ''                  : '';
      const currency    = pr['Currency']?.type === 'select'         ? pr['Currency'].select?.name ?? 'MYR'                  : 'MYR';
      const valueOrig   = pr['Value (Original Currency)']?.type === 'number' ? pr['Value (Original Currency)'].number ?? 0  : 0;
      const fxRate      = pr['FX Rate to MYR']?.type === 'number'   ? pr['FX Rate to MYR'].number ?? 1                      : 1;
      const valueMYR    = pr['Value (MYR)']?.type === 'number'      ? pr['Value (MYR)'].number ?? (valueOrig * fxRate)       : (valueOrig * fxRate);
      const purchMYR    = pr['Purchase price (MYR)']?.type === 'number' ? pr['Purchase price (MYR)'].number ?? 0            : 0;
      const ret         = purchMYR > 0 ? Math.round(((valueMYR - purchMYR) / purchMYR) * 100) : 0;
      const maturity    = pr['Maturity date']?.type === 'date'      ? pr['Maturity date'].date?.start ?? ''                  : '';
      const institution = pr['Institution']?.type === 'rich_text'   ? pr['Institution'].rich_text[0]?.plain_text ?? ''      : '';
      const units       = pr['Units']?.type === 'number'            ? pr['Units'].number ?? 0                               : 0;
      return { holdName, assetClass, currency, valueOrig, valueMYR, purchMYR, ret, maturity, institution, units };
    });

  // ── 3. Fetch insurance for this client ─────────────────────────────────────
  type PolicyRow = { policyName: string; insurer: string; benefits: string[]; status: string; annualPremium: number; lifeCover: number; ciCover: number; paCover: number; tpdCover: number; medicalClass: string };
  let policies: PolicyRow[] = [];

  if (DB.insurance) {
    const insurRes = await notion.databases.query({
      database_id: DB.insurance,
      filter: { property: 'Clients', relation: { contains: clientPage.id } },
    });
    policies = insurRes.results.filter(isFullPage).map(p => {
      const pr = p.properties;
      return {
        policyName:    pr['Policy Name']?.type === 'title'           ? pr['Policy Name'].title[0]?.plain_text ?? ''        : '',
        insurer:       pr['Insurer']?.type === 'rich_text'            ? pr['Insurer'].rich_text[0]?.plain_text ?? ''        : '',
        benefits:      pr['Benefits']?.type === 'multi_select'        ? pr['Benefits'].multi_select.map((b: { name: string }) => b.name) : [],
        status:        pr['Status']?.type === 'select'                ? pr['Status'].select?.name ?? ''                    : '',
        annualPremium: pr['Annual Premium (MYR)']?.type === 'number'  ? pr['Annual Premium (MYR)'].number ?? 0             : 0,
        lifeCover:     pr['Life Cover (MYR)']?.type === 'number'      ? pr['Life Cover (MYR)'].number ?? 0                 : 0,
        ciCover:       pr['CI Cover (MYR)']?.type === 'number'        ? pr['CI Cover (MYR)'].number ?? 0                   : 0,
        paCover:       pr['PA Cover (MYR)']?.type === 'number'        ? pr['PA Cover (MYR)'].number ?? 0                   : 0,
        tpdCover:      pr['TPD Cover (MYR)']?.type === 'number'       ? pr['TPD Cover (MYR)'].number ?? 0                  : 0,
        medicalClass:  pr['Medical Class']?.type === 'rich_text'      ? pr['Medical Class'].rich_text[0]?.plain_text ?? '' : '',
      };
    });
  }

  // ── 4. Assemble context string ─────────────────────────────────────────────
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

  const activePolicies = policies.filter(p => p.status === 'Active');
  if (activePolicies.length > 0) {
    lines.push('');
    lines.push('Insurance policies (Active):');
    for (const pol of activePolicies) {
      let line = `- ${pol.policyName}`;
      if (pol.insurer) line += ` (${pol.insurer})`;
      if (pol.benefits.length) line += ` · ${pol.benefits.join(', ')}`;
      if (pol.lifeCover > 0) line += ` · Life: ${fmtRM(pol.lifeCover)}`;
      if (pol.ciCover > 0) line += ` · CI: ${fmtRM(pol.ciCover)}`;
      if (pol.tpdCover > 0) line += ` · TPD: ${fmtRM(pol.tpdCover)}`;
      if (pol.paCover > 0) line += ` · PA: ${fmtRM(pol.paCover)}`;
      if (pol.medicalClass) line += ` · Medical Class ${pol.medicalClass}`;
      if (pol.annualPremium > 0) line += ` · ${fmtRM(pol.annualPremium)}/yr premium`;
      lines.push(line);
    }
  } else {
    lines.push('');
    lines.push('Insurance: No active policies on record.');
  }

  const context = lines.join('\n');
  cache.set(clientName.toLowerCase(), { context, ts: Date.now() });
  return context;
}

const BASE_PROMPT = `You are an AI assistant embedded in the Bill Morrisons Financial Consulting dashboard in Malaysia. You assist the consultant (Bill Morrisons) with client analysis, financial planning, and document generation.

Give concise, practical, Malaysia-specific advice. Use RM for currency. Be direct and professional. Default to max 300 words unless asked for detail. Use local terms where appropriate (KWSP/EPF, OPR, PDPA, unit trust, Bursa).

For calculations: use 3.5% inflation, 6–8% equity fund returns, 3–4% FD/bond returns, 5.5% EPF dividend. Show working when doing projections.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, clientName } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not set in environment variables.' }, { status: 500 });
    }

    // Build system prompt — inject live client context if a client is selected
    let systemPrompt = BASE_PROMPT;
    if (clientName && typeof clientName === 'string' && clientName.trim()) {
      const clientContext = await buildClientContext(clientName.trim());
      if (clientContext) {
        systemPrompt = `${BASE_PROMPT}\n\n${clientContext}`;
      }
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    });

    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const content = result.response.text();

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Gemini API error:', error);
    return NextResponse.json({ error: 'AI service error. Check GEMINI_API_KEY.' }, { status: 500 });
  }
}
