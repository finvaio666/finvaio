/**
 * lib/emailThemes.ts
 * Email-theme taxonomy used to auto-triage institution emails into groups the
 * advisor can filter by. Themes are customizable (stored company-wide); this
 * module holds the shape, the built-in defaults, and pure helpers. No server
 * deps, so it is safe to import from both client UI and server routes.
 */

export type ThemeId = string;

export interface Theme {
  id:       ThemeId;
  label:    string;
  emoji:    string;
  color:    string;
  keywords: string[];   // matched (whole-word, case-insensitive) against subject+body
  locked?:  boolean;    // built-in catch-all that can't be deleted (the "other" bucket)
}

/** Built-in defaults — used when no custom configuration is saved. */
export const DEFAULT_THEMES: Theme[] = [
  { id: 'product',     label: 'Product Update', emoji: '📢', color: '#60A5FA',
    keywords: ['new product', 'new plan', 'new fund', 'product update', 'launch', 'promotion', 'promo', 'campaign', 'webinar', 'roadshow', 'rate change', 'fund house update', 'bonus declaration', 'now available', 'introducing'] },
  { id: 'claims',      label: 'Claims', emoji: '🏥', color: '#F87171',
    keywords: ['claim', 'claims', 'hospitalisation', 'hospitalization', 'medical card', 'guarantee letter', 'admission', 'discharge', 'reimburse', 'panel hospital', 'pre-auth', 'preauth', 'surgical', 'inpatient', 'outpatient'] },
  { id: 'transaction', label: 'Transactions', emoji: '🔄', color: '#34D399',
    keywords: ['switch', 'switching', 'redemption', 'redeem', 'subscribe', 'subscription', 'top up', 'top-up', 'premium payment', 'premium due', 'premium paid', 'payment received', 'payment due', 'contribution', 'withdrawal', 'transfer', 'deduction', 'debit', 'transaction', 'surrender', 'disbursement', 'settlement'] },
  { id: 'statement',   label: 'Statements', emoji: '📄', color: '#A78BFA',
    keywords: ['e-statement', 'estatement', 'statement', 'account summary', 'valuation', 'portfolio statement', 'annual statement', 'consolidated statement', 'holdings report', 'nav report'] },
  { id: 'notice',      label: 'Notices', emoji: '🔔', color: '#F59E0B',
    keywords: ['notice', 'notification', 'reminder', 'maintenance', 'scheduled downtime', 'kindly note', 'important information', 'circular', 'advisory', 'expiry', 'expire', 'renewal notice', 'update your', 'system upgrade'] },
  { id: 'other',       label: 'Other', emoji: '🗂️', color: '#9CA3AF', keywords: [], locked: true },
];

/** The always-present catch-all. */
export const OTHER_THEME: Theme = DEFAULT_THEMES[DEFAULT_THEMES.length - 1];

/** Look up a theme by id within a list, falling back to the catch-all. */
export function themeFromList(list: Theme[], id: string | undefined): Theme {
  return list.find(t => t.id === id) || list.find(t => t.id === 'other') || OTHER_THEME;
}

/**
 * Keyword categoriser. Returns the first theme whose keyword matches (whole word,
 * case-insensitive), or null if none. Order in the list defines priority.
 */
export function categorizeByThemes(themes: Theme[], subject: string, snippet: string, body = ''): ThemeId | null {
  const hay = `${subject}\n${snippet}\n${body}`.toLowerCase();
  for (const t of themes) {
    if (t.id === 'other' || !t.keywords?.length) continue;
    for (const kwRaw of t.keywords) {
      const kw = kwRaw.trim().toLowerCase();
      if (!kw) continue;
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(hay)) return t.id;
    }
  }
  return null;
}
