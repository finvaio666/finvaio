import { Client, isFullPage } from '@notionhq/client';

export interface AdvisorConfig {
  notionApiKey:       string;
  clientsDbId:        string;
  portfolioDbId:      string;
  insuranceDbId:      string;
  cashflowDbId:       string;
  meetingNotesDbId:   string;
  tasksDbId:          string;  // To-Do / Tasks database
  insurancePlansDbId: string;  // product catalogue — insurance plans FA can sell
  fundsDbId:          string;  // product catalogue — investment funds FA can sell
  features:           string[]; // enabled feature flags, e.g. ['products', 'rules']
  role:               string;
  name:               string;
  // ── Email Hub ──────────────────────────────────────────────────────────────
  emailProvider:        string; // 'gmail' | 'outlook' — which mailbox is active
  gmailRefreshToken:    string; // OAuth2 refresh token for this advisor's Gmail
  gmailAddress:         string; // advisor's Gmail address (e.g. sky@gmail.com)
  outlookRefreshToken:  string; // OAuth2 refresh token for Microsoft 365 / Outlook
  outlookAddress:       string; // advisor's Outlook/M365 address
  institutionsJson:     string; // JSON array of institution contacts
  // ── Calendar (independent of email) ─────────────────────────────────────────
  calendarProvider:     string; // 'google' | 'microsoft'
  calendarRefreshToken: string; // OAuth2 refresh token for the connected calendar
  calendarAddress:      string; // the connected calendar account address
}

/**
 * Centralized multi-advisor scoping.
 * Shared DBs carry an "Advisor" select tagging each record's owning FA.
 * Returns a Notion filter limiting results to this advisor's records, or
 * `undefined` for Admin (who sees every advisor's data).
 */
export function advisorFilter(config: Pick<AdvisorConfig, 'role' | 'name'>) {
  return config.role === 'Admin'
    ? undefined
    : { property: 'Advisor', select: { equals: config.name } };
}

// In-process cache — survives warm function re-use, cleared on cold start
const cache = new Map<string, { config: AdvisorConfig; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  if (p?.type === 'rich_text') return p.rich_text?.[0]?.plain_text ?? '';
  return '';
}

