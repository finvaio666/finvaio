/**
 * lib/premiumIntent.ts
 * Deterministic detection of "price this person" requests.
 *
 * Why this exists: left to the model alone, the same question ("45M non-smoker,
 * life + CI, what's the premium?") sometimes priced, sometimes asked for a sum
 * assured, and once was mistaken for a coverage-gap analysis and asked for
 * income. Whether a request is a quote is a parsing question, not a judgement
 * one — so it is answered here in code. When age, gender and smoker status are
 * all present, the engine is run BEFORE the model is called and the result is
 * handed over; the model only words the answer.
 */

import { runPremiumComparison, type PremiumToolResult } from './assistantContext';
import { INSURERS } from './insuranceCalculator';
import { MEDICAL_BENEFITS, MEDICAL_PLAN_LABEL } from './insuranceMedicalBenefits';

export interface QuoteRequest {
  age: number;
  gender: 'M' | 'F';
  smoker: boolean;
  lifeSA?: number;
  ciSA?: number;
}

const GAP_INTENT = /\b(enough|adequate|adequately|sufficient|lacking|shortfall|gap|under-?insured|over-?insured|benchmark|income|salary)\b|夠不夠|缺口/i;
const QUOTE_INTENT = /\b(insurance|insure|medical|life|critical|ci|premium|premiums|quote|quotation|cover|coverage|plan|ilp|protection)\b|保險|保費|醫療|重疾/i;

