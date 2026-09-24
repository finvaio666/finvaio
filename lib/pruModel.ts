// Prudential premium model — reverse-engineered from 652 Prudential sales illustrations
// (SQSOnline ver 8.7, Aug–Sep 2026). Mirrors Insurance_Quotations/PRU/_pru_model.py; the
// rate tables live in the generated lib/pruRates.ts.
//
// THE FORMULA. Both products are regular-premium ILPs projected monthly:
//     AV += premium x allocation(policy year)     then  AV -= RM5 service charge
//     AV -= rate(ANB on that date) x base / 1000 / 12
//     AV *= (1 + 5% x (1 - 8% tax) - 1.3% FMC) ^ (1/12)        [scenario Y = 3.3% net]
// ANB steps up on the BIRTHDAY, not the policy anniversary, so each policy year blends two
// attained-age rates; for an estimate we assume the birthday falls half-way through it.
//   PRUWealth Enrich 2.0 (PWE):  base = SA - AV   (death benefit = higher of SA or units)
//                                + Loyalty Bonus 5% SA at ANB 65 and every 10 yrs to the
//                                  end of term, Loyalty Booster 10% SA at the end of term.
//   PRUWith You Plus (PWYP):     base = SA         (death benefit = SA + units), riders add
//                                  their own SA-based (CI) or flat (medical) charges.
// Break-even premium = the smallest level premium keeping AV >= 0 to the end of the term
// (PWYP may lean on the 72-month No-Lapse Provision, as its juvenile SIs do; PWE may not).
// A real illustration sits above break-even - agents round up (PWE to ANB 80: +1.8% F,
// +4.0% M; to ANB 101: +4.1% F, +7.8% M; PWYP ~+1.1%) - so the estimate is break-even x
// that loading, rounded up, floored at Prudential's minimum premium.
//
// Accuracy (Python model vs the 652 SIs): the rate tables reproduce every printed yearly
// insurance charge to ~RM1; PWE lapse ages match the SI exactly or within a year for 95% of
// quotes; PWYP premiums land within ~0.8% (1 s.d.) after loading. FIGURES ARE ESTIMATES.

import { PWE_RATES, PWYP_BASIC_RATES, PWYP_RIDER_RATES, PWE_LOAD, PWYP_LOAD, PRU_SMOKER_RATIO } from './pruRates';

export type PruGender = 'M' | 'F';
export type PwePay = 'full' | 5 | 10 | 20;

const I_Y = 0.05;
const TAX = 0.08;
const FMC = 0.013;
const SVC = 5;
const GROW = Math.pow(1 + I_Y * (1 - TAX) - FMC, 1 / 12);
const NO_LAPSE_MONTHS = 72;
const BIRTHDAY_MONTH = 6; // estimate convention: ANB steps up after 6 months of each policy year

export const PWE_MIN_PREMIUM = 100;   // lowest monthly premium seen on any PWE illustration
export const PWYP_MIN_PREMIUM = 125;  // PRUWith You Plus floor (many young-age quotes sit on it)

/** Rate lookup by ANB; flat below the table, log-linear extrapolation above it (as the Python Table). */
function rateAt(tbl: number[], anb: number): number {
  if (anb < 1) return tbl[0];
  if (anb <= tbl.length) return tbl[anb - 1];
  const x2 = tbl.length;
  const y1 = tbl[x2 - 2];
  const y2 = tbl[x2 - 1];
  if (y1 > 0 && y2 > 0) return y2 * Math.pow(y2 / y1, anb - x2);
  return y2;
}

function anbsFor(anb: number, year: number): number[] {
  const a = anb + year - 1;
  return Array.from({ length: 12 }, (_, m) => (m >= BIRTHDAY_MONTH ? a + 1 : a));
}

