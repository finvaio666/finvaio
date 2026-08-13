import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import { getActive, getRecentInbound } from '@/lib/emailService';
import { getCompanyDomains } from '@/lib/institutions';

export const dynamic = 'force-dynamic';

export interface ClientAlert {
  clientId:   string;
  clientName: string;
  threadId:   string;
  subject:    string;
  snippet:    string;
  from:       string;
  fromName:   string;
  date:       string;
  isRead:     boolean;
}

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  if (!getActive(config).connected) return NextResponse.json({ alerts: [], connected: false });

  // Company-wide shared whitelist
  const domains = await getCompanyDomains();
  if (domains.length === 0) return NextResponse.json({ alerts: [], noWhitelist: true });

  try {
    // 1. Load client names via the data-source abstraction (Notion or Supabase per flag)
    const clientNames: { id: string; name: string; first: string; last: string }[] = [];
    for (const c of await listClients(config)) {
      if (!c.name) continue;
      const parts = c.name.trim().split(/\s+/);
      clientNames.push({
        id:    c.id,
        name:  c.name,
        first: parts[0]?.toLowerCase() ?? '',
        last:  parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '',
      });
    }
    if (clientNames.length === 0) return NextResponse.json({ alerts: [] });

    // 2. Fetch recent inbound institution emails
    const emails = await getRecentInbound(config, domains, 14, 40);

    // 3. Match each email to a client by name in subject + snippet.
    //    getRecentInbound already excludes threads labelled FINVA/Seen, so once
    //    the FA opens a thread in FINVA it drops off this list automatically.
    const alerts: ClientAlert[] = [];
    for (const email of emails) {
      // Scan subject + snippet + full body — institution emails frequently name
      // the client deeper in the body, beyond the short preview snippet.
      const haystack = `${email.subject} ${email.snippet} ${email.bodyText ?? ''}`.toLowerCase();
      const wordIn = (w: string) => w.length > 1 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack);

      // Require the WHOLE name to appear: either the full name as a phrase, or
      // EVERY name token present as a whole word. This disambiguates siblings who
      // share first + last (e.g. "Lim Sheng Yee" vs "Lim Hiook Yee") — the middle
      // token ("sheng" vs "hiook") must match, so they never cross-attribute.
      const matched = clientNames.filter(c => {
        const n = c.name.toLowerCase().trim();
        if (!n) return false;
        if (haystack.includes(n)) return true;
        const tokens = n.split(/\s+/).filter(t => t.length > 1);
        return tokens.length > 0 && tokens.every(t => wordIn(t));
      });
      if (matched.length === 0) continue;

      // One alert per distinct client named in the email (a single institution
      // email can reference more than one client).
      for (const match of matched) {
        alerts.push({
          clientId:   match.id,
          clientName: match.name,
          threadId:   email.threadId,
          subject:    email.subject,
          snippet:    email.snippet,
          from:       email.from,
          fromName:   email.fromName,
          date:       email.date,
          isRead:     email.isRead,
        });
      }
    }

    return NextResponse.json({ alerts, connected: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Client alerts error:', msg);
    return NextResponse.json({ error: msg, alerts: [] }, { status: 500 });
  }
}
