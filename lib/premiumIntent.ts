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

/** The block handed to the model in place of a tool call. */
export function formatPrecomputedQuote(result: PremiumToolResult): string {
  return [
    '\n# PRE-COMPUTED PREMIUM COMPARISON (run by the pricing engine before this answer — authoritative)',
    'The advisor asked for a premium. Present THIS result; do not call any tool, do not ask for a sum assured, and do not alter any figure.',
    JSON.stringify(result),
  ].join('\n');
}
