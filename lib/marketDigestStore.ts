/**
 * lib/marketDigestStore.ts
 * Persists the generated Market Digest company-wide (on the Admin's Users
 * record, 'Market Digest JSON'), so every advisor sees the same fresh digest
 * and the daily cron can update it without a user session.
 */

import { Client, isFullPage } from '@notionhq/client';
import { getBnmMarketData, generateMarketDigest, type MarketData } from './marketData';
import * as sbUsers from './repos/users';

const useSupabaseUsers = () => process.env.DATA_SOURCE_USERS === 'supabase';

export interface StoredDigest {
  digest:      string;     // markdown
  data:        MarketData; // raw live figures
  dataDate:    string;     // YYYY-MM-DD of the figures
  generatedAt: string;     // ISO timestamp of generation
}

/** Parse a stored-digest blob — shared by both data sources. */
export function parseDigest(txt: string | null | undefined): StoredDigest | null {
  if (!txt) return null;
  try { return JSON.parse(txt) as StoredDigest; } catch { return null; }
}

function hostNotion(): Client | null {
  const key = process.env.NOTION_API_KEY;
  return key ? new Client({ auth: key }) : null;
}

let cache: { d: StoredDigest | null; ts: number } | null = null;
const TTL = 5 * 60 * 1000;

async function findStoragePageId(notion: Client, usersDb: string): Promise<string | null> {
  const res = await notion.databases.query({ database_id: usersDb, page_size: 50 });
  const pages = res.results.filter(isFullPage);
  // Prefer an Admin record; fall back to the first user.
  const admin = pages.find(p => (p.properties['Role'] as { select?: { name: string } })?.select?.name === 'Admin');
  return (admin ?? pages[0])?.id ?? null;
}

export async function getStoredDigest(): Promise<StoredDigest | null> {
  if (cache && Date.now() - cache.ts < TTL) return cache.d;

  if (useSupabaseUsers()) {
    try {
      // first parseable blob wins; a bad one must not stop the search
      for (const txt of await sbUsers.listCompanyJson('market_digest_json')) {
        const d = parseDigest(txt);
        if (d) { cache = { d, ts: Date.now() }; return d; }
      }
    } catch { /* ignore */ }
    return null;
  }

  const notion = hostNotion();
  const usersDb = process.env.NOTION_USERS_DB_ID;
  if (!notion || !usersDb) return null;
  try {
    const res = await notion.databases.query({ database_id: usersDb, page_size: 50 });
    for (const pg of res.results) {
      if (!isFullPage(pg)) continue;
      const v = pg.properties['Market Digest JSON'] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
      const txt = v?.type === 'rich_text' ? (v.rich_text?.map(r => r.plain_text).join('') ?? '') : '';
      if (txt) {
        const d = parseDigest(txt);
        if (d) { cache = { d, ts: Date.now() }; return d; }
      }
    }
  } catch { /* ignore */ }
  return null;
}

/** Fetch live BNM data, generate the digest, and persist it. Returns the new digest. */
export async function refreshDigest(): Promise<StoredDigest> {
  const data = await getBnmMarketData();
  const digest = await generateMarketDigest(data);
  const payload: StoredDigest = { digest, data, dataDate: data.dataDate, generatedAt: new Date().toISOString() };

  if (useSupabaseUsers()) {
    try {
      const target = await sbUsers.findDigestTargetNotionId();
      // text column: store whole, no 1900-char chunking and no 18000 cap
      if (target) await sbUsers.writeCompanyJson('market_digest_json', target, JSON.stringify(payload));
    } catch { /* non-critical — still return the fresh digest */ }
    cache = { d: payload, ts: Date.now() };
    return payload;
  }

  const notion = hostNotion();
  const usersDb = process.env.NOTION_USERS_DB_ID;
  if (notion && usersDb) {
    try {
      const pageId = await findStoragePageId(notion, usersDb);
      if (pageId) {
        // Notion caps each rich_text block at 2000 chars — split into chunks
        // (read side joins them back). Cap total to stay well within limits.
        const json = JSON.stringify(payload).slice(0, 18000);
        const chunks: { text: { content: string } }[] = [];
        for (let i = 0; i < json.length; i += 1900) chunks.push({ text: { content: json.slice(i, i + 1900) } });
        await notion.pages.update({
          page_id: pageId,
          properties: { 'Market Digest JSON': { rich_text: chunks } } as never,
        });
      }
    } catch { /* non-critical — still return the fresh digest */ }
  }
  cache = { d: payload, ts: Date.now() };
  return payload;
}
