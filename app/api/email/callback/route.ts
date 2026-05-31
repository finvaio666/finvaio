import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/gmail';
import { saveGmailToken } from '@/lib/getAdvisorConfig';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code      = searchParams.get('code');
  const advisorId = searchParams.get('state');
  const error     = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/emails?error=auth_denied', req.url));
  }

  if (!code || !advisorId) {
    return NextResponse.redirect(new URL('/emails?error=invalid_callback', req.url));
  }

  try {
    const { refreshToken, accessToken } = await exchangeCodeForTokens(code);

    if (!refreshToken) {
      return NextResponse.redirect(new URL('/emails?error=no_refresh_token', req.url));
    }

    // Get the advisor's Gmail address using the access token
    let gmailAddress = '';
    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );
      auth.setCredentials({ access_token: accessToken });
      const oauth2 = google.oauth2({ version: 'v2', auth });
      const info = await oauth2.userinfo.get();
      gmailAddress = info.data.email ?? '';
    } catch {
      // Non-critical — advisor can set it manually
    }

    // Save refresh token to advisor's Notion user page
    await saveGmailToken(advisorId, refreshToken, gmailAddress);

    return NextResponse.redirect(new URL('/emails?connected=1', req.url));
  } catch (e) {
    console.error('Gmail OAuth callback error:', e);
    return NextResponse.redirect(new URL('/emails?error=token_exchange_failed', req.url));
  }
}
