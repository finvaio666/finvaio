-- Let term sheets reach the intake queue by upload, not only by a folder scan
-- on one particular PC (see app/api/note-intake/upload).
--
-- The PDF itself now has somewhere to live: Supabase Storage, the same place
-- the Forms Library keeps its 211 Allianz PDFs. That matters because FINVA can
-- only read files it put there itself — the reason a hand-populated Google
-- Drive folder is invisible to it, and why uploading through the app sidesteps
-- the whole Google permissions problem.
--
-- Parsing stays on a machine with Python/pypdf: Vercel has neither, and
-- reconstructing a term sheet's table layout from a JS PDF reader is exactly
-- what silently misreads a column (it already put wrong observation dates on 5
-- live notes — see the 2026-08-29 audit). So an upload lands as
-- 'awaiting_parse' and `scan-term-sheets.mjs --parse-queue` fills in the terms
-- and moves it to 'pending'. status is deliberately un-constrained text, so
-- this adds no check to relax.

alter table note_intake add column if not exists storage_key text;   -- object key in the term-sheets bucket; null for folder scans
alter table note_intake add column if not exists uploaded_by text;   -- who uploaded it; null when a folder scan found it

create index if not exists note_intake_storage_key_idx on note_intake (storage_key);

-- A folder scan keys a candidate by (file_hash, client_notion_id) and re-runs
-- upsert against it. An upload has no folder to infer a client from — the
-- uploader picks one — so it reuses the same key and the same permanent
-- per-hash ignore. No index change needed; noted here because the two intake
-- paths deliberately share one identity.
