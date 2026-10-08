/**
 * scripts/eval-assistant.ts
 * The house eval harness for Ask FINVA. Run it after ANY change to the system
 * prompt, the tools, or the model — it is what turns "standardised answers"
 * from a hope into something checkable.
 *
 *   npm run eval:assistant               # unit layer only — free, instant
 *   npm run eval:assistant -- --live     # + real questions through Gemini
 *   npm run eval:assistant -- --live --group gap
 *   npm run eval:assistant -- --live --base https://dev.finva.io
 *
 * Two layers:
 *   UNIT  pure functions (pricing match, gap maths, medical-limit parsing,
 *         intent routing). No network, no tokens, deterministic.
 *   LIVE  real questions through /api/ai, asserting on the answer. Costs
 *         tokens and is rate-limited, so it is opt-in and paced.
 *
 * LIVE needs a dev server running and AUTH_SECRET in the environment; it signs
 * its own session cookie like scripts/e2e-tasks-http.ts does. Exits non-zero
 * on any failure, so it can gate a deploy.
 */
import { SignJWT } from 'jose';
import { CASES, type EvalCase } from '../evals/assistant-cases';
import { parseAnnualLimit, runCoverageGap, matchHoldingNames, looksLikeTaskRequest, GAP_BENCHMARK } from '../lib/assistantContext';
import { estimateAll } from '../lib/insuranceCalculator';
import type { AdvisorConfig } from '../lib/getAdvisorConfig';

const argv = process.argv.slice(2);
/** Value after a flag, or undefined. (indexOf returns -1 when absent, and
 *  argv[-1 + 1] is argv[0] — which silently read the wrong argument.) */
