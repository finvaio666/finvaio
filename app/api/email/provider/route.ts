import { NextRequest, NextResponse } from 'next/server';
import { setEmailProvider } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { provider: 'gmail' | 'outlook' };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  if (body.provider !== 'gmail' && body.provider !== 'outlook') {
    return NextResponse.json({ error: 'provider must be gmail or outlook' }, { status: 400 });
  }

  await setEmailProvider(advisorId, body.provider);
  return NextResponse.json({ success: true });
}
