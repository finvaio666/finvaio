-- AI usage log: separate test runs from real use, and record what each call cost.
-- ai_usage_log already exists (RLS enabled, no policies) - this only adds columns.
--   is_test          true for eval-harness / dev test runs (tagged by a signed header)
--   model            the Gemini model that actually answered (fallbacks differ in price)
--   thinking_tokens  total - input - output; billed as output
--   est_cost_usd     list-price estimate at the time of the call (see lib/aiPricing.ts)
alter table ai_usage_log add column if not exists is_test         boolean not null default false;
alter table ai_usage_log add column if not exists model           text;
alter table ai_usage_log add column if not exists thinking_tokens integer not null default 0;
alter table ai_usage_log add column if not exists est_cost_usd    numeric(12,6);

create index if not exists ai_usage_log_date_idx on ai_usage_log (date);

-- Backfill: every row since the Master Brain work began (2026-10-10) was a test run.
update ai_usage_log set is_test = true where date >= '2026-10-10';
-- Backfill cost at gemini-2.5-flash list price (USD 0.30 / 2.50 per 1M tokens).
update ai_usage_log
   set thinking_tokens = greatest(coalesce(total_tokens,0) - coalesce(input_tokens,0) - coalesce(output_tokens,0), 0),
       est_cost_usd = round(((coalesce(input_tokens,0) * 0.30
                              + greatest(coalesce(total_tokens,0) - coalesce(input_tokens,0), coalesce(output_tokens,0)) * 2.50) / 1000000.0)::numeric, 6)
 where est_cost_usd is null;
