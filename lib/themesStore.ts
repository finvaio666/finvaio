/**
 * lib/themesStore.ts
 * Company-wide email-theme configuration, stored as JSON on the admin's Users
 * record (mirrors lib/institutions). Falls back to DEFAULT_THEMES when nothing
 * is saved. Short in-process cache keeps the email-list hot path fast.
 */

import { Client, isFullPage } from '@notionhq/client';
import { DEFAULT_THEMES, OTHER_THEME, type Theme } from './emailThemes';
import * as sbUsers from './repos/users';

const useSupabaseUsers = () => process.env.DATA_SOURCE_USERS === 'supabase';

function hostNotion(): Client | null {
  const key = process.env.NOTION_API_KEY;
  return key ? new Client({ auth: key }) : null;
}

let cache: { themes: Theme[]; ts: number } | null = null;
const TTL = 5 * 60 * 1000; // 5 min

/** Parse a themes JSON blob — shared by both data sources. */
function parseThemes(txt: string | null | undefined): Theme[] | null {
  if (!txt) return null;
  try {
    const arr = JSON.parse(txt) as Theme[];
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch { return null; }
}

function readJson(p: Record<string, unknown>): Theme[] | null {
  const v = p['Email Themes JSON'] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  const txt = v?.type === 'rich_text' ? (v.rich_text?.map(r => r.plain_text).join('') ?? '') : '';
  return parseThemes(txt);
}

/** Ensure the catch-all "other" theme is always present and last. */
function withOther(list: Theme[]): Theme[] {
  const cleaned = list.filter(t => t.id !== 'other');
  const other = list.find(t => t.id === 'other') || OTHER_THEME;
  return [...cleaned, { ...other, locked: true }];
}

/** Company themes — custom config if saved, otherwise the built-in defaults. */
export async function getCompanyThemes(): Promise<Theme[]> {
  if (cache && Date.now() - cache.ts < TTL) return cache.themes;

  if (useSupabaseUsers()) {
    let themes = DEFAULT_THEMES;
    try {
      // iterate: a blob that fails to parse must not stop the search (mirrors
      // the Notion loop over user pages)
      for (const txt of await sbUsers.listCompanyJson('email_themes_json')) {
        const parsed = parseThemes(txt);
        if (parsed) { themes = withOther(parsed); break; }
      }
    } catch { /* fall back to defaults */ }
    cache = { themes, ts: Date.now() };
    return themes;
  }

  const notion  = hostNotion();
  const usersDb = process.env.NOTION_USERS_DB_ID;
  let themes = DEFAULT_THEMES;

  if (notion && usersDb) {
    try {
      const res = await notion.databases.query({ database_id: usersDb, page_size: 50 });
      for (const pg of res.results) {
        if (!isFullPage(pg)) continue;
        const parsed = readJson(pg.properties as Record<string, unknown>);
        if (parsed) { themes = withOther(parsed); break; }
      }
    } catch { /* fall back to defaults */ }
  }

  cache = { themes, ts: Date.now() };
  return themes;
}

/** Save the canonical theme list to the admin's record. */
export async function setCompanyThemes(adminId: string, list: Theme[]): Promise<void> {
  if (useSupabaseUsers()) {
    const toSave = withOther(list);
    await sbUsers.writeCompanyJson('email_themes_json', adminId, JSON.stringify(toSave));
    cache = { themes: toSave, ts: Date.now() };
    return;
  }
  const notion = hostNotion();
  if (!notion) throw new Error('Server config error');
  const toSave = withOther(list);
  await notion.pages.update({
    page_id: adminId,
    properties: { 'Email Themes JSON': { rich_text: [{ text: { content: JSON.stringify(toSave).slice(0, 1990) } }] } } as never,
  });
  cache = { themes: toSave, ts: Date.now() };
}

export function clearThemesCache() { cache = null; }
