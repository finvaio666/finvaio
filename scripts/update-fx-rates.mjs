/**
 * Refresh each holding's "FX Rate to MYR" from live market rates.
 *
 * Source: Frankfurter (ECB reference rates, no key required). Rates are quoted
 * against MYR, so a holding in USD gets 1 / (MYR→USD).
 *
 * IMPORTANT — this deliberately does NOT touch value_myr.
 * In this book value_myr is not a derived column: it arrives from the FAME /
 * iFAST syncs and is the trustworthy figure, while value_original_currency is
 * frequently 0 or missing (SGD rows carry value_myr with value_orig = 0). The
 * app already prefers stored value_myr and only falls back to
 * value_orig × fx when it's absent, so refreshing the rate corrects the FX
 * display without silently repricing anyone's AUM. Rows that WOULD move under
 * that fallback are reported so the change is never invisible.
 *
 * Usage:  node scripts/update-fx-rates.mjs --dry-run
 *         node scripts/update-fx-rates.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] ??= m[2].trim();
});

const URL_ = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// Only rewrite when the stored rate is off by more than this — avoids churning
// every row on each run for a rounding-level move.
const TOLERANCE = 0.005;   // 0.5%

console.log(`\n💱 FINVA — refresh FX rates to MYR${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log('━'.repeat(60));

// ── 1. Live rates ─────────────────────────────────────────────────────────────
const fxRes = await fetch('https://api.frankfurter.app/latest?base=MYR');
if (!fxRes.ok) { console.error('❌ FX source unavailable:', fxRes.status); process.exit(1); }
const fx = await fxRes.json();

const toMyr = { MYR: 1 };
for (const [ccy, perMyr] of Object.entries(fx.rates)) {
  if (perMyr > 0) toMyr[ccy] = 1 / perMyr;
}
console.log(`Rates as of ${fx.date} (ECB via Frankfurter)`);
for (const c of ['USD', 'SGD', 'AUD', 'GBP', 'EUR', 'JPY', 'HKD']) {
  if (toMyr[c]) console.log(`   1 ${c} = MYR ${toMyr[c].toFixed(4)}`);
}

// ── 2. Holdings ───────────────────────────────────────────────────────────────
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const res = await fetch(`${URL_}/rest/v1/portfolio_holdings?select=id,holding_name,currency,fx_rate_to_myr,value_original_currency,value_myr&limit=1000&offset=${offset}`, { headers: H });
  if (!res.ok) { console.error('❌', res.status, (await res.text()).slice(0, 300)); process.exit(1); }
  const batch = await res.json();
  rows.push(...batch);
  if (batch.length < 1000) break;
}
console.log(`\n📈 ${rows.length} holdings\n`);

// ── 3. Decide updates ─────────────────────────────────────────────────────────
const updates = [];
const skippedNoCcy = [];
const heldBack = [];   // fx drives AUM here — changing it would move reported figures

for (const r of rows) {
  const ccy = (r.currency || '').trim().toUpperCase();
  if (!ccy) { skippedNoCcy.push(r); continue; }
  const target = toMyr[ccy];
  if (!target) { skippedNoCcy.push(r); continue; }

  const current = r.fx_rate_to_myr ?? 0;
  const off = current > 0 ? Math.abs(current - target) / target : 1;
  if (off <= TOLERANCE) continue;

  // The app prefers stored value_myr and only falls back to value_orig × fx
  // when it's missing. On those rows the rate IS the valuation, so touching it
  // silently restates AUM — hold them back for a human rather than fold a data
  // fix into an FX refresh.
  if (!(r.value_myr > 0) && (r.value_original_currency ?? 0) > 0) {
    heldBack.push({
      id: r.id, name: r.holding_name, ccy,
      before: (r.value_original_currency ?? 0) * current,
      after:  (r.value_original_currency ?? 0) * target,
    });
    continue;
  }

  updates.push({ id: r.id, name: r.holding_name, ccy, from: current, to: target });
}

const byCcy = {};
for (const u of updates) {
  byCcy[u.ccy] ??= { n: 0, from: new Set(), to: u.to };
  byCcy[u.ccy].n++;
  byCcy[u.ccy].from.add(u.from);
}
console.log('Planned rate changes:');
for (const [c, d] of Object.entries(byCcy).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`   ${c.padEnd(5)} ${String(d.n).padStart(5)} rows   ${[...d.from].join('/')} → ${d.to.toFixed(4)}`);
}
if (!updates.length) console.log('   (none — every rate already within tolerance)');

if (skippedNoCcy.length) {
  console.log(`\n⏭️  ${skippedNoCcy.length} rows skipped — blank/unknown currency, not guessing one.`);
}
if (heldBack.length) {
  const delta = heldBack.reduce((s, w) => s + (w.after - w.before), 0);
  console.log(`\n⚠️  ${heldBack.length} rows HELD BACK — they have no stored value_myr, so the rate`);
  console.log(`   is what values them. Updating would move AUM by MYR ${Math.round(delta).toLocaleString()}:`);
  for (const w of heldBack.slice(0, 15)) {
    console.log(`     ${(w.name ?? '').replace(/\s+/g, ' ').slice(0, 46).padEnd(48)} ${w.ccy}  ${Math.round(w.before).toLocaleString()} → ${Math.round(w.after).toLocaleString()}`);
  }
  if (heldBack.length > 15) console.log(`     …and ${heldBack.length - 15} more`);
  console.log('   Fix the underlying rows (or set value_myr) rather than letting an FX run reprice them.');
}
console.log('\n✓ Reported AUM is unchanged by this run — only stored rates move.');

// ── 4. Apply ──────────────────────────────────────────────────────────────────
if (DRY_RUN) {
  console.log(`\n🎉 Dry run — nothing written. ${updates.length} rows would change.`);
  process.exit(0);
}

let done = 0, failed = 0;
for (const u of updates) {
  const res = await fetch(`${URL_}/rest/v1/portfolio_holdings?id=eq.${u.id}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ fx_rate_to_myr: Number(u.to.toFixed(6)) }),
  });
  if (res.ok) done++;
  else { failed++; if (failed <= 3) console.log(`   ❌ ${u.name}: ${res.status} ${(await res.text()).slice(0, 120)}`); }
}
console.log(`\n🎉 Done — updated ${done}, failed ${failed}.`);
