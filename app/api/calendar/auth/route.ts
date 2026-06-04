import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getGoogleCalAuthUrl, getMsCalAuthUrl } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  const { searchParams, origin } = new URL(req.url);
  const provider = searchParams.get('provider') === 'microsoft' ? 'microsoft' : 'google';

  if (provider === 'google') {
    if (!process.env.GOOGLE_CLIENT_ID) return NextResponse.json({ error: 'Google OAuth not configured.' }, { status: 500 });
    const redirectUri = `${origin}/api/calendar/google/callback`;
    return NextResponse.json({ url: getGoogleCalAuthUrl(advisorId, redirectUri) });
  } else {
    if (!process.env.MS_CLIENT_ID) return NextResponse.json({ error: 'Microsoft OAuth not configured.' }, { status: 500 });
    const redirectUri = `${origin}/api/calendar/ms/callback`;
    return NextResponse.json({ url: getMsCalAuthUrl(advisorId, redirectUri) });
  }
}
