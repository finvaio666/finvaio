<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deployment rule — no automatic pushes

`git push` to this repo triggers Vercel auto-deploy. NEVER run `git push` (or any
`vercel` deploy/redeploy/promote/alias command) on your own — only when the user
explicitly asks in that conversation. Committing locally is fine and encouraged
(commit after each tested change); pushing is a deploy decision that belongs to
the user.

# Database migration rule — new tables MUST enable RLS

Every `create table` in a SQL migration (`db/migrations/`) MUST be followed by
`alter table <name> enable row level security;` with NO policies. Raw SQL does
not enable RLS by default (only dashboard-created tables do) — this already
caused a Supabase Security Advisor ERROR on `insurance_plans` + `funds`
(fixed in `2026-07-22-products-enable-rls.sql`; see MIGRATION.md §5.3).
The project pattern is "RLS enabled, zero policies": anon/authenticated get
nothing; the app only uses the server-side service_role client
(`lib/supabase.ts`), which bypasses RLS. Do NOT add policies to silence the
advisor's `rls_enabled_no_policy` INFO items — any policy would grant client
roles access.
