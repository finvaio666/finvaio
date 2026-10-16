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

import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration, type FunctionCall } from '@google/generative-ai';
import { AdvisorConfig } from './getAdvisorConfig';
import { estimateAll, getExclusions, PLAN_TYPES, type Gender as InsGender } from './insuranceCalculator';
import { listClients, ClientRecord } from './clients';
import { listHoldings, isExitedHolding, type PortfolioHolding } from './portfolio';
import { listTasks, setTaskStatus } from './tasks';
import { listMeetings } from './meetingNotes';
import { listFunds, listPlans } from './products';
import { listPolicies, type InsurancePolicy } from './insurance';
import * as kbEntries from './repos/knowledgeEntries';
import { listHouseStructuredTerms } from './repos/portfolio';
import { compareMedicalCoi } from './coiComparison';
import { logAiUsage } from './aiUsage';
import { getBnmMarketData, type FxRate } from './marketData';

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

  // The advisor's own book, read once and only because a client was named: what
  // this person already holds and is already insured for decides the advice.
  let allHoldings: PortfolioHolding[] = [];
  let allPolicies: InsurancePolicy[] = [];
  try { [allHoldings, allPolicies] = await Promise.all([listHoldings(config), listPolicies(config)]); } catch { /* profile alone still answers */ }
  const rm = (n: number) => `RM ${Math.round(n).toLocaleString('en-MY')}`;

  const blocks: string[] = [];
  for (const c of matched) {
    const lines: string[] = [`\n# CLIENT: ${c.name} (EXISTING CLIENT - found in the advisor's client records)`];
    if (c.email) lines.push(`Email: ${c.email}`);
    if (c.phone) lines.push(`Phone: ${c.phone}`);
    if (c.status || c.segment || c.risk) lines.push(`Profile: ${[c.status, c.segment, c.risk].filter(Boolean).join(' · ')}`);
    if (c.aum) lines.push(`AUM: RM ${c.aum.toLocaleString()}`);
    if (c.financialGoals.length) lines.push(`Goals: ${c.financialGoals.join(', ')}`);
    if (c.nextReview) lines.push(`Next review: ${c.nextReview}`);
    if (c.lastReview) lines.push(`Last review: ${c.lastReview}`);

    // Holdings on record, by asset class (live positions only).
    if (c.notionId) {
      const hs = allHoldings.filter(h => h.clientNotionId === c.notionId && !isExitedHolding(h));
      if (hs.length) {
        const byClass = new Map<string, { n: number; total: number }>();
        for (const h of hs) {
          const k = h.assetClass || 'Other';
          const g = byClass.get(k) ?? { n: 0, total: 0 };
          g.n++; g.total += h.valueMyr || 0; byClass.set(k, g);
        }
        lines.push(`HOLDINGS ON RECORD (live): ${[...byClass.entries()].map(([k, g]) => `${k} ${g.n} holding${g.n === 1 ? '' : 's'} ${rm(g.total)}`).join('; ')}`);
      } else {
        lines.push('HOLDINGS ON RECORD: none recorded.');
      }

      // Insurance on record (active policies), with whose life each one covers.
      const pols = allPolicies.filter(p => p.clientNotionId === c.notionId && (p.status || '').toLowerCase() === 'active');
      if (pols.length) {
        lines.push(`INSURANCE ON RECORD (${pols.length} active polic${pols.length === 1 ? 'y' : 'ies'}):`);
        for (const p of pols.slice(0, 12)) {
          const parts = [
            p.insurer, p.insuranceType,
            p.lifeAssured ? `life assured: ${p.lifeAssured}` : 'life assured: not stated',
            p.lifeCover ? `life ${rm(p.lifeCover)}` : '',
            p.ciCover ? `CI ${rm(p.ciCover)}` : '',
            p.tpdCover ? `TPD ${rm(p.tpdCover)}` : '',
            p.medicalCard ? `medical: ${p.medicalCard}` : '',
            p.annualPremium ? `premium ${rm(p.annualPremium)}/yr` : '',
          ].filter(Boolean);
          lines.push(`- ${parts.join(' · ')}`);
        }
      } else {
        lines.push('INSURANCE ON RECORD: no active policies recorded for this client. Say so, and ask the advisor to confirm with the client; do not state that he is uninsured.');
      }
    }

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
  /\b(case|experience|before|previously|handled|happened|lesson|learn|advice|advise|recommend|suggest|propose|option|invest|investment|risk|return|yield|bond|fcn|note|structured|fund|insurance|policy|client|objection|complain|surrender|claim|default|fd|fixed deposit|portfolio|allocation|retire\w*|financial plan\w*|process|procedure|how do (?:i|we)|medical|premium|repric\w*|mediasas|mhit|co-?payment|deductible|strike|knock\w*|coupon|issuer|sukuk|worst case|perpetual|at1|tier 2|callable|duration|rating|ytm|yield to maturity)\b|案例|經驗|教訓|處理|建議|投資|風險|報酬|債券|違約|定存|流程/i;

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

    const isIndustry = (e: { source: string }) => e.source === 'industry_reference' || e.source === 'ai_synthesis';
    // Public rules (BNM, SC, budget measures): facts, not sales technique, so
    // they get their own label instead of the "unverified" industry one.
    const isRegulation = (e: { source: string }) => e.source === 'public_regulation' || e.source === 'product_knowledge';
    const firm = picked.filter(e => !isIndustry(e) && !isRegulation(e));
    const industry = picked.filter(isIndustry);
    const regulation = picked.filter(isRegulation);
    const out: string[] = [];

    if (firm.length) {
      out.push('\n# FIRM KNOWLEDGE BASE — FAQ & CASE STUDIES (real experience from this firm\'s advisors; attribute it to the firm\'s experience; NEVER name a person)');
      for (const e of firm) {
        out.push(`\n## ${e.isBigLesson ? '⭐ BIG LESSON — ' : ''}${e.title}`);
        out.push(`Type: ${e.entryType} · Category: ${e.category}`);
        if (e.keyTakeaway) out.push(`KEY TAKEAWAY: ${e.keyTakeaway}`);
        if (e.situation)   out.push(`Situation: ${e.situation}`);
        if (e.resolution)  out.push(`How it was handled: ${e.resolution}`);
      }
    }
    if (industry.length) {
      out.push('\n# GENERAL INDUSTRY TECHNIQUE — public sales practice or an AI-synthesised reference (unverified), NOT this firm\'s own experience. Introduce it as "A commonly used approach is…". Only lines starting "Adaptation to confirm with the firm" and any text that says "the firm\'s benchmark" or "the firm has not set" describe the firm\'s own practice.');
      for (const e of industry) {
        out.push(`\n## ${e.title}`);
        if (e.keyTakeaway) out.push(`KEY TAKEAWAY: ${e.keyTakeaway}`);
        if (e.situation)   out.push(`Situation: ${e.situation}`);
        if (e.resolution)  out.push(`Technique: ${e.resolution}`);
      }
    }
    if (regulation.length) {
      out.push('\n# PUBLIC RULES, REGULATORY FACTS AND PRODUCT KNOWLEDGE — from Bank Negara, the Securities Commission, government announcements and standard product mechanics, checked against public sources. State them as facts ("Under Bank Negara\'s rules…"), keep any "indicative" or "to be confirmed" wording, and suggest the FA confirm final terms with the insurer or the official source. Lines that say "the firm" are the firm\'s own practice.');
      for (const e of regulation) {
        out.push(`\n## ${e.title}`);
        if (e.keyTakeaway) out.push(`KEY TAKEAWAY: ${e.keyTakeaway}`);
        if (e.situation)   out.push(`Background: ${e.situation}`);
        if (e.resolution)  out.push(`Details: ${e.resolution}`);
      }
    }
    return out.join('\n');
  } catch { return ''; }
}

