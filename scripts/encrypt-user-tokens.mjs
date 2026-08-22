/**
 * encrypt-user-tokens.mjs
 * One-time migration: encrypts the stored credentials on the LIVE Supabase
 * `users` table with AES-256-GCM (format `enc:v1:<base64(iv|ct|tag)>` — MUST
 * stay byte-identical to lib/nricCrypto.ts / lib/fieldCrypto.ts). Columns:
 *   notion_api_key, gmail_refresh_token, outlook_refresh_token,
 *   calendar_refresh_token, drive_refresh_token
 * Values already carrying the enc:v1: prefix are skipped, so re-running is safe.
 *
 * ORDER MATTERS: the decrypt-on-read code (lib/repos/users.ts) must already be
 * deployed before this runs, or the app hands ciphertext to Google/Microsoft as
 * a "token" and email/calendar break. decryptField passes plaintext through, so
 * deploying the code first is harmless.
 *
 * Usage:
 *   node scripts/encrypt-user-tokens.mjs             # DRY RUN
 *   node scripts/encrypt-user-tokens.mjs --apply     # encrypt + write (backup first)
 *
 * --apply writes a plaintext backup to scripts/.token-backup.csv (gitignored).
 * That file contains LIVE OAuth refresh tokens — DELETE it the moment the
 * migration is verified.
 */

import { createCipheriv, randomBytes, createDecipheriv } from 'node:crypto';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const require = createRequire(path.join(repoRoot, 'x.js'));

// Manually parse .env.local (avoids needing dotenv)
fs.readFileSync(path.join(repoRoot, '.env.local'), 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim();
});

const { createClient } = require('@supabase/supabase-js');

const PREFIX = 'enc:v1:';
const COLS = ['notion_api_key', 'gmail_refresh_token', 'outlook_refresh_token', 'calendar_refresh_token', 'drive_refresh_token'];

function getKey() {
  const raw = process.env.NRIC_ENCRYPTION_KEY ?? '';
  if (!raw) { console.error('❌ NRIC_ENCRYPTION_KEY is not set in .env.local'); process.exit(1); }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) { console.error('❌ NRIC_ENCRYPTION_KEY must be 32 bytes base64'); process.exit(1); }
  return key;
}
function encryptField(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64');
}
function decryptField(stored, key) {
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12), tag = buf.subarray(buf.length - 16), ct = buf.subarray(12, buf.length - 16);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const key = getKey();
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`\n🔍 Scanning users table (${apply ? 'APPLY' : 'DRY RUN'})…`);
  const { data, error } = await sb.from('users').select(['notion_id', 'name', ...COLS].join(', '));
  if (error) { console.error('❌ read failed:', error.message); process.exit(1); }

  const updates = [];            // { notion_id, name, patch, backup: [{col, plain}] }
  let alreadyEnc = 0, empty = 0;
  for (const row of data) {
    const patch = {}, backup = [];
    for (const col of COLS) {
      const val = row[col];
      if (!val) { empty++; continue; }
      if (val.startsWith(PREFIX)) { alreadyEnc++; continue; }
      patch[col] = encryptField(val, key);
      backup.push({ col, plain: val });
    }
    if (Object.keys(patch).length) updates.push({ notion_id: row.notion_id, name: row.name ?? '(unnamed)', patch, backup });
  }

  const totalVals = updates.reduce((n, u) => n + u.backup.length, 0);
  console.log(`\n   ${empty} empty · ${alreadyEnc} already encrypted · ${totalVals} plaintext credential value(s) across ${updates.length} user(s)\n`);
  for (const u of updates) console.log(`   ${apply ? 'encrypting' : 'would encrypt'}: ${u.name} → [${u.backup.map(b => b.col).join(', ')}]`);

  if (!apply) { console.log('\nDry run only — re-run with --apply to write.'); return; }
  if (!updates.length) { console.log('\nNothing to do.'); return; }

  // Plaintext backup (LIVE tokens) — gitignored. DELETE after verifying.
  const backupPath = path.join(__dirname, '.token-backup.csv');
  const lines = ['notion_id,name,column,plaintext'];
  for (const u of updates) for (const b of u.backup) lines.push(`${u.notion_id},"${u.name.replace(/"/g, '""')}",${b.col},"${b.plain.replace(/"/g, '""')}"`);
  fs.writeFileSync(backupPath, lines.join('\n'), 'utf8');
  console.log(`\n💾 Plaintext token backup → ${backupPath} — DELETE after verifying.\n`);

  let ok = 0, failed = 0;
  for (const u of updates) {
    try {
      // Per-record sanity: every ciphertext must round-trip before we write it.
      for (const [col, ct] of Object.entries(u.patch)) {
        const orig = u.backup.find(b => b.col === col).plain;
        if (decryptField(ct, key) !== orig) throw new Error(`round-trip mismatch on ${col}`);
      }
      const { error: upErr } = await sb.from('users').update(u.patch).eq('notion_id', u.notion_id);
      if (upErr) throw new Error(upErr.message);
      ok++; console.log(`   ✅ ${u.name}`);
    } catch (e) {
      failed++; console.error(`   ❌ ${u.name}: ${e.message}`);
    }
  }
  console.log(`\nDone: ${ok} user(s) encrypted, ${failed} failed.`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
