import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const validUsername = process.env.AUTH_USERNAME;
  const validPassword = process.env.AUTH_PASSWORD;

  if (!validUsername || !validPassword) {
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  if (username !== validUsername || password !== validPassword) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }
  const secret = new TextEncoder().encode(authSecret);

  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  const res = NextResponse.json({ success: true });
  res.cookies.set('aria-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  return res;
}
