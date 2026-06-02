import { NextRequest, NextResponse } from 'next/server';
import { exchangeOutlookCode, getOutlookProfile } from '@/lib/outlook';
import { saveOutlookToken } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code      = searchParams.get('code');
  const advisorId = searchParams.get('state');
  const error     = searchParams.get('error');

  if (error)              return NextResponse.redirect(new URL('/emails?error=auth_denied', req.url));
  if (!code || !advisorId) return NextResponse.redirect(new URL('/emails?error=invalid_callback', req.url));

  try {
    const { refreshToken } = await exchangeOutlookCode(code);
    if (!refreshToken) return NextResponse.redirect(new URL('/emails?error=no_refresh_token', req.url));

    let address = '';
    try { address = await getOutlookProfile(refreshToken); } catch { /* non-critical */ }

    await saveOutlookToken(advisorId, refreshToken, address);
    return NextResponse.redirect(new URL('/emails?connected=outlook', req.url));
  } catch (e) {
    console.error('Outlook OAuth callback error:', e);
    return NextResponse.redirect(new URL('/emails?error=token_exchange_failed', req.url));
  }
}