export async function getAdvisorConfig(advisorId: string): Promise<AdvisorConfig | null> {
  const cached = cache.get(advisorId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config;

  const hostKey = process.env.NOTION_API_KEY; // Bill's key — used to read the shared Users table
  if (!hostKey) return null;

  const notion = new Client({ auth: hostKey });

  try {
    const page = await notion.pages.retrieve({ page_id: advisorId });
    if (!isFullPage(page)) return null;

    const p = page.properties as Record<string, unknown>;
    // Centralized model: if a per-advisor DB ID isn't set on the record, fall back
    // to the company-wide shared DB (env). New FAs need NO DB IDs filled in.
    const env = process.env;
    const config: AdvisorConfig = {
      notionApiKey:     rt(p, 'Notion API Key')      || env.NOTION_API_KEY            || '',
      clientsDbId:      rt(p, 'Clients DB ID')       || env.COMPANY_CLIENTS_DB_ID      || '',
      portfolioDbId:    rt(p, 'Portfolio DB ID')     || env.COMPANY_PORTFOLIO_DB_ID    || '',
      insuranceDbId:    rt(p, 'Insurance DB ID')     || env.COMPANY_INSURANCE_DB_ID    || '',
      cashflowDbId:     rt(p, 'Cashflow DB ID')      || env.COMPANY_CASHFLOW_DB_ID     || '',
      meetingNotesDbId:   rt(p, 'Meeting Notes DB ID') || env.COMPANY_MEETING_NOTES_DB_ID || '',
      tasksDbId:          rt(p, 'Tasks DB ID')         || env.COMPANY_TASKS_DB_ID        || '',
      insurancePlansDbId: rt(p, 'Insurance Plans DB ID'),
      fundsDbId:          rt(p, 'Funds DB ID'),
      features:           rt(p, 'Features').split(',').map(f => f.trim().toLowerCase()).filter(Boolean),
      role: (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor',
      name: (p['Name']  as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '',
      // Email Hub fields
      emailProvider:       (rt(p, 'Email Provider') || 'gmail').toLowerCase(),
      gmailRefreshToken:   rt(p, 'Gmail Refresh Token'),
      gmailAddress:        rt(p, 'Gmail Address'),
      outlookRefreshToken: rt(p, 'Outlook Refresh Token'),
      outlookAddress:      rt(p, 'Outlook Address'),
      institutionsJson:    rt(p, 'Institutions JSON'),
      calendarProvider:     (rt(p, 'Calendar Provider') || '').toLowerCase(),
      calendarRefreshToken: rt(p, 'Calendar Refresh Token'),
      calendarAddress:      rt(p, 'Calendar Address'),
    };

    cache.set(advisorId, { config, ts: Date.now() });
    return config;
  } catch {
    return null;
  }
}

/** Call this after a password reset so the cached config is immediately invalidated. */
export function clearAdvisorCache(advisorId: string) {
  cache.delete(advisorId);
}

/**
 * Persist the Gmail OAuth refresh token and address back to the advisor's Notion user page.
 * Uses the host Notion API key (same integration that reads the Users DB).
 */
export async function saveGmailToken(
  advisorId:    string,
  refreshToken: string,
  gmailAddress: string,
): Promise<void> {
  const hostKey = process.env.NOTION_API_KEY;
  if (!hostKey) return;

  const notion = new Client({ auth: hostKey });
  try {
    await notion.pages.update({
      page_id:    advisorId,
      properties: {
        'Gmail Refresh Token': { rich_text: [{ text: { content: refreshToken } }] },
        'Gmail Address':       { rich_text: [{ text: { content: gmailAddress } }] },
      } as never,
    });
    clearAdvisorCache(advisorId); // force re-read on next request
  } catch (e) {
    console.error('saveGmailToken failed:', e);
  }
}

/** Persist the calendar connection (provider + refresh token + address). */
export async function saveCalendarToken(
  advisorId:    string,
  provider:     string,
  refreshToken: string,
  address:      string,
): Promise<void> {
  const hostKey = process.env.NOTION_API_KEY;
  if (!hostKey) return;
  const notion = new Client({ auth: hostKey });
  try {
    await notion.pages.update({
      page_id:    advisorId,
      properties: {
        'Calendar Provider':      { rich_text: [{ text: { content: provider } }] },
        'Calendar Refresh Token': { rich_text: [{ text: { content: refreshToken } }] },
        'Calendar Address':       { rich_text: [{ text: { content: address } }] },
      } as never,
    });
    clearAdvisorCache(advisorId);
  } catch (e) {
    console.error('saveCalendarToken failed:', e);
  }
}

/**
 * Persist the Outlook (Microsoft 365) OAuth refresh token + address, and set
 * the active email provider to 'outlook'.
 */
export async function saveOutlookToken(
  advisorId:      string,
  refreshToken:   string,
  outlookAddress: string,
): Promise<void> {
  const hostKey = process.env.NOTION_API_KEY;
  if (!hostKey) return;

  const notion = new Client({ auth: hostKey });
  try {
    await notion.pages.update({
      page_id:    advisorId,
      properties: {
        'Outlook Refresh Token': { rich_text: [{ text: { content: refreshToken } }] },
        'Outlook Address':       { rich_text: [{ text: { content: outlookAddress } }] },
        'Email Provider':        { rich_text: [{ text: { content: 'outlook' } }] },
      } as never,
    });
    clearAdvisorCache(advisorId);
  } catch (e) {
    console.error('saveOutlookToken failed:', e);
  }
}

/** Switch the active email provider (gmail | outlook). */
export async function setEmailProvider(advisorId: string, provider: 'gmail' | 'outlook'): Promise<void> {
  const hostKey = process.env.NOTION_API_KEY;
  if (!hostKey) return;
  const notion = new Client({ auth: hostKey });
  try {
    await notion.pages.update({
      page_id:    advisorId,
      properties: { 'Email Provider': { rich_text: [{ text: { content: provider } }] } } as never,
    });
    clearAdvisorCache(advisorId);
  } catch (e) {
    console.error('setEmailProvider failed:', e);
  }
}

/**
 * Persist the institutions JSON list back to Notion.
 */
export async function saveInstitutions(
  advisorId: string,
  json:      string,
): Promise<void> {
  const hostKey = process.env.NOTION_API_KEY;
  if (!hostKey) return;

  const notion = new Client({ auth: hostKey });
  try {
    await notion.pages.update({
      page_id:    advisorId,
      properties: {
        'Institutions JSON': { rich_text: [{ text: { content: json.slice(0, 2000) } }] },
      } as never,
    });
    clearAdvisorCache(advisorId);
  } catch (e) {
    console.error('saveInstitutions failed:', e);
  }
}
