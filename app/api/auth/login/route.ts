import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { Client, isFullPage } from '@notionhq/client';
import bcrypt from 'bcryptjs';
import * as sbUsers from '@/lib/repos/users';
import { recordLogin, type LoginOutcome } from '@/lib/repos/loginLog';
const useSupabaseUsers = () => process.env.DATA_SOURCE_USERS === 'supabase';

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
  const userAgent = req.headers.get('user-agent') ?? '';

  if (!checkRateLimit(ip)) {
    // Username isn't parsed yet at this point, and deliberately so — we block
    // before touching the body. Logged as unknown so the burst is still visible.
    await recordLogin({ username: '(rate limited)', outcome: 'rate_limited', ip, userAgent });
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

  // Usernames are stored trimmed + lowercased (see settings/users POST) — match that here,
  // or logins fail for any casing other than the exact stored form.
  username = username.trim().toLowerCase();

  const usersDbId  = process.env.NOTION_USERS_DB_ID;
  const hostKey    = process.env.NOTION_API_KEY;
  const authSecret = process.env.AUTH_SECRET;

  if (!usersDbId || !hostKey || !authSecret) {
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  // Read once into a plain value: useSupabaseUsers is named like a React hook,
  // so calling it inside the `audit` closure below trips rules-of-hooks.
  const viaSupabase = useSupabaseUsers();

  // Audit trail — see lib/repos/loginLog.ts. Never throws, so it can't block a login.
  const audit = (outcome: LoginOutcome, extra: { advisorId?: string; name?: string; role?: string } = {}) =>
    recordLogin({ username, outcome, ip, userAgent, source: viaSupabase ? 'supabase' : 'notion', ...extra });

  if (viaSupabase) {
    const found = await sbUsers.verifyLogin(username).catch(() => null);
    if (!found) {
      // verifyLogin filters on active=true, so an inactive account is
      // indistinguishable from a missing one here.
      await audit('unknown_user');
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, found.passwordHash);
    if (!valid) {
      await audit('bad_password', { advisorId: found.notionId, name: found.name, role: found.role });
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }
    await audit('success', { advisorId: found.notionId, name: found.name, role: found.role });
    const secret = new TextEncoder().encode(authSecret);
    const token  = await new SignJWT({ advisorId: found.notionId, username, role: found.role })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
    clearRateLimit(ip);
    const res = NextResponse.json({ success: true });
    res.cookies.set('aria-session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  // ── 1. Find user in Notion Users table ──────────────────────────────────────
  const notion = new Client({ auth: hostKey });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userPage: any = null;
  // Unlike the Supabase path, this one sees deactivated accounts too — worth
  // distinguishing in the audit trail, since someone trying a disabled
  // colleague's credentials is a different event from a typo'd username.
  let matchedButInactive = false;

  try {
    const res = await notion.databases.query({
      database_id: usersDbId,
      filter: { property: 'Username', rich_text: { equals: username } },
    });

    const matches = res.results.filter(isFullPage);
    const isActive = (p: (typeof matches)[number]) =>
      p.properties['Active']?.type === 'checkbox'
        ? (p.properties['Active'] as { type: 'checkbox'; checkbox: boolean }).checkbox
        : true; // default to active if column missing

    // Find the first active match
    userPage = matches.find(isActive) ?? null;
    matchedButInactive = !userPage && matches.length > 0;
  } catch {
    return NextResponse.json({ error: 'Authentication service unavailable.' }, { status: 503 });
  }

  /** Advisor display name off a Notion user page, for the audit trail. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageName = (p: any): string =>
    p?.properties?.['Name']?.type === 'title'
      ? (p.properties['Name'].title?.[0]?.plain_text ?? '')
      : '';

  if (!userPage) {
    await audit(matchedButInactive ? 'inactive' : 'unknown_user');
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  // ── 2. Verify password hash ─────────────────────────────────────────────────
  const pwProp = userPage.properties['Password Hash'];
  const storedHash: string = pwProp?.type === 'rich_text'
    ? (pwProp.rich_text?.[0]?.plain_text ?? '')
    : '';

  const roleProp = userPage.properties['Role'];
  const role: string = roleProp?.type === 'select'
    ? (roleProp.select?.name ?? 'Advisor')
    : 'Advisor';

  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) {
    await audit('bad_password', { advisorId: userPage.id, name: pageName(userPage), role });
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  await audit('success', { advisorId: userPage.id, name: pageName(userPage), role });

  // ── 3. Sign JWT with advisor identity ───────────────────────────────────────
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
