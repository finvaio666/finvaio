/**
 * FAME reconciliation — finds manual/legacy Portfolio Holdings rows (no
 * "FAME Account No") that are likely superseded by holdings the FAME sync
 * has since added for the same client (which do carry a FAME Account No).
 *
 * This exists because the FAME → Notion sync is append-only: it creates a
 * row per fund per account but never checks whether an older manual entry
 * already covers that same money (e.g. a "PMART" wrapper row entered before
 * FAME sync existed, now duplicated by the individual funds FAME synced in
 * detail). Left unchecked, every FAME sync makes the Portfolio page's
 * running totals worse.
 *
 * READ-ONLY. Never writes to Notion or deletes anything — it only prints/
 * writes a candidate list for a human to review. Run this after every FAME
 * sync (see fame-portfolio-download skill).
 *
 * Usage:  node scripts/fame-reconcile-duplicates.mjs
 *         node scripts/fame-reconcile-duplicates.mjs --csv=out.csv
 */

import { Client, isFullPage } from '@notionhq/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const csvArg = process.argv.find(a => a.startsWith('--csv='));
const CSV_PATH = csvArg ? csvArg.slice('--csv='.length) : null;

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  });
}

const NOTION_KEY = process.env.NOTION_API_KEY;
if (!NOTION_KEY) { console.error('❌ NOTION_API_KEY not set. Add it to .env.local'); process.exit(1); }

const DB = {
  clients:   '362de6dd1dfe80e59275e4ce2fc046b2',
  portfolio: '363de6dd1dfe8058b73ec7fa8bb431fb',
};

const notion = new Client({ auth: NOTION_KEY });
const sleep  = ms => new Promise(r => setTimeout(r, ms));

async function notionCall(fn) {
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (err?.code === 'rate_limited' && attempt < MAX_RETRIES) {
        const retryAfter = Number(err?.headers?.get?.('retry-after') ?? 0);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 + 200 : Math.min(1000 * 2 ** attempt, 16000);
        await sleep(waitMs);
      } else throw err;
    }
  }
}

async function fetchAll(database_id) {
  const pages = [];
  let cursor;
  do {
    const res = await notionCall(() => notion.databases.query({
      database_id, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
    }));
    pages.push(...res.results.filter(isFullPage));
    cursor = res.has_more ? res.next_cursor : undefined;
    if (cursor) await sleep(350);
  } while (cursor);
  return pages;
}

// Known platform labels used for old manual "wrapper" entries (a single lump
// row standing in for a whole account, entered before FAME sync broke it out
// fund-by-fund). Anything with one of these institutions AND no fund-like
// name is treated as a wrapper candidate rather than a real standalone fund.
const WRAPPER_INSTITUTIONS = ['phillip capital management', 'phillip mutual berhad', 'phillip', 'ifast'];
const WRAPPER_NAME_HINTS   = ['pmart', 'pgwa', 'etf', 'cash account', 'money market'];

