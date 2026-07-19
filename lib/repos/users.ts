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
