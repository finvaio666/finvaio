/**
 * encrypt-nric-supabase.ts
 *
 * ⚠️ Touches real client PII: the `nric_reg_no` column on the Supabase
 * `clients` table. One-time backfill that:
 *   1. Encrypts plaintext NRIC / registration-number values with AES-256-GCM
 *      via `../lib/nricCrypto` (format `enc:v1:<base64(iv|ct|tag)>` — this
 *      script does NOT reimplement the crypto, it imports the real module so
 *      the on-disk format stays byte-identical to what the app reads/writes).
 *   2. Blanks the ~4 existing `enc:v1:` values that were encrypted under a
 *      now-LOST key (they throw when decrypted under the CURRENT key).
 *
 * The NEW NRIC_ENCRYPTION_KEY must be set in .env.local AND in Vercel's
 * environment variables BEFORE running --apply. If this new key is ever
 * lost, we repeat the exact incident that made this script necessary in the
 * first place — store it somewhere durable outside this repo. DELETE
 * scripts/.nric-supabase-backup.csv once the migration is verified; it is
 * gitignored but still holds raw plaintext NRICs on disk.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/encrypt-nric-supabase.ts
 *     → DRY RUN. Works even with NO key present: reports the plaintext /
 *       enc:v1: / empty counts. Without a key, `enc:v1:` rows cannot be
 *       classified (could be already-current or dead-old-key) so they are
 *       reported as "needs key to classify" and left alone.
 *
 *   node --env-file=.env.local --import tsx scripts/encrypt-nric-supabase.ts --apply
 *     → Requires NRIC_ENCRYPTION_KEY (32 bytes base64) — fails clearly if
 *       missing/malformed. Writes a plaintext backup CSV FIRST, then encrypts
 *       plaintext rows (with a per-record round-trip sanity check) and blanks
 *       dead enc:v1: rows.
 *
 *   ... --apply --limit 2   → test pass on the first 2 rows that would change.
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { encryptNric, decryptNric, isEncrypted } from '../lib/nricCrypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APPLY = process.argv.includes('--apply');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity;

type ClientRow = { id: string; client_name: string | null; nric_reg_no: string | null };

function hasKey(): boolean {
  const raw = process.env.NRIC_ENCRYPTION_KEY ?? '';
  if (!raw) return false;
  return Buffer.from(raw, 'base64').length === 32;
}

async function main() {
  const keyPresent = hasKey();

  if (APPLY && !keyPresent) {
    console.error('❌ --apply requires NRIC_ENCRYPTION_KEY set in .env.local (32 bytes, base64).');
    process.exit(1);
  }

  console.log(
    `\n🔍 Scanning Supabase clients.nric_reg_no (${APPLY ? 'APPLY' : 'DRY RUN'}` +
    `${Number.isFinite(LIMIT) ? `, limit ${LIMIT}` : ''})` +
    `${keyPresent ? '' : ' — NO KEY present, enc:v1: rows cannot be classified yet'}…`,
  );

  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();

  const clients = (
    await db.query<ClientRow>(`select id, client_name, nric_reg_no from clients order by id`)
  ).rows;

  let empty = 0;
  const plaintext: ClientRow[] = [];
  const needsKey: ClientRow[] = [];   // enc:v1: — can't classify without the key
  let alreadyCurrent = 0;             // enc:v1: decrypts fine under the current key
  const dead: ClientRow[] = [];       // enc:v1: throws under the current key (old lost key)

  for (const c of clients) {
    const raw = c.nric_reg_no ?? '';
    if (!raw) { empty++; continue; }
    if (isEncrypted(raw)) {
      if (!keyPresent) { needsKey.push(c); continue; }
      try {
        decryptNric(raw);
        alreadyCurrent++;
      } catch {
        dead.push(c);
      }
      continue;
    }
    plaintext.push(c);
  }

  console.log(`\n   ${plaintext.length} plaintext (would encrypt) · ${empty} empty`);
  if (!keyPresent) {
    console.log(`   ${needsKey.length} enc:v1: (needs key to classify — will be re-checked at --apply)`);
  } else {
    console.log(
      `   ${alreadyCurrent} enc:v1: already under current key (skip, re-run-safe) · ` +
      `${dead.length} enc:v1: dead — old lost key (would blank)`,
    );
    if (dead.length) {
      console.log(`\n   Dead enc:v1: rows (would be blanked):`);
      for (const d of dead) console.log(`     - ${d.id}  ${d.client_name ?? '(unnamed)'}`);
    }
  }

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write (requires NRIC_ENCRYPTION_KEY).');
    await db.end();
    return;
  }

  // --- APPLY path (requires key; needsKey is always empty here) ---
  const toEncrypt = plaintext.slice(0, LIMIT);
  const remaining = Number.isFinite(LIMIT) ? Math.max(0, LIMIT - toEncrypt.length) : Infinity;
  const toBlank = dead.slice(0, remaining);
  const changed = [...toEncrypt, ...toBlank];

  if (!changed.length) {
    console.log('\nNothing to do — no plaintext to encrypt and no dead enc:v1: rows to blank.');
    await db.end();
    return;
  }

  // Plaintext backup (recovery net if the new key is ever lost). Gitignored.
  // Backs up the raw value even for dead enc:v1: rows being blanked, for the record.
  const backupPath = path.join(__dirname, '.nric-supabase-backup.csv');
  const backupLines = ['id,client_name,nric_reg_no'];
  for (const c of changed) {
    const name = (c.client_name ?? '').replace(/"/g, '""');
    const nric = (c.nric_reg_no ?? '').replace(/"/g, '""');
    backupLines.push(`${c.id},"${name}","${nric}"`);
  }
  fs.writeFileSync(backupPath, backupLines.join('\n'), 'utf8');
  console.log(`\n💾 Plaintext backup written to ${backupPath} — DELETE after verifying.\n`);

  let encrypted = 0, blanked = 0, failed = 0;
  const blankedList: ClientRow[] = [];

  for (const c of toEncrypt) {
    try {
      const raw = c.nric_reg_no ?? '';
      const enc = encryptNric(raw);
      if (decryptNric(enc) !== raw) throw new Error('round-trip mismatch'); // sanity per record
      await db.query(`update clients set nric_reg_no = $1 where id = $2`, [enc, c.id]);
      encrypted++;
      console.log(`   ✅ encrypted: ${c.client_name ?? c.id}`);
    } catch (e) {
      failed++;
      console.error(`   ❌ ${c.client_name ?? c.id}: ${(e as Error).message}`);
    }
  }

  for (const c of toBlank) {
    try {
      await db.query(`update clients set nric_reg_no = null where id = $1`, [c.id]);
      blanked++;
      blankedList.push(c);
      console.log(`   🗑️  blanked (dead enc:v1:): ${c.client_name ?? c.id}`);
    } catch (e) {
      failed++;
      console.error(`   ❌ ${c.client_name ?? c.id}: ${(e as Error).message}`);
    }
  }

  console.log(`\nDone: encrypted ${encrypted}, blanked ${blanked}, skipped ${alreadyCurrent}, failed ${failed}.`);
  if (blankedList.length) {
    console.log(`\nBlanked rows (dead enc:v1:, old lost key):`);
    for (const b of blankedList) console.log(`   - ${b.id}  ${b.client_name ?? '(unnamed)'}`);
  }

  await db.end();
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