// ── House activity — what the firm is actually running right now ─────────────
// Answers "what FCNs do we do / which underlyings / what coupon levels" from the
// live book, so there is nothing for anyone to write first. Output policy (Sky,
// 2026-08-22): names and ranges only — NEVER client names, client counts,
// per-issuer counts or any amount. Those are sensitive business numbers and
// don't help an advisor decide anything.
const HOUSE_TRIGGER =
  /\b(fcn|fcns|structured|note|notes|autocall\w*|coupon|knock.?(?:in|out)|issuer|underlying\w*|what (?:are|do) we (?:run|do|offer|have)|firm (?:has|is) (?:done|running)|house)\b|結構|票息|發行商|標的/i;

const ISSUER_CANON: [RegExp, string][] = [
  [/marex/i, 'Marex'], [/natixis/i, 'Natixis'], [/barclays/i, 'Barclays'], [/ubs/i, 'UBS'],
  [/nomura/i, 'Nomura'], [/csi|citic/i, 'CSI (CITIC Securities guaranteed)'],
  [/sg issuer|societe generale/i, 'Societe Generale'], [/citigroup|cgmfl/i, 'Citi'],
  [/maybank|mbib/i, 'Maybank Investment Bank'],
];

function underlyingKey(name: string): string {
  const m = name.match(/\(([A-Za-z0-9.=\-]+)\)\s*$/);
  return (m ? m[1] : name).toUpperCase();
}

export async function lookupHouseActivity(question: string): Promise<string> {
  if (!HOUSE_TRIGGER.test(question)) return '';
  try {
    const notes = await listHouseStructuredTerms();
    if (notes.length === 0) return '';

    const freq = new Map<string, number>();
    const issuers = new Set<string>();
    const coupons: number[] = [];
    let stepDown = 0;
    for (const n of notes) {
      const d = n.underlyingDetails!;
      for (const u of new Set((d.underlyings ?? []).map(x => underlyingKey(x.name)))) freq.set(u, (freq.get(u) ?? 0) + 1);
      const iss = ISSUER_CANON.find(([re]) => re.test(n.institution));
      if (iss) issuers.add(iss[1]); else if (n.institution) issuers.add(n.institution);
      if (typeof d.couponRatePa === 'number' && d.couponRatePa > 0) coupons.push(d.couponRatePa);
      const pcts = (d.schedule ?? []).map(s => s.triggerPct).filter((x): x is number => typeof x === 'number');
      if (new Set(pcts).size > 1) stepDown++;
    }
    const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const lines = ['\n# HOUSE ACTIVITY — what the firm is running right now (live structured-note book; ranking and ranges only, deliberately no counts, amounts or client data)'];
    lines.push(`Underlyings, most-used first: ${ranked.join(', ')}.`);
    lines.push(`Issuers the firm works with (alphabetical, no ranking): ${[...issuers].sort().join(', ')}.`);
    if (coupons.length) {
      const avg = coupons.reduce((s, x) => s + x, 0) / coupons.length;
      lines.push(`Coupon level on current notes: roughly ${Math.min(...coupons).toFixed(1)}% – ${Math.max(...coupons).toFixed(1)}% p.a., typical ~${avg.toFixed(0)}% p.a. (high coupons come from volatile single-stock underlyings and carry knock-in risk).`);
    }
    if (stepDown > 0) lines.push('Structure: a meaningful share of notes are step-down autocalls (the KO barrier lowers each observation date); others use a flat barrier.');
    return lines.join('\n');
  } catch { return ''; }
}

