import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getActive, sendEmail, markThreadSeen } from '@/lib/emailService';

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
  if (!config || !getActive(config).connected) {
    return NextResponse.json({ error: 'Email not connected' }, { status: 400 });
  }

  try {
    const messageId = await sendEmail(config, {
      to:         body.to,
      subject:    body.subject,
      body:       body.body,
      threadId:   body.threadId,
      inReplyTo:  body.inReplyTo,
      references: body.references,
    });

    // Replying = acted on → drop from dashboard "new" list (stays tracked as a
    // follow-up). New outbound emails don't have a thread to mark.
    if (!body.isNew && body.threadId) {
      await markThreadSeen(config, body.threadId).catch(() => {});
    }

    return NextResponse.json({ success: true, messageId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Send email error:', msg);
    return NextResponse.json({ error: `Failed to send email: ${msg}` }, { status: 500 });
  }
}
