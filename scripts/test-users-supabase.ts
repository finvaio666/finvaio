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

    // login lookup + bcrypt (verifyLogin returns the hash; caller compares)
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('secret123', 10);
    await sb.from('users').update({ password_hash: hash }).eq('notion_id', NID);
    const vl = await sbUsers.verifyLogin(`${MARK}_user`);
    ok(!!vl && vl.notionId === NID, 'verifyLogin finds the active test user');
    ok(await bcrypt.compare('secret123', vl!.passwordHash), 'verifyLogin returns the usable password hash');
    // inactive user is not returned
    await sb.from('users').update({ active: false }).eq('notion_id', NID);
    ok((await sbUsers.verifyLogin(`${MARK}_user`)) === null, 'inactive user is not returned by verifyLogin');
    await sb.from('users').update({ active: true }).eq('notion_id', NID);
    // listUsers includes the test user with id == notion_id
    ok((await sbUsers.listUsers()).some(u => u.id === NID && u.username === `${MARK}_user`), 'listUsers includes the test user keyed by notion_id');

    // token write-backs land on the row
    await sbUsers.setGmailToken(NID, 'gtok', 'g@x.com');
    await sbUsers.setInstitutions(NID, '[{"a":1}]');
    const { data: w1 } = await sb.from('users').select('gmail_refresh_token, gmail_address, institutions_json').eq('notion_id', NID).single();
    ok((w1 as any).gmail_refresh_token === 'gtok' && (w1 as any).gmail_address === 'g@x.com', 'setGmailToken writes token + address');
    ok((w1 as any).institutions_json === '[{"a":1}]', 'setInstitutions writes json');
    // outlook also flips provider
    await sbUsers.setOutlookToken(NID, 'otok', 'o@x.com');
    const { data: w2 } = await sb.from('users').select('email_provider').eq('notion_id', NID).single();
    ok((w2 as any).email_provider === 'outlook', 'setOutlookToken flips email_provider to outlook');
    // password change: new hash verifies, old fails
    const nh = await bcrypt.hash('newpass99', 10);
    await sbUsers.setPassword(NID, nh);
    const vl2 = await sbUsers.verifyLogin(`${MARK}_user`);
    ok(await bcrypt.compare('newpass99', vl2!.passwordHash), 'setPassword updates the hash (new password verifies)');
    ok(!(await bcrypt.compare('secret123', vl2!.passwordHash)), 'old password no longer verifies');
    // createUser + usernameExists
    const nid2 = sbUsers.genNotionId();
    ok(nid2.length === 32 && !nid2.includes('-'), 'genNotionId is dashless 32-hex');
    await sbUsers.createUser({ notionId: nid2, name: `${MARK} Two`, username: `${MARK}_two`, passwordHash: nh, role: 'Advisor' });
    ok(await sbUsers.usernameExists(`${MARK}_two`), 'createUser + usernameExists');
    // setUserById toggles active
    await sbUsers.setUserById(nid2, { active: false });
    ok((await sbUsers.verifyLogin(`${MARK}_two`)) === null, 'setUserById active=false disables login');

    // ── company JSON columns (Phase 3.5a) ──────────────────────────────────
    // Snapshot the real users' 3 columns FIRST; asserted unchanged at the end.
    const { data: realBefore } = await sb.from('users')
      .select('notion_id, institutions_json, email_themes_json, market_digest_json')
      .neq('notion_id', NID).not('username', 'like', `${MARK}%`);
    const snap = JSON.stringify(realBefore);

    // email_themes_json is empty for every real user → the fixture is the only
    // non-empty value, so "first non-empty" is unambiguous here.
    await sbUsers.writeCompanyJson('email_themes_json', NID, '[{"id":"t1"}]');
    const themeBlobs = await sbUsers.listCompanyJson('email_themes_json');
    ok(themeBlobs.length === 1 && themeBlobs[0] === '[{"id":"t1"}]', 'listCompanyJson(email_themes_json) returns the fixture blob');

    // institutions_json: Administrator already holds a real blob → assert the
    // fixture is INCLUDED alongside it (not that it is the only one).
    await sbUsers.writeCompanyJson('institutions_json', NID, '[{"domain":"fixture.test"}]');
    const instBlobs = await sbUsers.listCompanyJson('institutions_json');
    ok(instBlobs.includes('[{"domain":"fixture.test"}]'), 'listCompanyJson(institutions_json) includes the fixture blob');
    ok(instBlobs.length >= 2, 'listCompanyJson returns real blobs alongside the fixture');

    // no truncation: a blob well past the old 2000-char Notion cap round-trips intact
    const big = JSON.stringify([{ domain: 'big.test', pad: 'x'.repeat(3000) }]);
    await sbUsers.writeCompanyJson('institutions_json', NID, big);
    const bigBack = (await sbUsers.listCompanyJson('institutions_json')).find(b => b.includes('big.test'));
    ok(bigBack === big, 'writeCompanyJson stores >2000 chars without truncation');
    ok(JSON.parse(bigBack!).length === 1, 'the >2000-char blob is still valid JSON');

    // digest target prefers the Admin row (read-only)
    const target = await sbUsers.findDigestTargetNotionId();
    const { data: adminRow } = await sb.from('users').select('notion_id').eq('role', 'Admin').limit(1).maybeSingle();
    ok(!!target && target === (adminRow as { notion_id: string } | null)?.notion_id, 'findDigestTargetNotionId prefers the Admin row');

    // the 8 real users' 3 columns are untouched by everything above
    const { data: realAfter } = await sb.from('users')
      .select('notion_id, institutions_json, email_themes_json, market_digest_json')
      .neq('notion_id', NID).not('username', 'like', `${MARK}%`);
    ok(JSON.stringify(realAfter) === snap, 'real users’ company-JSON columns unchanged (content compare)');
  } finally {
    await purge();
  }
  const after = await count();
  ok(after === before, `user count restored (${before} → ${after})`);

  console.log(failures === 0 ? '\n🎉 all Phase 3 users checks passed' : `\n💥 ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async e => { await purge().catch(() => {}); console.error('crashed:', e); process.exit(1); });
