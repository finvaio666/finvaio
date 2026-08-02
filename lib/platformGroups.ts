/**
 * lib/platformGroups.ts
 * Company-wide mapping of investment platforms → groups (e.g. Local UT,
 * Local EAM, Offshore EAM). Stored as JSON on the admin's Users record and
 * shared by every advisor, mirroring lib/institutions.ts.
 *
 * A holding carries a Platform ("Phillip", "SwissQuote", …); the group is what
 * the Investment page breaks AUM down by. Keeping the mapping in config rather
 * than in code means adding a new custodian is an admin action, not a deploy.
 */

import { Client, isFullPage } from '@notionhq/client';

export interface PlatformGroup {
  id:        string;
  name:      string;   // "Local UT", "Offshore EAM", …
  platforms: string[]; // ["Phillip", "iFAST"]
}

/** Used the first time an admin opens the page, before anything is saved. */
export const DEFAULT_PLATFORM_GROUPS: PlatformGroup[] = [
  { id: 'local-ut',     name: 'Local UT',     platforms: ['Phillip', 'iFAST'] },
  { id: 'local-eam',    name: 'Local EAM',    platforms: ['Maybank', 'CGS'] },
  { id: 'offshore-eam', name: 'Offshore EAM', platforms: ['SwissQuote', 'MSSG'] },
];

const PROP = 'Platform Groups JSON';

function hostNotion(): Client | null {
  const key = process.env.NOTION_API_KEY;
  return key ? new Client({ auth: key }) : null;
}

function readJson(p: Record<string, unknown>): PlatformGroup[] | null {
  const v = p[PROP] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  const txt = v?.type === 'rich_text' ? (v.rich_text?.map(r => r.plain_text).join('') ?? '') : '';
  if (!txt) return null;
  try {
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? (parsed as PlatformGroup[]) : null;
  } catch { return null; }
}

/**
 * The first user record that has a saved mapping wins (in practice only the
 * admin's record is ever written). Falls back to the defaults so a fresh
 * workspace still shows a sensible structure.
 */
export async function getPlatformGroups(): Promise<PlatformGroup[]> {
  const notion  = hostNotion();
  const usersDb = process.env.NOTION_USERS_DB_ID;
  if (!notion || !usersDb) return DEFAULT_PLATFORM_GROUPS;
  try {
    const res = await notion.databases.query({ database_id: usersDb, page_size: 50 });
    for (const pg of res.results) {
      if (!isFullPage(pg)) continue;
      const groups = readJson(pg.properties as Record<string, unknown>);
      if (groups) return groups;
    }
    return DEFAULT_PLATFORM_GROUPS;
  } catch { return DEFAULT_PLATFORM_GROUPS; }
}

/**
 * Write the canonical mapping to the admin's record and clear it from every
 * other record, so the admin's copy stays the single source of truth (this is
 * what makes deletions stick — same reasoning as setCompanyInstitutions).
 */
export async function setPlatformGroups(adminId: string, groups: PlatformGroup[]): Promise<void> {
  const notion  = hostNotion();
  const usersDb = process.env.NOTION_USERS_DB_ID;
  if (!notion || !usersDb) throw new Error('Server config error');

  const json = JSON.stringify(groups);
  // Notion caps a single rich_text item at 2000 chars — chunk so a long list
  // of platforms can't silently truncate.
  const chunks = json.match(/[\s\S]{1,1900}/g) ?? [''];

  await notion.pages.update({
    page_id: adminId,
    properties: { [PROP]: { rich_text: chunks.map(c => ({ text: { content: c } })) } } as never,
  });

  try {
    const res = await notion.databases.query({ database_id: usersDb, page_size: 50 });
    for (const pg of res.results) {
      if (!isFullPage(pg) || pg.id === adminId) continue;
      if (!readJson(pg.properties as Record<string, unknown>)) continue;
      await notion.pages.update({
        page_id: pg.id,
        properties: { [PROP]: { rich_text: [] } } as never,
      }).catch(() => {});
    }
  } catch { /* non-critical */ }
}

/** Group name a platform belongs to, or '' when it hasn't been assigned yet. */
export function groupForPlatform(groups: PlatformGroup[], platform: string): string {
  if (!platform) return '';
  const hit = groups.find(g => g.platforms.some(p => p.toLowerCase() === platform.toLowerCase()));
  return hit?.name ?? '';
}