const flagValue = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const LIVE     = argv.includes('--live');
const BASE     = (flagValue('--base') ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const GROUP    = flagValue('--group') ?? '';
// Each live case costs TWO Gemini calls (ask + tool result), so on the free
// tier's 5/min a tighter gap trips the quota and scores a rate limit as if it
// were a wrong answer. Lower it once you are off the free tier.
const DELAY_MS = Number(flagValue('--delay')) || 13000;
const ADVISOR_ID = process.env.EVAL_ADVISOR_ID ?? '369de6dd-1dfe-8035-b0da-ef3a717cab95'; // Sky Siew

let passed = 0, failed = 0, skipped = 0;
const failures: string[] = [];
const infra: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else    { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

/** Commas stripped so "RM1,177" matches a needle of 1177. */
const flatten = (s: string) => s.toLowerCase().replace(/,/g, '');

// ── UNIT LAYER ────────────────────────────────────────────────────────────────
async function unitLayer(): Promise<void> {
  console.log('\nUNIT — pure functions (no tokens)');

  // Medical annual limit: the parse that decides whether the RM1m floor is met.
  const limits: [string, number | null][] = [
    ['MediSafe Infinite · Room & Board: RM200/day · Annual Limit: RM1,000,000 · Lifetime Limit: Unlimited', 1_000_000],
    ['HealthAssured (15% Co-Ins) · Annual Limit: RM5,000,000', 5_000_000],
    ['Enhanced MediCover · Room & Board: RM200/day · Lifetime Limit: RM1,200,000', null],
    ['Accidental Medical Reimbursement Benefit · Room & Board: RM2,000/day', null],
    ['0', null],
    ['Plan X · Annual Limit: Unlimited', Infinity],
  ];
  for (const [text, want] of limits) {
    const got = parseAnnualLimit(text);
    check(`annual limit: ${text.slice(0, 44)}…`, got === want, `got ${String(got)}, want ${String(want)}`);
  }

  // Gap maths against the firm benchmark.
  const ctx = { config: {} as AdvisorConfig };
  const g = await runCoverageGap({ annualIncome: 120_000, existingLifeCover: 300_000, existingCiCover: 0, existingMedicalAnnualLimit: 500_000 }, ctx);
  check('gap: life required = 10x income', g.life?.required === 120_000 * GAP_BENCHMARK.lifeMultiple);
  check('gap: life shortfall net of existing', g.life?.gap === 900_000);
  check('gap: CI required = 5x income', g.ci?.required === 120_000 * GAP_BENCHMARK.ciMultiple);
  check('gap: medical below RM1m floor fails', g.medical?.meetsFloor === false);

  const noIncome = await runCoverageGap({}, ctx);
  check('gap: refuses without income', noIncome.ok === false);
  const noCover = await runCoverageGap({ annualIncome: 100_000 }, ctx);
  check('gap: refuses without client or cover figures', noCover.ok === false);

  // Pricing engine sanity — the figures the live cases assert on.
  const q = estimateAll(35, 'M', false, 500_000, 500_000, true).sort((a, b) => a.monthly - b.monthly);
  check('engine: cheapest for 35M NS 500k/500k is HLA at 1177', q[0]?.insurer === 'HLA' && Math.round(q[0].monthly) === 1177,
    `got ${q[0]?.insurer} ${Math.round(q[0]?.monthly ?? 0)}`);

  // Fund-name matching (the "Greater China" ambiguity).
  const names = ['Principal Greater China Equity Fund-MYR', 'Manulife Investment Greater China Fund', 'Cash Account'];
  check('funds: partial name returns both Greater China funds',
    matchHoldingNames('who holds the Greater China fund?', names).length === 2);
  check('funds: generic-only names never match', !matchHoldingNames('cash account', names).includes('Cash Account'));

  // Intent routing.
  check('intent: analysis question is not a task', looksLikeTaskRequest('no record with us, is that enough cover?') === false);
  check('intent: genuine task still detected', looksLikeTaskRequest('remind me to call Karen on Friday') === true);
}

// ── LIVE LAYER ────────────────────────────────────────────────────────────────
async function sessionCookie(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET missing — run with: node --env-file=.env.local --import tsx scripts/eval-assistant.ts --live');
  const token = await new SignJWT({ advisorId: ADVISOR_ID, username: 'Eval Runner', role: 'Advisor' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('6h')
    .sign(new TextEncoder().encode(secret));
  return `aria-session=${token}`;
}

async function askOnce(cookie: string, c: EvalCase): Promise<{ content?: string; pendingTasks?: unknown[]; error?: string }> {
  const messages = [...(c.history ?? []), { role: 'user', content: c.question }];
  const res = await fetch(`${BASE}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ messages, clientId: c.client?.id ?? null, clientName: c.client?.name ?? null }),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    const looksLikeLogin = /<!doctype html|<html/i.test(text);
    return { error: looksLikeLogin
      ? 'INFRA: got the login page — the eval session was rejected (expired or wrong AUTH_SECRET)'
      : `INFRA: non-JSON response (${res.status})` };
  }
}

/** Retries a rate-limited case rather than failing it — a 429 is not a wrong answer. */
async function ask(cookie: string, c: EvalCase) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await askOnce(cookie, c);
    // Transient upstream trouble is not a wrong answer — retry rather than
    // scoring it as a product failure.
    if (!(r.error && /429|quota|rate limit|overloaded|503|fetching from|network|ECONN|timeout/i.test(r.error))) return r;
    console.log(`     (rate-limited, retry ${attempt}/4)`);
    await new Promise(r => setTimeout(r, 20_000));
  }
  return { error: 'rate-limited after 4 attempts' };
}

async function liveLayer(): Promise<void> {
  const cases = CASES.filter(c => !GROUP || c.group === GROUP);
  console.log(`\nLIVE — ${cases.length} case(s) against ${BASE}  (${DELAY_MS}ms apart)`);
  const cookie = await sessionCookie();

  for (const c of cases) {
    const r = await ask(cookie, c);
    const answer = r.content ?? '';
    const flat = flatten(answer);
    const label = `[${c.group}] ${c.id}`;

    if (r.error) {
      // "rate-limited" (hyphen) must match too — it did not, so quota
      // exhaustion was still being scored as a wrong answer.
      const transient = /INFRA|429|quota|rate[ -]?limit|overloaded|503|fetching from|timeout|ECONN/i.test(r.error);
      if (transient) {
        skipped++; infra.push(`${label} — ${r.error.slice(0, 80)}`);
        console.log(`  ⚠️  ${label} — NOT TESTED (${r.error.slice(0, 60)})`);
      } else {
        check(label, false, r.error.slice(0, 90));
      }
      await new Promise(r => setTimeout(r, DELAY_MS));
      continue;
    }

    const problems: string[] = [];

    if (c.expect.pendingTasks === true && !Array.isArray(r.pendingTasks)) problems.push('expected a task proposal, got a normal answer');
    if (c.expect.pendingTasks === false && Array.isArray(r.pendingTasks)) problems.push('question was wrongly turned into a task');

    for (const needle of c.expect.mustInclude ?? []) {
      if (!flat.includes(flatten(String(needle)))) problems.push(`missing "${needle}"`);
    }
    for (const needle of c.expect.mustNotInclude ?? []) {
      if (flat.includes(flatten(needle))) problems.push(`should not contain "${needle}"`);
    }
    // A request for missing detail is not always phrased with a question mark
    // ("please tell me their existing cover"), so accept either form.
    const asksSomething = answer.includes('?') ||
      /(please (tell|provide|confirm|share|let me know)|what (is|are)|i need (to know|the)|could you|can you (tell|provide))/i.test(answer);
    if (c.expect.asksForMoreInfo && !asksSomething) problems.push('expected a request for more information');

    check(label, problems.length === 0, problems.join('; '));
    if (problems.length) {
      console.log(`     why it matters: ${c.why}`);
      console.log(`     got: ${answer.replace(/\s+/g, ' ').slice(0, 220)}${answer.length > 220 ? '…' : ''}`);
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

async function main(): Promise<void> {
  console.log('Ask FINVA — house eval set');
  await unitLayer();
  if (LIVE) await liveLayer();
  else console.log('\n(skipping LIVE cases — pass --live to run them through Gemini)');

  console.log(`\n${failed === 0 ? '✅ ALL PASSED' : '❌ FAILURES'}  ${passed} passed, ${failed} failed, ${skipped} not tested`);
  if (failures.length) { console.log('\nFailed (wrong answers):'); failures.forEach(f => console.log(`  - ${f}`)); }
  if (infra.length) {
    console.log('\nNot tested (infrastructure, NOT a product failure):');
    infra.forEach(f => console.log(`  - ${f}`));
    console.log('  Gemini free tier allows 5 requests/min and each live case costs 2.');
    console.log('  Re-run the affected group, raise --delay, or move off the free tier.');
  }
  // Only a wrong answer fails the suite. Quota exhaustion means "untested",
  // and must not be mistaken for a regression.
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error('eval harness crashed:', e); process.exit(1); });
