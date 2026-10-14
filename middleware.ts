import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/api/auth', '/form/', '/api/cashflow/submit', '/api/networth/submit', '/premium-calculator'];

// Identity headers the API routes trust. Only this middleware may set them —
// any copy arriving from the client is a forgery and is dropped on EVERY path,
// including the public ones, so a route can never see an attacker's value.
const IDENTITY_HEADERS = ['x-advisor-id', 'x-advisor-role', 'x-advisor-name'];

function withoutIdentity(req: NextRequest): Headers {
  const h = new Headers(req.headers);
  for (const k of IDENTITY_HEADERS) h.delete(k);
  return h;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // Allow public paths through
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers: withoutIdentity(req) } });
  }

  // Allow static public assets (images, SVGs, fonts). Never for /api/ — an API
  // path ending in ".png" must still be authenticated.
  if (!isApi && /\.(svg|png|jpg|jpeg|ico|webp|gif|woff2?|ttf)$/i.test(pathname)) {
    return NextResponse.next({ request: { headers: withoutIdentity(req) } });
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
    const requestHeaders = withoutIdentity(req);
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
  matcher: [
    // Pages: skip Next internals and static image files
    '/((?!api/|_next/static|_next/image|favicon.ico|icon-192.png|manifest.json|.*\\.svg|.*\\.png|.*\\.ico|.*\\.webp|.*\\.jpg|.*\\.jpeg).*)',
    // API: always run, whatever the path ends in
    '/api/:path*',
  ],
};
