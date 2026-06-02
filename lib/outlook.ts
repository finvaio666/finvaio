/**
 * lib/outlook.ts
 * Microsoft 365 / Outlook connector via the Microsoft Graph API.
 * Mirrors lib/gmail.ts so the email features can use either provider.
 */

import type { EmailSummary, EmailThread, EmailMessage, SendOptions, FollowUp } from './gmail';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH     = 'https://graph.microsoft.com/v1.0';
const SCOPES    = 'offline_access Mail.ReadWrite Mail.Send User.Read openid profile email';

// ── OAuth ─────────────────────────────────────────────────────────────────────

export function getOutlookAuthUrl(advisorId: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri:  process.env.MS_REDIRECT_URI ?? '',
    response_mode: 'query',
    scope:         SCOPES,
    state:         advisorId,
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export async function exchangeOutlookCode(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID ?? '',
    client_secret: process.env.MS_CLIENT_SECRET ?? '',
    code,
    redirect_uri:  process.env.MS_REDIRECT_URI ?? '',
    grant_type:    'authorization_code',
    scope:         SCOPES,
  });
  const res = await fetch(`${AUTHORITY}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Token exchange failed');
  return { refreshToken: data.refresh_token ?? '', accessToken: data.access_token ?? '' };
}

/** Exchange a stored refresh token for a fresh access token. */
async function getAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID ?? '',
    client_secret: process.env.MS_CLIENT_SECRET ?? '',
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         SCOPES,
  });
  const res = await fetch(`${AUTHORITY}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Token refresh failed');
  return data.access_token as string;
}

async function graph(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return res;
}