// ── Live FX: conversions follow the market rate, never a remembered one ──────
const FX_TRIGGER = /\b(usd|sgd|aud|gbp|eur|jpy|cny|rmb|dollars?|ringgit|exchange rate|fx|forex|currency|convert\w*)\b|us\$|s\$|a\$/i;
let fxCache: { at: number; rates: FxRate[]; date: string } | null = null;

/** Today's Bank Negara rates when the question involves another currency (cached for an hour). */
export async function lookupFxRates(question: string): Promise<string> {
  if (!FX_TRIGGER.test(question)) return '';
  try {
    if (!fxCache || Date.now() - fxCache.at > 3600_000) {
      const d = await getBnmMarketData();
      if (d.fx.length) fxCache = { at: Date.now(), rates: d.fx, date: d.fx[0]?.date || d.dataDate };
    }
    if (!fxCache) return '';
    const lines = fxCache.rates.map(f => `${f.unit} ${f.code} = RM${f.rate.toFixed(4)}`);
    return `\n# LIVE EXCHANGE RATES (Bank Negara Malaysia middle rate, ${fxCache.date})\n${lines.join(' · ')}`;
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
  const [clientData, fundData, kbData, caseData, houseData, fxData] = await Promise.all([
    lookupMentionedClients(config, question, clients).catch(() => ''),
    lookupFundHoldings(config, question, clients).catch(() => ''),
    lookupKnowledgeBase(config, question).catch(() => ''),
    lookupCaseStudies(question).catch(() => ''),
    lookupHouseActivity(question).catch(() => ''),
    lookupFxRates(question).catch(() => ''),
  ]);
  return [clientData, fundData, kbData, caseData, houseData, fxData].filter(Boolean).join('\n');
}

/** Prompt rules for the sections buildSharedContext produces. */
export const SHARED_DATA_RULES = `- When asked which clients own / bought / hold a particular fund or product, answer from the "FUND HOLDINGS LOOKUP" section: list each client with the current value and category (Cash / EPF). If the advisor asks for one category only (e.g. "under EPF" or "cash only"), filter to that asset class and say how many were excluded. If SEVERAL funds match the name the advisor used (e.g. two "Greater China" funds), present each fund's holders under its own heading and note they may want to be more specific. If the lookup says no holding matched, tell the advisor the fund isn't in the holdings records — and if a similar name appears in the distinct list, suggest it ("did you mean …?").
- COMPANY KNOWLEDGE BASE: for questions about which fund/insurance plan is best, comparisons between products, returns, sum assured, premiums, EPF approval, risk level, or "what should I recommend" — answer FIRST from the "COMPANY KNOWLEDGE BASE" section. This is the firm's own curated, admin-maintained catalogue and is authoritative — treat it as the house view, not just background info. Only bring in general market/product knowledge if the catalogue doesn't cover what was asked, and say so explicitly when you do (e.g. "not in our catalogue, but generally…"). If the catalogue section says it's empty, tell the advisor no funds/plans have been added yet rather than answering from general knowledge as if it were house data.
- FIRM KNOWLEDGE BASE (FAQ & CASE STUDIES): this is real, hard-won experience from this firm's own advisors — treat it as more authoritative than general market knowledge, and attribute it to the firm's own experience ("from the firm's experience…", "our house view…"), so the advisor knows it is real company experience rather than general market knowledge. NEVER name the person who contributed it, or any colleague, in an answer — refer to "the firm" or "our experience" only. Entries marked "GENERAL INDUSTRY TECHNIQUE" are public sales practice, not the firm's own experience: open the answer with "A commonly used approach is…", never say "from the firm's experience" or "our experience" for the technique itself, and when a firm-experience entry covers the same point, lead with that one. Only the lines that start with "Adaptation to confirm with the firm" describe the firm's own practice: give those separately under "How this applies at the firm". An entry marked "⭐ BIG LESSON" is a firm-level lesson: surface it whenever it is even loosely relevant, and never contradict it.
- NAMED CLIENT CHECK (every question that names a person): first establish whether they are an existing client. If a "# CLIENT:" section exists for the name, open with ONE line that says so, for example "X is an existing client: Affluent, Moderate risk profile, AUM RM …, goals …", and then USE the record: the recorded risk profile calibrates the mix, the goals shape it, the holdings and insurance on record replace generic assumptions, and any amount or fact the advisor states that differs from the record (for example "RM1 million" against a recorded AUM of RM 461,894) must be pointed out as a difference to confirm, not silently accepted. Also name what is MISSING from the record (for example no medical card or no critical-illness cover among the policies) as something to confirm with the client, and in "Ask the client first" leave out anything the record already answers (risk profile, goals, existing cover) - ask only what is genuinely unknown. If there is no "# CLIENT:" section for the name, say plainly "I can't find <name> in your client records, so I'm treating this as a prospect", and do not invent a profile.
- PORTFOLIO / ALLOCATION ANSWERS: use EXACTLY this markdown layout so it is easy to scan - one summary sentence; then, ONLY when the person is an existing client, "### Client on record" with 2-4 bullets (profile and risk profile, goals, AUM and holdings against the amount stated, existing insurance); then these headings, each on its own line with short bullets underneath: "### Step 1 - Protect the family first" (insurance benchmarks), "### Step 2 - Ring-fence cash", "### Step 3 - Illustrative portfolio" (this one MUST contain a markdown table with the header row | Bucket | Share | Amount (RM) | What goes in it | followed by the |---|---|---|---| separator row and one row per bucket - never replace the table with a list), "### Cautions" (3-5 bullets of ONE sentence each: bonds, structured notes, issuer concentration, suitability - for structured notes state only the worst case in one sentence, e.g. if the worst stock ends below the strike the client receives that stock's shares and can lose most of the principal, and an issuer failure can lose everything; for bonds one sentence on credit and issuer risk. Never paste the full FCN worst-case walkthrough, the worked table or a bond checklist into a portfolio answer - those are for questions about one specific note or bond, and the FA can ask a follow-up), "### Ask the client first" (bullets). Keep the whole answer under about 350 words; skip the compounding illustration unless asked. Protection (insurance) comes first, before returns. Open with "A general starting framework is…" and never say it comes from the firm's experience; only the benchmarks and rules the entry marks as the firm's (protection benchmark, the low-risk rule, bond due-diligence lesson) are the firm's own. Structured notes only for Sophisticated or Accredited Investors; never present a structured note as a way to meet a low-risk target.
- CURRENCY CONVERSION: convert between ringgit and another currency ONLY with the "LIVE EXCHANGE RATES" section, and say which rate and date you used (e.g. "at Bank Negara's rate of RM4.21 per USD on 2026-10-15"). Never assume or remember a rate; if that section is missing, give the figure in the original currency and say the live rate was not available.
- CHANNELS AND PEOPLE TO REFER TO: never name or recommend FSMOne, Fundsupermart, Bondsupermart or any other direct-to-consumer (B2C) investment platform - they compete with the firm's advisors. Refer to the iFAST platform the firm uses instead. For choosing a specific bond paper, suggest the advisor consult Bill Morrisons' IC (Investment Consultant). Do not write your own disclaimer at the end of an answer; the app adds the company disclaimer automatically.
- HOUSE ACTIVITY: for questions about what the firm runs / has done in FCNs or structured notes (which underlyings, which issuers, typical coupon), answer from the "HOUSE ACTIVITY" section. Report only what it states. NEVER invent or infer client names, how many clients or notes, per-issuer shares, or any amount — if asked for those, say the knowledge base deliberately doesn't expose them. A high coupon is never a reason to suggest an FCN to a low-risk client (see the risk-tier rule).
- ⚠️ RISK-TIER SAFETY RULE (this overrides any impulse to be helpful with a bigger number). When the advisor's question signals LOW RISK — "low risk", "conservative", "capital preservation", "safe", "FD alternative", "定存", "保守", "穩健", "低風險" — you must answer ONLY from instruments in that risk tier (cash, government bonds, investment-grade corporate bonds). NEVER present a higher-yielding product (structured notes/FCN, equities, leveraged products) as a way to "hit the target return". FCNs carry knock-in risk: in the worst case the client takes delivery of a collapsed stock and loses a large part of their principal — they are NOT a low-risk instrument no matter how attractive the coupon looks. If the firm's low-risk holdings cannot reach the return the client wants, SAY SO PLAINLY and explain the gap. An honest "we can't reach that at this risk level" is the correct answer; reaching up the risk ladder to produce a nicer number is a harmful one. If you do mention a higher-risk instrument for context, you must state explicitly that it sits in a different risk tier and name the specific risk mechanism.
- ⚠️ DEFAULTED / DISTRESSED POSITIONS. Before citing any holding as a live option, check its state — a bond can still read as "Active" with no maturity date and yet be in default. If the current value is drastically below cost, treat it as defaulted/distressed: never present it as an available yield, and if it is relevant, cite it as a cautionary case with its recovery rate. (Concrete precedent in the firm: a 6.3% corporate bond that defaulted and recovered ~0.1% of capital.)
- You describe what the firm has done and what it currently runs; you never tell the advisor what their client should buy. Investment recommendations are the licensed advisor's call, made through the firm's own suitability and compliance process.`;

// ── Task intents (mark done / create) ─────────────────────────────────────────

export interface PendingTask { task: string; client: string; due: string }

/**
 * Does this message actually ask to CREATE a task?
 *
 * The old test fired on a bare "add|create|record|note" anywhere in the
 * sentence, which hijacked ordinary questions — "my prospect has no RECORD
 * with us, is that enough cover?" was turned into a to-do instead of being
 * answered. Now a trigger word must either lead the sentence (an imperative:
 * "add a reminder to…") or sit next to a task noun, and plainly analytical
 * questions are excluded outright.
 */
export function looksLikeTaskRequest(q: string): boolean {
  // Questions that are clearly asking for analysis, never a task.
  if (/\b(is (that|this|it|he|she|they) enough|enough cover|what(?:'s| is| are)? (lacking|missing)|under-?insured|coverage gap|protection gap|compare|cheapest|how much (should|would|does|is))\b/i.test(q)) {
    return false;
  }
  // Explicit task phrasing anywhere in the message.
  if (/\b(remind me|new task|add (?:a |an )?(?:task|to-?do|reminder)|create (?:a |an )?(?:task|to-?do|reminder)|note (?:it |this |that )?down|put (?:it |this |that )?down|to-?do list)\b/i.test(q)) {
    return true;
  }
  // Or an imperative opening the message: "add …", "record …", "log …".
  return /^\s*(?:please\s+)?(add|create|record|note|log)\b/i.test(q);
}
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
  isTest = false,
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
  if (looksLikeTaskRequest(question) &&
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
        try {
          const res = await genAI.getGenerativeModel({ model: modelId }).generateContent(extractPrompt);
          await logAiUsage({ advisorName: config.name ?? 'Unknown', feature: 'Task Extract', usage: res.response.usageMetadata, model: modelId, question, isTest });
          raw = res.response.text(); break;
        }
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

// ── Premium comparison tool (Gemini function calling) ─────────────────────────
/**
 * The insurance pricing engine (lib/insuranceCalculator.ts) is exposed to the
 * model as a CALLABLE TOOL rather than as prompt text, for one reason: the
 * model must never do the arithmetic. Premiums quoted to a real client have to
 * come out of the calibrated engine, not out of an LLM's head.
 *
 * Mirrors the Premium Calculator page's defaults — plan type `ilp200`
 * (ILP Protection + Medical, Room 200) and waiver included — so chat and page
 * can never disagree. ilp200 is currently the only enabled plan type, so there
 * is deliberately no planType parameter to get wrong.
 */
const PLAN_BASIS = PLAN_TYPES.find(p => p.enabled) ?? PLAN_TYPES[0];

export const ENGINE_DISCLAIMER =
  'Premiums are estimates from a reverse-engineered attained-age model that reproduces each insurer\'s official illustrations to ~0.5% at quoted ages (Prudential ~1%). They are NOT official quotations and must be confirmed against the insurer\'s system before issue. Medical is fixed at Room 200. For advisory discussion only.';

/**
 * The firm's STANDARD comparison package, used whenever the advisor does not state
 * a sum assured: Life RM100k + "36CI" critical illness RM100k + waiver of premium +
 * medical (ILP with Room & Board RM200 — the enabled PLAN_TYPE). The engine prices
 * a sum assured, not a condition count, so "36CI" is the package name, not a filter.
 */
export const STANDARD_PACKAGE = { lifeSA: 100_000, ciSA: 100_000, waiver: true };

export const PREMIUM_TOOL: FunctionDeclaration = {
  name: 'compare_premiums',
  description:
    'Compare estimated insurance premiums across AIA, Great Eastern, Allianz, HLA and Prudential for one person, ' +
    `using the firm's calibrated pricing engine (${PLAN_BASIS.label}). ` +
    'Call this whenever the advisor asks what a plan would cost, which insurer is cheapest, or for a premium comparison. ' +
    'Do NOT call it until you know age, gender and smoker status — ask for whatever is missing first. ' +
    'If the advisor gives NO sum assured, OMIT lifeSA and ciSA: the tool applies the standard package (Life RM100k, 36CI RM100k, waiver of premium, medical Room & Board RM200). ' +
    'Never estimate or adjust premiums yourself; every figure you quote must come from this tool.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      age:    { type: SchemaType.INTEGER, description: 'Age next birthday of the life assured, 1-75.' },
      gender: { type: SchemaType.STRING,  format: 'enum', description: "Gender of the life assured: 'M' or 'F'.", enum: ['M', 'F'] },
      smoker: { type: SchemaType.BOOLEAN, description: 'True if the life assured smokes. Changes the premium materially — never guess it.' },
      lifeSA: { type: SchemaType.NUMBER,  description: 'Life cover sum assured in MYR, e.g. 500000. OMIT if the advisor did not state one (standard RM100k applies).' },
      ciSA:   { type: SchemaType.NUMBER,  description: 'Critical illness sum assured in MYR, e.g. 500000. OMIT if the advisor did not state one (standard RM100k applies).' },
      waiver: { type: SchemaType.BOOLEAN, description: 'Include waiver-of-premium rider. Defaults to true (the calculator default) when not specified.' },
    },
    required: ['age', 'gender', 'smoker'],
  },
};

export interface PremiumToolResult {
  ok: boolean;
  error?: string;
  basis?: string;
  inputs?: { age: number; gender: string; smoker: boolean; lifeSA: number; ciSA: number; waiver: boolean };
  quotes?: { insurer: string; product: string; monthly: number; annual: number; verified: boolean; caveat: string }[];
  excluded?: { insurer: string; reason: string }[];
  disclaimer?: string;
  standardPackageApplied?: string[];
  samples?: { insurer: string; product: string; monthly: number; annual: number }[];
}

/** Run the pricing engine. Pure + synchronous — no DB, no network. */
export function runPremiumComparison(args: Record<string, unknown>): PremiumToolResult {
  const age    = Number(args.age);
  const gender = String(args.gender ?? '').toUpperCase() as InsGender;
  const smoker = Boolean(args.smoker);
  const applied: string[] = [];
  const given = (v: unknown) => v !== undefined && v !== null && v !== '';
  if (!given(args.lifeSA)) applied.push(`Life RM${STANDARD_PACKAGE.lifeSA.toLocaleString()}`);
  if (!given(args.ciSA))   applied.push(`36CI critical illness RM${STANDARD_PACKAGE.ciSA.toLocaleString()}`);
  const lifeSA = given(args.lifeSA) ? Number(args.lifeSA) : STANDARD_PACKAGE.lifeSA;
  const ciSA   = given(args.ciSA) ? Number(args.ciSA) : STANDARD_PACKAGE.ciSA;
  const waiver = args.waiver === undefined ? true : Boolean(args.waiver);

  if (!Number.isFinite(age) || age < 1 || age > 75) {
    return { ok: false, error: `Age ${args.age} is outside the engine's supported range (1-75). Tell the advisor the engine cannot price this age — do not estimate it yourself.` };
  }
  if (gender !== 'M' && gender !== 'F') {
    return { ok: false, error: 'Gender must be M or F. Ask the advisor.' };
  }
  if (!Number.isFinite(lifeSA) || !Number.isFinite(ciSA) || lifeSA < 0 || ciSA < 0) {
    return { ok: false, error: 'Both life and CI sum assured are required, in MYR. Ask the advisor.' };
  }

  const results  = estimateAll(age, gender, smoker, lifeSA, ciSA, waiver);
  const excluded = getExclusions(lifeSA, ciSA, smoker);

  if (results.length === 0) {
    return { ok: false, error: 'The engine returned no priceable insurer for this combination. Report that plainly; do not invent a figure.', excluded: excluded.map(e => ({ insurer: e.insurer, reason: e.reason })) };
  }

  return {
    ok: true,
    basis: `${PLAN_BASIS.label}; waiver of premium ${waiver ? 'included' : 'excluded'}`,
    inputs: { age, gender, smoker, lifeSA, ciSA, waiver },
    quotes: results.map(r => ({
      insurer:  r.insurer,
      product:  r.product,
      monthly:  Math.round(r.monthly * 100) / 100,
      annual:   Math.round(r.annual * 100) / 100,
      verified: r.verified,
      caveat:   r.caveat,
    })),
    excluded: excluded.map(e => ({ insurer: e.insurer, reason: e.reason })),
    disclaimer: ENGINE_DISCLAIMER,
    standardPackageApplied: applied.length ? [...applied, ...(args.waiver === undefined ? ['waiver of premium'] : []), `medical: ${PLAN_BASIS.medicalLabel}`] : undefined,
    samples: results.slice(0, 3).map(r => ({ insurer: r.insurer, product: r.product, monthly: Math.round(r.monthly * 100) / 100, annual: Math.round(r.annual * 100) / 100 })),
  };
}

// ── Coverage gap analysis ─────────────────────────────────────────────────────
/**
 * The firm's underinsurance benchmark, set by the advisor:
 *   life = 10x annual income, CI = 5x annual income, medical >= RM1m annual limit.
 * Encoded here so the gap is COMPUTED, not opined on by the model.
 */
export const GAP_BENCHMARK = { lifeMultiple: 10, ciMultiple: 5, medicalAnnualLimitFloor: 1_000_000 };

/**
 * Medical annual limit lives in free text on the policy, e.g.
 * "MediSafe Infinite · Room & Board: RM200/day · Annual Limit: RM1,000,000".
 * Returns the limit in MYR, Infinity for an unlimited annual limit, or null when
 * the text carries no annual limit at all (a "Lifetime Limit" is NOT an annual
 * one, and must not be read as if it were).
 */
export function parseAnnualLimit(medicalText: string): number | null {
  if (!medicalText || medicalText.trim() === '0') return null;
  const m = medicalText.match(/annual\s*limit\s*:?\s*(unlimited|rm\s*[\d,]+(?:\.\d+)?)/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (v.includes('unlimited')) return Infinity;
  const n = Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export const GAP_TOOL: FunctionDeclaration = {
  name: 'analyse_coverage_gap',
  description:
    "Work out whether a person's life, critical illness and medical cover meets the firm's benchmark " +
    `(life ${GAP_BENCHMARK.lifeMultiple}x annual income, CI ${GAP_BENCHMARK.ciMultiple}x annual income, medical at least RM1,000,000 annual limit), ` +
    'and report the shortfall. Call this whenever the advisor asks if cover is enough, what is lacking, ' +
    'whether a client is underinsured, or for a coverage/protection gap analysis. ' +
    'annualIncome is required and is almost never on file — ask the advisor for it first. ' +
    'For a client selected in the picker, existing cover is read from their policies automatically; ' +
    'for a prospect with no record, pass their existing cover explicitly (use 0 if they have none). ' +
    'Never compute the gap yourself — every figure must come from this tool.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      annualIncome:                { type: SchemaType.NUMBER, description: 'Annual income in MYR. If the advisor gives a monthly figure, multiply by 12 before calling.' },
      existingLifeCover:           { type: SchemaType.NUMBER, description: 'Existing life cover in MYR. Omit to read it from the selected client\'s policies; pass 0 for a prospect with none.' },
      existingCiCover:             { type: SchemaType.NUMBER, description: 'Existing critical illness cover in MYR. Omit to read it from the selected client\'s policies.' },
      existingMedicalAnnualLimit:  { type: SchemaType.NUMBER, description: 'Existing medical annual limit in MYR. Omit to read it from the selected client\'s policies.' },
    },
    required: ['annualIncome'],
  },
};

export interface GapToolResult {
  ok: boolean;
  error?: string;
  benchmark?: string;
  annualIncome?: number;
  source?: string;
  life?:    { required: number; existing: number; gap: number };
  ci?:      { required: number; existing: number; gap: number };
  medical?: { floor: number; existing: number | 'unlimited' | null; meetsFloor: boolean | null; note?: string };
  countedPolicies?: string[];
  excludedPolicies?: string[];
  caution?: string;
}

/**
 * Compute the shortfall. Existing cover for a selected client is summed ONLY
 * from active policies where that client is the life assured — 172 policies in
 * the book are owned by one person and assured on another (a child, a spouse),
 * and counting those would overstate the client's own protection. Anything not
 * counted is listed back rather than silently dropped, so the advisor can see
 * what was left out and overrule it.
 */
export async function runCoverageGap(
  args: Record<string, unknown>,
  ctx: { config: AdvisorConfig; clientId?: string; clientName?: string },
): Promise<GapToolResult> {
  const annualIncome = Number(args.annualIncome);
  if (!Number.isFinite(annualIncome) || annualIncome <= 0) {
    return { ok: false, error: 'Annual income is required and is almost never stored on the client record. Ask the advisor for it — do not assume a figure.' };
  }

  const given = (k: string) => args[k] !== undefined && args[k] !== null && Number.isFinite(Number(args[k]));
  let life    = given('existingLifeCover')          ? Number(args.existingLifeCover) : null;
  let ci      = given('existingCiCover')            ? Number(args.existingCiCover)   : null;
  let medical: number | null = given('existingMedicalAnnualLimit') ? Number(args.existingMedicalAnnualLimit) : null;

  const counted: string[] = [];
  const excluded: string[] = [];
  let unknownMedical = 0;
  let source = 'figures supplied by the advisor';

  // Read from the client's policies for anything not supplied.
  if ((life === null || ci === null || medical === null) && ctx.clientId) {
    try {
      const all = await listPolicies(ctx.config);
      const clients = await fetchClients(ctx.config);

      // The id can arrive in more than one shape: the Supabase uuid the picker
      // sends, or a Notion page id (dashed or not, depending on the caller).
      // Match on any of them — matching only `id` silently found nobody and
      // reported RM0 cover for a client who actually had four policies.
      const bare   = (s: string) => (s || '').replace(/-/g, '').toLowerCase();
      const wanted = bare(ctx.clientId);
      const client = clients.find(c =>
        c.id === ctx.clientId || c.notionId === ctx.clientId ||
        bare(c.id) === wanted  || bare(c.notionId) === wanted);

      // A client we cannot resolve is an ERROR, never "no cover". Reporting
      // zero here would tell the advisor a protected client is uninsured.
      if (!client) {
        return { ok: false, error: 'Could not match the selected client to a record, so existing cover is unknown. Do NOT report zero cover — ask the advisor to re-select the client, or to state the existing life/CI cover directly.' };
      }
      if (!client.notionId) {
        return { ok: false, error: `No policy link exists for ${client.name}, so existing cover cannot be read. Ask the advisor to state existing life/CI cover rather than assuming there is none.` };
      }

      const key   = client.notionId;
      const cname = norm(client.name || ctx.clientName || '');

      const mine = all.filter(p =>
        (p.status || '').toLowerCase() === 'active' && p.clientNotionId === key);

      let sumLife = 0, sumCi = 0, maxMed: number | null = null;
      for (const p of mine) {
        const assured = norm(p.lifeAssured || '');
        // Blank life assured = can't tell; include it but say so. A DIFFERENT
        // name = cover on someone else; exclude and name it.
        if (assured && cname && assured !== cname) {
          excluded.push(`${p.policyName || 'policy'} (${p.insurer}) — life assured is ${p.lifeAssured}, not ${client?.name ?? 'this client'}`);
          continue;
        }
        sumLife += p.lifeCover || 0;
        sumCi   += p.ciCover   || 0;
        const lim = parseAnnualLimit(p.medicalClass || '');
        if (lim !== null) maxMed = maxMed === null ? lim : Math.max(maxMed, lim);
        else if ((p.medicalClass || '').trim() && (p.medicalClass || '').trim() !== '0') unknownMedical++;
        counted.push(`${p.policyName || 'policy'} (${p.insurer})${assured ? '' : ' — life assured blank on the record'}`);
      }

      if (life === null)    life = sumLife;
      if (ci === null)      ci = sumCi;
      if (medical === null) medical = maxMed;
      // Say which it is. "Nothing on record" and "nothing counted because every
      // policy is assured on someone else" look identical in the totals but mean
      // very different things to an advisor.
      source = mine.length === 0
        ? `${client.name} has NO active policies on record — the zero below is a genuine absence of records, not a failed lookup`
        : `${counted.length} of ${mine.length} active polic${mine.length === 1 ? 'y' : 'ies'} on record for ${client.name}`;
    } catch {
      return { ok: false, error: 'Could not read the policies. Say so plainly rather than estimating the gap.' };
    }
  }

  if (life === null || ci === null) {
    return { ok: false, error: 'No client is selected and existing cover was not supplied. Ask the advisor for existing life and CI cover (0 if none).' };
  }

  const reqLife = annualIncome * GAP_BENCHMARK.lifeMultiple;
  const reqCi   = annualIncome * GAP_BENCHMARK.ciMultiple;
  const floor   = GAP_BENCHMARK.medicalAnnualLimitFloor;

  const medExisting: number | 'unlimited' | null =
    medical === null ? null : (medical === Infinity ? 'unlimited' : medical);

  return {
    ok: true,
    benchmark: `life ${GAP_BENCHMARK.lifeMultiple}x annual income, CI ${GAP_BENCHMARK.ciMultiple}x annual income, medical at least RM${floor.toLocaleString()} annual limit`,
    annualIncome,
    source,
    life: { required: reqLife, existing: life, gap: Math.max(0, reqLife - life) },
    ci:   { required: reqCi,   existing: ci,   gap: Math.max(0, reqCi - ci) },
    medical: {
      floor,
      existing: medExisting,
      meetsFloor: medExisting === null ? null : (medExisting === 'unlimited' || medExisting >= floor),
      note: medExisting === null
        ? (unknownMedical > 0
            ? `${unknownMedical} medical policy(ies) on record state no annual limit — the limit could NOT be determined. Tell the advisor to verify it rather than treating it as a gap or as adequate.`
            : 'No medical cover found on record.')
        : undefined,
    },
    countedPolicies: counted,
    excludedPolicies: excluded,
    caution: 'Figures come from the records as captured. The advisor should sanity-check against the actual policy documents before advising the client.',
  };
}

/** Dispatch a model-requested tool call. Returns null for an unknown tool. */
export const COI_TOOL: FunctionDeclaration = {
  name: 'compare_medical_coi',
  description:
    'Compare the medical-card cost of insurance (COI) CURVES of AIA, Great Eastern, Allianz, HLA and Prudential: how high the COI is, how fast it rises with age, which one spikes, and what it costs by age 80. ' +
    'Call this when the advisor asks about COI, how fast cost rises, premium sustainability at 80, repricing risk, or which medical card gets expensive. ' +
    'Do NOT call it until you know age, gender and smoker status. Never state a COI figure the tool did not return.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      age:    { type: SchemaType.INTEGER, description: 'Age next birthday of the life assured, 1-79.' },
      gender: { type: SchemaType.STRING, format: 'enum', description: "'M' or 'F'.", enum: ['M', 'F'] },
      smoker: { type: SchemaType.BOOLEAN, description: 'True if the life assured smokes. Never guess it.' },
    },
    required: ['age', 'gender', 'smoker'],
  },
};

