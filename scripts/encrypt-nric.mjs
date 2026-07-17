/**
 * encrypt-nric.mjs
 * One-time migration: encrypts plaintext "NRIC / Reg No" values in the Clients
 * DB with AES-256-GCM (format `enc:v1:<base64(iv|ct|tag)>` — MUST stay
 * byte-identical to lib/nricCrypto.ts). Values already carrying the enc:v1:
 * prefix are skipped, so re-running is safe.
 *
 * Usage:
 *   node scripts/encrypt-nric.mjs               # DRY RUN — lists what would change
 *   node scripts/encrypt-nric.mjs --apply       # encrypt + write back (writes backup first)
 *   node scripts/encrypt-nric.mjs --apply --limit 2   # test pass on first 2 records
 *
 * Before writing, --apply saves a plaintext backup to scripts/.nric-backup.csv
 * (gitignored). DELETE IT once the migration is verified.
 */

import { Client } from '@notionhq/client';
import { createCipheriv, randomBytes, createDecipheriv } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Manually parse .env.local (avoids needing dotenv package)
const envPath = path.join(__dirname, '../.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim();
});

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const CLIENTS_DB = process.env.COMPANY_CLIENTS_DB_ID || '362de6dd-1dfe-80e5-9275-e4ce2fc046b2';

const PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.NRIC_ENCRYPTION_KEY ?? '';
  if (!raw) { console.error('❌ NRIC_ENCRYPTION_KEY is not set in .env.local'); process.exit(1); }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) { console.error('❌ NRIC_ENCRYPTION_KEY must be 32 bytes base64'); process.exit(1); }
  return key;
}

function encryptNric(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64');
}

function decryptNric(stored, key) {
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const apply = process.argv.includes('--apply');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity;
  const key = getKey();

  console.log(`\n🔍 Scanning Clients DB ${CLIENTS_DB} (${apply ? 'APPLY' : 'DRY RUN'}${Number.isFinite(limit) ? `, limit ${limit}` : ''})…`);

  // Collect every page with a non-empty NRIC
  const targets = [];
  let alreadyEncrypted = 0, empty = 0, cursor = undefined;
  do {
    const res = await notion.databases.query({
      database_id: CLIENTS_DB,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const prop = page.properties['NRIC / Reg No'];
      const raw = prop?.type === 'rich_text' ? prop.rich_text[0]?.plain_text ?? '' : '';
      const name = Object.values(page.properties).find(p => p.type === 'title')?.title?.[0]?.plain_text ?? '(unnamed)';
      if (!raw) { empty++; continue; }
      if (raw.startsWith(PREFIX)) { alreadyEncrypted++; continue; }
      targets.push({ id: page.id, name, raw });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const todo = targets.slice(0, limit);
  console.log(`\n   ${empty} empty · ${alreadyEncrypted} already encrypted · ${targets.length} plaintext found · ${todo.length} to process\n`);

  if (!apply) {
    for (const t of todo) console.log(`   would encrypt: ${t.name}  (${t.raw.slice(0, 4)}…${t.raw.slice(-4)})`);
    console.log('\nDry run only — re-run with --apply to write.');
    return;
  }

  // Plaintext backup (recovery net if the key is ever lost). Gitignored. Delete after verifying.
  const backupPath = path.join(__dirname, '.nric-backup.csv');
  const backupLines = ['page_id,client_name,nric'];
  for (const t of todo) backupLines.push(`${t.id},"${t.name.replace(/"/g, '""')}","${t.raw.replace(/"/g, '""')}"`);
  fs.writeFileSync(backupPath, backupLines.join('\n'), 'utf8');
  console.log(`💾 Plaintext backup written to ${backupPath} — DELETE after verifying.\n`);

  let ok = 0, failed = 0;
  for (const t of todo) {
    try {
      const enc = encryptNric(t.raw, key);
      if (decryptNric(enc, key) !== t.raw) throw new Error('round-trip mismatch'); // sanity per record
      await notion.pages.update({
        page_id: t.id,
        properties: { 'NRIC / Reg No': { rich_text: [{ text: { content: enc } }] } },
      });
      ok++;
      console.log(`   ✅ ${t.name}`);
    } catch (e) {
      failed++;
      console.error(`   ❌ ${t.name}: ${e.message}`);
    }
    await sleep(350); // stay under Notion's ~3 req/s limit
  }

  console.log(`\nDone: ${ok} encrypted, ${failed} failed.`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
