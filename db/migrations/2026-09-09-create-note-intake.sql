-- Structured-note intake queue: term sheets found in the folder tree that are
-- not yet in portfolio_holdings, staged for an admin to review before anything
-- is written to the live book.
--
-- Why a staging table rather than inserting straight from the scanner: a term
-- sheet parse can be wrong in a way that looks entirely plausible (the
-- 2026-08-29 audit found 5 real notes storing a Payment Date where an
-- Observation Date belonged, all from one misread column), and a term sheet
-- can NEVER supply the one field that matters most — this client's actual
-- invested amount. So the scanner's job ends at "here's a candidate and my
-- best-effort read of it"; a human supplies the amount and confirms the terms.
--
-- `parsed` and `parse_warnings` are kept after acceptance on purpose: when a
-- stored note later looks wrong, they show what the parser originally read
-- versus what a human confirmed, which is what makes that kind of bug findable.
--
-- Keyed by file CONTENT hash, not path — the same term sheet filed under a
-- second client's folder is a genuinely separate candidate (shared notes are
-- common in this book), but renaming or moving a file must not resurrect a
-- candidate that was already dealt with.

create table if not exists note_intake (
  id                  uuid        primary key default gen_random_uuid(),
  file_hash           text        not null,                    -- sha256 of the PDF bytes
  file_path           text        not null,                    -- where it was found, for the reviewer to open
  file_name           text,
  isin                text        not null,                    -- from the filename; = portfolio_holdings.product_name

  -- Which client this is FOR. EMPTY STRING (not null) means the folder didn't
  -- match any known client name — the reviewer has to pick one, and the card
  -- says so. Not nullable because it is half of the unique key below, and a
  -- null there would make every unmatched candidate distinct from itself,
  -- re-inserting a fresh duplicate on every nightly scan.
  client_notion_id    text        not null default '',
  client_match_source text,                                    -- 'folder' | 'manual' | null
  client_hint         text,                                    -- the folder path the guess came from

  issuer_family       text,                                    -- 'nomura' | 'marex' | 'ubs_vmran' | 'csi' | 'natixis' | null
  parsed              jsonb,                                   -- best-effort terms; never trusted without review
  parse_warnings      text[]      default '{}',                -- fields the parser could not find, surfaced on the card

  status              text        not null default 'pending',  -- 'pending' | 'inserted' | 'ignored'
  holding_ids         text[]      default '{}',                -- what accepting it created (one id per client allocation)
  reviewed_by         text,
  reviewed_at         timestamptz,

  first_seen_at       timestamptz default now(),
  last_seen_at        timestamptz default now()                -- bumped by every re-scan that still sees the file
);

-- One candidate per (document, client) — the same term sheet filed under two
-- clients' folders is two candidates, which is how a shared tranche gets
-- reviewed per client. Plain column pair, not an expression, so the scanner
-- can upsert against it through PostgREST's on_conflict.
create unique index if not exists note_intake_hash_client_idx
  on note_intake (file_hash, client_notion_id);

create index if not exists note_intake_status_idx on note_intake (status);
create index if not exists note_intake_isin_idx   on note_intake (isin);
create index if not exists note_intake_hash_idx   on note_intake (file_hash);

-- AGENTS.md rule: every raw-SQL-created table MUST enable RLS with NO policies.
-- anon/authenticated get nothing; the app uses the service_role client
-- (lib/supabase.ts), which bypasses RLS entirely.
alter table note_intake enable row level security;
