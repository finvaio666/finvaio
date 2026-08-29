'use client';

import { useState, useEffect } from 'react';
import PortfolioSwitchPanel from '@/components/PortfolioSwitchPanel';
import NavUpdatePanel from '@/components/NavUpdatePanel';
import ClientSearchCombobox from '@/components/ClientSearchCombobox';
import PortfolioFormModal, { type HoldingDraft } from '@/components/PortfolioFormModal';
import { useClients } from '@/components/useClients';
import { upperName } from '@/lib/displayName';
import DonutBreakdown from '@/components/DonutBreakdown';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { PlatformGroup } from '@/lib/platformGroups';

interface Holding {
  id: string;
  clientId: string;
  name: string;
  clientName: string;
  advisorName: string;
  assetClass: string;
  institution: string;
  status: string;
  maturity: string;
  currency: string;
  valueOrig: number;
  purchaseOrig: number;
  fxRate: number;
  value: number;
  purchase: number;
  gain: number;
  returnPct: number;
  fameAccountNo?: string;
  fundSource?: string;
  platform?: string;
  underlyingDetails?: {
    couponRatePa?: number;
    priceAsOf?: string;
    underlyings: { name: string; entry: number; strike: number; ki: number; ko: number; today?: number }[];
    schedule: { date: string; label: string; triggerPct?: number; resolved?: boolean; cleared?: boolean }[];
  } | null;
}

const CCY_COLORS: Record<string, string> = {
  MYR: '#4ADE80', USD: '#60A5FA', SGD: '#F59E0B',
  GBP: '#A78BFA', EUR: '#F87171', AUD: '#34D399', HKD: '#FB923C',
};
const ASSET_COLORS: Record<string, string> = {
  'EPF': '#4ADE80', 'Unit Trust': '#60A5FA', 'PRS': '#818CF8',
  'Fixed Deposit': '#F59E0B', 'Stocks': '#A78BFA', 'Bonds': '#F87171',
  'Money Market': '#34D399', 'Structured Product': '#F472B6', 'ETF': '#2DD4BF',
  'Cash': '#FDE047',
};
const ccyColor   = (c: string) => CCY_COLORS[c]  ?? '#9CB8A0';
const assetColor = (a: string) => ASSET_COLORS[a] ?? '#9CB8A0';
// "Structured Product" as a sub-label under every note's name is a given
// (the category header above already says it) — the note TYPE is the more
// useful thing to show there instead, read off the issuer's own naming in
// the holding name (e.g. "Barclays Bank PLC FCN — …").
// A few notes' holding names don't carry the type token (unlike every other
// note in the book), so the regex alone can't tell — confirmed by reading
// their actual term sheets 2026-08-23: CSI's single-share barrier note is a
// DCN (digital coupon, single observation at maturity — no autocall
// schedule); both UBS notes are literally self-titled "ELNs" in the term
// sheet header. Keyed on ISIN (the "(XS...)" in the holding name) so this
// still works if either note gets renamed later.
const NOTE_TYPE_OVERRIDE: Record<string, string> = {
  XS3308648263: 'DCN', // CSI Financial Products — NVO
  XS3432570078: 'ELN', // UBS — ARM/NBIS
  XS3432735762: 'ELN', // UBS — ORCL/ARM/NBIS
};
const noteType = (name: string) => {
  const isin = name.match(/\(([A-Z0-9]{12})\)/)?.[1];
  if (isin && NOTE_TYPE_OVERRIDE[isin]) return NOTE_TYPE_OVERRIDE[isin];
  return name.match(/\b(FCN|ELN|DCN|BEN|CRAN)\b/)?.[1] ?? 'Other';
};
const fmtK = (n: number) => n >= 1_000_000 ? `RM ${(n/1_000_000).toFixed(2)}M` : n >= 1000 ? `RM ${(n/1000).toFixed(1)}K` : `RM ${Math.round(n)}`;
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// "PRS Acc A" / "PRS Acc B" etc. are just different PRS sub-accounts — showing
// the letter suffix in the group label reads as separate categories when
// they're not. Collapse to a single "PRS Acc" label; the account number
// already distinguishes the group.
const normalizeFundSource = (fs: string) => /^PRS\s*Acc/i.test(fs) ? 'PRS Acc' : fs;

// Fixed reading order (matches the Add Holding asset-class list) so a client's
// funds cluster by what they are, not by insertion/creation order — an EPF
// balance, three unit trusts, and two FCNs each read as one visual block
// instead of interleaving. Unknown classes sort after all named ones.
const ASSET_CLASS_ORDER = ['EPF', 'Unit Trust', 'PRS', 'Stocks', 'Bonds', 'Structured Product', 'Fixed Deposit', 'ETF', 'Cash', 'Other'];
function sortByAssetClass(rows: Holding[]): Holding[] {
  const rank = (cls: string) => {
    const i = ASSET_CLASS_ORDER.indexOf(cls || 'Other');
    return i === -1 ? ASSET_CLASS_ORDER.length : i;
  };
  return [...rows].sort((a, b) => {
    const byClass = rank(a.assetClass) - rank(b.assetClass);
    if (byClass !== 0) return byClass;
    // Within Structured Products, soonest-maturing first — the FA is tracking
    // upcoming autocall/maturity dates, not alphabetical note names. Other
    // categories keep their existing (alphabetical) order.
    if (a.assetClass === 'Structured Product' && b.assetClass === 'Structured Product') {
      if (!a.maturity) return 1;
      if (!b.maturity) return -1;
      return a.maturity.localeCompare(b.maturity);
    }
    return 0;
  });
}

// The worst-performing underlying relative to its Knock-Out level is the one
// that actually determines whether this note is close to autocalling — 0%
// or above means every underlying has cleared its KO and the note redeems at
// the next observation; deeply negative means the worst one still has a long
// way to climb. Requires at least one underlying with a live "today" price;
// returns null otherwise so the caller falls back to ordinary Return %.
// This observation's autocall barrier for one underlying. Step-down notes
// lower it each date (100%, 95%, 90%…), so it's derived from the Initial
// Fixing Level; `ko` is only the fallback for older rows that never recorded
// a triggerPct (it holds a single barrier with no date attached, which for a
// step-down note is right for at most one observation).
function koBarrier(u: { entry: number; ko: number }, triggerPct?: number): number {
  return typeof triggerPct === 'number' ? u.entry * triggerPct / 100 : u.ko;
}