function normalizeName(s) {
  return (s || '')
    .toUpperCase()
    .replace(/[().,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const wa = new Set(na.split(' ')), wb = new Set(nb.split(' '));
  const shared = [...wa].filter(w => wb.has(w)).length;
  return shared / Math.max(wa.size, wb.size);
}

console.log('🔎 Fetching all clients + holdings (read-only)…');
const [clientPages, holdingPages] = await Promise.all([
  fetchAll(DB.clients),
  fetchAll(DB.portfolio),
]);
console.log(`   ${clientPages.length} clients, ${holdingPages.length} holdings\n`);

const clientNames = {};
clientPages.forEach(c => {
  clientNames[c.id] = c.properties['Client Name']?.title?.[0]?.plain_text ?? '(unknown)';
});

function parseHolding(h) {
  const p = h.properties;
  const valueMYR  = p['Value (MYR)']?.number ?? 0;
  const valueOrig = p['Value (Original Currency)']?.number ?? 0;
  const fxStored  = p['FX Rate to MYR']?.number ?? 0;
  const currency  = p['Currency']?.select?.name ?? 'MYR';
  const value = valueMYR > 0 ? valueMYR
    : (fxStored > 0 && valueOrig > 0) ? valueOrig * fxStored
    : (currency === 'MYR' ? valueOrig : 0);
  return {
    id: h.id,
    url: h.url,
    clientId: p['👥 Clients']?.relation?.[0]?.id ?? '',
    name: p['Holding Name']?.title?.[0]?.plain_text ?? '',
    institution: p['Institution']?.rich_text?.[0]?.plain_text ?? '',
    assetClass: p['Asset class']?.select?.name ?? '',
    fameAccountNo: p['FAME Account No']?.rich_text?.[0]?.plain_text ?? '',
    value,
  };
}

const holdings = holdingPages.map(parseHolding).filter(h => h.clientId);
const byClient = new Map();
for (const h of holdings) {
  const arr = byClient.get(h.clientId) ?? [];
  arr.push(h);
  byClient.set(h.clientId, arr);
}

const candidates = [];

for (const [clientId, rows] of byClient) {
  const synced = rows.filter(h => h.fameAccountNo);
  const manual = rows.filter(h => !h.fameAccountNo);
  if (!synced.length || !manual.length) continue; // nothing to reconcile

  for (const m of manual) {
    // 1. Try a name match against any synced fund for this same client.
    let best = null, bestScore = 0;
    for (const s of synced) {
      const score = nameSimilarity(m.name, s.name);
      if (score > bestScore) { bestScore = score; best = s; }
    }

    if (best && bestScore >= 0.6) {
      candidates.push({
        client: clientNames[clientId], manual: m, match: best, score: bestScore,
        confidence: bestScore >= 0.9 ? 'HIGH' : 'MEDIUM',
        reason: `Name matches synced holding "${best.name}" (Account ${best.fameAccountNo})`,
      });
      continue;
    }

    // 2. No name match — flag known wrapper-style labels for manual review.
    const instLower = m.institution.toLowerCase();
    const looksLikeWrapper = WRAPPER_INSTITUTIONS.some(w => instLower.includes(w))
      && (WRAPPER_NAME_HINTS.some(h => m.name.toLowerCase().includes(h)) || m.assetClass === 'EPF');
    if (looksLikeWrapper) {
      candidates.push({
        client: clientNames[clientId], manual: m, match: null, score: 0,
        confidence: 'MEDIUM',
        reason: `Institution "${m.institution}" / asset class "${m.assetClass}" matches the wrapper-account pattern (client has ${synced.length} FAME-synced fund rows) — verify sum of synced funds against this account before archiving`,
      });
    }
    // else: no match, not wrapper-shaped — leave unflagged (likely a genuine
    // standalone manual holding FAME doesn't cover, e.g. property, ASB).
  }
}

candidates.sort((a, b) => (b.confidence === 'HIGH') - (a.confidence === 'HIGH') || b.manual.value - a.manual.value);

console.log(`📋 ${candidates.length} manual holdings flagged as likely duplicates (read-only — nothing changed):\n`);
for (const c of candidates) {
  console.log(`[${c.confidence}] ${c.client} — "${c.manual.name}" (MYR ${Math.round(c.manual.value).toLocaleString()}, ${c.manual.institution})`);
  console.log(`    ${c.reason}`);
  console.log(`    Notion: ${c.manual.url}\n`);
}

const totalFlagged = candidates.reduce((s, c) => s + c.manual.value, 0);
console.log(`💰 Total value flagged for review: MYR ${Math.round(totalFlagged).toLocaleString()}`);
console.log(`\nNothing was deleted or archived. Review the list above, then archive confirmed rows manually in Notion (or ask for a follow-up script scoped to the approved IDs).`);

if (CSV_PATH) {
  const header = 'Confidence,Client,Holding Name,Institution,Value (MYR),Matched Synced Holding,Reason,Notion URL';
  const lines = candidates.map(c => [
    c.confidence, c.client, c.manual.name, c.manual.institution, Math.round(c.manual.value),
    c.match ? c.match.name : '', c.reason.replace(/,/g, ';'), c.manual.url,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  fs.writeFileSync(CSV_PATH, [header, ...lines].join('\n'));
  console.log(`\n📄 CSV written to ${CSV_PATH}`);
}
