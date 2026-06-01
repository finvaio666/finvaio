import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { sendEmail, markAsSent } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    to:        string;
    subject:   string;
    body:      string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    isNew?:    boolean; // true = outbound initiated by advisor
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!body.to || !body.subject || !body.body) {
    return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 });
  }

  const config = await getAdvisorConfig(advisorId);
  if (!config?.gmailRefreshToken) {
    return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
  }

  try {
    const messageId = await sendEmail(config.gmailRefreshToken, {
      to:        body.to,
      subject:   body.subject,
      body:      body.body,
      from:      config.gmailAddress || undefined, // force real Gmail address, bypass misconfigured alias
      threadId:  body.threadId,
      inReplyTo: body.inReplyTo,
      references: body.references,
    });

    // If this is a new outbound email, add the ARIA/Sent label for monitoring
    if (body.isNew && messageId) {
      await markAsSent(config.gmailRefreshToken, messageId).catch(() => {});
    }

    return NextResponse.json({ success: true, messageId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Send email error:', msg);
    return NextResponse.json({ error: `Failed to send email: ${msg}` }, { status: 500 });
  }
}