/** The next observation whose barrier the note will actually be tested against. */
function nextKoObs(details: Holding['underlyingDetails']) {
  const today = new Date().toISOString().slice(0, 10);
  return details?.schedule?.find(s => s.label.startsWith('KO obs') && s.date >= today) ?? null;
}

// The worst-performing underlying relative to the barrier of the NEXT
// observation is the one that actually determines whether this note is close
// to autocalling — 0% or above means every underlying has cleared it and the
// note redeems at that observation; deeply negative means the worst one still
// has a long way to climb. Measuring against the initial 100% level instead
// would understate a step-down note as its barrier ratchets down.
// Requires at least one underlying with a live "today" price; returns null
// otherwise so the caller falls back to ordinary Return %.
function worstVsKo(details: Holding['underlyingDetails']): { pct: number; ticker: string } | null {
  const unds = details?.underlyings;
  if (!unds || unds.length === 0) return null;
  const trigger = nextKoObs(details)?.triggerPct;
  let worst: { pct: number; ticker: string } | null = null;
  for (const u of unds) {
    const barrier = koBarrier(u, trigger);
    if (typeof u.today !== 'number' || !barrier) continue;
    const pct = (u.today / barrier - 1) * 100;
    if (worst === null || pct < worst.pct) {
      worst = { pct, ticker: u.name.match(/\(([^)]+)\)/)?.[1] ?? u.name };
    }
  }
  return worst;
}

// A note whose FAME/iFAST sync (or an admin) has confirmed Redeemed is done —
// it no longer belongs in the working AUM view. This is the only source of
// truth for "has it actually exited"; see deriveNoteFlag below for the
// earlier, unconfirmed hint shown while that sync is still catching up.
const isExitedNote = (h: Holding) => h.assetClass === 'Structured Product' && h.status === 'Redeemed';

type NoteFlag = 'ki' | 'likely-ko' | 'likely-matured';

