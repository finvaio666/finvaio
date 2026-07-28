import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { getAdvisorConfig, advisorFilter } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

/**
 * POST /api/clients — quick-create a client record.
 *
 * Built for the "Log Meeting" flow: an FA meets someone who isn't in the CRM
 * yet (almost always a prospect) and needs a real client page so the meeting
 * note, tasks, review dates and follow-up email all have something to hang
 * off. Only the name is required; everything else can be filled in later on
 * the client page.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (config.notionApiKey === 'DEMO_MODE') {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({
      client: {
        id: `demo-${Date.now()}`, name: body.name ?? '', email: body.email ?? '',
        phone: body.phone ?? '', status: 'Prospect', segment: 'Prospect',
      },
      demo: true,
    });
  }

  if (!config.clientsDbId) {
    return NextResponse.json({ error: 'Clients database not configured.' }, { status: 400 });
  }

  let body: { name?: string; email?: string; phone?: string; segment?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Client name is required.' }, { status: 400 });

  const email   = (body.email ?? '').trim();
  const phone   = (body.phone ?? '').trim();
  const status  = (body.status  ?? 'Prospect').trim();
  const segment = (body.segment ?? 'Prospect').trim();

  const notion = new Client({ auth: config.notionApiKey });

  try {
    // Reject a duplicate within this advisor's own book — two client pages with
    // the same name would split the meeting history between them.
    const f = advisorFilter(config);
    const nameFilter = { property: 'Client Name', title: { equals: name } };
    const dupe = await notion.databases.query({
      database_id: config.clientsDbId,
      filter: f ? { and: [f, nameFilter] } : nameFilter,
      page_size: 1,
    });
    if (dupe.results.length > 0) {
      return NextResponse.json(
        { error: `"${name}" already exists in your client list.`, existingId: dupe.results[0].id },
        { status: 409 },
      );
    }

    const page = await notion.pages.create({
      parent: { database_id: config.clientsDbId },
      properties: {
        'Client Name':     { title:  [{ text: { content: name } }] },
        'Status':          { select: { name: status } },
        'Client Segment':  { select: { name: segment } },
        ...(email ? { 'Email': { email } }               : {}),
        ...(phone ? { 'Phone': { phone_number: phone } } : {}),
        // Centralized model: stamp owning advisor
        'Advisor':         { select: { name: config.name } },
      } as Parameters<typeof notion.pages.create>[0]['properties'],
    });

    return NextResponse.json({ client: { id: page.id, name, email, phone, status, segment } });
  } catch (e) {
    console.error('Client create error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
