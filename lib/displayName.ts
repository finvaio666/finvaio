/**
 * lib/displayName.ts
 * Display-only name formatting. Uppercases a client's name for on-screen /
 * PDF rendering ONLY — never use this on a value before it is sent to an API,
 * saved, or used as a matching/lookup key. The underlying stored data (Notion,
 * Supabase) and all name-based matching logic must keep the original casing.
 */
export const upperName = (s?: string | null): string => (s ?? '').toUpperCase();
