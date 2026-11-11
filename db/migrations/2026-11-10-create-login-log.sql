-- FA login audit trail — who signed in, when, from where, and what failed.
--
-- Append-only and Supabase-native (no notion_id, no Notion page), the same
-- shape as ai_usage_log. Writes are best-effort at the call site: an audit
-- trail must never be the reason someone cannot log in.
--
-- Failed attempts are recorded too, which is most of the point — a log of
-- successes alone cannot show you someone probing an FA's account. `advisor_id`
-- is null when the attempt never resolved to a real user (unknown username, or
-- blocked by the rate limiter before lookup).

create table if not exists login_log (
  id          bigserial   primary key,
  created_at  timestamptz not null default now(),
  advisor_id  text,                                -- Notion page id, DASHLESS (matches users.notion_id); null if unresolved
  username    text        not null,                -- as submitted, trimmed + lowercased
  name        text,                                -- advisor display name at time of login
  role        text,                                -- 'Admin' | 'Advisor'
  outcome     text        not null,                -- success | bad_password | unknown_user | inactive | rate_limited
  ip          text,
  user_agent  text,
  source      text                                 -- 'supabase' | 'notion' — which auth path served it, for the cutover
);

create index if not exists login_log_created_at_idx on login_log (created_at desc);
create index if not exists login_log_username_idx   on login_log (username);
create index if not exists login_log_advisor_id_idx on login_log (advisor_id);
create index if not exists login_log_outcome_idx    on login_log (outcome);

-- AGENTS.md rule: every raw-SQL-created table MUST enable RLS with NO policies.
-- anon/authenticated get nothing; the app uses the service_role client
-- (lib/supabase.ts), which bypasses RLS entirely.
alter table login_log enable row level security;
