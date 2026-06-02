import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getActive, getThread } from '@/lib/emailService';
import { summarizeEmail } from '@/lib/emailClassifier';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get('id');
  if (!threadId) return NextResponse.json({ error: 'Missing thread id' }, { status: 400 });

  const config = await getAdvisorConfig(advisorId);
  if (!config || !getActive(config).connected) {
    return NextResponse.json({ error: 'Email not connected' }, { status: 400 });
  }

  try {
    const thread = await getThread(config, threadId);

    // Note: opening no longer marks it seen — it stays on the dashboard until
    // the advisor acts on it (replies or marks done).

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
