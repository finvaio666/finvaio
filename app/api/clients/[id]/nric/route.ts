import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { decryptNric } from '@/lib/nricCrypto';
import * as sbClients from '@/lib/repos/clients';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clients/[id]/nric
 * On-demand decryption of a single client's NRIC. This is the ONLY route that
 * returns the plaintext NRIC — list/detail payloads carry a masked form. Keeping
 * one choke point makes future access auditing trivial.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (config.notionApiKey === 'DEMO_MODE') return NextResponse.json({ error: 'Not available in demo.' }, { status: 403 });

  if (process.env.DATA_SOURCE_CLIENTS === 'supabase') {
    const client = await sbClients.getClientById(id);
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    if (config.role !== 'Admin' && client.advisorName !== config.name) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    try {
      return NextResponse.json({ nric: decryptNric(client.nricRegNo) });
    } catch (e) {
      console.error('nric reveal (supabase) failed:', e);
      return NextResponse.json({ error: 'Failed to retrieve NRIC' }, { status: 500 });
    }
  }

  const notion = new Client({ auth: config.notionApiKey });

  try {
    const page = await notion.pages.retrieve({ page_id: id });
    if (!isFullPage(page)) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    // Must be a page of this advisor's Clients DB — not any Notion page the
    // integration happens to read.
    const parentDb = page.parent.type === 'database_id' ? page.parent.database_id.replace(/-/g, '') : '';
    if (!parentDb || parentDb !== config.clientsDbId.replace(/-/g, '')) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Same scoping rule as every shared-DB query: non-admin advisors only see
    // their own records (Advisor select === their name).
    const p = page.properties;
    const owner = p['Advisor']?.type === 'select' ? p['Advisor'].select?.name ?? '' : '';
    if (config.role !== 'Admin' && owner !== config.name) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const raw = p['NRIC / Reg No']?.type === 'rich_text' ? p['NRIC / Reg No'].rich_text[0]?.plain_text ?? '' : '';
    const nric = decryptNric(raw);
    return NextResponse.json({ nric });
  } catch (e) {
    console.error('nric reveal failed:', e);
    return NextResponse.json({ error: 'Failed to retrieve NRIC' }, { status: 500 });
  }
}
