-- Migration: 2026-08-08  public.portfolio_holdings — add platform column + backfill
--
-- WHY: the Investment page breaks AUM down by platform group (Local UT /
-- Local EAM / Offshore EAM, see lib/platformGroups.ts), but no platform was
-- ever stored here — so every holding fell into "Ungrouped" (100% of AUM) and
-- the per-group pages (/portfolio/local-ut) came up empty.
--
-- Platform is the custodian a holding sits on (Phillip, iFAST, SwissQuote…).
-- It is NOT `institution`: on FAME-synced rows institution is the *fund house*
-- (AHAM, Principal, United…). Same distinction as scripts/backfill-platform.mjs,
-- which populates the equivalent Notion "Platform" select.
--
-- Backfill resolution order (matches derivePlatform() in lib/platformGroups.ts):
--   1. FAME Account No present            → Phillip  (FAME is the Phillip feed)
--   2. Institution matches a known alias  → that platform
--   3. otherwise                          → left null, shows as "Ungrouped"
--
-- Expected on the current book (1232 live rows): 969 Phillip + 263 iFAST,
-- 0 left null. Re-runnable: only touches rows where platform is still null.
--
-- Additive, nullable. portfolio_holdings already has RLS enabled — this is an
-- `alter table`, NOT a `create table`, so per AGENTS.md do NOT add an
-- `enable row level security` line.
--
-- Rollback: alter table public.portfolio_holdings drop column if exists platform;

alter table public.portfolio_holdings add column if not exists platform text;

update public.portfolio_holdings
set platform = case
  when nullif(trim(coalesce(fame_account_no, '')), '') is not null then 'Phillip'
  when institution ~* '^i\s*-?\s*fast'                             then 'iFAST'
  when institution ~* 'phillip|poems|pmart|pgwa'                   then 'Phillip'
  when institution ~* 'maybank|\ymbb\y'                            then 'Maybank'
  when institution ~* '\ycgs\y|cimb.?securities'                   then 'CGS'
  when institution ~* 'swiss\s*-?\s*quote'                         then 'SwissQuote'
  when institution ~* '\ymssg\y|morgan\s*stanley'                  then 'MSSG'
end
where platform is null
  and deleted_at is null;