export async function runAssistantTool(
  call: FunctionCall,
  ctx: { config: AdvisorConfig; clientId?: string; clientName?: string },
): Promise<object | null> {
  if (call.name === 'compare_premiums') {
    return runPremiumComparison((call.args ?? {}) as Record<string, unknown>);
  }
  if (call.name === 'compare_medical_coi') {
    return compareMedicalCoi((call.args ?? {}) as Record<string, unknown>);
  }
  if (call.name === 'analyse_coverage_gap') {
    return runCoverageGap((call.args ?? {}) as Record<string, unknown>, ctx);
  }
  return null;
}

/** Prompt rules for the gap tool. */

export const GAP_TOOL_RULES = `COVERAGE GAP ("is that enough?", "what's lacking?", "is this client underinsured?"):
- Use the analyse_coverage_gap tool. NEVER work the shortfall out yourself, and never state a benchmark figure the tool did not return.
- The firm's benchmark is life ${GAP_BENCHMARK.lifeMultiple}x annual income, CI ${GAP_BENCHMARK.ciMultiple}x annual income, and medical of at least RM1,000,000 annual limit.
- ANNUAL INCOME IS ALMOST NEVER ON FILE (only a handful of client records have it). Ask the advisor for it before calling the tool. If they give a monthly figure, multiply by 12. Never guess income, and never infer it from AUM.
- For a prospect with no record, ask for their existing life/CI cover too and pass it (0 if they have none).
- Report each line as: required vs existing vs shortfall. If a shortfall is zero, say that line is adequately covered rather than inventing a concern.
- MEDICAL: if the tool returns meetsFloor: null, the annual limit could NOT be determined from the records — say so and tell the advisor to verify. Do NOT treat an unknown limit as either a gap or as adequate.
- If "excludedPolicies" is non-empty, list what was excluded and why (cover assured on someone else). The advisor may know better — invite them to correct it.
- If a counted policy says the life assured is blank on the record, mention it: the total may include cover that isn't actually on this person.
- End with the tool's caution. This informs the advisor's recommendation; it is not advice to the client, and it is not a substitute for reading the policy documents.`;

