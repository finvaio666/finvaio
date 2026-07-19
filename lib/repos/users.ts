/**
 * lib/repos/users.ts
 * Supabase data layer for the Users/config table (Phase 3).
 *
 * advisorId is a Notion page id (dashed in the JWT); public.users.notion_id is
 * dashless. Every lookup dashless-normalizes advisorId and keys on notion_id, so
 * existing sessions stay valid across the DATA_SOURCE_USERS flip.
 *
 * getAdvisorConfig mirrors the Notion path field-for-field, INCLUDING the
 * `stored || env.COMPANY_*` fallback (7 of 8 users rely on the env fallback).
 */
import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import { randomBytes } from 'crypto';

const TABLE = 'users';
const dashless = (id: string) => id.replace(/-/g, '');

interface UserRow {
  notion_id: string | null;
  name: string | null;
  role: string | null;
  features: string | null;
  notion_api_key: string | null;
  clients_db_id: string | null;
  portfolio_db_id: string | null;
  insurance_db_id: string | null;
  cashflow_db_id: string | null;
  meeting_notes_db_id: string | null;
  tasks_db_id: string | null;
  email_provider: string | null;
  gmail_refresh_token: string | null;
  gmail_address: string | null;
  outlook_refresh_token: string | null;
  outlook_address: string | null;
  institutions_json: string | null;
  calendar_provider: string | null;
  calendar_refresh_token: string | null;
  calendar_address: string | null;
  drive_refresh_token: string | null;
}

const USER_COLS =
  'notion_id, name, role, features, notion_api_key, clients_db_id, portfolio_db_id, insurance_db_id, cashflow_db_id, meeting_notes_db_id, tasks_db_id, email_provider, gmail_refresh_token, gmail_address, outlook_refresh_token, outlook_address, institutions_json, calendar_provider, calendar_refresh_token, drive_refresh_token';

/** Map a Supabase users row → AdvisorConfig, mirroring the Notion path's
 *  `stored || env.COMPANY_*` fallbacks so both sources return equal configs. */
function toConfig(r: UserRow): AdvisorConfig {
  const env = process.env;
  return {
    notionApiKey:     r.notion_api_key || env.NOTION_API_KEY            || '',
    clientsDbId:      r.clients_db_id  || env.COMPANY_CLIENTS_DB_ID      || '',
    portfolioDbId:    r.portfolio_db_id|| env.COMPANY_PORTFOLIO_DB_ID    || '',
    insuranceDbId:    r.insurance_db_id|| env.COMPANY_INSURANCE_DB_ID    || '',
    cashflowDbId:     r.cashflow_db_id || env.COMPANY_CASHFLOW_DB_ID     || '',
    assetsDbId:       env.COMPANY_ASSETS_DB_ID || '',            // no per-user column (vestigial post-cutover)
    meetingNotesDbId: r.meeting_notes_db_id || env.COMPANY_MEETING_NOTES_DB_ID || '',
    tasksDbId:        r.tasks_db_id    || env.COMPANY_TASKS_DB_ID        || '',
    insurancePlansDbId: '',                                       // Notion path has no env fallback; products dormant → ''
    fundsDbId:          '',
    features:  (r.features ?? '').split(',').map(f => f.trim().toLowerCase()).filter(Boolean),
    role:  r.role ?? 'Advisor',
    name:  r.name ?? '',
    emailProvider:        (r.email_provider || 'gmail').toLowerCase(),
    gmailRefreshToken:    r.gmail_refresh_token ?? '',
    gmailAddress:         r.gmail_address ?? '',
    outlookRefreshToken:  r.outlook_refresh_token ?? '',
    outlookAddress:       r.outlook_address ?? '',
    institutionsJson:     r.institutions_json ?? '',
    calendarProvider:     (r.calendar_provider ?? '').toLowerCase(),
    calendarRefreshToken: r.calendar_refresh_token ?? '',
    calendarAddress:      r.calendar_address ?? '',
    driveRefreshToken:    env.COMPANY_DRIVE_REFRESH_TOKEN || r.drive_refresh_token || '',
  };
}

/** Read one advisor's config by advisorId (dashed or dashless), or null. */
export async function getAdvisorConfig(advisorId: string): Promise<AdvisorConfig | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select(USER_COLS)
    .eq('notion_id', dashless(advisorId)).limit(1).maybeSingle();
  if (error) throw new Error(`users getAdvisorConfig failed: ${error.message}`);
  return data ? toConfig(data as UserRow) : null;
}

/** Look up an ACTIVE user by username for login. Returns the stored hash +
 *  identity; the caller runs bcrypt.compare (keeps bcrypt logic in the route). */
