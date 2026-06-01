import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getThread, markThreadRead } from '@/lib/gmail';
import { summarizeEmail } from '@/lib/emailClassifier';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get('id');
  if (!threadId) return NextResponse.json({ error: 'Missing thread id' }, { status: 400 });

  const config = await getAdvisorConfig(advisorId);
  if (!config?.gmailRefreshToken) {
    return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
  }

  const advisorEmail = config.gmailAddress || '';

  try {
    const thread = await getThread(config.gmailRefreshToken, threadId, advisorEmail);

    // Mark as read once opened — drops it off the dashboard "new" list
    markThreadRead(config.gmailRefreshToken, threadId).catch(() => {});

    // Generate AI summary from the first (or longest) inbound message
    const inboundMsg = thread.messages.find(m => !m.isFromAdvisor) ?? thread.messages[0];
    let aiSummary = null;
    if (inboundMsg) {
      const rawBody = inboundMsg.body || inboundMsg.bodyHtml;
    aiSummary = await summarizeEmail(
        inboundMsg.from,
        thread.subject,
        rawBody,
      ).catch(() => null);
    }

    return NextResponse.json({ thread, aiSummary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Get thread error:', msg);
    return NextResponse.json({ error: `Failed to load thread: ${msg}` }, { status: 500 });
  }
}
