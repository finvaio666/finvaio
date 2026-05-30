import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { Client, isFullPage } from '@notionhq/client';
import bcrypt from 'bcryptjs';

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
// Limits login attempts per IP: 5 attempts per 5-minute window.
// Note: resets on cold start. For multi-instance production scale,
// replace with a Redis-backed store (e.g. Upstash).
const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS   = 5;

function checkRateLimit(ip: string): boolean {
  const now  = Date.now();
  const prev = loginAttempts.get(ip);
  if (!prev || now - prev.windowStart > RATE_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return true; // allowed
  }
  if (prev.count >= MAX_ATTEMPTS) return false; // blocked
  prev.count++;
  return true; // allowed
}

function clearRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  // Rate-limit by IP before doing anything else
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please wait 5 minutes and try again.' },
      { status: 429 }
    );
  }

  let username: string, password: string;
  try {
    ({ username, password } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  const usersDbId  = process.env.NOTION_USERS_DB_ID;
  const hostKey    = process.env.NOTION_API_KEY;
  const authSecret = process.env.AUTH_SECRET;

  if (!usersDbId || !hostKey || !authSecret) {
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  // ── 1. Find user in Notion Users table ──────────────────────────────────────
  const notion = new Client({ auth: hostKey });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userPage: any = null;

  try {
    const res = await notion.databases.query({
      database_id: usersDbId,
      filter: { property: 'Username', rich_text: { equals: username } },
    });

    // Find the first active match
    userPage = res.results.filter(isFullPage).find(p => {
      const active = p.properties['Active']?.type === 'checkbox'
        ? (p.properties['Active'] as { type: 'checkbox'; checkbox: boolean }).checkbox
        : true; // default to active if column missing
      return active;
    }) ?? null;
  } catch {
    return NextResponse.json({ error: 'Authentication service unavailable.' }, { status: 503 });
  }

  if (!userPage) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  // ── 2. Verify password hash ─────────────────────────────────────────────────
  const pwProp = userPage.properties['Password Hash'];
  const storedHash: string = pwProp?.type === 'rich_text'
    ? (pwProp.rich_text?.[0]?.plain_text ?? '')
    : '';

  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  // ── 3. Sign JWT with advisor identity ───────────────────────────────────────
  const roleProp = userPage.properties['Role'];
  const role: string = roleProp?.type === 'select'
    ? (roleProp.select?.name ?? 'Advisor')
    : 'Advisor';

  const secret = new TextEncoder().encode(authSecret);
  const token  = await new SignJWT({ advisorId: userPage.id, username, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  // Successful login — clear the rate-limit counter for this IP
  clearRateLimit(ip);

  const res = NextResponse.json({ success: true });
  res.cookies.set('aria-session', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 7, // 7 days
    path:     '/',
  });

  return res;
}
