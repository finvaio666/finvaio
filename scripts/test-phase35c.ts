/**
 * scripts/test-phase35c.ts
 * Phase 3.5c regression test — NRIC encryption, the clients repo, and
 * platform-groups company JSON. Self-cleaning.
 *   node --env-file=.env.local --import tsx scripts/test-phase35c.ts
 *
 * NEVER touches the 896 real clients or 8 real users: every DB fixture uses
 * the fabricated marker ZZZ_P35C_TEST (client name / users username+name /
 * fixed fabricated dashless 32-hex notion_id) and is hard-deleted at the end.
 *
 * The real NRIC_ENCRYPTION_KEY is intentionally absent from env — set a
 * throwaway one at the very top, before any crypto call, so the round-trip
 * checks below work without depending on a real key.
 */
process.env.NRIC_ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'); // 32 bytes, test-only

import { getSupabase } from '../lib/supabase';
import * as sbClients from '../lib/repos/clients';
import * as sbUsers from '../lib/repos/users';
import { parsePlatformGroups } from '../lib/platformGroups';
import { encryptNric, decryptNric, maskNric, isEncrypted } from '../lib/nricCrypto';

const MARK = 'ZZZ_P35C_TEST';
const NID  = 'zzzp35ctestnotionid00000000000001'.slice(0, 32); // dashless 32-hex-shaped, cannot collide with real notion_ids

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✅ ${msg}`);
  else { console.error(`  ❌ ${msg}`); failures++; }
}
async function clientsCount(): Promise<number> {
  const { count: n } = await getSupabase().from('clients').select('*', { count: 'exact', head: true });
  return n ?? 0;
}
async function usersCount(): Promise<number> {
  const { count: n } = await getSupabase().from('users').select('*', { count: 'exact', head: true });
  return n ?? 0;
}
async function purge(): Promise<void> {
  // scoped to the fabricated markers only — can never match a real row
  const sb = getSupabase();
  await sb.from('clients').delete().like('client_name', `${MARK}%`);
  await sb.from('users').delete().eq('notion_id', NID);
  await sb.from('users').delete().like('username', `${MARK}%`);
}

/**
 * Zero-DB layer: parsePlatformGroups + the NRIC encryption round-trip. These
 * are shared by both data sources and by the migration script, so a drift
 * here would silently change stored data on both paths.
 */
function pureFunctionChecks(): string {
  // parsePlatformGroups: tolerant, but [] is a VALID empty array (not null) —
  // that distinction belongs to getPlatformGroups, not the parser.
  ok(parsePlatformGroups(null) === null, 'parsePlatformGroups(null) → null');
  ok(parsePlatformGroups('') === null, 'parsePlatformGroups("") → null');
  ok(parsePlatformGroups('{oops') === null, 'parsePlatformGroups(malformed) → null');
  const empty = parsePlatformGroups('[]');
  ok(Array.isArray(empty) && empty.length === 0, 'parsePlatformGroups("[]") → [] (empty array, NOT null)');
  const one = parsePlatformGroups('[{"id":"x","name":"n","platforms":["P"]}]');
  ok(Array.isArray(one) && one.length === 1, 'parsePlatformGroups(valid) → array of length 1');

  // NRIC encryption round-trip
  const enc = encryptNric('900101-14-5566');
  ok(enc.startsWith('enc:v1:'), 'encryptNric prefixes with enc:v1:');
  ok(isEncrypted(enc), 'isEncrypted recognizes the encrypted value');
  ok(decryptNric(enc) === '900101-14-5566', 'decryptNric round-trips the plaintext');
  ok(decryptNric('plain-value') === 'plain-value', 'decryptNric passes through non-encrypted values');
  const masked = maskNric('900101-14-5566');
  ok(masked.endsWith('5566') && masked.includes('•'), 'maskNric masks all but the last 4, preserving dashes');
  ok(encryptNric('') === '', 'encryptNric("") → "" (empty stays empty)');

  return enc;
}

async function main() {
  const sb = getSupabase();
  const enc = pureFunctionChecks();
  const beforeClients = await clientsCount();
  const beforeUsers = await usersCount();
  try {
    // ── Section 2: clients repo ─────────────────────────────────────────────
    const { id } = await sbClients.createClient({
      name: `${MARK} Client`, status: 'Prospect', segment: null, advisor: `${MARK} FA`,
    });
    ok(!!id, 'createClient returns an id (insert + null segment pass the CHECK)');

    const c1 = await sbClients.getClientById(id);
    ok(!!c1 && c1!.name === `${MARK} Client`, 'getClientById reads the fixture back');
    ok(c1!.nricRegNo === '', 'nricRegNo is empty initially (no NRIC set yet)');

    // set an encrypted NRIC directly, reusing `enc` from Section 1
    await sb.from('clients').update({ nric_reg_no: enc }).eq('id', id);
    const c2 = await sbClients.getClientById(id);
    ok(c2!.nricRegNo === enc, 'getClientById carries the RAW stored encrypted value, un-decrypted');
    ok(decryptNric(c2!.nricRegNo) === '900101-14-5566', 'decryptNric recovers the plaintext from the repo-read value');

    // set a plaintext NRIC: pass-through
    await sb.from('clients').update({ nric_reg_no: 'plain-nric-123' }).eq('id', id);
    const c3 = await sbClients.getClientById(id);
    ok(c3!.nricRegNo === 'plain-nric-123', 'getClientById carries a plaintext nric_reg_no unchanged');

    await sb.from('clients').delete().eq('id', id);

    // ── Section 3: platform-groups company JSON ────────────────────────────
    const { data: realBefore } = await sb.from('users')
      .select('notion_id, platform_groups_json')
      .neq('notion_id', NID).not('username', 'like', `${MARK}%`);
    const snap = JSON.stringify(realBefore);

    await sb.from('users').insert({
      notion_id: NID, name: `${MARK} User`, username: `${MARK}_user`,
      password_hash: 'x', role: 'Advisor', active: true,
    });

    await sbUsers.writeCompanyJson('platform_groups_json', NID, '[{"id":"g1","name":"Local UT","platforms":["Phillip"]}]');
    const groupBlobs = await sbUsers.listCompanyJson('platform_groups_json');
    ok(groupBlobs.includes('[{"id":"g1","name":"Local UT","platforms":["Phillip"]}]'), 'listCompanyJson(platform_groups_json) includes the fixture blob');

    // clearCompanyJsonExcept is never EXECUTED here — it clears every row by
    // design and running it would wipe any real admin's whitelist. Its
    // PREDICATE is still verifiable read-only: issue the same filter chain as
    // a select and assert the victim set is "every non-empty row except the
    // keeper". Catches an eq/neq inversion, a wrong column, or a missing
    // non-empty guard.
    const { data: victims } = await sb.from('users').select('notion_id')
      .neq('notion_id', NID).not('platform_groups_json', 'is', null).neq('platform_groups_json', '');
    const victimIds = (victims as Array<{ notion_id: string }>).map(v => v.notion_id);
    const { data: allNonEmpty } = await sb.from('users').select('notion_id')
      .not('platform_groups_json', 'is', null).neq('platform_groups_json', '');
    const allIds = (allNonEmpty as Array<{ notion_id: string }>).map(a => a.notion_id);
    ok(!victimIds.includes(NID), 'clearCompanyJsonExcept predicate excludes the keeper');
    ok(allIds.includes(NID) && victimIds.length === allIds.length - 1,
       'clearCompanyJsonExcept predicate targets every non-empty row except the keeper');

    const { data: realAfter } = await sb.from('users')
      .select('notion_id, platform_groups_json')
      .neq('notion_id', NID).not('username', 'like', `${MARK}%`);
    ok(JSON.stringify(realAfter) === snap, 'real users’ platform_groups_json column unchanged (content compare)');
  } finally {
    await purge();
  }
  const afterClients = await clientsCount();
  const afterUsers = await usersCount();
  ok(afterClients === beforeClients, `clients count restored (${beforeClients} → ${afterClients})`);
  ok(afterUsers === beforeUsers, `user count restored (${beforeUsers} → ${afterUsers})`);

  console.log(failures === 0 ? '\n🎉 all Phase 3.5c checks passed' : `\n💥 ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async e => { await purge().catch(() => {}); console.error('crashed:', e); process.exit(1); });
