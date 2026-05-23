import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/api/auth'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
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
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    // Token invalid or expired — redirect to login
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('aria-session');
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-192.png|manifest.json).*)'],
};
