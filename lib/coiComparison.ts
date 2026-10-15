/**
 * lib/coiComparison.ts
 * Compares the medical-card cost of insurance (COI) curves of the five insurers
 * the pricing engine covers: how high, how fast it rises, what it costs by 80.
 * The firm's own way of judging a medical policy (Sky, 2026-10): lowest COI
 * across the age range, slower rise, and premium sustainability at age 80.
 * Pure + synchronous - the figures are the same tables the premium engine uses.
 */

import { INSURERS, PRODUCT_NAME, medicalCoiAnnual, medicalCoiLastQuotedAge, type Gender, type Insurer } from './insuranceCalculator';

const END_AGE = 80;
const CHECKPOINTS = [50, 55, 60, 65, 70, 75, 80];

export interface CoiRow {
  insurer: Insurer;
  product: string;
  /** Annual medical COI (RM) at the starting age and at each checkpoint age. */
  startAnnual: number;
  atAge: { age: number; annual: number; monthly: number }[];
  /** Sum of annual COI from the starting age to 80 (RM). */
  totalToAge80: number;
  /** COI at 80 divided by COI at the starting age. */
  riseMultiple: number;
  /** The largest one-year jump (percent) and the age it happens at. */
  biggestJump: { age: number; fromAnnual: number; toAnnual: number; pct: number };
  /** Table is quoted only to this age; later ages are extrapolated (wider uncertainty). */
  quotedToAge: number | null;
  extrapolatedAfterQuoted: boolean;
}

export interface CoiComparison {
  ok: boolean;
  error?: string;
  basis?: string;
  inputs?: { startAge: number; gender: string; smoker: boolean };
  rows?: CoiRow[];
  /** Insurer names ordered best to worst on each lens the firm judges by. */
  rankings?: { lowestAt80: string[]; lowestTotalToAge80: string[]; slowestRise: string[] };
  excluded?: { insurer: string; reason: string }[];
  /** Plain-language findings written in code. Quote these; do not recompute or restate them differently. */
  findings?: string[];
  caveats?: string[];
}

const r0 = (n: number) => Math.round(n);

export function compareMedicalCoi(args: Record<string, unknown>): CoiComparison {
  const age = Number(args.age);
  const gender = String(args.gender ?? '').toUpperCase() as Gender;
  const smoker = Boolean(args.smoker);
  if (!Number.isFinite(age) || age < 1 || age >= END_AGE) {
    return { ok: false, error: `Age ${args.age} is outside the supported range (1-79). Tell the advisor; do not estimate.` };
  }
  if (gender !== 'M' && gender !== 'F') return { ok: false, error: 'Gender must be M or F. Ask the advisor.' };

  const start = age + 1; // first policy year is priced at age next birthday, as in the premium engine
  const rows: CoiRow[] = [];
  const excluded: { insurer: string; reason: string }[] = [];

  for (const ins of INSURERS) {
    const curve: { age: number; annual: number }[] = [];
    for (let a = start; a <= END_AGE; a++) {
      const v = medicalCoiAnnual(ins, a, gender, smoker);
      if (v === null || !Number.isFinite(v)) break;
      curve.push({ age: a, annual: v });
    }
    if (curve.length === 0) {
      excluded.push({ insurer: ins, reason: ins === 'Prudential' && smoker ? 'Prudential is modelled on non-smokers only.' : 'No medical COI table for this profile.' });
      continue;
    }
    let jump = { age: curve[0].age, fromAnnual: curve[0].annual, toAnnual: curve[0].annual, pct: 0 };
    for (let i = 1; i < curve.length; i++) {
      const pct = curve[i - 1].annual > 0 ? (curve[i].annual / curve[i - 1].annual - 1) * 100 : 0;
      if (pct > jump.pct) jump = { age: curve[i].age, fromAnnual: r0(curve[i - 1].annual), toAnnual: r0(curve[i].annual), pct: Math.round(pct * 10) / 10 };
    }
    const quoted = medicalCoiLastQuotedAge(ins, gender, smoker);
    const last = curve[curve.length - 1];
    rows.push({
      insurer: ins,
      product: PRODUCT_NAME[ins],
      startAnnual: r0(curve[0].annual),
      atAge: CHECKPOINTS.filter(c => c >= start && c <= last.age).map(c => {
        const annual = curve.find(p => p.age === c)!.annual;
        return { age: c, annual: r0(annual), monthly: r0(annual / 12) };
      }),
      totalToAge80: r0(curve.reduce((s, p) => s + p.annual, 0)),
      riseMultiple: Math.round((last.annual / curve[0].annual) * 10) / 10,
      biggestJump: jump,
      quotedToAge: quoted,
      extrapolatedAfterQuoted: quoted !== null && quoted < END_AGE,
    });
  }

  if (rows.length === 0) return { ok: false, error: 'No insurer could be compared for this profile.', excluded };

  const at80 = (r: CoiRow) => r.atAge.find(p => p.age === END_AGE)?.annual ?? Infinity;
  const rm = (n: number) => 'RM' + Math.round(n).toLocaleString('en-US');
  const byAt80 = [...rows].sort((a, b) => at80(a) - at80(b));
  const byStart = [...rows].sort((a, b) => a.startAnnual - b.startAnnual);
  const bySpike = [...rows].sort((a, b) => b.biggestJump.pct - a.biggestJump.pct);
  const findings = [
    `Lowest COI at age 80: ${byAt80.map(r => `${r.insurer} ${rm(at80(r))}/yr`).join(', ')} (cheapest first).`,
    `Lowest cumulative COI from age ${start} to 80: ${[...rows].sort((a, b) => a.totalToAge80 - b.totalToAge80).map(r => `${r.insurer} ${rm(r.totalToAge80)}`).join(', ')}.`,
    `COI at the starting age (${start}): ${byStart.map(r => `${r.insurer} ${rm(r.startAnnual)}/yr`).join(', ')} (cheapest first).`,
    `Single-year spikes (the largest one-year step-up for each insurer): ${bySpike.map(r => `${r.insurer} +${r.biggestJump.pct}% at age ${r.biggestJump.age} (${rm(r.biggestJump.fromAnnual)} to ${rm(r.biggestJump.toAnnual)})`).join('; ')}.`,
    `Rise multiple (COI at 80 divided by COI at ${start}): ${[...rows].sort((a, b) => a.riseMultiple - b.riseMultiple).map(r => `${r.insurer} ${r.riseMultiple}x`).join(', ')} (smallest first). A small multiple on an already high COI is NOT cheap - read it together with the absolute levels above.`,
  ];
  const order = (f: (r: CoiRow) => number) => [...rows].sort((a, b) => f(a) - f(b)).map(r => r.insurer);
  return {
    ok: true,
    basis: 'Annual medical-card COI per policy, Room & Board RM200 plan, from the pricing engine tables (attained age; first policy year priced at age next birthday).',
    inputs: { startAge: start, gender, smoker },
    rows,
    rankings: { lowestAt80: order(at80), lowestTotalToAge80: order(r => r.totalToAge80), slowestRise: order(r => r.riseMultiple) },
    excluded,
    findings,
    caveats: [
      'COI is only part of the picture: compare the medical benefit (annual limit, room & board, co-insurance) first.',
      'Plans are not identical across insurers; Prudential figures are PRUMillion Med 2.0 Plan 200 with RM500 deductible.',
      'These are reverse-engineered estimates, not official illustrations. Insurers can reprice; confirm against official illustrations.',
      ...rows.filter(r => r.extrapolatedAfterQuoted).map(r => `${r.insurer}: quoted only to age ${r.quotedToAge}; later ages are extrapolated.`),
    ],
  };
}
