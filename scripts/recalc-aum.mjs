/**
 * Recalculate AUM (MYR) for all clients from portfolio holdings.
 *
 * Logic:
 *   - If "Value (MYR)" > 0 → use it
 *   - Else if Currency == "MYR" → use "Value (Original Currency)"
 *   - Else → 0 (FX rate missing, cannot determine)
 *
 * Usage:  node scripts/recalc-aum.mjs
 *         node scripts/recalc-aum.mjs --dry-run
 */

import { Client, isFullPage } from '@notionhq/client';

const DRY_RUN = process.argv.includes('--dry-run');

const NOTION_KEY = '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';
const DB = {
  clients:   '362de6dd1dfe80e59275e4ce2fc046b2',
  portfolio: '363de6dd1dfe8058b73ec7fa8bb431fb',
};

const notion = new Client({ auth: NOTION_KEY });
const sleep  = ms => new Promise(r => setTimeout(r, ms));
const log    = (icon, msg) => console.log(`${icon} ${msg}`);

/** Retry any Notion call on 429 rate-limit with exponential backoff */
async function notionCall(fn) {
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err?.code === 'rate_limited' && attempt < MAX_RETRIES) {
        const retryAfter = Number(err?.headers?.get?.('retry-after') ?? 0);
        const waitMs = retryAfter > 0
          ? retryAfter * 1000 + 200
          : Math.min(1000 * 2 ** attempt, 16000);
        log('⏳', `Rate limited — waiting ${(waitMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})…`);
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
}

// ── 1. Fetch ALL portfolio pages (paginate) ───────────────────────────────────
async function fetchAllPortfolio() {
  const pages = [];
  let cursor;
  do {
    const res = await notionCall(() => notion.databases.query({
      database_id: DB.portfolio,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    }));
    pages.push(...res.results.filter(isFullPage));
    cursor = res.has_more ? res.next_cursor : undefined;
    if (cursor) await sleep(400);
  } while (cursor);
  return pages;
}

// ── 2. Fetch ALL client pages ─────────────────────────────────────────────────
async function fetchAllClients() {
  const pages = [];
  let cursor;
  do {
    const res = await notionCall(() => notion.databases.query({
      database_id: DB.clients,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    }));
    pages.push(...res.results.filter(isFullPage));
    cursor = res.has_more ? res.next_cursor : undefined;
    if (cursor) await sleep(400);
  } while (cursor);
  return pages;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n🚀 ARIA — Recalculate AUM from Portfolio${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log('━'.repeat(50));

log('📈', 'Fetching all portfolio holdings…');
const holdings = await fetchAllPortfolio();
log('📊', `  ${holdings.length} holdings found`);

log('👥', 'Fetching all clients…');
const clients = await fetchAllClients();
log('📊', `  ${clients.length} clients found\n`);

// Fallback FX rates (approximate) — used when holding has no FX rate stored
const FX_FALLBACK = {
  MYR: 1,
  USD: 4.47,
  SGD: 3.32,
  GBP: 5.65,
  EUR: 4.85,
  AUD: 2.90,
  HKD: 0.57,
};

// Build AUM map: clientPageId → totalMYR
const aumMap = {};

for (const h of holdings) {
  const clientRel  = h.properties['👥 Clients']?.relation?.[0]?.id ?? '';
  if (!clientRel) continue;

  const valueMYR  = h.properties['Value (MYR)']?.number ?? 0;
  const valueOrig = h.properties['Value (Original Currency)']?.number ?? 0;
  const fxStored  = h.properties['FX Rate to MYR']?.number ?? 0;
  const currency  = h.properties['Currency']?.select?.name ?? 'MYR';
  const holdName  = h.properties['Holding Name']?.title?.[0]?.plain_text ?? '(unknown)';

  // Determine effective MYR value
  let myrValue = 0;
  if (valueMYR > 0) {
    myrValue = valueMYR;                                      // stored MYR value
  } else if (fxStored > 0 && valueOrig > 0) {
    myrValue = valueOrig * fxStored;                          // orig × stored FX
  } else if (valueOrig > 0) {
    const fx = FX_FALLBACK[currency] ?? 1;
    myrValue = valueOrig * fx;                                // fallback FX
    if (currency !== 'MYR') {
      log('⚠️ ', `  ${holdName}: no FX rate stored — using fallback ${currency} × ${fx}`);
    }
  }

  if (!aumMap[clientRel]) aumMap[clientRel] = 0;
  aumMap[clientRel] += myrValue;

  log('   ', `  ${holdName}: ${currency} ${valueOrig.toLocaleString()} → MYR ${myrValue.toLocaleString()}`);
}

// Update each client
console.log('');
let updated = 0, skipped = 0;

for (const client of clients) {
  const name     = client.properties['Client Name']?.title?.[0]?.plain_text ?? '(unknown)';
  const pageId   = client.id;
  const aum      = Math.round((aumMap[pageId] ?? 0) * 100) / 100;
  const existing = client.properties['AUM (MYR)']?.number ?? null;

  if (existing === aum && aum === 0) {
    log('⏭️ ', `Skip ${name} — no holdings, AUM stays 0`);
    skipped++;
    continue;
  }

  log(`${existing === aum ? '=' : '✏️ '}`, `${name} — AUM: ${existing ?? 'empty'} → MYR ${aum.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`);

  if (!DRY_RUN) {
    await notionCall(() => notion.pages.update({
      page_id: pageId,
      properties: { 'AUM (MYR)': { number: aum } },
    }));
    await sleep(400);
  }
  updated++;
}

console.log('\n' + '━'.repeat(50));
console.log(`🎉 Done — updated: ${updated}, skipped: ${skipped}${DRY_RUN ? ' (dry run)' : ''}`);
