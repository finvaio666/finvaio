import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listMeetings } from '@/lib/meetingNotes';
import { DEMO_MEETINGS } from '@/lib/demoData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config?.notionApiKey) return NextResponse.json({ data: [] });

  if (config.notionApiKey === 'DEMO_MODE') return NextResponse.json({ data: DEMO_MEETINGS });
  if (!config.meetingNotesDbId) return NextResponse.json({ data: [] });

  try {
    // Meetings via the data-source abstraction (Notion or Supabase per flag).
    // Already sorted by meeting date desc; the empty-advisor-option case returns [].
    return NextResponse.json({ data: await listMeetings(config) });
  } catch (e) {
    console.error('Meetings fetch error:', e);
    return NextResponse.json({ data: [] });
  }
}

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (config.notionApiKey === 'DEMO_MODE') return NextResponse.json({ success: true, demo: true });

  if (!config.meetingNotesDbId) {
    return NextResponse.json({ error: 'Meeting Notes database not configured.' }, { status: 400 });
  }

  const body = await req.json();
  const { clientId, clientName, meetingDate, meetingType, notes, actionItems, nextReviewDate, clearNextReview } = body;

  const notion = new Client({ auth: config.notionApiKey });
  // Title always encodes client name so it can be parsed back without extra DB columns
  const title  = `${clientName} — ${meetingType} — ${meetingDate}`;

  // Core properties that every Meeting Notes DB must have
  const coreProps: Record<string, unknown> = {
    Name:           { title:     [{ text: { content: title } }] },
    'Meeting Date': { date:      { start: meetingDate } },
    'Meeting Type': { select:    { name: meetingType } },
    'Notes':        { rich_text: [{ text: { content: notes || '' } }] },
    'Action Items': { rich_text: [{ text: { content: actionItems || '' } }] },
    ...(nextReviewDate ? { 'Next Review Date': { date: { start: nextReviewDate } } } : {}),
    // Centralized model: stamp owning advisor
    'Advisor':      { select: { name: config.name } },
  };

  // Optional properties — only present if the DB has these columns
  const optionalProps: Record<string, unknown> = {
    'Client Name': { rich_text: [{ text: { content: clientName || '' } }] },
    ...(clientId ? { 'Client': { relation: [{ id: clientId }] } } : {}),
  };

  try {
    // Attempt 1: try with optional client-linkage fields
    try {
      await notion.pages.create({
        parent: { database_id: config.meetingNotesDbId },
        properties: { ...coreProps, ...optionalProps } as Parameters<typeof notion.pages.create>[0]['properties'],
      });
    } catch (e1) {
      // If Notion rejects because the optional columns don't exist, retry with core only
      if (String(e1).includes('is not a property')) {
        await notion.pages.create({
          parent: { database_id: config.meetingNotesDbId },
          properties: coreProps as Parameters<typeof notion.pages.create>[0]['properties'],
        });
      } else {
        throw e1;
      }
    }

    // Update client's review dates in the CRM
    if (clientId && config.clientsDbId) {
      const updateProps: Record<string, unknown> = {
        'Last review date': { date: { start: meetingDate } },
      };
      if (nextReviewDate)     updateProps['Next review date'] = { date: { start: nextReviewDate } };
      else if (clearNextReview) updateProps['Next review date'] = { date: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await notion.pages.update({ page_id: clientId, properties: updateProps as any });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Meeting save error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
