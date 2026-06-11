import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/gmail';
import { saveGmailToken, saveDriveToken } from '@/lib/getAdvisorConfig';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Drive connections (Forms Library) use a "drive:<advisorId>" state prefix
  // to distinguish from the Gmail flow below, which shares this callback.
  if (state?.startsWith('drive:')) {
    const advisorId = state.slice('drive:'.length);
    if (error) return NextResponse.redirect(new URL('/forms-library?error=auth_denied', req.url));
    if (!code || !advisorId) return NextResponse.redirect(new URL('/forms-library?error=invalid_callback', req.url));

    try {
      const { refreshToken } = await exchangeCodeForTokens(code);
      if (!refreshToken) return NextResponse.redirect(new URL('/forms-library?error=no_refresh_token', req.url));
      await saveDriveToken(advisorId, refreshToken);
      return NextResponse.redirect(new URL('/forms-library?connected=1', req.url));
    } catch (e) {
      console.error('Drive OAuth callback error:', e);
      return NextResponse.redirect(new URL('/forms-library?error=token_exchange_failed', req.url));
    }
  }

  const advisorId = state;

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
    // Use the Gmail API's getProfile (works with the gmail.modify scope we already
    // have) instead of the userinfo endpoint (which needs an extra email scope).
    let gmailAddress = '';
    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );
      auth.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: 'v1', auth });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      gmailAddress = profile.data.emailAddress ?? '';
    } catch {
      // Non-critical — sendEmail resolves the address again at send time
    }

    // Save refresh token to advisor's Notion user page
    await saveGmailToken(advisorId, refreshToken, gmailAddress);

    return NextResponse.redirect(new URL('/emails?connected=1', req.url));
  } catch (e) {
    console.error('Gmail OAuth callback error:', e);
    return NextResponse.redirect(new URL('/emails?error=token_exchange_failed', req.url));
  }
}
