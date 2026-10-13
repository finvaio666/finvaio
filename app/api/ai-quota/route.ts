import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { quotaStatus } from '@/lib/aiGuard';

export const dynamic = 'force-dynamic';

/** The signed-in advisor's own FINVA token allowance for today. */
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Unknown advisor' }, { status: 404 });
  return NextResponse.json(await quotaStatus(config.name));
}
