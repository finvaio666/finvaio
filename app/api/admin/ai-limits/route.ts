import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listUsers } from '@/lib/repos/users';
import { getSupabase } from '@/lib/supabase';
import { DEFAULT_DAILY_TOKEN_LIMIT, getLimitOverrides, clearLimitCache, tokensUsedToday } from '@/lib/aiGuard';

export const dynamic = 'force-dynamic';

export interface AdvisorLimit { advisor: string; usedToday: number; limit: number; isOverride: boolean }

async function requireAdmin(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return { error: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  return { config };
}

/** Every active advisor with today's usage and their daily limit. */
export async function GET(req: NextRequest) {
  const a = await requireAdmin(req); if ('error' in a) return a.error;
  const [users, overrides] = await Promise.all([listUsers(), getLimitOverrides(true)]);
  const names = [...new Set(users.filter(u => u.active).map(u => u.name))].sort();
  const rows: AdvisorLimit[] = await Promise.all(names.map(async name => ({
    advisor: name,
    usedToday: await tokensUsedToday(name),
    limit: overrides[name] ?? DEFAULT_DAILY_TOKEN_LIMIT,
    isOverride: name in overrides,
  })));
  return NextResponse.json({ defaultLimit: DEFAULT_DAILY_TOKEN_LIMIT, advisors: rows });
}

/** Set an advisor's daily limit, or send limit:null to go back to the default. */
export async function PUT(req: NextRequest) {
  const a = await requireAdmin(req); if ('error' in a) return a.error;
  let body: { advisor?: string; limit?: number | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const advisor = body.advisor?.trim();
  if (!advisor) return NextResponse.json({ error: 'advisor required' }, { status: 400 });

  const sb = getSupabase();
  if (body.limit === null) {
    const { error } = await sb.from('ai_usage_limits').delete().eq('advisor', advisor);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const limit = Math.round(Number(body.limit));
    if (!Number.isFinite(limit) || limit < 0 || limit > 5_000_000) {
      return NextResponse.json({ error: 'limit must be between 0 and 5,000,000 tokens' }, { status: 400 });
    }
    const { error } = await sb.from('ai_usage_limits').upsert(
      { advisor, daily_token_limit: limit, updated_by: a.config!.name, updated_at: new Date().toISOString() },
      { onConflict: 'advisor' },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  clearLimitCache();
  return NextResponse.json({ ok: true });
}
