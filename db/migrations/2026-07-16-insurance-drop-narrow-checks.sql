-- Migration: 2026-07-16  insurance_policies — drop over-narrow CHECK constraints
--
-- WHY: Phase 2.11 insurance write path. The insurance_type / status CHECK
-- constraints were derived from the 81 seeded rows, NOT from the app's input
-- set. They are narrower than what InsuranceFormModal actually lets an advisor
-- submit:
--   insurance_type CHECK: ILP,IUL,UL,VUL,Term Life,Endowment
--   form TYPES:           ILP,Term Life,Whole Life,Medical,Critical Illness,
--                         Personal Accident,Annuity,Other,Endowment
--   status CHECK:         Active,Lapsed,Surrendered
--   form STATUSES:        Active,Lapsed,Matured,Surrendered
-- A Supabase-path write with type "Medical" or status "Matured" (both valid in
-- the Notion free-select) would throw a constraint violation — a broken write
-- path. Notion's select is free-form (arbitrary options), so the faithful
-- migration behaviour is NO enum constraint here. User decision (2026-07-16):
-- drop both.
--
-- Rollback: re-add the CHECKs (only safe if all rows still satisfy them):
--   alter table insurance_policies add constraint insurance_policies_insurance_type_check
--     check (insurance_type = any (array['ILP','IUL','UL','VUL','Term Life','Endowment']));
--   alter table insurance_policies add constraint insurance_policies_status_check
--     check (status = any (array['Active','Lapsed','Surrendered']));

alter table insurance_policies drop constraint if exists insurance_policies_insurance_type_check;
alter table insurance_policies drop constraint if exists insurance_policies_status_check;
