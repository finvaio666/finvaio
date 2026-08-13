/**
 * lib/institutions.ts
 * Company-wide institution whitelist. Stored on the admin's Users record and
 * shared by every advisor's Email Hub. Reading merges all user records (so no
 * legacy per-advisor entries are lost); the admin's save becomes canonical.
 */

import { Client, isFullPage } from '@notionhq/client';
import type { Institution } from '@/app/api/email/institutions/route';
import * as sbUsers from './repos/users';

const useSupabaseUsers = () => process.env.DATA_SOURCE_USERS === 'supabase';

function hostNotion(): Client | null {
  const key = process.env.NOTION_API_KEY;
  if (!key) return null;
  return new Client({ auth: key });
}

/** Parse an institutions JSON blob — shared by both data sources. */
export function parseInstitutions(txt: string | null | undefined): Institution[] {
  if (!txt) return [];
  try { return JSON.parse(txt) as Institution[]; } catch { return []; }
}

/** Merge institution lists, deduped by lowercased domain — first occurrence wins.
 *  Shared by both data sources so the merge rule exists in exactly one place. */
export function mergeInstitutions(lists: Institution[][]): Institution[] {
  const merged = new Map<string, Institution>();
  for (const list of lists) {
    for (const inst of list) {
      const key = (inst.domain || '').toLowerCase();
      if (key && !merged.has(key)) merged.set(key, inst);
    }
  }
  return [...merged.values()];
}

function rtJson(p: Record<string, unknown>, key: string): Institution[] {
  const v = p[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  const txt = v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : '';
  return parseInstitutions(txt);
}

/** Merge every user record's institution list (deduped by domain). */
export async function getCompanyInstitutions(): Promise<Institution[]> {
  if (useSupabaseUsers()) {
    try {
      const blobs = await sbUsers.listCompanyJson('institutions_json');
      return mergeInstitutions(blobs.map(parseInstitutions));
    } catch { return []; }
  }

  const notion  = hostNotion();
  const usersDb = process.env.NOTION_USERS_DB_ID;
  if (!notion || !usersDb) return [];
  try {
    const res = await notion.databases.query({ database_id: usersDb, page_size: 50 });
    const lists: Institution[][] = [];
    for (const pg of res.results) {
      if (!isFullPage(pg)) continue;
      lists.push(rtJson(pg.properties as Record<string, unknown>, 'Institutions JSON'));
    }
    return mergeInstitutions(lists);
  } catch { return []; }
}

export async function getCompanyDomains(): Promise<string[]> {
  return [...new Set((await getCompanyInstitutions()).map(i => i.domain).filter(Boolean))];
}

/**
 * Save the canonical list to the admin's record and CLEAR every other user's
 * list, so the admin record becomes the single source of truth (removals stick).
 */
export async function setCompanyInstitutions(adminId: string, list: Institution[]): Promise<void> {
  if (useSupabaseUsers()) {
    // 1. admin's record becomes canonical (untruncated — text column)
    await sbUsers.writeCompanyJson('institutions_json', adminId, JSON.stringify(list));
    // 2. clear everyone else so removals stick (non-critical, mirrors Notion)
    try { await sbUsers.clearCompanyJsonExcept('institutions_json', adminId); } catch { /* non-critical */ }
    return;
  }

  const notion  = hostNotion();
  const usersDb = process.env.NOTION_USERS_DB_ID;
  if (!notion || !usersDb) throw new Error('Server config error');

  // 1. Write the full list to the admin's record
  await notion.pages.update({
    page_id: adminId,
    properties: { 'Institutions JSON': { rich_text: [{ text: { content: JSON.stringify(list).slice(0, 2000) } }] } } as never,
  });

  // 2. Clear any other record that still has institutions (one-time migration + keeps removals authoritative)
  try {
    const res = await notion.databases.query({ database_id: usersDb, page_size: 50 });
    for (const pg of res.results) {
      if (!isFullPage(pg) || pg.id === adminId) continue;
      const existing = rtJson(pg.properties as Record<string, unknown>, 'Institutions JSON');
      if (existing.length === 0) continue;
      await notion.pages.update({
        page_id: pg.id,
        properties: { 'Institutions JSON': { rich_text: [{ text: { content: '' } }] } } as never,
      }).catch(() => {});
    }
  } catch { /* non-critical */ }
}
