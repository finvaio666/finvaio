/**
 * Guards lib/lsaCalculator.ts against the failure modes that actually bit us when
 * the estimator moved from linear to log-linear interpolation (2026-08-04):
 *
 *   1. Grid ages must reproduce the insurers' official quoted premiums EXACTLY.
 *      Math.exp(Math.log(x)) drifts ~1 ULP and premiums round UP, so 470 became 471
 *      on 60 grid ages until endpoints were short-circuited.
 *   2. A missing neighbour must not blank out a grid age that IS quoted (GE M55S was
 *      returning null purely because GE M60S has not been run yet).
 *   3. The sum-assured exponents must still reproduce the real RM3m quotes. Moving
 *      the interpolation shifted Prudential's off-grid age-39 base, so its exponent
 *      had to be refitted 0.9864 -> 0.9904.
 *
 * Run: npx tsx scripts/test-lsa-calculator.ts
 */
import {
  estimate, LSA_DATA, LSA_INSURERS, type LsaInsurer, type Gender,
} from '../lib/lsaCalculator';

const AGES = [20, 25, 30, 35, 40, 45, 50, 55, 60];
const BASE = 1_000_000;
let failures = 0;

function fail(msg: string) {
  console.error(`  FAIL ${msg}`);
  failures++;
}

// 1 — every quoted grid point comes back verbatim
let points = 0;
for (const ins of LSA_INSURERS) {
  for (const g of ['M', 'F'] as Gender[]) {
    for (const smoker of [false, true]) {
      for (const age of AGES) {
        const rec = LSA_DATA[ins][`${g}${age}${smoker ? 'S' : 'N'}`];
        if (!rec) continue;
        points++;
        const r = estimate(ins, g, smoker, age, BASE);
        const label = `${ins} ${g}${age}${smoker ? 'S' : 'N'}`;
        if (r.monthly !== Math.ceil(rec[0])) {
          fail(`${label} monthly: got ${r.monthly}, quoted ${rec[0]}`);
        }
        if (r.outlay80 !== Math.round(rec[1])) {
          fail(`${label} outlay80: got ${r.outlay80}, expected ${Math.round(rec[1])}`);
        }
      }
    }
  }
}
console.log(`1. grid exactness — ${points} quoted points reproduced`);

// 2 — interpolated ages stay inside their bracket and at or below the old linear value
//     (the age/premium curve is convex, so linear always over-stated)
let violations = 0;
for (const ins of LSA_INSURERS) {
  for (const g of ['M', 'F'] as Gender[]) {
    for (const smoker of [false, true]) {
      const sm = smoker ? 'S' : 'N';
      for (let i = 0; i < AGES.length - 1; i++) {
        const v0 = LSA_DATA[ins][`${g}${AGES[i]}${sm}`];
        const v1 = LSA_DATA[ins][`${g}${AGES[i + 1]}${sm}`];
        if (!v0 || !v1) continue;
        for (let age = AGES[i] + 1; age < AGES[i + 1]; age++) {
          const got = estimate(ins, g, smoker, age, BASE).monthly!;
          const t = (age - AGES[i]) / (AGES[i + 1] - AGES[i]);
          const linear = Math.ceil(v0[0] + (v1[0] - v0[0]) * t);
          if (got > linear) { fail(`${ins} ${g}${age}${sm}: log ${got} exceeds linear ${linear}`); violations++; }
          if (got < Math.min(v0[0], v1[0]) - 1 || got > Math.max(v0[0], v1[0]) + 1) {
            fail(`${ins} ${g}${age}${sm}: ${got} outside bracket [${v0[0]}, ${v1[0]}]`);
            violations++;
          }
        }
      }
    }
  }
}
console.log(`2. convexity + bracketing — ${violations} violations`);

// 3 — a quoted age must survive a missing neighbour
const m55s = estimate('GE', 'M', true, 55, BASE);
if (m55s.monthly == null) fail('GE M55S is a published rate but returned no quote');
const m58s = estimate('GE', 'M', true, 58, BASE);
if (m58s.monthly != null) fail('GE M58S cannot be interpolated (M60S missing) but returned a value');
console.log(`3. missing-neighbour handling — GE M55S = ${m55s.monthly}, GE M58S = ${m58s.monthly ?? 'null'}`);

// 4 — sum-assured exponents still hit the real RM3,000,000 quotes.
//     NOTE the age basis: Prudential prices on age NEXT birthday, so its "ANB 40"
//     illustration belongs to a true age-39 client.
const anchors: Array<[LsaInsurer, number, number]> = [
  ['Allianz', 40, 2498],
  ['HLA', 40, 1600],
  ['Prudential', 39, 1673],
];
for (const [ins, age, quoted] of anchors) {
  const got = estimate(ins, 'M', false, age, 3_000_000).monthly!;
  if (got !== quoted) fail(`${ins} M${age} RM3m: got ${got}, real quote ${quoted}`);
}
console.log(`4. sum-assured anchors — ${anchors.length} real RM3m quotes reproduced`);

console.log(failures === 0 ? '\nPASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
