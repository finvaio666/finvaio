/**
 * lib/noteIntakeAccess.ts
 * Who besides an Admin may use the note-intake queue (upload, review, accept).
 *
 * A name allowlist, not a role, because this is scoped to two specific people
 * asked for by name rather than a tier everyone in a role gets — Tracy Chia
 * and Sky Siew wanted to see how the flow works without being made full
 * Admins (which would also open client management, settings, and every other
 * admin-only route). If this list grows past a handful of people it should
 * become a real role/feature flag instead of more names here.
 */

const ALLOWED_NAMES = ['Tracy Chia', 'Sky Siew'];

// A type predicate, not just boolean, so callers narrow `config` to non-null
// past the check — matches how `config?.role !== 'Admin'` used to let TS
// narrow the old Admin-only checks in these same routes.
export function canUseNoteIntake<T extends { role?: string; name?: string }>(
  config: T | null,
): config is T {
  if (!config) return false;
  return config.role === 'Admin' || ALLOWED_NAMES.includes(config.name ?? '');
}