/** Get the signed-in user's email address. */
export async function getOutlookProfile(refreshToken: string): Promise<string> {
  const token = await getAccessToken(refreshToken);
  const res = await graph(token, '/me?$select=mail,userPrincipalName');
  const data = await res.json();
  return data.mail || data.userPrincipalName || '';
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  from?:    { emailAddress?: { name?: string; address?: string } };
  sender?:  { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  body?: { contentType?: string; content?: string };
  internetMessageId?: string;
  categories?: string[];
}

function toSummary(m: GraphMessage, advisorEmail: string): EmailSummary {
  const fromAddr = m.from?.emailAddress?.address ?? m.sender?.emailAddress?.address ?? '';
  const fromName = m.from?.emailAddress?.name ?? fromAddr;
  const isFromAdvisor = fromAddr.toLowerCase() === advisorEmail.toLowerCase();
  return {
    id:        m.id,
    threadId:  m.conversationId ?? m.id,
    from:      fromAddr,
    fromName:  isFromAdvisor ? 'You' : (fromName || fromAddr),
    to:        m.toRecipients?.[0]?.emailAddress?.address ?? '',
    subject:   m.subject || '(No subject)',
    snippet:   m.bodyPreview ?? '',
    date:      m.receivedDateTime || m.sentDateTime || new Date().toISOString(),
    isRead:    m.isRead ?? true,
    direction: isFromAdvisor ? 'outbound' : 'inbound',
    status:    isFromAdvisor ? 'monitoring' : 'pending',
    labelIds:  m.categories ?? [],
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Preserve structure: convert block/line elements to newlines BEFORE stripping
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')      // collapse runs of spaces
    .replace(/ *\n */g, '\n')        // trim spaces around newlines
    .replace(/\n{3,}/g, '\n\n')      // cap blank lines
    .trim();
}

// ── List / search / threads ───────────────────────────────────────────────────

/**
 * True if an email address belongs to one of the whitelisted institutions.
 * Brand-based: matches on the institution's primary label (e.g. "phillipmutual")
 * so phillipmutual.com.my, phillipmutual.com and mail.phillipmutual.com.my all match.
 */
export function domainMatches(addr: string, domains: string[]): boolean {
  const d = (addr.match(/@([\w.-]+)/)?.[1] ?? addr).toLowerCase();
  if (!d) return false;
  const labels = d.split('.');
  return domains.some(w => {
    const wl = w.toLowerCase();
    if (d === wl || d.endsWith(`.${wl}`)) return true;
    const brand = wl.split('.')[0];          // "phillipmutual.com.my" → "phillipmutual"
    return brand.length >= 4 && labels.includes(brand);
  });
}

export async function listEmails(
  refreshToken: string,
  domains: string[],
  advisorEmail: string,
  maxResults = 50,
): Promise<EmailSummary[]> {
  if (domains.length === 0) return [];
  const token = await getAccessToken(refreshToken);
  // Reliable approach: fetch recent messages, then filter by domain client-side.
  // Graph $search is fuzzy and unreliable for matching sender-address domains.
  const res = await graph(token,
    `/me/messages?$top=150&$select=id,conversationId,subject,bodyPreview,receivedDateTime,isRead,from,sender,toRecipients,categories&$orderby=receivedDateTime desc`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Graph list failed');
  const msgs: GraphMessage[] = data.value ?? [];

  const seen = new Set<string>();
  const out: EmailSummary[] = [];
  for (const m of msgs) {
    if ((m.categories ?? []).includes('ARIA/Closed')) continue;
    const fromAddr = m.from?.emailAddress?.address ?? m.sender?.emailAddress?.address ?? '';
    const toAddr   = m.toRecipients?.[0]?.emailAddress?.address ?? '';
    // Keep emails received FROM a whitelisted institution OR sent TO one
    if (!domainMatches(fromAddr, domains) && !domainMatches(toAddr, domains)) continue;
    const cid = m.conversationId ?? m.id;
    if (seen.has(cid)) continue;
    seen.add(cid);
    out.push(toSummary(m, advisorEmail));
    if (out.length >= maxResults) break;
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getThread(
  refreshToken: string,
  threadId: string, // conversationId
  advisorEmail: string,
): Promise<EmailThread> {
  const token = await getAccessToken(refreshToken);
  // conversationId contains +, /, = — encode the whole filter expression
  const filter = encodeURIComponent(`conversationId eq '${threadId}'`);
  const res = await graph(token,
    `/me/messages?$filter=${filter}&$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,body,internetMessageId&$orderby=receivedDateTime asc&$top=50`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Graph thread failed');
  const msgs: GraphMessage[] = data.value ?? [];

  const messages: EmailMessage[] = msgs.map(m => {
    const fromAddr = m.from?.emailAddress?.address ?? '';
    const fromName = m.from?.emailAddress?.name ?? fromAddr;
    const toAddr   = m.toRecipients?.[0]?.emailAddress?.address ?? '';
    const raw      = m.body?.content ?? '';
    const text     = m.body?.contentType?.toLowerCase() === 'html' ? stripHtml(raw) : raw.trim();
    return {
      id:            m.id,
      from:          fromAddr,
      fromName:      fromName || fromAddr,
      fromEmail:     fromAddr,
      to:            toAddr,
      toEmail:       toAddr,
      date:          m.receivedDateTime || m.sentDateTime || new Date().toISOString(),
      body:          text,
      bodyHtml:      '',
      isFromAdvisor: fromAddr.toLowerCase() === advisorEmail.toLowerCase(),
      messageIdHeader: m.internetMessageId ?? '',
    };
  });

  return { threadId, subject: messages[0] ? (msgs[0].subject || '(No subject)') : '(No subject)', messages };
}

export async function sendEmail(refreshToken: string, opts: SendOptions): Promise<string> {
  const token = await getAccessToken(refreshToken);
  const payload = {
    message: {
      subject: opts.subject,
      body:    { contentType: 'Text', content: opts.body },
      toRecipients: [{ emailAddress: { address: opts.to } }],
    },
    saveToSentItems: true,
  };
  const res = await graph(token, '/me/sendMail', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Send failed (HTTP ${res.status})`);
  }
  return 'sent';
}

export async function searchClientEmails(
  refreshToken: string,
  domains: string[],
  advisorEmail: string,
  clientName: string,
): Promise<EmailSummary[]> {
  if (domains.length === 0 || !clientName.trim()) return [];
  const token = await getAccessToken(refreshToken);
  // Search the WHOLE mailbox by client name (not just recent mail) so older
  // correspondence is found too. $search scans subject + body server-side.
  const res = await graph(token,
    `/me/messages?$search="${encodeURIComponent(clientName.trim())}"&$top=100&$select=id,conversationId,subject,bodyPreview,receivedDateTime,isRead,from,sender,toRecipients`);
  const data = await res.json();
  if (!res.ok) return [];
  const msgs: GraphMessage[] = data.value ?? [];

  const seen = new Set<string>();
  const out: EmailSummary[] = [];
  for (const m of msgs) {
    const fromAddr = m.from?.emailAddress?.address ?? '';
    const toAddr   = m.toRecipients?.[0]?.emailAddress?.address ?? '';
    // Keep only emails involving a whitelisted institution
    if (!domainMatches(fromAddr, domains) && !domainMatches(toAddr, domains)) continue;
    const cid = m.conversationId ?? m.id;
    if (seen.has(cid)) continue;
    seen.add(cid);
    out.push(toSummary(m, advisorEmail));
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getRecentInbound(
  refreshToken: string,
  domains: string[],
  days = 14,
  maxResults = 40,
): Promise<EmailSummary[]> {
  if (domains.length === 0) return [];
  const token = await getAccessToken(refreshToken);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rfilter = encodeURIComponent(`receivedDateTime ge ${since}`);
  const res = await graph(token,
    `/me/messages?$filter=${rfilter}&$top=${maxResults}&$select=id,conversationId,subject,bodyPreview,receivedDateTime,isRead,from,sender,toRecipients,categories&$orderby=receivedDateTime desc`);
  const data = await res.json();
  if (!res.ok) return [];
  const msgs: GraphMessage[] = data.value ?? [];
  const seen = new Set<string>();
  const out: EmailSummary[] = [];
  for (const m of msgs) {
    const fromAddr = (m.from?.emailAddress?.address ?? '').toLowerCase();
    // inbound only — from a whitelisted domain
    if (!domains.some(d => fromAddr.endsWith(`@${d}`) || fromAddr.endsWith(`.${d}`))) continue;
    if ((m.categories ?? []).includes('ARIA/Closed') || (m.categories ?? []).includes('ARIA/Seen')) continue;
    const cid = m.conversationId ?? m.id;
    if (seen.has(cid)) continue;
    seen.add(cid);
    out.push(toSummary(m, ''));
  }
  return out;
}

export async function getFollowUps(
  refreshToken: string,
  domains: string[],
  advisorEmail: string,
  overdueDays = 3,
): Promise<FollowUp[]> {
  // Lightweight: outbound messages to institutions in Sent, awaiting reply.
  if (domains.length === 0) return [];
  const token = await getAccessToken(refreshToken);
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const sfilter = encodeURIComponent(`sentDateTime ge ${since}`);
  const res = await graph(token,
    `/me/mailFolders/sentitems/messages?$filter=${sfilter}&$top=40&$select=id,conversationId,subject,toRecipients,sentDateTime,categories&$orderby=sentDateTime desc`);
  const data = await res.json();
  if (!res.ok) return [];
  const msgs: GraphMessage[] = data.value ?? [];
  const now = Date.now();
  const seen = new Set<string>();
  const out: FollowUp[] = [];
  for (const m of msgs) {
    const toAddr = (m.toRecipients?.[0]?.emailAddress?.address ?? '').toLowerCase();
    if (!domains.some(d => toAddr.endsWith(`@${d}`) || toAddr.endsWith(`.${d}`))) continue;
    if ((m.categories ?? []).includes('ARIA/Closed')) continue;
    const cid = m.conversationId ?? m.id;
    if (seen.has(cid)) continue;
    seen.add(cid);
    const sentDate = m.sentDateTime ? new Date(m.sentDateTime) : new Date();
    const daysWaiting = Math.floor((now - sentDate.getTime()) / 86400000);
    out.push({
      threadId:    cid,
      messageId:   m.id,
      subject:     m.subject || '(No subject)',
      to:          toAddr,
      toName:      m.toRecipients?.[0]?.emailAddress?.name ?? toAddr,
      sentDate:    sentDate.toISOString(),
      daysWaiting,
      isOverdue:   daysWaiting >= overdueDays,
    });
  }
  return out.sort((a, b) => b.daysWaiting - a.daysWaiting);
}

// ── Categories (Outlook equivalent of Gmail labels) ────────────────────────────

async function addCategory(refreshToken: string, messageId: string, category: string): Promise<void> {
  const token = await getAccessToken(refreshToken);
  // Fetch existing categories, then append
  const res = await graph(token, `/me/messages/${messageId}?$select=categories`);
  const data = await res.json().catch(() => ({}));
  const existing: string[] = data.categories ?? [];
  if (existing.includes(category)) return;
  await graph(token, `/me/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ categories: [...existing, category] }),
  }).catch(() => {});
}

export async function markThreadSeen(refreshToken: string, threadId: string): Promise<void> {
  // threadId is conversationId; tag the latest message in it
  const token = await getAccessToken(refreshToken);
  const filter = encodeURIComponent(`conversationId eq '${threadId}'`);
  const res = await graph(token, `/me/messages?$filter=${filter}&$select=id&$top=1`);
  const data = await res.json().catch(() => ({}));
  const id = data.value?.[0]?.id;
  if (id) await addCategory(refreshToken, id, 'ARIA/Seen');
}

export async function closeThread(refreshToken: string, threadId: string): Promise<void> {
  // threadId is conversationId — tag the latest message in it
  const token = await getAccessToken(refreshToken);
  const filter = encodeURIComponent(`conversationId eq '${threadId}'`);
  const res = await graph(token, `/me/messages?$filter=${filter}&$select=id&$top=1`);
  const data = await res.json().catch(() => ({}));
  const id = data.value?.[0]?.id;
  if (id) await addCategory(refreshToken, id, 'ARIA/Closed');
}

export async function markAsSent(): Promise<void> {
  // No-op for Outlook — sent items are tracked natively in the Sent folder.
}
