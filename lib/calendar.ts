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

/**
 * Build the calendar OAuth redirect URI from a STABLE base, so the auth step
 * and the token-exchange step always produce the identical string. On Vercel,
 * `new URL(req.url).origin` can resolve to the per-deployment hostname rather
 * than the public alias — if auth and callback disagree, Google rejects the
 * token exchange with `invalid_grant`. We reuse the same base as the (working)
 * Gmail flow's GOOGLE_REDIRECT_URI, falling back to the request origin for
 * local dev where that env isn't set.
 */
export function calendarRedirectUri(fallbackOrigin: string): string {
  // 1) Exact, registered URI wins — fully deterministic, no derivation.
  if (process.env.GOOGLE_CALENDAR_REDIRECT_URI) return process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  // 2) Else reuse the (working) Gmail flow's stable base origin.
  const base = process.env.GOOGLE_REDIRECT_URI;
  const origin = base ? new URL(base).origin : fallbackOrigin;
  return `${origin}/api/calendar/google/callback`;
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

  // Start 12h ago (timezone-safe — captures all of today's appointments
  // regardless of the server/UTC vs Malaysia offset) through the next 14 days.
  const now = Date.now();
  const timeMin = new Date(now - 12 * 3600 * 1000).toISOString();
  const timeMax = new Date(now + WINDOW_DAYS * 86400000).toISOString();

  // Pull from ALL the user's calendars, not just primary. Keep each calendar's
  // accessRole: we query every calendar (so timed appointments on shared/reader
  // calendars still show), but suppress all-day events from reader-only
  // calendars (holiday feeds, birthdays, subscribed calendars) which are noise.
  // All-day events on the user's OWN (owner/writer) calendars are kept — they're
  // legitimate full-day appointments.
  let calendars: { id: string; owned: boolean }[] = [{ id: 'primary', owned: true }];
  try {
    const list = await cal.calendarList.list({ maxResults: 50 });
    const items = (list.data.items ?? [])
      .filter(c => !!c.id)
      .map(c => ({ id: c.id as string, owned: c.accessRole === 'owner' || c.accessRole === 'writer' }));
    if (items.length) calendars = items;
  } catch { /* fall back to primary */ }

  const all: CalEvent[] = [];
  let ok = false;
  let lastErr: unknown;
  for (const { id: calendarId, owned } of calendars) {
    try {
      const res = await cal.events.list({
        calendarId,
        timeMin, timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });
      ok = true;
      for (const e of res.data.items ?? []) {
        if (e.status === 'cancelled') continue;
        // Drop special event types: birthdays, focus time, OOO, working location.
        const specialType = e.eventType && e.eventType !== 'default';
        const isAllDay = !e.start?.dateTime && !!e.start?.date;
        const hasStart = e.start?.dateTime || e.start?.date;
        // Keep timed events from any calendar. Keep all-day events only from the
        // user's own calendars (suppress holiday/birthday/subscribed all-day noise).
        if (!hasStart || specialType || (isAllDay && !owned)) continue;
        all.push({
          id:       e.id ?? '',
          title:    e.summary ?? '(No title)',
          start:    e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : ''),
          end:      e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : ''),
          allDay:   !e.start?.dateTime,
          location: e.location ?? '',
        });
      }
    } catch (e) { lastErr = e; /* try next calendar */ }
  }
  // If every calendar query failed (e.g. missing calendar scope), surface it
  if (!ok && lastErr) throw lastErr;
  return all;
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
  const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${until.toISOString()}&$orderby=start/dateTime&$top=50&$select=subject,start,end,location,isAllDay,attendees`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="Asia/Kuala_Lumpur"' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Graph calendar failed');
  return (data.value ?? [])
    // Appointments only: keep events that have other attendees (drops solo blocks)
    .filter((e: { attendees?: { type?: string }[] }) =>
      (e.attendees ?? []).some(a => a.type !== 'resource'))
    .map((e: { id: string; subject?: string; start?: { dateTime?: string }; end?: { dateTime?: string }; isAllDay?: boolean; location?: { displayName?: string } }) => ({
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
  // Let errors propagate so the API can report scope/permission problems.
  const events = config.calendarProvider === 'microsoft'
    ? await getMsEvents(config.calendarRefreshToken)
    : await getGoogleEvents(config.calendarRefreshToken);
  return events.filter(e => e.start).sort((a, b) => a.start.localeCompare(b.start));
}
