/**
 * lib/calendar.ts
 * Standalone calendar connection — independent of the email account.
 * Supports Google Calendar and Microsoft (Outlook) Calendar, read-only.
 */

import { google } from 'googleapis';
import { AdvisorConfig } from './getAdvisorConfig';

export interface CalEvent {
  id:       string;
  title:    string;
  start:    string;   // ISO
  end:      string;   // ISO
  allDay:   boolean;
  location: string;
}

const WINDOW_DAYS = 14;

// ── Google Calendar ─────────────────────────────────────────────────────────

function googleOAuth(redirectUri = '') {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
}

export function getGoogleCalAuthUrl(advisorId: string, redirectUri: string): string {
  return googleOAuth(redirectUri).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'],
    state: advisorId,
  });
}

export async function exchangeGoogleCal(code: string, redirectUri: string): Promise<{ refreshToken: string; accessToken: string }> {
  const { tokens } = await googleOAuth(redirectUri).getToken(code);
  return { refreshToken: tokens.refresh_token ?? '', accessToken: tokens.access_token ?? '' };
}

export async function getGoogleCalAddress(accessToken: string): Promise<string> {
  try {
    const auth = googleOAuth();
    auth.setCredentials({ access_token: accessToken });
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const info = await oauth2.userinfo.get();
    return info.data.email ?? '';
  } catch { return ''; }
}

async function getGoogleEvents(refreshToken: string): Promise<CalEvent[]> {
  const auth = googleOAuth();
  auth.setCredentials({ refresh_token: refreshToken });
  const cal = google.calendar({ version: 'v3', auth });
  const now = new Date();
  const until = new Date(now.getTime() + WINDOW_DAYS * 86400000);
  const res = await cal.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  });
  return (res.data.items ?? []).map(e => ({
    id:       e.id ?? '',
    title:    e.summary ?? '(No title)',
    start:    e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : ''),
    end:      e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : ''),
    allDay:   !e.start?.dateTime,
    location: e.location ?? '',
  }));
}

// ── Microsoft / Outlook Calendar ────────────────────────────────────────────

const MS_AUTH       = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const MS_CAL_SCOPES = 'offline_access Calendars.Read User.Read openid profile email';

export function getMsCalAuthUrl(advisorId: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri:  redirectUri,
    response_mode: 'query',
    scope:         MS_CAL_SCOPES,
    state:         advisorId,
  });
  return `${MS_AUTH}/authorize?${p.toString()}`;
}

export async function exchangeMsCal(code: string, redirectUri: string): Promise<{ refreshToken: string; address: string }> {
  const body = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID ?? '',
    client_secret: process.env.MS_CLIENT_SECRET ?? '',
    code,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code',
    scope:         MS_CAL_SCOPES,
  });
  const res = await fetch(`${MS_AUTH}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Token exchange failed');
  const refreshToken = data.refresh_token ?? '';
  let address = '';
  try {
    const me = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const meData = await me.json();
    address = meData.mail || meData.userPrincipalName || '';
  } catch { /* non-critical */ }
  return { refreshToken, address };
}

async function msCalAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID ?? '',
    client_secret: process.env.MS_CLIENT_SECRET ?? '',
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         MS_CAL_SCOPES,
  });
  const res = await fetch(`${MS_AUTH}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Token refresh failed');
  return data.access_token as string;
}

async function getMsEvents(refreshToken: string): Promise<CalEvent[]> {
  const token = await msCalAccessToken(refreshToken);
  const now = new Date();
  const until = new Date(now.getTime() + WINDOW_DAYS * 86400000);
  const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${until.toISOString()}&$orderby=start/dateTime&$top=50&$select=subject,start,end,location,isAllDay`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="Asia/Kuala_Lumpur"' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Graph calendar failed');
  return (data.value ?? []).map((e: { id: string; subject?: string; start?: { dateTime?: string }; end?: { dateTime?: string }; isAllDay?: boolean; location?: { displayName?: string } }) => ({
    id:       e.id,
    title:    e.subject || '(No title)',
    start:    e.start?.dateTime ?? '',
    end:      e.end?.dateTime ?? '',
    allDay:   !!e.isAllDay,
    location: e.location?.displayName ?? '',
  }));
}

// ── Unified ─────────────────────────────────────────────────────────────────

export async function getUpcomingEvents(config: AdvisorConfig): Promise<CalEvent[]> {
  if (!config.calendarRefreshToken) return [];
  try {
    const events = config.calendarProvider === 'microsoft'
      ? await getMsEvents(config.calendarRefreshToken)
      : await getGoogleEvents(config.calendarRefreshToken);
    return events.filter(e => e.start).sort((a, b) => a.start.localeCompare(b.start));
  } catch {
    return [];
  }
}
