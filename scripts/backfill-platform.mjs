/**
 * Adds the "Platform" select property to Portfolio Holdings (if missing) and
 * backfills it for every holding that doesn't have one yet.
 *
 * Platform is the custodian/trading venue a holding sits on — Phillip, iFAST,
 * Maybank, CGS, SwissQuote, MSSG — as opposed to "Institution", which on
 * FAME-synced rows is the *fund house* (AHAM, Principal, United…), not the
 * platform. The app groups platforms into Local UT / Local EAM / Offshore EAM;
 * that grouping is admin-managed and lives separately (see lib/platformGroups.ts).
 *
 * Resolution order (only applied to rows with a blank Platform):
 *   1. FAME Account No present  → Phillip  (FAME is the Phillip/Bill Morrisons feed)
 *   2. Institution matches a known alias → that platform
 *   3. otherwise                → left blank and reported, so it can be fixed by hand
 *
 * Safe to re-run: rows that already have a Platform are never touched.
 *
 * Usage:  node scripts/backfill-platform.mjs --dry-run
 *         node scripts/backfill-platform.mjs
 */

import { Client, isFullPage } from '@notionhq/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

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

const PORTFOLIO_DB = '363de6dd1dfe8058b73ec7fa8bb431fb';

const notion = new Client({ auth: NOTION_KEY });
const sleep  = ms => new Promise(r => setTimeout(r, ms));

/** Every platform the app knows about, with the colour used in the Notion select. */
export const PLATFORMS = [
  { name: 'Phillip',    color: 'orange' },
  { name: 'iFAST',      color: 'blue'   },
  { name: 'Maybank',    color: 'yellow' },
  { name: 'CGS',        color: 'green'  },
  { name: 'SwissQuote', color: 'red'    },
  { name: 'MSSG',       color: 'purple' },
];

/** Loose text → canonical platform name. */
const ALIASES = [
  [/^i\s*-?\s*fast/i,                      'iFAST'],
  [/phillip|poems|pmart|pgwa/i,            'Phillip'],
  [/maybank|mbb/i,                         'Maybank'],
  [/\bcgs\b|cimb.?securities/i,            'CGS'],
  [/swiss\s*-?\s*quote/i,                  'SwissQuote'],
  [/\bmssg\b|morgan\s*stanley/i,           'MSSG'],
];

function platformFromInstitution(text) {
  const t = (text || '').trim();
  if (!t) return '';
  for (const [re, name] of ALIASES) if (re.test(t)) return name;
  return '';
}

async function notionCall(fn) {
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (err?.code === 'rate_limited' && attempt < MAX_RETRIES) {
        const retryAfter = Number(err?.headers?.get?.('retry-after') ?? 0);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 + 200 : Math.min(1000 * 2 ** attempt, 16000);
        console.log(`⏳ Rate limited — waiting ${(waitMs / 1000).toFixed(1)}s…`);
        await sleep(waitMs);
      } else throw err;
    }
  }
}

async function fetchAll(database_id) {
  const pages = []; let cursor;
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

console.log(`\n🚀 FINVA — Backfill holding Platform${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log('━'.repeat(52));

// ── 1. Ensure the Platform property exists, with every known option ───────────
const db = await notionCall(() => notion.databases.retrieve({ database_id: PORTFOLIO_DB }));
const hasPlatform = Boolean(db.properties['Platform']);
console.log(hasPlatform ? '✓ "Platform" property already exists' : '➕ "Platform" property missing — will create');

if (!DRY_RUN) {
  await notionCall(() => notion.databases.update({
    database_id: PORTFOLIO_DB,
    properties: { 'Platform': { select: { options: PLATFORMS } } },
  }));
  console.log(`✓ "Platform" select ready with options: ${PLATFORMS.map(p => p.name).join(', ')}`);
}

// ── 2. Backfill ───────────────────────────────────────────────────────────────
console.log('\n📈 Fetching holdings…');
const holdings = await fetchAll(PORTFOLIO_DB);
console.log(`   ${holdings.length} holdings\n`);

let filled = 0, already = 0, unresolved = 0;
const unresolvedSamples = new Map();
const tally = {};

for (const h of holdings) {
  const p = h.properties;
  const current = p['Platform']?.select?.name ?? '';
  if (current) { already++; tally[current] = (tally[current] ?? 0) + 1; continue; }

  const fameAcct = p['FAME Account No']?.rich_text?.[0]?.plain_text ?? '';
  const inst     = p['Institution']?.rich_text?.[0]?.plain_text ?? '';
  const name     = p['Holding Name']?.title?.[0]?.plain_text ?? '(unknown)';

  const platform = fameAcct ? 'Phillip' : platformFromInstitution(inst);

  if (!platform) {
    unresolved++;
    const key = inst || '(blank institution)';
    unresolvedSamples.set(key, (unresolvedSamples.get(key) ?? 0) + 1);
    continue;
  }

  tally[platform] = (tally[platform] ?? 0) + 1;
  filled++;
  if (!DRY_RUN) {
    await notionCall(() => notion.pages.update({
      page_id: h.id,
      properties: { 'Platform': { select: { name: platform } } },
    }));
    await sleep(340);
  } else if (filled <= 5) {
    console.log(`   e.g. ${name} — ${inst || '(no institution)'} → ${platform}`);
  }
}

console.log('\n' + '━'.repeat(52));
console.log(`Platform tally:`);
Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   ${String(v).padStart(5)}  ${k}`));
console.log(`\n🎉 Done — set: ${filled}, already had one: ${already}, unresolved: ${unresolved}${DRY_RUN ? ' (dry run — nothing written)' : ''}`);

if (unresolved) {
  console.log('\n⚠️  Could not resolve a platform for these Institution values:');
  [...unresolvedSamples.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`   ${String(v).padStart(5)}  "${k}"`));
  console.log('   Add an alias in ALIASES above, or set Platform by hand in Notion.');
}
