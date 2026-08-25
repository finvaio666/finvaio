-- FINVA Master Brain — internal knowledge base (FAQ + FA case studies).
-- Plan: 100_Todo/plans/2026-08-22-finva-master-brain-kb.md
--
-- This is the firm's shared institutional memory: hard-won lessons (e.g. the
-- Serba Dinamik bond default),客戶異議應對, and internal SOPs. Unlike every
-- other table, reads are deliberately COMPANY-WIDE rather than advisor-scoped —
-- the entire point is that one FA's experience becomes every FA's knowledge.
--
-- Only `published` rows are ever fed to the AI assistant. `draft` acts as both a
-- quality gate and a privacy gate (de-identification review before it goes live).

create table if not exists knowledge_entries (
  id                uuid        primary key default gen_random_uuid(),
  entry_type        text        not null default 'case_study',  -- 'faq' | 'case_study'
  category          text,                                       -- 'client_objection' | 'operations' | 'product_regulatory'
  title             text        not null,                       -- the question an FA would actually ask
  situation         text,                                       -- FAQ: background · case: what happened (DE-IDENTIFIED)
  resolution        text,                                       -- the answer / how it was handled
  key_takeaway      text,                                       -- one-line lesson; AI quotes this first
  tags              text[]      default '{}',                   -- keyword matching for the AI lookup
  status            text        not null default 'draft',       -- 'draft' | 'published' — ONLY published reaches the AI
  is_big_lesson     boolean     default false,                  -- firm-level lesson; AI should surface prominently
  source            text        default 'manual',               -- 'manual' | 'meeting_capture'
  source_meeting_id text,                                       -- provenance when auto-drafted from a meeting note
  author_advisor    text,                                       -- contributor (credit + someone to ask follow-ups)
  helpful_count     integer     default 0,                      -- FA "this helped me" tally (future ranking signal)
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists knowledge_entries_status_idx     on knowledge_entries (status);
create index if not exists knowledge_entries_type_idx       on knowledge_entries (entry_type);
create index if not exists knowledge_entries_category_idx   on knowledge_entries (category);
create index if not exists knowledge_entries_big_lesson_idx on knowledge_entries (is_big_lesson);
create index if not exists knowledge_entries_tags_idx       on knowledge_entries using gin (tags);

-- AGENTS.md rule: every raw-SQL-created table MUST enable RLS with NO policies.
-- anon/authenticated get nothing; the app uses the service_role client
-- (lib/supabase.ts), which bypasses RLS entirely.
alter table knowledge_entries enable row level security;
