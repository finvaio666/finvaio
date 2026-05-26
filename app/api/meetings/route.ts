import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { DEMO_MEETINGS } from '@/lib/demoData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config?.notionApiKey) return NextResponse.json({ data: [] });

  // Demo mode
  if (config.notionApiKey === 'DEMO_MODE') return NextResponse.json({ data: DEMO_MEETINGS });

  if (!config.meetingNotesDbId) return NextResponse.json({ data: [] });

  const notion = new Client({ auth: config.notionApiKey });
  try {
    const res = await notion.databases.query({
      database_id: config.meetingNotesDbId,
      sorts: [{ property: 'Meeting Date', direction: 'descending' }],
    });

    const data = res.results.filter(isFullPage).map(page => {
      const p = page.properties;
      return {
        id:             page.id,
        clientId:       p['Client']?.type === 'relation' ? (p['Client'] as { type: 'relation'; relation: { id: string }[] }).relation[0]?.id ?? '' : '',
        clientName:     p['Client Name']?.type === 'rich_text' ? (p['Client Name'] as { type: 'rich_text'; rich_text: { plain_text: string }[] }).rich_text[0]?.plain_text ?? '' : '',
        meetingDate:    p['Meeting Date']?.type === 'date'      ? (p['Meeting Date'] as { type: 'date'; date: { start: string } | null }).date?.start ?? '' : '',
        meetingType:    p['Meeting Type']?.type === 'select'    ? (p['Meeting Type'] as { type: 'select'; select: { name: string } | null }).select?.name ?? '' : '',
        notes:          p['Notes']?.type === 'rich_text'        ? (p['Notes'] as { type: 'rich_text'; rich_text: { plain_text: string }[] }).rich_text[0]?.plain_text ?? '' : '',
        actionItems:    p['Action Items']?.type === 'rich_text' ? (p['Action Items'] as { type: 'rich_text'; rich_text: { plain_text: string }[] }).rich_text[0]?.plain_text ?? '' : '',
        nextReviewDate: p['Next Review Date']?.type === 'date'  ? (p['Next Review Date'] as { type: 'date'; date: { start: string } | null }).date?.start ?? '' : '',
        title:          p['Name']?.type === 'title'             ? (p['Name'] as { type: 'title'; title: { plain_text: string }[] }).title[0]?.plain_text ?? '' : '',
      };
    });
    return NextResponse.json({ data });
  } catch (e) {
    console.error('Meetings fetch error:', e);
    return NextResponse.json({ data: [] });
  }
}

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Demo mode — simulate success
  if (config.notionApiKey === 'DEMO_MODE') {
    return NextResponse.json({ success: true, demo: true });
  }

  if (!config.meetingNotesDbId) {
    return NextResponse.json({ error: 'Meeting Notes database not configured.' }, { status: 400 });
  }

  const body = await req.json();
  const { clientId, clientName, meetingDate, meetingType, notes, actionItems, nextReviewDate } = body;

  const notion  = new Client({ auth: config.notionApiKey });
  const title   = `${clientName} — ${meetingType} — ${meetingDate}`;

  try {
    // 1. Create meeting note
    await notion.pages.create({
      parent: { database_id: config.meetingNotesDbId },
      properties: {
        Name:             { title:     [{ text: { content: title } }] },
        'Meeting Date':   { date:      { start: meetingDate } },
        'Meeting Type':   { select:    { name: meetingType } },
        'Notes':          { rich_text: [{ text: { content: notes || '' } }] },
        'Action Items':   { rich_text: [{ text: { content: actionItems || '' } }] },
        // ── Client linkage — these fields drive the client filter in the UI ──
        'Client Name':    { rich_text: [{ text: { content: clientName || '' } }] },
        ...(clientId ? { 'Client': { relation: [{ id: clientId }] } } : {}),
        ...(nextReviewDate ? { 'Next Review Date': { date: { start: nextReviewDate } } } : {}),
      },
    });

    // 2. Update client's Last review date + Next review date
    if (clientId && config.clientsDbId) {
      const updateProps: Record<string, unknown> = {
        'Last review date': { date: { start: meetingDate } },
      };
      if (nextReviewDate) updateProps['Next review date'] = { date: { start: nextReviewDate } };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await notion.pages.update({ page_id: clientId, properties: updateProps as any });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Meeting save error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
