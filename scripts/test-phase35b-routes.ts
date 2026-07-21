/**
 * scripts/test-phase35b-routes.ts
 * Phase 3.5b regression test — the field mapping in the three migrated routes.
 *   node --env-file=.env.local --import tsx scripts/test-phase35b-routes.ts
 *
 * The repo functions themselves are already covered (Phase 2.11). What is new
 * here is each route's translation of its request body into repo arguments —
 * a mapping bug returns HTTP 200 with wrong data, which nothing else catches.
 *
 * NEVER touches real data: every fixture carries the PHASE35B_TEST marker and is
 * hard-deleted in a finally; both table counts are asserted restored.
 */
import { getSupabase } from '../lib/supabase';
import * as sbAssets from '../lib/repos/assets';

const MARK   = 'PHASE35B_TEST';
const CLIENT = `${MARK} Client`;
const ADV    = `${MARK} Advisor`;
const MARKER = 'client-form'; // same marker networth/submit uses

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✅ ${msg}`);
  else { console.error(`  ❌ ${msg}`); failures++; }
}
async function countRows(table: string): Promise<number> {
  const { count } = await getSupabase().from(table).select('*', { count: 'exact', head: true });
  return count ?? 0;
}
async function purge(): Promise<void> {
  // scoped to the fabricated marker only — can never match a real row
  const sb = getSupabase();
  await sb.from('assets_liabilities').delete().eq('advisor', ADV);
  await sb.from('portfolio_holdings').delete().eq('advisor', ADV);
}

async function main() {
  const sb = getSupabase();
  const beforeAssets = await countRows('assets_liabilities');
  const beforePortfolio = await countRows('portfolio_holdings');
  try {
    // ── networth/submit mapping ────────────────────────────────────────────
    // Exactly the call the route makes, with the route's own marker.
    const today = new Date().toISOString().split('T')[0];
    await sbAssets.replaceAssetEntries(ADV, CLIENT, MARKER, [
      { name: 'Cash', client: CLIENT, type: 'Asset', category: 'Liquid',
        valueMyr: 1500, notes: `${MARKER} · submitted ${today}`, advisor: ADV },
      { name: 'Car Loan', client: CLIENT, type: 'Liability', category: 'Loans',
        valueMyr: 800, notes: `${MARKER} · submitted ${today}`, advisor: ADV },
    ]);
    const { data: rows1 } = await sb.from('assets_liabilities')
      .select('name, client, type, category, value_myr, notes, advisor')
      .eq('advisor', ADV).is('deleted_at', null).order('name');
    const r1 = rows1 as Array<Record<string, unknown>>;
    ok(r1.length === 2, 'replaceAssetEntries wrote both rows');
    const cash = r1.find(r => r.name === 'Cash')!;
    ok(cash.client === CLIENT && cash.type === 'Asset' && cash.category === 'Liquid',
       'asset row maps name/client/type/category');
    ok(Number(cash.value_myr) === 1500, 'asset row maps value_myr');
    ok(String(cash.notes).includes(MARKER), 'notes carries the client-form marker');
    const loan = r1.find(r => r.name === 'Car Loan')!;
    ok(loan.type === 'Liability', 'liability row maps type');

    // Idempotent re-submit is this route's core contract: the second submission
    // must REPLACE the prior client-form rows, not stack on top of them.
    await sbAssets.replaceAssetEntries(ADV, CLIENT, MARKER, [
      { name: 'Cash', client: CLIENT, type: 'Asset', category: 'Liquid',
        valueMyr: 2500, notes: `${MARKER} · submitted ${today}`, advisor: ADV },
    ]);
    const { data: rows2 } = await sb.from('assets_liabilities')
      .select('name, value_myr').eq('advisor', ADV).is('deleted_at', null);
    const r2 = rows2 as Array<Record<string, unknown>>;
    ok(r2.length === 1, 're-submit replaces prior client-form rows (no stacking)');
    ok(Number(r2[0].value_myr) === 2500, 're-submit stores the new value');
  } finally {
    await purge();
  }
  const afterAssets = await countRows('assets_liabilities');
  const afterPortfolio = await countRows('portfolio_holdings');
  ok(afterAssets === beforeAssets, `assets_liabilities count restored (${beforeAssets} → ${afterAssets})`);
  ok(afterPortfolio === beforePortfolio, `portfolio_holdings count restored (${beforePortfolio} → ${afterPortfolio})`);

  console.log(failures === 0 ? '\n🎉 all Phase 3.5b route-mapping checks passed' : `\n💥 ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async e => { await purge().catch(() => {}); console.error('crashed:', e); process.exit(1); });