/** Prompt rules governing how the premium tool may be used and reported. */
export const PREMIUM_TOOL_RULES = `PREMIUM COMPARISONS (compare_premiums tool):
- The advisor's client records do NOT store gender, smoker status or marital status. You must ASK for whatever you don't have. Never assume a client's gender, and never guess smoker status — it changes the premium a lot.
- Before calling the tool you need: age (use the client's date of birth if a client is selected), gender and smoker status. Ask for the missing ones in ONE short message, then wait. NEVER assume gender or smoker status.
- ⚠️ NEVER ASK FOR A SUM ASSURED. "36 CI" / "36 critical illness" is the name of the firm's CI package (36 conditions), NOT an amount. If the advisor states no sum assured, do NOT ask — call the tool with lifeSA and ciSA omitted so the firm's STANDARD PACKAGE applies (Life RM100k, 36CI critical illness RM100k, waiver of premium, medical Room & Board RM200). If the tool reports standardPackageApplied, say so in one line ("Standard package applied: …") and invite the advisor to give different sums assured. If the advisor states only one of the two, use their figure and the standard for the other, and say so. Never invent a sum assured yourself.
- SHOW ALL INSURERS: the firm shortlists all five. Present every quote the tool returned as a table (company, plan, monthly, annual), cheapest first. State that each premium is the level premium priced to stay sustainable to age 80, and that it can be lower if the sustainability age is set lower (e.g. 60 or 70) depending on the insurer's availability - give no figure for that, the engine does not price it. The engine prices a sum assured, not the number of covered illnesses, so do not claim any insurer's plan covers 36 conditions.
- EVERY premium figure you give must come from the tool's output. Never compute, adjust, interpolate, inflate or "roughly estimate" a premium yourself, and never reuse a figure from an earlier question with different inputs. If the tool is unavailable or errors, say so and point the advisor at the Premium Calculator page — do NOT answer from memory.
- Present the result as a short comparison, cheapest first, with monthly (and annual) figures. State the basis line returned by the tool.
- A quote flagged verified:true is a confirmed official quotation — label it as such. Everything else is an ESTIMATE, never a quotation; include the tool's disclaimer, and carry each insurer's own caveat when you mention that insurer.
- If the tool returns anything in "excluded", say which insurers were excluded and why. Never quietly drop them from the comparison.
- The comparison informs the advisor's recommendation; the advisor decides and must confirm figures with the insurer before issue. Never address the end client.`;

export const COI_TOOL_RULES = `MEDICAL COI COMPARISON (compare_medical_coi tool). This is how the firm judges a medical policy: lowest COI across the age range, the slower rise, and sustainability at age 80.
- Need age, gender and smoker status; ask for what is missing in one short message. Never assume them. COI differs a lot by gender.
- Build the answer from the tool's "findings" sentences: quote them as written; never recompute, merge or re-attribute a percentage (a spike is ONE year's step-up at ONE age - never say "between ages 65 and 70"). A low rise multiple on an already-high COI is not "gradual" or cheap: always lead with the absolute level. Every COI figure must come from the tool. Present, from the result: (1) who is cheapest at age 80 and cumulatively to 80, (2) who rises most slowly, (3) WHICH insurer spikes and at what age (biggestJump), (4) a compact table of annual COI at the checkpoint ages.
- Say plainly that COI is only one lens: the medical benefit (annual limit, room & board, co-insurance) is compared FIRST. Mention each insurer's caveat, especially extrapolated ages and that Prudential is non-smoker only.
- Describe what the numbers show; do not say a company is "bad". Never address the end client.`;

