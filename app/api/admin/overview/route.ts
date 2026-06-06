import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}

export interface FAStats {
  id:           string;
  name:         string;
  username:     string;
  active:       boolean;
  clientCount:  number;
  totalAUM:     number;
  hasGmail:     boolean;
  lastActivity: string; // ISO date or ''
}

export interface AdminOverview {
  totalFAs:     number;
  activeFAs:    number;
  totalClients: number;
  totalAUM:     number;
  advisors:     FAStats[];
}

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const hostKey   = process.env.NOTION_API_KEY;
  const usersDbId = process.env.NOTION_USERS_DB_ID;
  if (!hostKey || !usersDbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion = new Client({ auth: hostKey });
  // Centralized model: one shared Clients DB; attribute by the Advisor tag.
  const clientsDbId = config.clientsDbId || process.env.COMPANY_CLIENTS_DB_ID;

  // Fetch all users
  const usersRes = await notion.databases.query({ database_id: usersDbId, page_size: 50 });
  const faUsers  = usersRes.results.filter(isFullPage).filter(page => {
    const p    = page.properties as Record<string, unknown>;
    const role = (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor';
    return role === 'Advisor'; // only FAs, not admins
  });

  // For each FA, count their clients + total AUM by querying the shared DB
  // filtered to that FA's Advisor tag.
  const advisors: FAStats[] = await Promise.all(
    faUsers.map(async (page) => {
      const p        = page.properties as Record<string, unknown>;
      const name     = (p['Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '';
      const username = rt(p, 'Username');
      const active   = (p['Active'] as { type: string; checkbox?: boolean } | undefined)?.checkbox ?? true;

      let clientCount  = 0;
      let totalAUM     = 0;
      let lastActivity = '';

      if (clientsDbId && name) {
        try {
          let cursor: string | undefined;
          do {
            const clientsRes = await notion.databases.query({
              database_id: clientsDbId,
              page_size: 100,
              start_cursor: cursor,
              filter: { property: 'Advisor', select: { equals: name } },
            });
            clientCount += clientsRes.results.length;
            for (const cp of clientsRes.results) {
              if (!isFullPage(cp)) continue;
              const aumProp = cp.properties['AUM'] ?? cp.properties['Total AUM'] ?? cp.properties['AUM (MYR)'];
              if (aumProp?.type === 'number') {
                totalAUM += (aumProp as { type: 'number'; number: number | null }).number ?? 0;
              }
              if (!lastActivity || cp.last_edited_time > lastActivity) {
                lastActivity = cp.last_edited_time;
              }
            }
            cursor = clientsRes.has_more ? (clientsRes.next_cursor ?? undefined) : undefined;
          } while (cursor);
        } catch { /* shared DB may be inaccessible */ }
      }

      return {
        id: page.id,
        name: name || username,
        username,
        active,
        clientCount,
        totalAUM,
        hasGmail: !!rt(p, 'Gmail Refresh Token'),
        lastActivity,
      };
    })
  );

  const activeFAs    = advisors.filter(a => a.active);
  const totalClients = advisors.reduce((s, a) => s + a.clientCount, 0);
  const totalAUM     = advisors.reduce((s, a) => s + a.totalAUM, 0);

  return NextResponse.json({
    totalFAs:     advisors.length,
    activeFAs:    activeFAs.length,
    totalClients,
    totalAUM,
    advisors,
  } as AdminOverview);
}