function solve(sustains: (p: number) => boolean): number {
  let lo = 0;
  let hi = 60000;
  for (let i = 0; i < 45; i++) {
    const mid = (lo + hi) / 2;
    if (sustains(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ── PRUWealth Enrich 2.0 ──────────────────────────────────────────────────────

// Allocation of the BASIC premium by payment term; premium above the basic cap goes to
// PRUAllocator at 95%. Full Pay and 20 Pay share a schedule.
const PWE_ALLOC: Record<string, number[]> = {
  full: [60, 60, 60, 80, 80, 80, 95],
  20: [60, 60, 60, 80, 80, 80, 95],
  10: [60, 70, 80, 95, 95],
  5: [70, 80],
};
const ALLOCATOR_PCT = 0.95;

function pweAlloc(pay: PwePay, year: number): number {
  const s = PWE_ALLOC[String(pay)];
  return (year <= s.length ? s[year - 1] : 100) / 100;
}

/** Minimum SA as a multiple of the annual basic premium (caps the basic premium). */
function pweSaMultiple(anb: number): number {
  return anb <= 35 ? 50 : anb <= 45 ? 35 : anb <= 55 ? 25 : 15;
}

// Rates differ by SA band. Band edges between the quoted RM300k / 500k / 1m are not in
// the data; midpoints are assumed. SA >= RM2m has no quotes yet and uses the RM1m rates.
function pweBand(sa: number): string {
  return sa < 400_000 ? '300k' : sa < 750_000 ? '500k' : '1m+';
}

function pweBonuses(anb: number, termAnb: number, sa: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let a = 65; a <= termAnb; a += 10) {
    const y = a - anb;
    if (y >= 1) out.set(y, (out.get(y) ?? 0) + 0.05 * sa);
  }
  const y = termAnb - anb;
  out.set(y, (out.get(y) ?? 0) + 0.1 * sa);
  return out;
}

/**
 * True if the PWE policy stays in force (scenario Y) to the end of the term. For pricing
 * the account must never go negative: leaning on the 72-month No-Lapse Provision lets a
 * late entrant (ANB 55+ to 80) run a deficit until the age-65 Loyalty Bonus bails it
 * out, which makes the premium FALL with age - an artefact, not a price.
 */
function pweSustains(P: number, g: PruGender, anb: number, sa: number, termAnb: number, pay: PwePay): boolean {
  const tbl = PWE_RATES[`${g}|${pweBand(sa)}`];
  const term = termAnb - anb;
  const ppp = pay === 'full' ? term : pay;
  const cap = sa / pweSaMultiple(anb) / 12;
  const basicP = Math.min(P, cap);
  const allocP = P - basicP;
  const bonus = pweBonuses(anb, termAnb, sa);
  let av = 0;
  for (let y = 1; y <= term; y++) {
    const anbs = anbsFor(anb, y);
    for (let m = 0; m < 12; m++) {
      if (y <= ppp) av += basicP * pweAlloc(pay, y) + allocP * ALLOCATOR_PCT;
      av -= SVC + (rateAt(tbl, anbs[m]) * Math.max(sa - Math.max(av, 0), 0)) / 1000 / 12;
      if (av < 0) return false;
      if (av > 0) av *= GROW;
    }
    av += bonus.get(y) ?? 0;
  }
  return true;
}

export interface PruEstimate {
  monthly: number;     // estimated illustration premium (RM, rounded up)
  breakEven: number;   // model minimum premium before the illustration loading
  smokerAdjusted: boolean;
}

/**
 * PRUWealth Enrich 2.0 monthly premium.
 * @param age      age LAST birthday (Prudential quotes on ANB = age + 1)
 * @param termAnb  80 (to-80), 101 (to-100 / "Age 100" quotes), 70 (modelled)
 */
export function pwePremium(
  g: PruGender, age: number, sa: number, termAnb: number, pay: PwePay = 'full', smoker = false,
): PruEstimate | null {
  const anb = age + 1;
  if (anb < 1 || anb >= termAnb) return null;
  const be = solve((p) => pweSustains(p, g, anb, sa, termAnb, pay));
  const load = PWE_LOAD[`${g}|${termAnb === 101 ? 101 : 80}`];
  let monthly = Math.max(PWE_MIN_PREMIUM, Math.ceil(be * load));
  if (smoker) monthly = Math.ceil(monthly * smokerRatio(g, age));
  return { monthly, breakEven: be, smokerAdjusted: smoker };
}

/**
 * The Sep-2026 SIs are all non-smoker. Smoker premiums scale by the S/N ratio of the
 * July-2026 PRUWealth Enrich grid (RM1m, to 80, ages 20-60), interpolated by age.
 */
export function smokerRatio(g: PruGender, age: number): number {
  const t = PRU_SMOKER_RATIO[g];
  const ks = Object.keys(t).map(Number).sort((a, b) => a - b);
  const a = Math.max(ks[0], Math.min(ks[ks.length - 1], age));
  const lo = Math.max(...ks.filter((k) => k <= a));
  const hi = Math.min(...ks.filter((k) => k >= a));
  if (lo === hi) return t[lo];
  return t[lo] + ((t[hi] - t[lo]) * (a - lo)) / (hi - lo);
}

// ── PRUWith You Plus + riders ─────────────────────────────────────────────────

export type PwypCi = 'Critical Care' | 'Critical Care Plus' | 'Total Multi Crisis Care';
export type PwypMed =
  | 'PRUMillion Med 2.0'
  | 'PRUMillion Med 2.0 + PRUMillion Med Booster 3.0'
  | 'PRUMillion Med Active 2.0'
  | 'PRUMillion Med Active 2.0 + Active Booster 2.0'
  | 'PRUValue Med'
  | 'PRUValue Med + PRUValue Med Booster';

const PWYP_ALLOC = [60, 60, 60, 80, 80, 80, 95, 95];

function pwypBand(sa: number): string {
  return sa < 50_000 ? '10k' : sa < 250_000 ? '100k' : '300k+';
}

export interface PwypInput {
  gender: PruGender;
  age: number;          // age last birthday
  lifeSA: number;
  ci?: { type: PwypCi; sa: number } | null;
  med?: PwypMed | null; // Plan 200 / RM500 deductible as illustrated
}

function pwypSustains(P: number, inp: PwypInput, anb: number): boolean {
  const g = inp.gender;
  const basic = PWYP_BASIC_RATES[`${g}|${pwypBand(inp.lifeSA)}`] ?? PWYP_BASIC_RATES[`${g}|100k`];
  const ci = inp.ci && inp.ci.sa > 0 ? PWYP_RIDER_RATES[`${inp.ci.type}|${g}|${inp.ci.sa < 250_000 ? '100k' : '300k+'}`] : null;
  const med = inp.med ? PWYP_RIDER_RATES[`${inp.med}|${g}|flat`] : null;
  // PRUMillion Med riders carry an extra RM3/month on top of the RM5 service charge
  const svc = SVC + (inp.med && inp.med.startsWith('PRUMillion Med') ? 3 : 0);
  const term = 80 - anb;
  let av = 0;
  let low = Infinity;
  for (let y = 1; y <= term; y++) {
    const anbs = anbsFor(anb, y);
    const alloc = (y <= PWYP_ALLOC.length ? PWYP_ALLOC[y - 1] : 100) / 100;
    for (let m = 0; m < 12; m++) {
      const a = anbs[m];
      av += P * alloc - svc;
      av -= (rateAt(basic, a) * inp.lifeSA) / 1000 / 12;
      if (ci) av -= (rateAt(ci, a) * inp.ci!.sa) / 1000 / 12;
      if (med) av -= rateAt(med, a) / 12;
      if (av > 0) av *= GROW;
      if ((y - 1) * 12 + m + 1 > NO_LAPSE_MONTHS) low = Math.min(low, av);
    }
  }
  return low >= 0;
}

/** PRUWith You Plus (+ CI / medical rider) monthly premium, coverage to ANB 80. */
export function pwypPremium(inp: PwypInput): PruEstimate | null {
  const anb = inp.age + 1;
  if (anb < 1 || anb >= 80 || !PWYP_BASIC_RATES[`${inp.gender}|100k`]) return null;
  if (inp.med && !PWYP_RIDER_RATES[`${inp.med}|${inp.gender}|flat`]) return null;
  const be = solve((p) => pwypSustains(p, inp, anb));
  const fam = inp.ci?.sa ? inp.ci.type : inp.med ? inp.med.split(' + ')[0] : 'default';
  const load = PWYP_LOAD[`${fam}|${inp.gender}`] ?? PWYP_LOAD.default;
  return { monthly: Math.max(PWYP_MIN_PREMIUM, Math.ceil(be * load)), breakEven: be, smokerAdjusted: false };
}