// System-computed hint only — never written back automatically. It exists
// because the FAME/iFAST sync that actually flips `status` to Redeemed can
// lag by a day or more, so a note that's clearly past its KO trigger or
// maturity date would otherwise sit unflagged in the Active list in the
// meantime. KI is a different kind of event (principal-protection risk, not
// an exit) and always reported separately even once the note is otherwise
// past a KO observation.
// One full UTC day after a schedule date, as a "YYYY-MM-DD" string. Used as
// the flag threshold instead of the schedule date itself — whatever
// timezone an underlying's own exchange actually settles in, that event has
// definitely already happened by one full day later everywhere on Earth, so
// this removes the remaining ambiguity that pinning to UTC alone doesn't
// (an underlying trading many hours behind/ahead of UTC could otherwise
// flag a day early from that exchange's point of view).
function daysAfterUTC(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function deriveNoteFlag(h: Holding): NoteFlag | null {
  const details = h.underlyingDetails;
  if (h.assetClass !== 'Structured Product' || !details || !details.schedule?.length) return null;
  // Compared as plain "YYYY-MM-DD" strings (UTC), one day past the schedule
  // date — see daysAfterUTC. This is still an unconfirmed hint an admin has
  // to act on anyway, never written automatically (see isExitedNote/confirmExit).
  const todayUTC = new Date().toISOString().slice(0, 10);
  const finalRow = details.schedule.find(s => s.label.startsWith('Final'));
  if (finalRow && todayUTC >= daysAfterUTC(finalRow.date, 1)) return 'likely-matured';
  // KO obs dates are resolved server-side against their ACTUAL historical
  // closing price (app/api/portfolio/update-underlying-prices), not guessed
  // from today's live price — a note trading above KO today says nothing
  // about whether it cleared KO on a past observation date (found 2026-08-23:
  // a live-price heuristic falsely flagged notes for months after a missed
  // observation, since price naturally drifts back above KO in between
  // dates). `resolved` stays false until that check has actually run once
  // for a given date — "Update underlying prices" triggers it.
  if (details.schedule.some(s => s.label.startsWith('KO obs') && s.resolved && s.cleared)) return 'likely-ko';
  if (details.underlyings.some(u => typeof u.today === 'number' && u.today < u.ki)) return 'ki';
  return null;
}

// Group a client's holdings by FAME account no (e.g. a "PMART" wrapper account holds
// several underlying funds) so the wrapper and its funds read as one account, not
// unrelated duplicated line items. Holdings without an account no fall into one bucket.
function groupByAccount(rows: Holding[]): { key: string; label: string; rows: Holding[] }[] {
  const byAccount = new Map<string, Holding[]>();   // holdings that carry an account no
  const byPlatform = new Map<string, Holding[]>();  // no account no — bucket per platform
  const loose: Holding[] = [];                      // neither — nothing to group on
  for (const h of rows) {
    if (h.fameAccountNo) {
      const arr = byAccount.get(h.fameAccountNo) ?? [];
      arr.push(h);
      byAccount.set(h.fameAccountNo, arr);
    } else if (h.platform) {
      const arr = byPlatform.get(h.platform) ?? [];
      arr.push(h);
      byPlatform.set(h.platform, arr);
    } else {
      loose.push(h);
    }
  }
  const groups = Array.from(byAccount.entries()).map(([acct, acctRows]) => ({
    key: acct,
    label: [
      acctRows[0].platform,
      `Account ${acct}`,
      acctRows[0].fundSource ? normalizeFundSource(acctRows[0].fundSource) : '',
    ].filter(Boolean).join(' · '),
    rows: acctRows,
  }));
  for (const [platform, pRows] of byPlatform) {
    groups.push({ key: `platform:${platform}`, label: platform, rows: pRows });
  }
  if (loose.length) groups.push({ key: '__manual__', label: 'Other Holdings (manual entries)', rows: loose });
  return groups;
}

export default function PortfolioPage({ groupSlug }: { groupSlug?: string } = {}) {
  const [allHoldings,  setHoldings]    = useState<Holding[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [activeTabId,  setTabId]       = useState<string>('');  // '' | 'All' | clientId
  const [showSwitch,   setShowSwitch]  = useState(false);
  const [showNav,      setShowNav]     = useState(false);
  const [formOpen,     setFormOpen]    = useState(false);
  const [editing,      setEditing]     = useState<HoldingDraft | null>(null);
  const [collapsed,    setCollapsed]   = useState<Record<string, boolean>>({});
  const [expandedNote, setExpandedNote] = useState<Record<string, boolean>>({});
  const [exitedCollapsed, setExitedCollapsed] = useState(true);
  const [platformGroups, setPlatformGroups] = useState<PlatformGroup[]>([]);
  const [fxUpdating, setFxUpdating] = useState(false);
  const [fxResult, setFxResult] = useState<string>('');
  const [pricesUpdating, setPricesUpdating] = useState(false);
  const [pricesResult, setPricesResult] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<string>('');   // '' = every platform
  const [advisorFilter, setAdvisorFilter] = useState<string>('');     // '' = every FA — admin-only
  const { clients: allClients }        = useClients();
  // FAs propose changes to their book through the company admin rather than
  // editing/deleting investment records themselves — seed from the cached role
  // (same pattern Sidebar uses) so the buttons don't flash in before resolving.
  const [isAdmin, setIsAdmin] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('aria-role') === 'Admin'
  );
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setIsAdmin(d.role === 'Admin')).catch(() => {});
  }, []);

  const loadHoldings = (fresh = false) => {
    setLoading(true);
    fetch(`/api/notion?type=portfolio${fresh ? '&fresh=1' : ''}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.data) setHoldings(json.data); })
      .finally(() => setLoading(false));
  };

  async function deleteHolding(h: Holding) {
    if (!confirm(`Delete holding "${h.name}"? This cannot be undone.`)) return;
    await fetch(`/api/portfolio?id=${h.id}`, { method: 'DELETE' });
    loadHoldings(true);
  }
  function editHolding(h: Holding) {
    setEditing({ id: h.id, clientId: h.clientId, clientName: h.clientName, holdingName: h.name, assetClass: h.assetClass, institution: h.institution, platform: h.platform, status: h.status, currency: h.currency, valueOrig: h.valueOrig, purchaseOrig: h.purchaseOrig, fxRate: h.fxRate, maturityDate: h.maturity });
    setFormOpen(true);
  }

  // Admin-only confirmation for a system-flagged "likely KO'd/matured" note —
  // the flag itself never writes anything; this is the one place that does,
  // and only when a human clicks it. Same admin-only PATCH route as edit/delete.
  async function confirmExit(h: Holding) {
    if (!confirm(`Confirm "${h.name}" has exited (KO'd or matured)? This marks it Redeemed and removes it from the active AUM view.`)) return;
    await fetch('/api/portfolio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: h.id, status: 'Redeemed' }),
    });
    loadHoldings(true);
  }

  async function updateFxRates() {
    setFxUpdating(true);
    setFxResult('');
    try {
      const res = await fetch('/api/portfolio/update-fx', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { setFxResult(d.error ?? 'FX update failed.'); return; }
      const parts = [`Updated ${d.updated} rate${d.updated === 1 ? '' : 's'} as of ${d.date}`];
      if (d.failed)        parts.push(`${d.failed} failed`);
      if (d.heldBackCount) parts.push(`${d.heldBackCount} held back — no stored value, ask an admin to check`);
      setFxResult(parts.join(' · '));
      if (d.updated > 0) loadHoldings(true);
    } catch {
      setFxResult('FX update failed — network error.');
    } finally {
      setFxUpdating(false);
    }
  }

  async function updateUnderlyingPrices() {
    setPricesUpdating(true);
    setPricesResult('');
    try {
      const res = await fetch('/api/portfolio/update-underlying-prices', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { setPricesResult(d.error ?? 'Price update failed.'); return; }
      const parts = [`Updated ${d.holdingsUpdated} note${d.holdingsUpdated === 1 ? '' : 's'} as of ${d.date}`];
      if (d.holdingsFailed) parts.push(`${d.holdingsFailed} failed`);
      if (d.tickersMissing?.length) parts.push(`no quote for ${d.tickersMissing.join(', ')}`);
      setPricesResult(parts.join(' · '));
      if (d.holdingsUpdated > 0) loadHoldings(true);
    } catch {
      setPricesResult('Price update failed — network error.');
    } finally {
      setPricesUpdating(false);
    }
  }

  useEffect(() => { loadHoldings(); }, []);

  useEffect(() => {
    fetch('/api/admin/platform-groups')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.groups)) setPlatformGroups(d.groups); })
      .catch(() => { /* breakdown just falls back to "Ungrouped" */ });
  }, []);

  // On a sub-menu page (/portfolio/local-ut) everything below is scoped to that
  // group's platforms; on /portfolio it's the whole book.
  const activeGroup = groupSlug ? platformGroups.find(g => g.id === groupSlug) ?? null : null;
  const groupHoldings = activeGroup
    ? allHoldings.filter(h => activeGroup.platforms.some(p => p.toLowerCase() === (h.platform ?? '').toLowerCase()))
    : allHoldings;

  // Admin-only: the whole book naturally pools every FA's clients together
  // (listHoldings has no advisor filter for Admin — see lib/repos/portfolio.ts),
  // so this is what gives Admin an actual "one FA at a time" overview instead
  // of one long undifferentiated client list. A non-admin's own holdings are
  // already server-scoped to themselves, so this is a no-op for them.
  const advisorOptions = isAdmin
    ? [...new Set(groupHoldings.map(h => h.advisorName).filter(Boolean))].sort()
    : [];
  const advisorScoped = (isAdmin && advisorFilter)
    ? groupHoldings.filter(h => h.advisorName === advisorFilter)
    : groupHoldings;

  // Platforms an advisor can narrow to. On a group page that's the group's own
  // list; at the top level it's every platform actually present in the book.
  const platformOptions = (activeGroup
    ? activeGroup.platforms
    : [...new Set(advisorScoped.map(h => h.platform).filter(Boolean) as string[])]
  ).filter(p => advisorScoped.some(h => (h.platform ?? '').toLowerCase() === p.toLowerCase()))
   .sort();

  // Applied before the client list is derived, so picking a platform also
  // narrows who is searchable — an advisor working an iFAST book shouldn't have
  // to wade through Phillip-only clients.
  const holdings = platformFilter
    ? advisorScoped.filter(h => (h.platform ?? '').toLowerCase() === platformFilter.toLowerCase())
    : advisorScoped;

  const clientNames = Array.from(new Set(holdings.map(h => h.clientName || 'Unknown'))).sort();

  // Only clients holding investments belong in the picker, so it stays driven by
  // the holdings. Each one is swapped for its full client record where available —
  // the stub carries no email/phone/segment, which the combobox searches on.
  const clientById = new Map(allClients.map(c => [c.id, c]));
  const uniqueClients = Array.from(new Map(holdings.map(h => [h.clientId, h])).values())
    .map(h => clientById.get(h.clientId) ?? { id: h.clientId, name: h.clientName || 'Unknown' })
    .sort((a, b) => a.name.localeCompare(b.name));

  // The search box shouldn't offer holdings with no linked client record — an
  // "Unknown" stub isn't a real, searchable client. (Still visible as its own
  // group in the "All Holdings" view below, which is a useful data-quality cue.)
  const searchableClients = uniqueClients.filter(c => c.name !== 'Unknown');

  // Derive activeTab (name string) from id — preserves all existing filtering logic
  const activeTab: string | null = activeTabId === ''
    ? null
    : activeTabId === 'All'
    ? 'All'
    : uniqueClients.find(c => c.id === activeTabId)?.name ?? null;

  // Confirmed-exited structured notes are pulled out before anything below
  // (totals, breakdowns, the active list) ever sees them — they get their own
  // collapsed section further down instead.
  const activeHoldings = holdings.filter(h => !isExitedNote(h));
  const exitedHoldingsAll = holdings.filter(isExitedNote);

  const visible = activeTab === null ? [] : activeTab === 'All'
    ? activeHoldings
    : activeHoldings.filter(h => h.clientName === activeTab);
  const exitedVisible = activeTab === null ? [] : activeTab === 'All'
    ? exitedHoldingsAll
    : exitedHoldingsAll.filter(h => h.clientName === activeTab);

  const totalValue    = visible.reduce((s, h) => s + h.value, 0);
  const totalPurchase = visible.reduce((s, h) => s + h.purchase, 0);
  const totalGain     = totalValue - totalPurchase;
  const avgReturn     = totalPurchase > 0 ? ((totalGain / totalPurchase) * 100).toFixed(1) : '0.0';
  const foreignCount  = visible.filter(h => h.currency && h.currency !== 'MYR').length;
  const currencies    = [...new Set(visible.map(h => h.currency || 'MYR'))];

  // Breakdown cards drill down one level: the top-level page splits AUM by
  // group (Local UT / Local EAM / …), a group page splits it by the platforms
  // inside that group (Phillip / iFAST). Anything whose platform isn't in a
  // group shows as "Ungrouped" rather than silently vanishing — fix it in
  // Admin → Platforms.
  const breakdown = (() => {
    if (activeGroup) {
      const totals = activeGroup.platforms.map(p => ({ name: p, value: 0 }));
      for (const h of visible) {
        const idx = activeGroup.platforms.findIndex(p => p.toLowerCase() === (h.platform ?? '').toLowerCase());
        if (idx >= 0) totals[idx].value += h.value;
      }
      return totals.filter(t => t.value > 0);
    }
    const totals = platformGroups.map(g => ({ name: g.name, value: 0 }));
    let ungrouped = 0;
    for (const h of visible) {
      const idx = platformGroups.findIndex(g =>
        g.platforms.some(p => p.toLowerCase() === (h.platform ?? '').toLowerCase()));
      if (idx >= 0) totals[idx].value += h.value;
      else ungrouped += h.value;
    }
    const rows = totals.filter(t => t.value > 0);
    if (ungrouped > 0) rows.push({ name: 'Ungrouped', value: ungrouped });
    return rows;
  })();

  // What the money is actually invested in, independent of who custodies it.
  const assetBreakdown = Object.entries(
    visible.reduce<Record<string, number>>((acc, h) => {
      const cls = h.assetClass || 'Unclassified';
      acc[cls] = (acc[cls] ?? 0) + h.value;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  // Admin's overview of AUM by FA — only meaningful when Admin hasn't already
  // narrowed to one FA via advisorFilter (at that point every row shares the
  // same advisor, so the ring would just be one full slice).
  const advisorBreakdown = isAdmin && !advisorFilter
    ? Object.entries(
        visible.reduce<Record<string, number>>((acc, h) => {
          const name = h.advisorName || 'Unassigned';
          acc[name] = (acc[name] ?? 0) + h.value;
          return acc;
        }, {}),
      ).map(([name, value]) => ({ name, value }))
    : [];

  // Structured-note underlying exposure — each note's value is split evenly
  // across its basket (a 3-stock note contributes 1/3 of its value to each),
  // then aggregated across every structured product in view. Only appears
  // where such holdings exist, so it's silent everywhere else in the app.
  const underlyingBreakdown = Object.entries(
    visible.reduce<Record<string, number>>((acc, h) => {
      const unds = h.underlyingDetails?.underlyings;
      if (!unds || unds.length === 0) return acc;
      const share = h.value / unds.length;
      for (const u of unds) {
        const ticker = u.name.match(/\(([^)]+)\)/)?.[1] ?? u.name;
        acc[ticker] = (acc[ticker] ?? 0) + share;
      }
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  // Group rows by client for visual separation
  const grouped: { client: string; rows: Holding[] }[] = activeTab === 'All'
    ? clientNames.map(c => ({ client: c, rows: activeHoldings.filter(h => h.clientName === c) }))
    : activeTab ? [{ client: activeTab, rows: visible }] : [];

  return (
    <>
      {/* ── FA filter — admin-only overview of every advisor's book, one at a time ── */}
      {isAdmin && advisorOptions.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', marginRight: 2 }}>
            FA
          </span>
          {['', ...advisorOptions].map(a => {
            const on = advisorFilter === a;
            const count = a
              ? new Set(groupHoldings.filter(h => h.advisorName === a).map(h => h.clientId)).size
              : new Set(groupHoldings.map(h => h.clientId)).size;
            return (
              <button
                key={a || 'all'}
                onClick={() => setAdvisorFilter(a)}
                style={{
                  padding: '7px 14px', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                  border: `1.5px solid ${on ? 'var(--accent2)' : 'var(--border)'}`,
                  background: on ? 'var(--accent2)' : 'var(--surface)',
                  color: on ? '#fff' : 'var(--text3)',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {a || 'All FAs'}
                <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Platform filter — narrows holdings AND who's searchable below ── */}
      {platformOptions.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', marginRight: 2 }}>
            Platform
          </span>
          {['', ...platformOptions].map(p => {
            const on = platformFilter === p;
            const count = p
              ? new Set(groupHoldings.filter(h => (h.platform ?? '').toLowerCase() === p.toLowerCase()).map(h => h.clientId)).size
              : new Set(groupHoldings.map(h => h.clientId)).size;
            return (
              <button
                key={p || 'all'}
                onClick={() => setPlatformFilter(p)}
                style={{
                  padding: '7px 14px', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                  border: `1.5px solid ${on ? 'var(--accent2)' : 'var(--border)'}`,
                  background: on ? 'var(--accent2)' : 'var(--surface)',
                  color: on ? '#fff' : 'var(--text3)',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {p || 'All platforms'}
                <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Client selector ── always visible at top ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 300 }}>
          <ClientSearchCombobox
            clients={searchableClients}
            value={activeTabId === 'All' ? '' : activeTabId}
            onChange={c => setTabId(c?.id ?? '')}
            placeholder="Search client…"
          />
        </div>

        {/* All Clients toggle */}
        <button
          onClick={() => setTabId(activeTabId === 'All' ? '' : 'All')}
          style={{
            padding: '9px 16px', borderRadius: 'var(--r-pill)', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
            border: `1.5px solid ${activeTabId === 'All' ? 'var(--accent2)' : 'var(--border)'}`,
            background: activeTabId === 'All' ? 'var(--accent2)' : 'var(--surface)',
            color: activeTabId === 'All' ? '#fff' : 'var(--text3)',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
        >
          👥 All Clients
        </button>

        {activeTabId && activeTabId !== 'All' && (
          <button onClick={() => setTabId('')} style={{
            padding: '8px 14px', borderRadius: 'var(--r-pill)',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>✕ Clear</button>
        )}

        <button onClick={() => { setEditing(null); setFormOpen(true); }} style={{
          padding: '9px 16px', borderRadius: 'var(--r-pill)', border: 'none',
          background: '#F37338', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>＋ Add Holding</button>

        {/* Action buttons — right-aligned, shown only when client selected */}
        {activeTab && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button disabled title="Disabled — NAV values now come from the FAME/iFAST sync instead of manual updates." style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 'var(--r-pill)',
              background: 'var(--surface)', border: '1.5px solid var(--border)',
              color: 'var(--text3)', fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
              opacity: 0.55,
            }}
            >
              📊 Update NAV
            </button>
            <button disabled title="Disabled — fund switches/redemptions are now picked up via the FAME/iFAST sync instead of manual entry." style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 'var(--r-pill)',
              background: 'var(--surface2)', border: '1.5px solid var(--border)',
              color: 'var(--text3)', fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
              opacity: 0.55,
            }}
            >
              🔄 Switch / Redeem
            </button>
          </div>
        )}
      </div>

      {/* ── Empty state — no client selected ── */}
      {!activeTab && (
        <div className="section" style={{ padding: '64px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📈</div>
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>
            {activeGroup ? `Select a client to view their ${activeGroup.name} holdings` : 'Select a client to view their portfolio'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            {activeGroup
              ? `Showing ${activeGroup.platforms.join(' and ')} only. Choose a client above, or use “All Clients”.`
              : 'Choose a client from the dropdown above to see their holdings, gains, and asset allocation.'}
          </div>
        </div>
      )}

      {/* ── Breakdowns — where the money sits, and what it's invested in.
             The ring centre carries total AUM, so a separate Total AUM stat
             card would just repeat it; client and holding counts ride along
             in the header meta instead. ── */}
      {activeTab && !loading && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
          <DonutBreakdown
            title={activeGroup ? `${activeGroup.name} — by platform` : 'AUM by platform group'}
            items={breakdown}
            meta={`${clientNames.length} client${clientNames.length === 1 ? '' : 's'} · ${visible.length} holding${visible.length === 1 ? '' : 's'}`}
            emptyHint={activeGroup
              ? `No ${activeGroup.platforms.join(' or ')} holdings for this selection.`
              : 'No holdings to break down yet.'}
          />
          <DonutBreakdown title="AUM by asset class" items={assetBreakdown} />
          {advisorBreakdown.length > 0 && (
            <DonutBreakdown title="AUM by FA" items={advisorBreakdown} />
          )}
          {underlyingBreakdown.length > 0 && (
            <DonutBreakdown title="Structured note underlying exposure" items={underlyingBreakdown} />
          )}
        </div>
      )}

      {/* ── FX bar — shown whenever there's foreign currency anywhere in this
             view, and the button is always live so a stale rate can be
             refreshed before it's the only currency left on screen. ── */}
      {activeTab && !loading && foreignCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {holdings.filter(h => h.currency && h.currency !== 'MYR' && h.fxRate > 0)
            .filter((h, i, arr) => arr.findIndex(x => x.currency === h.currency) === i)
            .map(h => (
              <div key={h.currency} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 'var(--r-pill)', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: ccyColor(h.currency), fontFamily: 'var(--font-mono)' }}>{h.currency}</span>
                <span style={{ color: 'var(--text3)' }}>=</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>RM {h.fxRate.toFixed(4)}</span>
              </div>
            ))}
          <button
            onClick={updateFxRates}
            disabled={fxUpdating}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 'var(--r-pill)',
              background: 'none', border: '1px solid var(--accent2)',
              color: 'var(--accent2)', fontSize: 12, fontWeight: 700,
              cursor: fxUpdating ? 'default' : 'pointer', opacity: fxUpdating ? 0.6 : 1,
            }}
          >
            {fxUpdating ? 'Updating…' : '🔄 Update FX rates'}
          </button>
          {fxResult && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fxResult}</span>}
        </div>
      )}

      {/* ── Underlying-price bar — refreshes the "Today" price shown per
             underlying on structured products, from live quotes. ── */}
      {activeTab && !loading && visible.some(h => h.assetClass === 'Structured Product' && h.underlyingDetails) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={updateUnderlyingPrices}
            disabled={pricesUpdating}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 'var(--r-pill)',
              background: 'none', border: '1px solid var(--gold)',
              color: 'var(--gold)', fontSize: 12, fontWeight: 700,
              cursor: pricesUpdating ? 'default' : 'pointer', opacity: pricesUpdating ? 0.6 : 1,
            }}
          >
            {pricesUpdating ? 'Updating…' : '🔄 Update underlying prices'}
          </button>
          {pricesResult && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{pricesResult}</span>}
        </div>
      )}

      {/* ── Switch / NAV panels ── */}
      {showSwitch && (
        <PortfolioSwitchPanel
          holdings={holdings}
          onClose={() => setShowSwitch(false)}
          onSuccess={() => { setShowSwitch(false); loadHoldings(); }}
        />
      )}

      {showNav && (
        <NavUpdatePanel
          onClose={() => setShowNav(false)}
          onSuccess={() => { setShowNav(false); loadHoldings(); }}
        />
      )}

      {formOpen && (
        <PortfolioFormModal
          clients={allClients}
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); loadHoldings(true); }}
        />
      )}

      {/* ── Holdings table ── */}
      {activeTab && <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--blue)' }} />
            {activeTab === 'All' ? 'All Holdings' : upperName(activeTab)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{visible.length} holdings</div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}><LoadingSpinner /></div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 680 }}>
            {/* Rows — grouped by client in "All" view */}
            {grouped.map(({ client, rows }) => (
              <div key={client}>
                {/* Client separator row — only in "All" view */}
                {activeTab === 'All' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 20px 6px',
                    background: 'var(--accent-dim)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'var(--accent2)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, flexShrink: 0,
                    }}>{initials(client)}</div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{upperName(client)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 2 }}>· {rows.length} holdings</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                      {fmtK(rows.reduce((s, h) => s + h.value, 0))}
                    </span>
                  </div>
                )}

                {/* Holding rows — sub-grouped by FAME account no */}
                {(() => {
                  const acctGroups = groupByAccount(rows);
                  // Always show the account header, even for a single account — every
                  // client's funds should consistently read as "belonging to account X".
                  const showAcctHeaders = acctGroups.length > 0;
                  const cols = '1fr 120px 120px 90px 80px';
                  // Structured Products drop the Value column outright (a blank
                  // slot read as awkward) rather than reflowing into the 5-column
                  // grid the other categories use.
                  const colsStructured = '1fr 140px 110px';
                  return acctGroups.map(acctGroup => {
                    const collapseKey = `${client}::${acctGroup.key}`;
                    const isCollapsed = showAcctHeaders && (collapsed[collapseKey] ?? true);
                    return (
                    <div key={acctGroup.key}>
                      {showAcctHeaders && (
                        <div
                          onClick={() => setCollapsed(prev => ({ ...prev, [collapseKey]: !(prev[collapseKey] ?? true) }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px 7px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}
                        >
                          <span style={{ fontSize: 10, color: 'var(--text3)', transition: 'transform 0.15s', transform: isCollapsed ? 'none' : 'rotate(90deg)', display: 'inline-block' }}>▶</span>
                          <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{acctGroup.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text3)' }}>· {acctGroup.rows.length} fund{acctGroup.rows.length === 1 ? '' : 's'}</span>
                        </div>
                      )}
                      {!isCollapsed && sortByAssetClass(acctGroup.rows).map((h, i, sortedRows) => {
                        const hasUnderlyings = !!(h.underlyingDetails && h.underlyingDetails.underlyings?.length);
                        const isNoteOpen = hasUnderlyings && !!expandedNote[h.id];
                        const cls = h.assetClass || 'Other';
                        const showClassLabel = i === 0 || (sortedRows[i - 1].assetClass || 'Other') !== cls;
                        return (
                    <div key={h.id}>
                    {showClassLabel && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: cls === 'Structured Product' ? colsStructured : cols,
                        marginTop: i === 0 ? 0 : 12,
                        padding: '7px 20px', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text3)',
                        background: 'var(--surface2)',
                        borderTop: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: assetColor(cls), flexShrink: 0 }} />
                          {cls}
                        </div>
                        {cls === 'Structured Product' ? (
                          <>
                            <div style={{ textAlign: 'right' }}>Purchase</div>
                            <div style={{ textAlign: 'right' }}>Worst vs KO</div>
                          </>
                        ) : (
                          <>
                            <div style={{ textAlign: 'right' }}>Value</div>
                            <div style={{ textAlign: 'right' }}>Purchase</div>
                            <div style={{ textAlign: 'right' }}>Gain / Loss</div>
                            <div style={{ textAlign: 'right' }}>Return</div>
                          </>
                        )}
                      </div>
                    )}
                    <div style={{
                      display: 'grid', gridTemplateColumns: h.assetClass === 'Structured Product' ? colsStructured : cols,
                      padding: '13px 20px', alignItems: 'center',
                      borderBottom: isNoteOpen ? 'none' : '1px solid var(--border)',
                      transition: 'background 0.12s',
                    }}
                      onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseOut={e => (e.currentTarget.style.background = '')}
                    >
                      {/* Holding name */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 13, color: 'var(--text)', flexWrap: 'wrap', paddingLeft: showAcctHeaders ? 13 : 0 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: assetColor(h.assetClass), flexShrink: 0 }} />
                          {hasUnderlyings && (
                            <button
                              onClick={() => setExpandedNote(prev => ({ ...prev, [h.id]: !prev[h.id] }))}
                              title={isNoteOpen ? 'Hide underlying details' : 'Show underlying details'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text3)', padding: '0 1px', transition: 'transform 0.15s', transform: isNoteOpen ? 'rotate(90deg)' : 'none' }}
                            >▶</button>
                          )}
                          {h.name}
                          {h.currency && h.currency !== 'MYR' && (
                            <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', background: `${ccyColor(h.currency)}22`, color: ccyColor(h.currency), border: `1px solid ${ccyColor(h.currency)}44` }}>{h.currency}</span>
                          )}
                          {typeof h.underlyingDetails?.couponRatePa === 'number' && (
                            <span title="Coupon rate p.a." style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', background: '#F79E1B22', color: 'var(--gold)', border: '1px solid #F79E1B44' }}>
                              {h.underlyingDetails.couponRatePa}% p.a.
                            </span>
                          )}
                          {(() => {
                            const flag = deriveNoteFlag(h);
                            if (!flag) return null;
                            if (flag === 'ki') {
                              return (
                                <span title="An underlying has traded below its Knock-In level (Below Strike Level) — principal protection may no longer apply. The note is still held." style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)' }}>
                                  ⚠️ KI triggered
                                </span>
                              );
                            }
                            const label = flag === 'likely-matured' ? 'Likely matured' : 'Likely KO’d';
                            return (
                              <>
                                <span title="Needs to be confirmed by an admin." style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)' }}>
                                  ⚠️ {label} — pending confirmation
                                </span>
                                {isAdmin && (
                                  <button onClick={() => confirmExit(h)} title="Mark this note Redeemed" style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: 'none', color: 'var(--red)', border: '1px solid var(--red)' }}>
                                    Confirm exit
                                  </button>
                                )}
                              </>
                            );
                          })()}
                          {isAdmin ? (
                            <>
                              <button onClick={() => editHolding(h)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', padding: '0 2px' }}>✎</button>
                              <button onClick={() => deleteHolding(h)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', padding: '0 2px' }}>🗑</button>
                            </>
                          ) : (
                            <span title="Investment records can only be changed by an admin — contact your company admin to request an adjustment." style={{ fontSize: 11, color: 'var(--text3)', cursor: 'help' }}>🔒</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, paddingLeft: showAcctHeaders ? 26 : 13 }}>
                          {[h.assetClass === 'Structured Product' ? noteType(h.name) : h.assetClass, h.institution].filter(Boolean).join(' · ')}
                          {h.maturity && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>⚠️ Matures {new Date(h.maturity).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}</span>}
                        </div>
                        {/* Meaningless for Structured Products — h.valueOrig there is
                            just the purchase basis restated (Value column is dropped
                            for this asset class by design), so this line duplicated
                            the Purchase figure already shown to the right. */}
                        {h.currency && h.currency !== 'MYR' && h.valueOrig > 0 && h.assetClass !== 'Structured Product' && (
                          <div style={{ fontSize: 10, color: ccyColor(h.currency), fontFamily: 'var(--font-mono)', marginTop: 2, paddingLeft: showAcctHeaders ? 26 : 13 }}>
                            {h.currency} {h.valueOrig.toLocaleString()} @ {h.fxRate.toFixed(4)}
                          </div>
                        )}
                      </div>

                      {/* Structured Products show raw original-currency figures (a USD
                          note's value in MYR is a distraction, not the number an FA
                          is actually tracking against Entry/Strike/KO) and drop
                          Gain/Loss in favour of Worst vs KO — the only two other
                          categories keep the MYR/Gain/Return layout. Account and
                          client subtotals below stay MYR-only either way, so the
                          FA still gets one true aggregate AUM figure. */}
                      {h.assetClass === 'Structured Product' ? (
                        <>
                          {/* No Currency column — already tagged next to the note
                              name above, and no Value column for Structured
                              Products — secondary-
                              market bid-based mark-to-market isn't a meaningful
                              number here; revisit once there's a valuation basis
                              worth surfacing. */}

                          {/* Purchase (original currency) */}
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)', fontSize: 12 }}>
                            {Math.round(h.purchaseOrig).toLocaleString()}
                          </div>

                          {/* Worst vs KO */}
                          {(() => {
                            const worstKo = worstVsKo(h.underlyingDetails);
                            if (!worstKo) return <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text3)' }}>—</div>;
                            return (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: worstKo.pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {worstKo.pct >= 0 ? '+' : ''}{worstKo.pct.toFixed(1)}%
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 1 }}>
                                  {worstKo.ticker} vs KO
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      ) : (() => {
                        // Foreign-currency holdings display in their own currency
                        // (a USD/AUD/GBP bond's MYR-converted number isn't what the
                        // FA is actually tracking it against). MYR-denominated
                        // holdings are unaffected — valueOrig/purchaseOrig are often
                        // just unset for those, so h.value/h.purchase (already MYR)
                        // stay the source of truth there.
                        const isForeign = !!h.currency && h.currency !== 'MYR';
                        const dispValue    = isForeign ? h.valueOrig    : h.value;
                        const dispPurchase = isForeign ? h.purchaseOrig : h.purchase;
                        const dispGain     = dispValue - dispPurchase;
                        return (
                        <>
                          {/* Value */}
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>
                            {Math.round(dispValue).toLocaleString()}
                          </div>

                          {/* Purchase */}
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)', fontSize: 12 }}>
                            {Math.round(dispPurchase).toLocaleString()}
                          </div>

                          {/* Gain */}
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: dispGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {dispGain >= 0 ? '+' : ''}{Math.round(dispGain).toLocaleString()}
                          </div>

                          {/* Return % — a ratio, so it reads the same regardless of
                              which currency Value/Purchase above are shown in. */}
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: h.returnPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {h.returnPct >= 0 ? '+' : ''}{h.returnPct}%
                          </div>
                        </>
                        );
                      })()}
                    </div>
                    {isNoteOpen && h.underlyingDetails && (
                      <div style={{ padding: '4px 20px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                        {typeof h.underlyingDetails.couponRatePa === 'number' && (
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                            Coupon rate: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>{h.underlyingDetails.couponRatePa}% p.a.</span>
                            {h.underlyingDetails.priceAsOf && (
                              <span style={{ marginLeft: 10, color: 'var(--text3)' }}>· prices as of {h.underlyingDetails.priceAsOf}</span>
                            )}
                          </div>
                        )}
                        {(() => {
                          const worst = worstVsKo(h.underlyingDetails);
                          if (!worst) return null;
                          return (
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                              Worst Asset vs KO: <span style={{ fontWeight: 700, color: 'var(--text)' }}>{worst.ticker}</span>{' '}
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: worst.pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {worst.pct >= 0 ? '+' : ''}{worst.pct.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })()}
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
                            <thead>
                              <tr style={{ color: 'var(--text3)', textAlign: 'right' }}>
                                <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 8px' }}>Underlying</th>
                                <th style={{ fontWeight: 600, padding: '4px 8px' }}>Today</th>
                                <th style={{ fontWeight: 600, padding: '4px 8px' }}>Entry</th>
                                <th style={{ fontWeight: 600, padding: '4px 8px' }}>Strike</th>
                                <th style={{ fontWeight: 600, padding: '4px 8px' }}>KI</th>
                                {/* Step-down notes lower the KO barrier each observation, so
                                    label which one this column is actually showing. */}
                                <th style={{ fontWeight: 600, padding: '4px 8px' }} title={(() => {
                                  const n = nextKoObs(h.underlyingDetails);
                                  return n && typeof n.triggerPct === 'number'
                                    ? `Barrier at the next observation (${n.date}, ${n.triggerPct}% of initial)`
                                    : 'Knock-Out barrier';
                                })()}>
                                  {(() => {
                                    const n = nextKoObs(h.underlyingDetails);
                                    return n && typeof n.triggerPct === 'number' ? `KO (${n.triggerPct}%)` : 'KO';
                                  })()}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {h.underlyingDetails.underlyings.map((u, ui) => {
                                const breached = typeof u.today === 'number' && u.today < u.ki;
                                return (
                                <tr key={ui} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td style={{ padding: '5px 8px', fontWeight: 500, color: 'var(--text)' }}>{u.name}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: typeof u.today !== 'number' ? 'var(--text3)' : breached ? 'var(--red)' : 'var(--green)' }}>
                                    {typeof u.today === 'number' ? u.today.toLocaleString() : '—'}
                                  </td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{u.entry.toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{u.strike.toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{u.ki.toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                                    {koBarrier(u, nextKoObs(h.underlyingDetails)?.triggerPct).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {h.underlyingDetails.schedule?.length > 0 && (
                          // Fixed 6-per-row grid — a 12-month schedule reads as two even
                          // rows instead of ragged flex-wrap that reflows with column width.
                          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                            {h.underlyingDetails.schedule.map((s, si) => (
                              <div key={si} style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
                                <div style={{ color: 'var(--text3)' }}>{s.label}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600 }}>
                                  {new Date(s.date).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                        );
                      })}
                      {showAcctHeaders && (
                        <div style={{
                          display: 'grid', gridTemplateColumns: cols,
                          padding: '8px 20px', alignItems: 'center',
                          background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>Subtotal — {acctGroup.label}</span>
                          <div />
                          {/* Purchase, not Value — same column TOTAL uses below, and
                              the same reasoning: Structured Products carry no
                              meaningful Value (purchase-basis by design), so a
                              blended Value sum here would be part-real, part-not. */}
                          <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                            {Math.round(acctGroup.rows.reduce((s, h) => s + h.purchase, 0)).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                    );
                  });
                })()}

                {/* Client subtotal — only in "All" view */}
                {activeTab === 'All' && (() => {
                  const sv = rows.reduce((s, h) => s + h.value, 0);
                  const sp = rows.reduce((s, h) => s + h.purchase, 0);
                  const sg = sv - sp;
                  const sr = sp > 0 ? ((sg / sp) * 100).toFixed(1) : '0.0';
                  return (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 120px 120px 90px 80px',
                      padding: '8px 20px', background: 'var(--bg2)',
                      borderBottom: '2px solid var(--border)', fontSize: 12, fontWeight: 700,
                    }}>
                      <div style={{ color: 'var(--text3)', fontSize: 11 }}>Subtotal</div>
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{Math.round(sv).toLocaleString()}</div>
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{Math.round(sp).toLocaleString()}</div>
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: sg >= 0 ? 'var(--green)' : 'var(--red)' }}>{sg >= 0 ? '+' : ''}{Math.round(sg).toLocaleString()}</div>
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: Number(sr) >= 0 ? 'var(--green)' : 'var(--red)' }}>{Number(sr) >= 0 ? '+' : ''}{sr}%</div>
                    </div>
                  );
                })()}
              </div>
            ))}

            {/* Grand total */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 120px 90px 80px',
              padding: '12px 20px', background: 'var(--surface2)',
              borderTop: '2px solid var(--text)', fontSize: 13, fontWeight: 700,
            }}>
              {/* Structured Products no longer carry a meaningful Value/Gain
                  (purchase-basis by design — see the source-level fix), so a
                  blended Value/Gain/Return total here would be part-real,
                  part-not. Purchase is the one number that's fully meaningful
                  across every asset class, so that's all this row shows. */}
              <div style={{ color: 'var(--text)' }}>TOTAL <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>(MYR equiv.)</span></div>
              <div />
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{Math.round(totalPurchase).toLocaleString()}</div>
              <div />
              <div />
            </div>

            {/* Exited structured notes — confirmed Redeemed (by the FAME/iFAST
                sync or an admin's "Confirm exit"). Kept out of every total/
                breakdown above; collapsed by default since it's a record, not
                something the FA needs to act on day to day. */}
            {exitedVisible.length > 0 && (() => {
              const sorted = [...exitedVisible].sort((a, b) => (b.maturity || '').localeCompare(a.maturity || ''));
              return (
                <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div
                    onClick={() => setExitedCollapsed(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--bg2)', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span style={{ fontSize: 10, color: 'var(--text3)', transition: 'transform 0.15s', transform: exitedCollapsed ? 'none' : 'rotate(90deg)', display: 'inline-block' }}>▶</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text2)' }}>Exited Notes ({sorted.length})</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>— redeemed / matured / knocked-out, excluded from AUM above</span>
                  </div>
                  {!exitedCollapsed && sorted.map(h => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 20px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                      <div>
                        <span style={{ color: 'var(--text2)' }}>{h.name}</span>
                        {activeTab === 'All' && <span style={{ color: 'var(--text3)', marginLeft: 8 }}>· {upperName(h.clientName)}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {h.maturity && <span style={{ color: 'var(--text3)' }}>{new Date(h.maturity).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{Math.round(h.purchaseOrig || h.purchase).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          </div>
        )}
      </div>}

      {/* Asset allocation now lives in the donut pair above, so the old
          bar list here would just repeat it. */}
      <div style={{ height: 28 }} />
    </>
  );
}
