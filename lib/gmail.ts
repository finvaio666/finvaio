/**
 * lib/gmail.ts
 * Gmail API wrapper — OAuth2 auth, email read/send, label management.
 * Supports both inbound monitoring and outbound-initiated threads.
 */

import { google } from 'googleapis';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmailSummary {
  id:        string;
  threadId:  string;
  from:      string;
  fromName:  string;
  to:        string;
  subject:   string;
  snippet:   string;
  date:      string;       // ISO string
  isRead:    boolean;
  direction: 'inbound' | 'outbound'; // inbound = they wrote first; outbound = we wrote first
  status:    'pending' | 'replied' | 'closed' | 'monitoring';
  labelIds:  string[];
}

export interface EmailThread {
  threadId:  string;
  subject:   string;
  messages:  EmailMessage[];
}

export interface EmailMessage {
  id:       string;
  from:     string;
  fromName: string;
  to:       string;
  date:     string;
  body:     string;       // plain text
  bodyHtml: string;       // HTML (may be empty)
  isFromAdvisor: boolean; // true if sent by the advisor (me)
}

export interface SendOptions {
  to:        string;
  subject:   string;
  body:      string;       // plain text
  threadId?: string;       // set when replying — Gmail groups into same thread
  inReplyTo?: string;      // Message-ID header of the message being replied to
  references?: string;     // References header chain
}

// ── Gmail Labels for ARIA status tracking ────────────────────────────────────

export const ARIA_LABELS = {
  MONITORED: 'ARIA',           // All emails ARIA is tracking
  CLOSED:    'ARIA/Closed',    // Manually closed by advisor
  SENT:      'ARIA/Sent',      // Outbound emails initiated from ARIA
};

// ── OAuth2 Setup ─────────────────────────────────────────────────────────────

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

/** Generate the Google OAuth2 URL the advisor visits to authorise ARIA. */
export function getGmailAuthUrl(advisorId: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
    state: advisorId,
    prompt: 'consent', // ensure refresh_token is always returned
  });
}

/** Exchange a one-time auth code for access + refresh tokens. */
export async function exchangeCodeForTokens(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return {
    refreshToken: tokens.refresh_token ?? '',
    accessToken:  tokens.access_token  ?? '',
  };
}

/** Create an authenticated Gmail API client from a stored refresh token. */
function getGmailClient(refreshToken: string) {
  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth });
}

// ── Email Helpers ─────────────────────────────────────────────────────────────

