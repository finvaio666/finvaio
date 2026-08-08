-- Migration: 2026-08-07  meeting_notes — add transcript
--
-- WHY: The post-meeting capture flow (components/MeetingCapture.tsx) sent the
-- AI's 2-6 sentence summary as `notes` and threw the underlying capture away —
-- the voice-memo transcription or the advisor's raw typed notes were never
-- persisted. Months later, preparing a client review, the advisor had only the
-- summary; everything the client actually said was gone.
--
-- `notes` stays the summary (what you want at a glance); `transcript` is the
-- verbatim record (what you want when preparing the review). Additive +
-- nullable — meetings logged before this read back with '' and the UI simply
-- omits the transcript section.
--
-- No new table → no RLS clause needed (see AGENTS.md; RLS is already enabled
-- on `meeting_notes`).
--
-- Rollback: alter table meeting_notes drop column if exists transcript;

alter table meeting_notes add column if not exists transcript text;
