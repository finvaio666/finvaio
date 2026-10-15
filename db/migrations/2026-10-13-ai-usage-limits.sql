-- Per-advisor daily AI token limit overrides. An advisor with no row uses the
-- default (AI_DAILY_TOKEN_LIMIT env, 200,000 tokens per day, reset at midnight
-- Malaysia time). Read and written only by the server (service_role).
create table if not exists ai_usage_limits (
  advisor           text        primary key,          -- matches ai_usage_log.advisor (the advisor's name)
  daily_token_limit integer     not null check (daily_token_limit >= 0),
  updated_by        text,
  updated_at        timestamptz default now()
);
-- AGENTS.md rule: raw-SQL tables MUST enable RLS with NO policies.
alter table ai_usage_limits enable row level security;

create index if not exists ai_usage_log_advisor_created_idx on ai_usage_log (advisor, created_at);
