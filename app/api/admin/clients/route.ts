import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}
function num(props: Record<string, unknown>, key: string): number {
  const p = props[key] as { type: string; number?: number | null } | undefined;
  return p?.type === 'number' ? (p.number ?? 0) : 0;
}
function sel(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; select?: { name: string } } | undefined;
  return p?.type === 'select' ? (p.select?.name ?? '') : '';
}
function title(props: Record<string, unknown>): string {
  for (const val of Object.values(props)) {
    const p = val as { type: string; title?: { plain_text: string }[] } | undefined;
    if (p?.type === 'title') return p.title?.[0]?.plain_text ?? '';
  }
  return '';
}

export interface AdminClient {
  id:          string;
  name:        string;
  advisorId:   string;
  advisorName: string;
  aum:         number;
  risk:        string;
  segment:     string;
  status:      string;
  nextReview:  string;
  phone:       string;
  email:       string;
}

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // Allow filtering by FA
  const { searchParams } = new URL(req.url);
  const filterFaId = searchParams.get('fa') ?? '';

  const hostKey   = process.env.NOTION_API_KEY;
  const usersDbId = process.env.NOTION_USERS_DB_ID;
  if (!hostKey || !usersDbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion = new Client({ auth: hostKey });

  // Get all FA users → build Advisor name → user-id map for attribution
  const usersRes = await notion.databases.query({ database_id: usersDbId, page_size: 50 });
  const faUsers = usersRes.results.filter(isFullPage).filter(page => {
    const p    = page.properties as Record<string, unknown>;
    const role = (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor';
    const active = (p['Active'] as { type: string; checkbox?: boolean } | undefined)?.checkbox ?? true;
    return role === 'Advisor' && active;
  });
  const nameToId: Record<string, string> = {};
  for (const fa of faUsers) {
    const nm = (fa.properties['Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '';
    if (nm) nameToId[nm] = fa.id;
  }
  // If filtering by a specific FA, resolve their name to filter on the Advisor tag
  const filterFaName = filterFaId
    ? (Object.entries(nameToId).find(([, id]) => id === filterFaId)?.[0] ?? '')
    : '';

  // Centralized model: query the ONE shared Clients DB and attribute each row
  // by its Advisor tag — no more per-FA DB iteration.
  const clientsDbId = config.clientsDbId || process.env.COMPANY_CLIENTS_DB_ID;
  const allClients: AdminClient[] = [];

  if (clientsDbId) {
    let cursor: string | undefined;
    do {
      const clientsRes = await notion.databases.query({
        database_id: clientsDbId,
        page_size:   100,
        start_cursor: cursor,
        ...(filterFaName ? { filter: { property: 'Advisor', select: { equals: filterFaName } } } : {}),
      });
      for (const cp of clientsRes.results) {
        if (!isFullPage(cp)) continue;
        const p = cp.properties as Record<string, unknown>;
        const advisorName = sel(p, 'Advisor');
        allClients.push({
          id:          cp.id,
          name:        title(p),
          advisorId:   nameToId[advisorName] ?? '',
          advisorName,
          aum:         num(p, 'AUM') || num(p, 'Total AUM') || num(p, 'AUM (MYR)'),
          risk:        sel(p, 'Risk Profile') || sel(p, 'Risk'),
          segment:     sel(p, 'Segment') || sel(p, 'Client Segment'),
          status:      sel(p, 'Status') || sel(p, 'Client Status'),
          nextReview:  (p['Next Review'] as { type: string; date?: { start: string } } | undefined)?.date?.start ?? '',
          phone:       rt(p, 'Phone') || rt(p, 'Phone Number') || rt(p, 'Mobile'),
          email:       rt(p, 'Email') || rt(p, 'Email Address'),
        });
      }
      cursor = clientsRes.has_more ? (clientsRes.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }

  // Sort by AUM descending
  allClients.sort((a, b) => b.aum - a.aum);

  return NextResponse.json({ clients: allClients, total: allClients.length });
}
