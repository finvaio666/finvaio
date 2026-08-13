-- Fix Supabase Security Advisor "rls_disabled_in_public" errors (2026-07-20 email).
--
-- insurance_plans + funds were created by raw SQL (2026-07-14-create-products-tables.sql),
-- which — unlike dashboard-created tables — does NOT enable row-level security by
-- default. That left both tables readable/writable via PostgREST with the anon key.
--
-- All other public tables follow the "RLS enabled, zero policies" pattern: anon and
-- authenticated roles get nothing; the app's server-side service_role client
-- (lib/supabase.ts) bypasses RLS entirely, so this change is invisible to the app.

alter table insurance_plans enable row level security;
alter table funds           enable row level security;