function headerVal(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseName(fromHeader: string): { name: string; email: string } {
  const m = fromHeader.match(/^(.*?)\s*<(.+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() };
  return { name: fromHeader, email: fromHeader };
}

/** Recursively extract plain text and HTML body from MIME parts. */
function extractBody(payload: {
  mimeType?: string | null;
  body?: { data?: string | null };
  parts?: unknown[];
}): { text: string; html: string } {
  const mime = payload.mimeType ?? '';
  const data = payload.body?.data ?? '';

  if (mime === 'text/plain') {
    return { text: Buffer.from(data, 'base64').toString('utf-8'), html: '' };
  }
  if (mime === 'text/html') {
    return { text: '', html: Buffer.from(data, 'base64').toString('utf-8') };
  }
  if (mime.startsWith('multipart/') && Array.isArray(payload.parts)) {
    let text = '', html = '';
    for (const part of payload.parts as typeof payload[]) {
      const r = extractBody(part);
      if (r.text) text += r.text;
      if (r.html) html += r.html;
    }
    return { text, html };
  }
  return { text: '', html: '' };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List recent emails from whitelisted domains.
 * Returns emails sorted newest-first.
 */
export async function listEmails(
  refreshToken: string,
  domains: string[],   // e.g. ['prudential.com.my', 'publicmutual.com.my']
  advisorEmail: string,
  maxResults = 50,
): Promise<EmailSummary[]> {
  const gmail = getGmailClient(refreshToken);

  // Strict whitelist — only fetch emails from configured domains
  // Caller must ensure domains.length > 0 before calling this function
  if (domains.length === 0) return [];

  const domainQ  = domains.map(d => `@${d}`).join(' OR ');
  const inboundQ  = `from:(${domainQ})`;
  const outboundQ = `from:me to:(${domainQ})`;

  // Fetch both inbound and outbound in parallel
  const [inRes, outRes] = await Promise.all([
    gmail.users.messages.list({ userId: 'me', q: `${inboundQ} -label:ARIA/Closed`, maxResults }),
    gmail.users.messages.list({ userId: 'me', q: `${outboundQ} -label:ARIA/Closed`, maxResults: 20 }),
  ]);

  const inIds  = (inRes.data.messages  ?? []).map(m => m.id!);
  const outIds = (outRes.data.messages ?? []).map(m => m.id!);

  // Deduplicate (a thread may appear in both)
  const seenThreads = new Set<string>();
  const allIds = [...inIds, ...outIds];

  // Fetch message metadata in parallel (max 30 concurrent)
  const chunks: string[][] = [];
  for (let i = 0; i < allIds.length; i += 30) chunks.push(allIds.slice(i, i + 30));

  const summaries: EmailSummary[] = [];

  for (const chunk of chunks) {
    const msgs = await Promise.all(
      chunk.map(id =>
        gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID'],
        }).catch(() => null)
      )
    );

    for (const msg of msgs) {
      if (!msg) continue;
      const d = msg.data;
      const headers = d.payload?.headers ?? [];
      const threadId = d.threadId ?? d.id ?? '';

      if (seenThreads.has(threadId)) continue;
      seenThreads.add(threadId);

      const from     = headerVal(headers, 'From');
      const to       = headerVal(headers, 'To');
      const subject  = headerVal(headers, 'Subject');
      const dateRaw  = headerVal(headers, 'Date');
      const { name: fromName, email: fromEmail } = parseName(from);

      const isFromAdvisor = fromEmail.toLowerCase().includes(advisorEmail.toLowerCase()) ||
        (d.labelIds ?? []).includes('SENT');

      const labelIds = d.labelIds ?? [];
      const isClosed = labelIds.includes('ARIA/Closed');
      if (isClosed) continue;

      // Determine direction based on who sent the FIRST message in thread
      const direction: 'inbound' | 'outbound' = isFromAdvisor ? 'outbound' : 'inbound';

      // Status: check if latest thread message is from advisor (= replied)
      // We'll refine this per-thread but for the list view use a heuristic
      const status: EmailSummary['status'] = isFromAdvisor ? 'monitoring' : 'pending';

      summaries.push({
        id:        d.id ?? '',
        threadId,
        from,
        fromName:  fromName || fromEmail,
        to,
        subject:   subject || '(No subject)',
        snippet:   d.snippet ?? '',
        date:      dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString(),
        isRead:    !(d.labelIds ?? []).includes('UNREAD'),
        direction,
        status,
        labelIds,
      });
    }
  }

  // Sort newest first
  return summaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Get full thread with all messages (newest first within thread).
 */
export async function getThread(
  refreshToken: string,
  threadId: string,
  advisorEmail: string,
): Promise<EmailThread> {
  const gmail = getGmailClient(refreshToken);

  const res = await gmail.users.threads.get({
    userId:   'me',
    id:       threadId,
    format:   'full',
  });

  const messages = (res.data.messages ?? []).map(msg => {
    const headers = msg.payload?.headers ?? [];
    const from = headerVal(headers, 'From');
    const { name: fromName, email: fromEmail } = parseName(from);
    const dateRaw = headerVal(headers, 'Date');
    const { text, html } = extractBody(msg.payload as Parameters<typeof extractBody>[0]);

    return {
      id:            msg.id ?? '',
      from,
      fromName:      fromName || fromEmail,
      to:            headerVal(headers, 'To'),
      date:          dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString(),
      body:          text,
      bodyHtml:      html,
      isFromAdvisor: fromEmail.toLowerCase().includes(advisorEmail.toLowerCase()),
    } as EmailMessage;
  });

  const firstMsg = messages[0];
  const headers  = firstMsg ? res.data.messages?.[0]?.payload?.headers ?? [] : [];
  const subject  = headerVal(headers, 'Subject') || '(No subject)';

  return { threadId, subject, messages };
}

/**
 * Send a new email or reply to an existing thread.
 */
export async function sendEmail(
  refreshToken: string,
  opts: SendOptions,
): Promise<string> { // returns messageId
  const gmail = getGmailClient(refreshToken);

  const lines: string[] = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
  ];
  if (opts.inReplyTo)  lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push('', opts.body);

  const raw = Buffer.from(lines.join('\r\n')).toString('base64url');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      ...(opts.threadId ? { threadId: opts.threadId } : {}),
    },
  });

  return res.data.id ?? '';
}

/**
 * Add the ARIA/Sent label to an outbound message (creates label if needed).
 */
export async function markAsSent(refreshToken: string, messageId: string): Promise<void> {
  const gmail = getGmailClient(refreshToken);

  // Ensure label exists
  const labelId = await ensureLabel(gmail, 'ARIA/Sent');
  if (!labelId) return;

  await gmail.users.messages.modify({
    userId: 'me',
    id:     messageId,
    requestBody: { addLabelIds: [labelId] },
  }).catch(() => {}); // non-critical
}

/**
 * Mark an email thread as closed (removes from active tracking).
 */
export async function closeThread(refreshToken: string, messageId: string): Promise<void> {
  const gmail = getGmailClient(refreshToken);
  const labelId = await ensureLabel(gmail, 'ARIA/Closed');
  if (!labelId) return;

  await gmail.users.messages.modify({
    userId: 'me',
    id:     messageId,
    requestBody: { addLabelIds: [labelId] },
  }).catch(() => {});
}

// ── Label Helpers ─────────────────────────────────────────────────────────────

type GmailClientType = ReturnType<typeof google.gmail>;

async function ensureLabel(gmail: GmailClientType, name: string): Promise<string | null> {
  try {
    const res = await gmail.users.labels.list({ userId: 'me' });
    const existing = (res.data.labels ?? []).find(l => l.name === name);
    if (existing?.id) return existing.id;

    // Create it
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility:   'labelShow',
        messageListVisibility: 'show',
      },
    });
    return created.data.id ?? null;
  } catch {
    return null;
  }
}
