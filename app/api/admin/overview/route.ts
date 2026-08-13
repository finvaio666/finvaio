import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import * as sbUsers from '@/lib/repos/users';

const useSupabaseUsers = () => process.env.DATA_SOURCE_USERS === 'supabase';

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

  type FaUser = { id: string; name: string; username: string; active: boolean; hasGmail: boolean };
  let faUsers: FaUser[];

  if (useSupabaseUsers()) {
    faUsers = (await sbUsers.listUsers())
      .filter(u => (u.role || 'Advisor') === 'Advisor') // only FAs, not admins
      .map(u => ({ id: u.id, name: u.name, username: u.username, active: u.active, hasGmail: u.hasGmail }));
  } else {
    const hostKey   = process.env.NOTION_API_KEY;
    const usersDbId = process.env.NOTION_USERS_DB_ID;
    if (!hostKey || !usersDbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const notion = new Client({ auth: hostKey });
    const usersRes = await notion.databases.query({ database_id: usersDbId, page_size: 50 });
    faUsers = usersRes.results.filter(isFullPage).filter(page => {
      const p    = page.properties as Record<string, unknown>;
      const role = (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor';
      return role === 'Advisor'; // only FAs, not admins
    }).map(page => {
      const p = page.properties as Record<string, unknown>;
      return {
        id:       page.id,
        name:     (p['Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '',
        username: rt(p, 'Username'),
        active:   (p['Active'] as { type: string; checkbox?: boolean } | undefined)?.checkbox ?? true,
        hasGmail: !!rt(p, 'Gmail Refresh Token'),
      };
    });
  }

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

  const advisors: FAStats[] = faUsers.map((u) => {
    const agg = byAdvisor.get(u.name) ?? { count: 0, aum: 0, lastActivity: '' };
    return {
      id:           u.id,
      name:         u.name || u.username,
      username:     u.username,
      active:       u.active,
      clientCount:  agg.count,
      totalAUM:     agg.aum,
      hasGmail:     u.hasGmail,
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
