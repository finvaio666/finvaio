import { NextRequest, NextResponse } from 'next/server';
import { exchangeMsCal } from '@/lib/calendar';
import { saveCalendarToken } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code      = searchParams.get('code');
  const advisorId = searchParams.get('state');
  const error     = searchParams.get('error');

  if (error)            return NextResponse.redirect(new URL('/settings?cal=denied', req.url));
  if (!code || !advisorId) return NextResponse.redirect(new URL('/settings?cal=invalid', req.url));

  try {
    const redirectUri = `${origin}/api/calendar/ms/callback`;
    const { refreshToken, address } = await exchangeMsCal(code, redirectUri);
    if (!refreshToken) return NextResponse.redirect(new URL('/settings?cal=no_token', req.url));
    await saveCalendarToken(advisorId, 'microsoft', refreshToken, address);
    return NextResponse.redirect(new URL('/settings?cal=connected', req.url));
  } catch {
    return NextResponse.redirect(new URL('/settings?cal=failed', req.url));
  }
}
