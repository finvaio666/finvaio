import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';

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

  // Fetch all users (Users DB stays on Notion — its migration is Phase 3).
  const usersRes = await notion.databases.query({ database_id: usersDbId, page_size: 50 });
  const faUsers  = usersRes.results.filter(isFullPage).filter(page => {
    const p    = page.properties as Record<string, unknown>;
    const role = (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor';
    return role === 'Advisor'; // only FAs, not admins
  });

  // Clients via the data-source abstraction (Notion or Supabase per flag), read once
  // and aggregated by the Advisor tag. (AUM is incomplete in Supabase mode until it is
  // recomputed post-portfolio; lastActivity is Notion-only until Supabase tracks edits.)
  const byAdvisor = new Map<string, { count: number; aum: number; lastActivity: string }>();
  for (const c of await listClients(config)) {
    if (!c.advisorName) continue;
    const agg = byAdvisor.get(c.advisorName) ?? { count: 0, aum: 0, lastActivity: '' };
    agg.count += 1;
    agg.aum   += c.aum;
    if (c.lastEdited && c.lastEdited > agg.lastActivity) agg.lastActivity = c.lastEdited;
    byAdvisor.set(c.advisorName, agg);
  }

  const advisors: FAStats[] = faUsers.map((page) => {
    const p        = page.properties as Record<string, unknown>;
    const name     = (p['Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '';
    const username = rt(p, 'Username');
    const active   = (p['Active'] as { type: string; checkbox?: boolean } | undefined)?.checkbox ?? true;
    const agg      = byAdvisor.get(name) ?? { count: 0, aum: 0, lastActivity: '' };

    return {
      id: page.id,
      name: name || username,
      username,
      active,
      clientCount:  agg.count,
      totalAUM:     agg.aum,
      hasGmail:     !!rt(p, 'Gmail Refresh Token'),
      lastActivity: agg.lastActivity,
    };
  });

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
