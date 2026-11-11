import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listLoginsSince, type LoginRecord } from '@/lib/repos/loginLog';

export const dynamic = 'force-dynamic';

/**
 * FA login audit trail, whole company, Admin only.
 *
 * Successes and failures both, because a log of successes alone cannot answer
 * the question an audit trail exists for. Filters are applied server-side so
 * the counts and the table always agree.
 *
 * Filters (all optional):
 *   days      lookback window, default 30, max 365
 *   advisor   exact advisor_id match ('' = all)
 *   outcome   success | bad_password | unknown_user | inactive | rate_limited ('' = all)
 *   q         text search over username, name and ip
 */
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const sp      = new URL(req.url).searchParams;
  const days    = Math.min(Math.max(parseInt(sp.get('days') ?? '30', 10) || 30, 1), 365);
  const advisor = (sp.get('advisor') ?? '').trim();
  const outcome = (sp.get('outcome') ?? '').trim();
  const q       = (sp.get('q') ?? '').trim().toLowerCase();

  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

  let rows: LoginRecord[];
  try {
    rows = await listLoginsSince(sinceIso);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // The table is created by db/migrations/2026-11-10-create-login-log.sql —
    // say so plainly rather than showing an empty page as if nobody logged in.
    if (/relation .*login_log.* does not exist|could not find the table/i.test(msg)) {
      return NextResponse.json({ error: 'login_log table not found — apply db/migrations/2026-11-10-create-login-log.sql.' }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (advisor) rows = rows.filter(r => r.advisorId === advisor);
  if (outcome) rows = rows.filter(r => r.outcome === outcome);
  if (q)       rows = rows.filter(r =>
    r.username.toLowerCase().includes(q) ||
    r.name.toLowerCase().includes(q) ||
    r.ip.toLowerCase().includes(q));

  const successes = rows.filter(r => r.outcome === 'success');
  const failures  = rows.filter(r => r.outcome !== 'success');

  // One entry per advisor who actually got in, with their most recent sign-in —
  // the "who is using this and when were they last here" view.
  const byAdvisor = new Map<string, { advisorId: string; name: string; username: string; role: string; logins: number; lastSeen: string }>();
  for (const r of successes) {
    const key = r.advisorId || r.username;
    const prev = byAdvisor.get(key);
    if (prev) {
      prev.logins++;
      if (r.createdAt > prev.lastSeen) prev.lastSeen = r.createdAt;
    } else {
      byAdvisor.set(key, {
        advisorId: r.advisorId, name: r.name, username: r.username,
        role: r.role, logins: 1, lastSeen: r.createdAt,
      });
    }
  }

  // Distinct advisor list for the filter dropdown, from the unfiltered window.
  const advisorOptions = [...byAdvisor.values()]
    .map(a => ({ id: a.advisorId, name: a.name || a.username }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    days,
    totals: {
      attempts:  rows.length,
      successes: successes.length,
      failures:  failures.length,
      advisors:  byAdvisor.size,
    },
    advisors: [...byAdvisor.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
    advisorOptions,
    rows,
  });
}
