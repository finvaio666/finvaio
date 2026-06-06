import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig, advisorFilter } from '@/lib/getAdvisorConfig';
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
    // 1. Load client names from Notion
    const clientNames: { id: string; name: string; first: string; last: string }[] = [];
    if (config.notionApiKey && config.notionApiKey !== 'DEMO_MODE' && config.clientsDbId) {
      const notion = new Client({ auth: config.notionApiKey });
      const f = advisorFilter(config);
      const res = await notion.databases.query({ database_id: config.clientsDbId, page_size: 100, ...(f ? { filter: f } : {}) });
      for (const page of res.results) {
        if (!isFullPage(page)) continue;
        const nameProp = page.properties['Client Name'];
        const name = nameProp?.type === 'title' ? nameProp.title[0]?.plain_text ?? '' : '';
        if (!name) continue;
        const parts = name.trim().split(/\s+/);
        clientNames.push({
          id:    page.id,
          name,
          first: parts[0]?.toLowerCase() ?? '',
          last:  parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '',
        });
      }
    }
    if (clientNames.length === 0) return NextResponse.json({ alerts: [] });

    // 2. Fetch recent inbound institution emails
    const emails = await getRecentInbound(config, domains, 14, 40);

    // 3. Match each email to a client by name in subject + snippet.
    //    getRecentInbound already excludes threads labelled ARIA/Seen, so once
    //    the FA opens a thread in ARIA it drops off this list automatically.
    const alerts: ClientAlert[] = [];
    for (const email of emails) {
      // Scan subject + snippet + full body — institution emails frequently name
      // the client deeper in the body, beyond the short preview snippet.
      const haystack = `${email.subject} ${email.snippet} ${email.bodyText ?? ''}`.toLowerCase();
      const wordIn = (w: string) => w.length > 0 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack);

      // 1) Exact full-name matches take priority — this disambiguates siblings
      //    who share first + last names (e.g. "Lim Sheng Yee" vs "Lim Hiook Yee").
      let matched = clientNames.filter(c => haystack.includes(c.name.toLowerCase()));
      // 2) Fall back to first AND last as whole words only if no full-name hit.
      if (matched.length === 0) {
        const fl = clientNames.find(c => c.first && c.last && wordIn(c.first) && wordIn(c.last));
        if (fl) matched = [fl];
      }
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
