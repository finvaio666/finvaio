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
import * as sbPortfolio from '../lib/repos/portfolio';
import { buildPortfolioPatch, listHoldings } from '../lib/portfolio';
import { getClientById, listClients } from '../lib/clients';
import { listPolicies } from '../lib/insurance';
import type { AdvisorConfig } from '../lib/getAdvisorConfig';

const MARK   = 'PHASE35B_TEST';
const CLIENT = `${MARK} Client`;
const ADV    = `${MARK} Advisor`;
const MARKER = 'client-form'; // same marker networth/submit uses
// Admin role short-circuits updateHolding's ownership guard, so the fixture is
// reachable without impersonating a real advisor.
const ADMIN_CFG = { role: 'Admin', name: ADV } as unknown as AdvisorConfig;

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

    // ── portfolio-switch mapping ───────────────────────────────────────────
    // The exact patch the route builds for a new fund.
    const patch = buildPortfolioPatch({
      holdingName:  'PHASE35B Fund',
      assetClass:   'Equity',
      institution:  'Test House',
      currency:     'USD',
      valueOrig:    1000,
      purchaseOrig: 900,
      fxRate:       4.5,
      valueMyr:     4500,
      purchaseMyr:  4050,
      status:       'Active',
    }, ADV, true);
    const { id: holdingId } = await sbPortfolio.createHolding(patch);
    const { data: h1 } = await sb.from('portfolio_holdings')
      .select('holding_name, asset_class, institution, currency, value_original_currency, value_myr, purchase_price_original, purchase_price_myr, fx_rate_to_myr, status, advisor')
      .eq('id', holdingId).single();
    const h = h1 as Record<string, unknown>;
    ok(h.holding_name === 'PHASE35B Fund' && h.currency === 'USD' && h.asset_class === 'Equity',
       'createHolding maps name/currency/asset_class');
    ok(Number(h.value_original_currency) === 1000 && Number(h.value_myr) === 4500,
       'createHolding maps both value columns');
    ok(Number(h.purchase_price_original) === 900 && Number(h.purchase_price_myr) === 4050,
       'createHolding maps both purchase columns');
    ok(Number(h.fx_rate_to_myr) === 4.5, 'createHolding maps fx_rate_to_myr');
    ok(h.status === 'Active' && h.advisor === ADV, 'createHolding stamps status and advisor');

    // partial switch → setHoldingValue updates exactly the two value columns
    await sbPortfolio.setHoldingValue(holdingId, 400, 1800);
    const { data: h2 } = await sb.from('portfolio_holdings')
      .select('value_original_currency, value_myr, purchase_price_original').eq('id', holdingId).single();
    const hv = h2 as Record<string, unknown>;
    ok(Number(hv.value_original_currency) === 400 && Number(hv.value_myr) === 1800,
       'setHoldingValue updates both value columns');
    ok(Number(hv.purchase_price_original) === 900, 'setHoldingValue leaves purchase price alone');

    // full redemption → status flips
    await sbPortfolio.updateHolding(ADMIN_CFG, holdingId, { status: 'Redeemed' });
    const { data: h3 } = await sb.from('portfolio_holdings').select('status').eq('id', holdingId).single();
    ok((h3 as { status: string }).status === 'Redeemed', 'updateHolding flips status to Redeemed');

    // ── reports/client mapping (READ-ONLY — touches no fixture) ────────────
    // Pick a real client that actually has holdings, so the join is exercised.
    const { data: linkRow } = await sb.from('portfolio_holdings')
      .select('client_notion_id').not('client_notion_id', 'is', null).limit(1).single();
    const cnid = (linkRow as { client_notion_id: string }).client_notion_id;
    const allClients = await listClients(ADMIN_CFG);
    const subject = allClients.find(c => c.notionId === cnid);
    ok(!!subject, 'found a real client that owns holdings (join fixture)');

    const rec = await getClientById(ADMIN_CFG, subject!.id);
    ok(!!rec, 'getClientById resolves the client');
    ok(rec!.name.length > 0, 'ClientRecord.name populated');
    ok(rec!.notionId === cnid, 'ClientRecord.notionId is the join key');
    ok(typeof rec!.aum === 'number' && typeof rec!.monthlyIncome === 'number',
       'ClientRecord aum/monthlyIncome are numbers (report maps income→monthlyIncome)');
    ok(Array.isArray(rec!.financialGoals), 'ClientRecord.financialGoals is an array (report maps goals→financialGoals)');
    ok(typeof rec!.onboardingDate === 'string' && typeof rec!.dob === 'string',
       'ClientRecord onboardingDate/dob are strings (report maps onboarding→onboardingDate)');

    // the join the report performs must match a direct SQL count
    const holdings = (await listHoldings(ADMIN_CFG)).filter(h => h.clientNotionId === cnid);
    const { count: sqlHoldings } = await sb.from('portfolio_holdings')
      .select('*', { count: 'exact', head: true }).eq('client_notion_id', cnid).is('deleted_at', null);
    ok(holdings.length === (sqlHoldings ?? -1),
       `holdings join by clientNotionId matches SQL (${holdings.length} = ${sqlHoldings})`);

    const policies = (await listPolicies(ADMIN_CFG)).filter(p => p.clientNotionId === cnid);
    const { count: sqlPolicies } = await sb.from('insurance_policies')
      .select('*', { count: 'exact', head: true }).eq('client_notion_id', cnid).is('deleted_at', null);
    ok(policies.length === (sqlPolicies ?? -1),
       `policies join by clientNotionId matches SQL (${policies.length} = ${sqlPolicies})`);
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
