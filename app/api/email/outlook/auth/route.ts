import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getOutlookAuthUrl } from '@/lib/outlook';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  if (!process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET || !process.env.MS_REDIRECT_URI) {
    return NextResponse.json(
      { error: 'Microsoft OAuth is not configured. Add MS_CLIENT_ID, MS_CLIENT_SECRET, and MS_REDIRECT_URI to your environment variables.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: getOutlookAuthUrl(advisorId) });
}
