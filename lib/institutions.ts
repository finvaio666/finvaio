/**
 * lib/institutions.ts
 * Company-wide institution whitelist. Stored on the admin's Users record and
 * shared by every advisor's Email Hub. Reading merges all user records (so no
 * legacy per-advisor entries are lost); the admin's save becomes canonical.
 */

import { Client, isFullPage } from '@notionhq/client';
import type { Institution } from '@/app/api/email/institutions/route';

function hostNotion(): Client | null {
  const key = process.env.NOTION_API_KEY;
  if (!key) return null;
  return new Client({ auth: key });
}

function rtJson(p: Record<string, unknown>, key: string): Institution[] {
  const v = p[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  const txt = v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : '';
  if (!txt) return [];
  try { return JSON.parse(txt) as Institution[]; } catch { return []; }
}

/** Merge every user record's institution list (deduped by domain). */
export async function getCompanyInstitutions(): Promise<Institution[]> {
  const notion  = hostNotion();
  const usersDb = process.env.NOTION_USERS_DB_ID;
  if (!notion || !usersDb) return [];
  try {
    const res = await notion.databases.query({ database_id: usersDb, page_size: 50 });
    const merged = new Map<string, Institution>();
    for (const pg of res.results) {
      if (!isFullPage(pg)) continue;
      for (const inst of rtJson(pg.properties as Record<string, unknown>, 'Institutions JSON')) {
        const key = (inst.domain || '').toLowerCase();
        if (key && !merged.has(key)) merged.set(key, inst);
      }
    }
    return [...merged.values()];
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
