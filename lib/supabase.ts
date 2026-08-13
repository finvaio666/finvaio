/**
 * lib/supabase.ts
 * Server-side Supabase client for the Notion→Postgres migration.
 *
 * ⚠️ SERVER ONLY. Uses the service_role key, which bypasses all row-level
 * security. Never import this from client components or expose the key to the
 * browser. Multi-advisor isolation is enforced manually in each repo via
 * advisor_id filters (same idea as the old Notion advisorFilter()).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
