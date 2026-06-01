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

  // Get all FA users
  const usersRes = await notion.databases.query({ database_id: usersDbId, page_size: 50 });
  let faUsers = usersRes.results.filter(isFullPage).filter(page => {
    const p    = page.properties as Record<string, unknown>;
    const role = (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor';
    const active = (p['Active'] as { type: string; checkbox?: boolean } | undefined)?.checkbox ?? true;
    return role === 'Advisor' && active;
  });

  // Filter to specific FA if requested
  if (filterFaId) faUsers = faUsers.filter(p => p.id === filterFaId);

  const allClients: AdminClient[] = [];

  await Promise.all(faUsers.map(async (faPage) => {
    const faProps  = faPage.properties as Record<string, unknown>;
    const faName   = (faProps['Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '';
    const faConfig = await getAdvisorConfig(faPage.id).catch(() => null);
    if (!faConfig?.notionApiKey || !faConfig.clientsDbId || faConfig.notionApiKey === 'DEMO_MODE') return;

    try {
      const faNotion   = new Client({ auth: faConfig.notionApiKey });
      const clientsRes = await faNotion.databases.query({
        database_id: faConfig.clientsDbId,
        page_size:   100,
      });

      for (const cp of clientsRes.results) {
        if (!isFullPage(cp)) continue;
        const p = cp.properties as Record<string, unknown>;
        allClients.push({
          id:          cp.id,
          name:        title(p),
          advisorId:   faPage.id,
          advisorName: faName,
          aum:         num(p, 'AUM') || num(p, 'Total AUM') || num(p, 'AUM (MYR)'),
          risk:        sel(p, 'Risk Profile') || sel(p, 'Risk'),
          segment:     sel(p, 'Segment') || sel(p, 'Client Segment'),
          status:      sel(p, 'Status') || sel(p, 'Client Status'),
          nextReview:  (p['Next Review'] as { type: string; date?: { start: string } } | undefined)?.date?.start ?? '',
          phone:       rt(p, 'Phone') || rt(p, 'Phone Number') || rt(p, 'Mobile'),
          email:       rt(p, 'Email') || rt(p, 'Email Address'),
        });
      }
    } catch { /* skip inaccessible FA */ }
  }));

  // Sort by AUM descending
  allClients.sort((a, b) => b.aum - a.aum);

  return NextResponse.json({ clients: allClients, total: allClients.length });
}
