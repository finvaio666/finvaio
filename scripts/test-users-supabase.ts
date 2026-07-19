/**
 * scripts/test-users-supabase.ts
 * Phase 3 regression test — Supabase Users/config layer. Self-cleaning.
 *   node --env-file=.env.local --import tsx scripts/test-users-supabase.ts
 *
 * NEVER touches the 8 real users: every fixture uses the fabricated marker
 * PHASE3_TEST (username/name/notion_id) and is hard-deleted at the end.
 */
import { getSupabase } from '../lib/supabase';
import * as sbUsers from '../lib/repos/users';

const MARK = 'PHASE3_TEST';
const NID  = 'phase3testnotionid00000000000001'; // dashless 32-hex, cannot collide with real notion_ids

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✅ ${msg}`);
  else { console.error(`  ❌ ${msg}`); failures++; }
}
async function count(): Promise<number> {
  const { count: n } = await getSupabase().from('users').select('*', { count: 'exact', head: true });
  return n ?? 0;
}
async function purge(): Promise<void> {
  // scoped to the fabricated markers only — can never match a real row
  const sb = getSupabase();
  await sb.from('users').delete().eq('notion_id', NID);
  await sb.from('users').delete().like('username', `${MARK}%`);
}

async function main() {
  const sb = getSupabase();
  const before = await count();
  try {
    // seed a test user with NO clients_db_id → must fall back to env.COMPANY_CLIENTS_DB_ID
    await sb.from('users').insert({
      notion_id: NID, name: `${MARK} User`, username: `${MARK}_user`,
      password_hash: 'x', role: 'Advisor', active: true, features: 'products,rules',
    });

    // read by dashless
    const c1 = await sbUsers.getAdvisorConfig(NID);
    ok(!!c1, 'getAdvisorConfig reads the test user (dashless id)');
    ok(c1!.name === `${MARK} User` && c1!.role === 'Advisor', 'name/role mapped');
    ok(c1!.features.join(',') === 'products,rules', 'features parsed');
    ok(c1!.clientsDbId === (process.env.COMPANY_CLIENTS_DB_ID || ''), 'clients_db_id falls back to env COMPANY_CLIENTS_DB_ID');
    ok(c1!.notionApiKey === (process.env.NOTION_API_KEY || ''), 'notion_api_key falls back to env NOTION_API_KEY');

    // read by dashed form of the same id must resolve identically
    const dashed = NID.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    const c2 = await sbUsers.getAdvisorConfig(dashed);
    ok(!!c2 && c2!.name === c1!.name, 'getAdvisorConfig resolves the dashed advisorId identically');

    ok((await sbUsers.getAdvisorConfig('nonexistentid0000000000000000000')) === null, 'unknown id → null');
  } finally {
    await purge();
  }
  const after = await count();
  ok(after === before, `user count restored (${before} → ${after})`);

  console.log(failures === 0 ? '\n🎉 all Phase 3 users checks passed' : `\n💥 ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async e => { await purge().catch(() => {}); console.error('crashed:', e); process.exit(1); });
