import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig, saveCalendarToken } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  await saveCalendarToken(advisorId, '', '', '');
  return NextResponse.json({ success: true });
}
