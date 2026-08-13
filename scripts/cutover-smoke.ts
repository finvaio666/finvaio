/**
 * scripts/cutover-smoke.ts
 * Branch cutover smoke test — READ-ONLY. Exercises every table's read path
 * through the same abstraction the routes use, with whatever DATA_SOURCE_*
 * flags are currently set. Writes nothing.
 *
 *   node --env-file=.env.local --import tsx scripts/cutover-smoke.ts
 *
 * Reports, per table: the row count each role would see plus a sample value,
 * so a silently-empty Supabase read is obvious rather than looking like
 * "this advisor simply has no data". Also checks the cross-table join
 * (clientNotionId → clients.notionId), the migration's riskiest part.
 */
import { getAdvisorConfig } from '../lib/getAdvisorConfig';
import { getSupabase } from '../lib/supabase';

const FLAGS = ['USERS','CLIENTS','PORTFOLIO','INSURANCE','ASSETS','CASHFLOW','MEETINGS','TASKS','PRODUCTS','FORMS','AI_USAGE'];
const flag = (n: string) => process.env[`DATA_SOURCE_${n}`] === 'supabase' ? 'supabase' : 'notion';

let problems = 0;
function line(label: string, n: number, sample: string, knownEmpty = false): void {
  const bad = n === 0 && !knownEmpty;
  if (bad) problems++;
  const mark = bad ? '⚠️ ' : '✅ ';
  console.log(`  ${mark}${label.padEnd(20)} ${String(n).padStart(5)}   ${sample.slice(0, 45)}`);
}

async function main() {
  const sb = getSupabase();

  const { data: users, error } = await sb.from('users')
    .select('notion_id, name, role').eq('active', true);
  if (error) throw new Error(`users read failed: ${error.message}`);
  const rows = users as Array<{ notion_id: string; name: string; role: string }>;
  const admin   = rows.find(u => u.role === 'Admin');
  const advisor = rows.find(u => u.role === 'Advisor' && u.name);
  if (!admin || !advisor) throw new Error('could not resolve an admin + advisor from public.users');

  console.log('\n=== FLAGS ===');
  for (const n of FLAGS) console.log(`  DATA_SOURCE_${n.padEnd(10)} = ${flag(n)}`);

  console.log(`\n=== getAdvisorConfig (${flag('USERS')}) — the gate everything depends on ===`);
  const cfgAdmin = await getAdvisorConfig(admin.notion_id);
  const cfgAdv   = await getAdvisorConfig(advisor.notion_id);
  console.log(`  admin   → ${cfgAdmin ? `${cfgAdmin.name} / ${cfgAdmin.role} / features=[${cfgAdmin.features}]` : 'NULL ❌'}`);
  console.log(`  advisor → ${cfgAdv   ? `${cfgAdv.name} / ${cfgAdv.role} / features=[${cfgAdv.features}]`     : 'NULL ❌'}`);
  if (!cfgAdmin || !cfgAdv) { console.error('\n💥 config read failed — everything downstream would break'); process.exit(1); }
  console.log(`  env fallback → clientsDbId:${!!cfgAdmin.clientsDbId} notionApiKey:${!!cfgAdmin.notionApiKey} tasksDbId:${!!cfgAdmin.tasksDbId}`);

  const { listClients }  = await import('../lib/clients');
  const { listHoldings } = await import('../lib/portfolio');
  const { listPolicies } = await import('../lib/insurance');
  const { listAssets }   = await import('../lib/assets');
  const { listCashflow } = await import('../lib/cashflow');
  const { listMeetings } = await import('../lib/meetingNotes');
  const { listTasks }    = await import('../lib/tasks');
  const { listForms }    = await import('../lib/formsLibrary');

  console.log(`\n=== READS as ADMIN (${cfgAdmin.name}) — sees everything ===`);
  const clients  = await listClients(cfgAdmin);   line('clients',    clients.length,  clients[0]?.name ?? '');
  const holdings = await listHoldings(cfgAdmin);  line('portfolio',  holdings.length, holdings[0]?.name ?? '');
  const policies = await listPolicies(cfgAdmin);  line('insurance',  policies.length, policies[0]?.policyName ?? '');
  const assets   = await listAssets(cfgAdmin);    line('assets',     assets.length,   assets[0]?.name ?? '');
  const cashflow = await listCashflow(cfgAdmin);  line('cashflow',   cashflow.length, cashflow[0]?.entry ?? '');
  const meetings = await listMeetings(cfgAdmin);  line('meetings',   meetings.length, meetings[0]?.clientName ?? '');
  const tasks    = await listTasks(cfgAdmin);     line('tasks',      tasks.length,    tasks[0]?.task ?? '');
  const forms    = await listForms(cfgAdmin);     line('forms',      forms.length,    forms[0]?.name ?? '(known-empty table)', true);

  console.log(`\n=== READS as ADVISOR (${cfgAdv.name}) — must be scoped, not everything ===`);
  const cl2 = await listClients(cfgAdv);
  const ho2 = await listHoldings(cfgAdv);
  const po2 = await listPolicies(cfgAdv);
  const scoped = (a: number, b: number) => a < b ? '✅ scoped' : a === b ? '⚠️  same as admin' : '❌ MORE than admin';
  console.log(`  clients    ${String(cl2.length).padStart(5)}  (admin ${clients.length})  ${scoped(cl2.length, clients.length)}`);
  console.log(`  portfolio  ${String(ho2.length).padStart(5)}  (admin ${holdings.length})  ${scoped(ho2.length, holdings.length)}`);
  console.log(`  insurance  ${String(po2.length).padStart(5)}  (admin ${policies.length})  ${scoped(po2.length, policies.length)}`);

  console.log('\n=== cross-table join (clientNotionId → clients.notionId) ===');
  const ids = new Set(clients.map(c => c.notionId).filter(Boolean));
  const join = (label: string, list: Array<{ clientNotionId: string }>) => {
    const linked   = list.filter(x => x.clientNotionId).length;
    const resolved = list.filter(x => x.clientNotionId && ids.has(x.clientNotionId)).length;
    const ok = linked > 0 && resolved === linked;
    if (!ok) problems++;
    console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(10)} ${resolved}/${linked} linked rows resolve to a real client (of ${list.length} total)`);
  };
  join('portfolio', holdings);
  join('insurance', policies);

  console.log(problems === 0
    ? '\n🎉 cutover smoke PASSED — every read returned data and joins resolve'
    : `\n⚠️  ${problems} issue(s) above — check whether genuinely empty or a broken read`);
  process.exit(problems === 0 ? 0 : 1);
}
main().catch(e => { console.error('\n💥 crashed:', e); process.exit(1); });
