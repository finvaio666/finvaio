import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getActive, closeThread } from '@/lib/emailService';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { threadId?: string; messageId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const target = body.threadId || body.messageId;
  if (!target) return NextResponse.json({ error: 'threadId required' }, { status: 400 });

  const config = await getAdvisorConfig(advisorId);
  if (!config || !getActive(config).connected) {
    return NextResponse.json({ error: 'Email not connected' }, { status: 400 });
  }

  try {
    await closeThread(config, target);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