/** "45 years old", "45yo", "aged 45", "45-year-old", "age 45". */
export function parseAge(t: string): number | null {
  const m =
    t.match(/\b(\d{1,2})\s*(?:-|\s)?\s*(?:years?|yrs?|yo|y\/o)(?:\s*-?\s*old)?\b/i) ??
    t.match(/\b(?:aged?|age next birthday|anb)\s*[:=]?\s*(\d{1,2})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 75 ? n : null;
}

export function parseGender(t: string): 'M' | 'F' | null {
  const male   = /\b(male|man|gentleman|husband|father|he|his|him|mr)\b/i.test(t);
  const female = /\b(female|woman|lady|wife|mother|she|her|hers|mrs|ms|miss)\b/i.test(t);
  if (male === female) return null;            // neither, or contradictory — never guess
  return male ? 'M' : 'F';
}

export function parseSmoker(t: string): boolean | null {
  if (/\bnon[\s-]?smok(?:er|ing)s?\b|\bdoes(?:n'?t| not) smoke\b|\bdon'?t smoke\b|\bnever smok(?:ed|es)\b|\bnot a smoker\b|不吸煙|不抽煙/i.test(t)) return false;
  if (/\bsmok(?:er|ers|es|ing)\b|吸煙|抽煙/i.test(t)) return true;
  return null;
}

/** An amount only counts when it is unmistakably money: RM-prefixed, k/m-suffixed or 5+ digits.
 *  A bare "36" in "36 critical illness" is a product name, never a sum assured. */
function parseMoney(raw: string): number | null {
  const m = raw.match(/(rm\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|m|million)?\b/i);
  if (!m) return null;
  let n = Number(m[2].replace(/,/g, ''));
  if (m[3]) n *= /^k$/i.test(m[3]) ? 1_000 : 1_000_000;
  const unmistakable = Boolean(m[1]) || Boolean(m[3]) || n >= 10_000;
  return unmistakable && n >= 10_000 ? n : null;
}

export function parseSumAssured(t: string): { lifeSA?: number; ciSA?: number } {
  const out: { lifeSA?: number; ciSA?: number } = {};
  // "life 500k", "life cover of RM500,000", "500k life"
  const life = t.match(/\blife(?:\s+(?:cover|insurance|sum assured|sa))?\s*(?:of|at|:|=)?\s*((?:rm\s*)?\d[\d,.]*\s*(?:k|m|million)?)/i)
            ?? t.match(/((?:rm\s*)?\d[\d,.]*\s*(?:k|m|million)?)\s*(?:of\s+)?life\b/i);
  const ci   = t.match(/\b(?:critical illness|critical|ci)(?:\s+(?:cover|sum assured|sa))?\s*(?:of|at|:|=)?\s*((?:rm\s*)?\d[\d,.]*\s*(?:k|m|million)?)/i)
            ?? t.match(/((?:rm\s*)?\d[\d,.]*\s*(?:k|m|million)?)\s*(?:of\s+)?(?:critical illness|ci)\b/i);
  const l = life ? parseMoney(life[1]) : null;
  const c = ci ? parseMoney(ci[1]) : null;
  if (l) out.lifeSA = l;
  if (c) out.ciSA = c;
  return out;
}

/**
 * Is this conversation a complete, unambiguous request to price a person?
 * `userTexts` are the user's messages oldest→newest, so a follow-up like
 * "male, non-smoker" completes an earlier "45 years old, need life + CI".
 * Returns null whenever anything is missing or the latest message is a gap
 * analysis ("is that enough?") — those stay with the model and its tools.
 */
export function detectQuoteRequest(userTexts: string[]): QuoteRequest | null {
  const last = userTexts[userTexts.length - 1] ?? '';
  if (GAP_INTENT.test(last)) return null;
  const all = userTexts.join(' \n ');
  if (!QUOTE_INTENT.test(all)) return null;

  const age = parseAge(all), gender = parseGender(all), smoker = parseSmoker(all);
  if (age === null || gender === null || smoker === null) return null;
  return { age, gender, smoker, ...parseSumAssured(all) };
}

/** Run the engine for a detected request. The standard package fills any absent sum assured. */
export function priceDetectedRequest(req: QuoteRequest): PremiumToolResult {
  return runPremiumComparison({ ...req });
}

/** Per-insurer notes the firm wants an FA to see next to the numbers. Written in code, in diplomatic wording. */
const INSURER_NOTES: Record<string, string> = {
  GE: 'Not among the firm\'s recommended choices: the claim procedure can involve more steps than at other insurers, and servicing support for FAs is slower. Confirm the details with the firm before proposing.',
  AIA: 'Strong benefits, but servicing support for FAs is slower, which matters for a medical card because claims are frequent. If the client insists on AIA, set the expectation early that servicing may take a little longer.',
};

/** Cost-sharing, annual limit and coverage age per insurer, read from the firm's medical benefit schedule. */
function costSharingLines(): string[] {
  const basics = MEDICAL_BENEFITS.find(s => s.section === 'Plan basics')?.rows ?? [];
  const row = (name: string) => basics.find(r => r.benefit === name);
  const cs = row('Cost-sharing'), lim = row('Overall annual limit'), to = row('Medical coverage to');
  if (!cs) return [];
  return INSURERS.map(i => {
    const k = i as keyof typeof cs;
    return `${i} (${MEDICAL_PLAN_LABEL[i]}): cost-sharing = ${cs[k]}; annual limit = ${lim?.[k] ?? 'n/a'}; medical cover to = ${to?.[k] ?? 'n/a'}`;
  });
}

/** The block handed to the model in place of a tool call. */
export function formatPrecomputedQuote(result: PremiumToolResult): string {
  const notes = (result.quotes ?? []).map(q => INSURER_NOTES[q.insurer] ? `${q.insurer}: ${INSURER_NOTES[q.insurer]}` : '').filter(Boolean);
  return [
    '\n# PRE-COMPUTED PREMIUM COMPARISON (run by the pricing engine before this answer — authoritative)',
    'The advisor asked for a premium. Present THIS result first, listing ALL insurers returned (the firm shortlists all five); do not call any tool, do not ask for a sum assured, and do not alter any figure.',
    'State the sustainability basis next to the table so nobody is confused: each premium is the level premium priced so the policy stays sustainable to age 80 (the engine illustrates to age 80). Then tell the FA that the premium can be lower if the sustainability age is set lower, e.g. to age 60 or 70, depending on what each insurer offers; do NOT quote a number for that, because the engine does not price it.',
    'Add the insurer notes below right after the table, in a diplomatic tone. Explain briefly why GE is not recommended using only the GE note (never criticise an insurer beyond it).',
    ...(notes.length ? ['INSURER NOTES (use as written, do not sharpen):', ...notes] : []),
    'COST-SHARING BY INSURER (from the firm\'s medical benefit schedule, Plan 200). Show the FA a small table of cost-sharing, annual limit and cover-to age for ALL insurers, and tell them to confirm against the policy wording. Report it exactly as listed; never assume one insurer\'s percentage or cap applies to another:',
    ...costSharingLines(),
    'THEN act as the firm\'s senior advisor, not a generic assistant: if the "FIRM KNOWLEDGE BASE" section above has guidance that fits this request (how to judge a medical card, what to check before recommending, which insurers the firm considers first), apply it and attribute it to the firm\'s experience ("our approach: …"); never name a person. Warn that cost-sharing is the item new FAs most often forget to explain to the client, and offer the medical COI comparison (how fast each insurer\'s cost rises, cost at age 80). Do not fall back on a generic financial-planning checklist when firm guidance exists.',
    JSON.stringify(result),
  ].join('\n');
}

// ── COI-curve comparison ──────────────────────────────────────────────────────
const COI_INTENT = /\b(coi|cost of insurance|spikes?|spiking|sustainab\w*|repric\w*|premium (?:increase|adjust\w*)|rises? (?:faster|slower|quickly))\b/i;

export interface CoiRequest { age: number; gender: 'M' | 'F'; smoker: boolean }

/** A complete "compare COI curves for this person" request - same rule as quotes: parsed in code. */
export function detectCoiRequest(userTexts: string[]): CoiRequest | null {
  const all = userTexts.join(' \n ');
  if (!COI_INTENT.test(all)) return null;
  const age = parseAge(all), gender = parseGender(all), smoker = parseSmoker(all);
  if (age === null || gender === null || smoker === null || age >= 80) return null;
  return { age, gender, smoker };
}

export function formatPrecomputedCoi(result: unknown): string {
  return [
    '\n# PRE-COMPUTED MEDICAL COI COMPARISON (run by the pricing engine before this answer - authoritative)',
    'The advisor asked about COI. Present THIS result following the COI rules; do not call any tool and do not alter any figure.',
    JSON.stringify(result),
  ].join('\n');
}
