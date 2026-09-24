/**
 * Guards lib/pruModel.ts, the Prudential premium model reverse-engineered from the
 * Sep-2026 sales illustrations (Insurance_Quotations/PRU/_pru_model.py).
 *
 *   1. The TS port must reproduce the Python model's break-even premiums (reference cases
 *      written by _gen_pru_ts.py) — any drift means the two implementations disagree.
 *   2. Premiums must rise with age, with the sum-assured band, and with the term.
 *
 * The reference file lives next to the (gitignored) quotations; the parity check is
 * skipped when it is absent.
 *
 * Run: npx tsx scripts/test-pru-model.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pwePremium, pwypPremium, type PruGender, type PwePay, type PwypCi, type PwypMed } from '../lib/pruModel';

let failures = 0;
function fail(msg: string) {
  console.error(`  FAIL ${msg}`);
  failures++;
}

// 1 — parity with the Python model
const REF = join(__dirname, '..', 'Insurance_Quotations', 'PRU', '_pru_ref.json');
if (existsSync(REF)) {
  type Ref =
    | { kind: 'PWE'; g: PruGender; anb: number; sa: number; term: number; pay: PwePay; be: number }
    | { kind: 'PWYP'; g: PruGender; anb: number; life: number; rider: string; riderSa: number | null; be: number };
  const cases: Ref[] = JSON.parse(readFileSync(REF, 'utf8'));
  let worst = 0;
  for (const c of cases) {
    const got = c.kind === 'PWE'
      ? pwePremium(c.g, c.anb - 1, c.sa, c.term, c.pay)?.breakEven
      : pwypPremium({
        gender: c.g, age: c.anb - 1, lifeSA: c.life,
        ci: c.riderSa ? { type: c.rider as PwypCi, sa: c.riderSa } : null,
        med: c.riderSa ? null : (c.rider as PwypMed),
      })?.breakEven;
    const d = got == null ? Infinity : Math.abs(got - c.be);
    worst = Math.max(worst, d);
    if (d > 0.05) fail(`${JSON.stringify(c)} -> TS ${got}`);
  }
  console.log(`parity: ${cases.length} reference cases, worst |TS - Python| = RM${worst.toFixed(4)}`);
} else {
  console.log('parity: reference file absent, skipped');
}

// 2 — monotonicity
for (const g of ['M', 'F'] as PruGender[]) {
  let prev = 0;
  for (let age = 0; age <= 54; age += 3) {
    const p = pwePremium(g, age, 1_000_000, 80)!.monthly;
    if (p < prev) fail(`PWE ${g} to-80 falls with age at ${age}: ${prev} -> ${p}`);
    prev = p;
  }
  for (const age of [20, 35, 50]) {
    const a = pwePremium(g, age, 300_000, 80)!.monthly;
    const b = pwePremium(g, age, 1_000_000, 80)!.monthly;
    const c = pwePremium(g, age, 1_000_000, 101)!.monthly;
    if (!(a < b)) fail(`PWE ${g}${age}: RM300k ${a} !< RM1m ${b}`);
    if (!(b < c)) fail(`PWE ${g}${age}: to-80 ${b} !< to-101 ${c}`);
    const s = pwePremium(g, age, 1_000_000, 80, 'full', true)!.monthly;
    if (!(s > b)) fail(`PWE ${g}${age}: smoker ${s} !> non-smoker ${b}`);
  }
  // limited pay: higher monthly, fewer years -> the shorter the payment term, the higher
  // the monthly and the lower the total premium paid
  for (const age of [25, 40]) {
    const years = 80 - (age + 1);
    let lastMonthly = 0;
    let lastTotal = Infinity;
    for (const pay of ['full', 20, 10, 5] as PwePay[]) {
      const m = pwePremium(g, age, 1_000_000, 80, pay)!.monthly;
      const total = m * 12 * (pay === 'full' ? years : pay);
      if (!(m > lastMonthly)) fail(`PWE ${g}${age} ${pay} Pay monthly ${m} !> previous ${lastMonthly}`);
      if (!(total < lastTotal)) fail(`PWE ${g}${age} ${pay} Pay total ${total} !< previous ${lastTotal}`);
      lastMonthly = m;
      lastTotal = total;
    }
  }
  prev = 0;
  for (let age = 0; age <= 60; age += 5) {
    const p = pwypPremium({ gender: g, age, lifeSA: 300_000, ci: { type: 'Critical Care', sa: 300_000 } })!.monthly;
    if (p < prev) fail(`PWYP ${g} CC falls with age at ${age}: ${prev} -> ${p}`);
    prev = p;
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall Prudential model checks passed');
process.exit(failures ? 1 : 0);
