/**
 * lib/repos/loginLog.ts
 * Supabase layer for the FA login audit trail (table: login_log).
 * Append-only, Supabase-native (no notion_id — there is no Notion page),
 * the same shape as lib/repos/aiUsage.ts.
 *
 * `recordLogin` never throws: an audit trail must not be able to stop someone
 * signing in. It logs to the server console on failure and returns.
 */
import { getSupabase } from '../supabase';

export type LoginOutcome =
  | 'success'
  | 'bad_password'
  | 'unknown_user'
  | 'inactive'
  | 'rate_limited';

export interface LoginAttempt {
  username:   string;
  outcome:    LoginOutcome;
  advisorId?: string;   // Notion page id, dashed or dashless — normalized on write
  name?:      string;
  role?:      string;
  ip?:        string;
  userAgent?: string;
  source?:    'supabase' | 'notion';
}

/**
 * The two auth paths hand us the id in different shapes: Supabase's
 * users.notion_id is dashless, while the Notion path uses the dashed page id
 * from the JWT. Stored dashless, matching lib/repos/users.ts, so one advisor
 * can't show up as two people in the admin view after a DATA_SOURCE_USERS flip.
 */
const dashless = (id: string) => id.replace(/-/g, '');

/** Best-effort append. Swallows every error by design — see file header. */
export async function recordLogin(a: LoginAttempt): Promise<void> {
  try {
    const sb = getSupabase();
    const { error } = await sb.from('login_log').insert({
      username:   a.username,
      outcome:    a.outcome,
      advisor_id: a.advisorId ? dashless(a.advisorId) : null,
      name:       a.name      ?? null,
      role:       a.role      ?? null,
      ip:         a.ip        ?? null,
      user_agent: a.userAgent ? a.userAgent.slice(0, 500) : null,
      source:     a.source    ?? null,
    });
    if (error) console.error('login_log insert failed:', error.message);
  } catch (e) {
    console.error('login_log insert failed:', e instanceof Error ? e.message : String(e));
  }
}

export interface LoginRecord {
  id: string; createdAt: string; advisorId: string; username: string;
  name: string; role: string; outcome: string; ip: string;
  userAgent: string; source: string;
}

/**
 * Attempts at or after `sinceIso`, newest first.
 * Paginated past PostgREST's 1000-row cap, like listUsageSince.
 */
export async function listLoginsSince(sinceIso: string): Promise<LoginRecord[]> {
  const sb = getSupabase();
  const out: LoginRecord[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('login_log')
      .select('id, created_at, advisor_id, username, name, role, outcome, ip, user_agent, source')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(`login_log list failed: ${error.message}`);
    for (const r of data as Record<string, unknown>[]) {
      out.push({
        id:        String(r.id),
        createdAt: String(r.created_at ?? ''),
        advisorId: String(r.advisor_id ?? ''),
        username:  String(r.username   ?? ''),
        name:      String(r.name       ?? ''),
        role:      String(r.role       ?? ''),
        outcome:   String(r.outcome    ?? ''),
        ip:        String(r.ip         ?? ''),
        userAgent: String(r.user_agent ?? ''),
        source:    String(r.source     ?? ''),
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}
