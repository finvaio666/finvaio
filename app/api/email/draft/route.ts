import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { draftReply, draftNewEmail } from '@/lib/emailClassifier';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    mode:        'reply' | 'new';
    // For reply:
    from?:       string;
    subject?:    string;
    emailBody?:  string;
    clientName?: string;
    instruction?: string;
    // For new:
    toName?:     string;
    purpose?:    string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  const advisorName = config.name || 'Your Financial Advisor';

  try {
    if (body.mode === 'reply') {
      const draft = await draftReply({
        from:        body.from        ?? '',
        subject:     body.subject     ?? '',
        body:        body.emailBody   ?? '',
        advisorName,
        clientName:  body.clientName,
        instruction: body.instruction,
      });
      return NextResponse.json({ draft });
    }

    if (body.mode === 'new') {
      const draft = await draftNewEmail({
        toName:      body.toName      ?? '',
        purpose:     body.purpose     ?? '',
        advisorName,
        clientName:  body.clientName,
      });
      return NextResponse.json(draft); // { subject, body }
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI draft failed: ${msg}` }, { status: 500 });
  }
}
