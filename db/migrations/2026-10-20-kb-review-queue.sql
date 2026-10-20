-- FINVA Master Brain, Phase 1 of the self-learning KB: FA suggestions + Admin review.
-- An FA can suggest any Ask FINVA answer for the knowledge base. The suggestion is
-- stored as status 'draft' (never shown to the AI) with source 'fa_suggestion' and
-- waits in Admin > KB Review. Only an Admin publishes it. 'rejected' rows are kept
-- for the audit trail and are never shown to the AI either.
-- knowledge_entries already has RLS enabled with no policies (AGENTS.md rule);
-- this migration only adds columns.
alter table knowledge_entries add column if not exists suggested_by        text;        -- FA who suggested it (internal credit only; never named in answers)
alter table knowledge_entries add column if not exists original_question   text;        -- what the FA asked (de-identified)
alter table knowledge_entries add column if not exists original_answer     text;        -- what FINVA answered (de-identified)
alter table knowledge_entries add column if not exists fa_note             text;        -- the FA's own note or correction
alter table knowledge_entries add column if not exists similar_entry_id    uuid;        -- closest existing entry, for duplicate review
alter table knowledge_entries add column if not exists similar_entry_title text;
alter table knowledge_entries add column if not exists reviewed_by         text;
alter table knowledge_entries add column if not exists reviewed_at         timestamptz;
alter table knowledge_entries add column if not exists review_note         text;

create index if not exists knowledge_entries_source_idx on knowledge_entries (source);
