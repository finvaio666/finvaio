import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/api/auth', '/form/', '/api/cashflow/submit', '/api/networth/submit', '/premium-calculator'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static public assets (images, SVGs, fonts)
  if (/\.(svg|png|jpg|jpeg|ico|webp|gif|woff2?|ttf)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get('aria-session')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const secret = new TextEncoder().encode(authSecret);
    const { payload } = await jwtVerify(token, secret);

    // Forward advisor identity to all API routes via request header
    const advisorId = (payload.advisorId as string) ?? '';
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-advisor-id', advisorId);
    requestHeaders.set('x-advisor-role', (payload.role as string) ?? 'Advisor');
    requestHeaders.set('x-advisor-name', (payload.username as string) ?? '');

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    // Token invalid or expired — redirect to login
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('aria-session');
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-192.png|manifest.json|.*\\.svg|.*\\.png|.*\\.ico|.*\\.webp|.*\\.jpg|.*\\.jpeg).*)'],
};
