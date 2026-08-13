import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import * as sbUsers from '@/lib/repos/users';

export const dynamic = 'force-dynamic';
const useSupabaseUsers = () => process.env.DATA_SOURCE_USERS === 'supabase';

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

  // Get all FA users → build Advisor name → user-id map for attribution.
  let nameToId: Record<string, string>;
  if (useSupabaseUsers()) {
    nameToId = await sbUsers.nameToIdMap();
  } else {
    const usersRes = await notion.databases.query({ database_id: usersDbId, page_size: 50 });
    const faUsers = usersRes.results.filter(isFullPage).filter(page => {
      const p    = page.properties as Record<string, unknown>;
      const role = (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor';
      const active = (p['Active'] as { type: string; checkbox?: boolean } | undefined)?.checkbox ?? true;
      return role === 'Advisor' && active;
    });
    nameToId = {};
    for (const fa of faUsers) {
      const nm = (fa.properties['Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '';
      if (nm) nameToId[nm] = fa.id;
    }
  }
  // If filtering by a specific FA, resolve their name to filter on the Advisor tag
  const filterFaName = filterFaId
    ? (Object.entries(nameToId).find(([, id]) => id === filterFaId)?.[0] ?? '')
    : '';

  // Centralized model: read the ONE shared Clients source via the data-source
  // abstraction (Notion or Supabase per DATA_SOURCE_CLIENTS), attributing each
  // row by its Advisor tag — no more per-FA DB iteration.
  const records = await listClients(config, filterFaName ? { advisorName: filterFaName } : {});
  const allClients: AdminClient[] = records.map(c => ({
    id:          c.id,
    name:        c.name,
    advisorId:   nameToId[c.advisorName] ?? '',
    advisorName: c.advisorName,
    aum:         c.aum,
    risk:        c.risk,
    segment:     c.segment,
    status:      c.status,
    nextReview:  c.nextReview,
    phone:       c.phone,
    email:       c.email,
  }));

  // Sort by AUM descending
  allClients.sort((a, b) => b.aum - a.aum);

  return NextResponse.json({ clients: allClients, total: allClients.length });
}
