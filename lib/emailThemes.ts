/**
 * lib/emailThemes.ts
 * Shared email-theme taxonomy used to auto-triage institution emails into
 * groups the advisor can filter by. Pure data (no server deps) so it can be
 * imported by both the client UI and server routes.
 */

export type ThemeId = 'product' | 'claims' | 'transaction' | 'statement' | 'notice' | 'other';

export interface Theme {
  id:    ThemeId;
  label: string;
  emoji: string;
  color: string;
}

export const THEMES: Theme[] = [
  { id: 'product',     label: 'Product Update', emoji: '📢', color: '#60A5FA' },
  { id: 'claims',      label: 'Claims',         emoji: '🏥', color: '#F87171' },
  { id: 'transaction', label: 'Transactions',   emoji: '🔄', color: '#34D399' },
  { id: 'statement',   label: 'Statements',     emoji: '📄', color: '#A78BFA' },
  { id: 'notice',      label: 'Notices',        emoji: '🔔', color: '#F59E0B' },
  { id: 'other',       label: 'Other',          emoji: '🗂️', color: '#9CA3AF' },
];

export const THEME_MAP: Record<string, Theme> =
  Object.fromEntries(THEMES.map(t => [t.id, t]));

export function themeOf(id: string | undefined): Theme {
  return (id && THEME_MAP[id]) || THEME_MAP['other'];
}