export async function verifyLogin(username: string): Promise<{ notionId: string; role: string; passwordHash: string } | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .select('notion_id, role, password_hash, active')
    .eq('username', username).eq('active', true).limit(1).maybeSingle();
  if (error) throw new Error(`users verifyLogin failed: ${error.message}`);
  if (!data) return null;
  const r = data as { notion_id: string; role: string | null; password_hash: string | null };
  return { notionId: r.notion_id, role: r.role ?? 'Advisor', passwordHash: r.password_hash ?? '' };
}

/** List all users (admin console). `id` is the notion_id, matching the Notion path. */
export async function listUsers(): Promise<{ id: string; name: string; username: string; role: string; active: boolean; hasGmail: boolean }[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .select('notion_id, name, username, role, active, gmail_refresh_token');
  if (error) throw new Error(`users listUsers failed: ${error.message}`);
  return (data as Array<{ notion_id: string; name: string | null; username: string | null; role: string | null; active: boolean | null; gmail_refresh_token: string | null }>)
    .map(u => ({ id: u.notion_id, name: u.name ?? '', username: u.username ?? '', role: u.role ?? 'Advisor', active: u.active ?? true, hasGmail: !!u.gmail_refresh_token }));
}

/** advisor name → notion_id, for record attribution (active Advisors). */
export async function nameToIdMap(): Promise<Record<string, string>> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('notion_id, name, role, active').eq('active', true);
  if (error) throw new Error(`users nameToIdMap failed: ${error.message}`);
  const map: Record<string, string> = {};
  for (const u of data as Array<{ notion_id: string; name: string | null; role: string | null }>) {
    if (u.role === 'Advisor' && u.name) map[u.name] = u.notion_id;
  }
  return map;
}

/** A dashless 32-hex identity for a Supabase-native new user (no Notion page). */
export function genNotionId(): string { return randomBytes(16).toString('hex'); }

async function patchByNotionId(advisorId: string, patch: Record<string, unknown>): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update(patch).eq('notion_id', dashless(advisorId));
  if (error) throw new Error(`users update failed: ${error.message}`);
}

export const setGmailToken   = (id: string, t: string, addr: string) => patchByNotionId(id, { gmail_refresh_token: t, gmail_address: addr });
export const setOutlookToken = (id: string, t: string, addr: string) => patchByNotionId(id, { outlook_refresh_token: t, outlook_address: addr, email_provider: 'outlook' });
export const setCalendarToken= (id: string, provider: string, t: string, addr: string) => patchByNotionId(id, { calendar_provider: provider, calendar_refresh_token: t, calendar_address: addr });
export const setDriveToken   = (id: string, t: string) => patchByNotionId(id, { drive_refresh_token: t });
export const setEmailProvider= (id: string, provider: string) => patchByNotionId(id, { email_provider: provider });
export const setInstitutions = (id: string, json: string) => patchByNotionId(id, { institutions_json: json.slice(0, 2000) });
export const setPassword     = (id: string, newHash: string) => patchByNotionId(id, { password_hash: newHash });

export function updateProfile(id: string, patch: { name?: string; gmailAddress?: string }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined)         row.name = patch.name;
  if (patch.gmailAddress !== undefined) row.gmail_address = patch.gmailAddress;
  return patchByNotionId(id, row);
}

export async function usernameExists(username: string): Promise<boolean> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('notion_id').eq('username', username).limit(1).maybeSingle();
  if (error) throw new Error(`users usernameExists failed: ${error.message}`);
  return !!data;
}

export async function createUser(u: { notionId: string; name: string; username: string; passwordHash: string; role: string }): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).insert({
    notion_id: u.notionId, name: u.name, username: u.username,
    password_hash: u.passwordHash, role: u.role, active: true,
  });
  if (error) throw new Error(`users create failed: ${error.message}`);
}

/** Admin edit of another user by their notion_id (active toggle / password reset). */
export function setUserById(notionId: string, patch: { active?: boolean; passwordHash?: string }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.active !== undefined)       row.active = patch.active;
  if (patch.passwordHash !== undefined) row.password_hash = patch.passwordHash;
  return patchByNotionId(notionId, row);
}

/** Current password hash lookup for settings/password (caller runs bcrypt.compare). */
export async function getStoredHash(advisorId: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('password_hash').eq('notion_id', dashless(advisorId)).limit(1).maybeSingle();
  if (error) throw new Error(`users getStoredHash failed: ${error.message}`);
  return data ? ((data as { password_hash: string | null }).password_hash ?? '') : null;
}
