'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  useClients,
  formatAUM, formatDate, initials,
  riskClass, segmentClass, segmentLabel, statusClass,
} from '@/components/useClients';
import CashflowFormModal from '@/components/CashflowFormModal';
import NetWorthFormModal from '@/components/NetWorthFormModal';
import { MedicalDetail } from '@/components/MedicalDetail';

// ── Types ────────────────────────────────────────────────────────────────────

interface Holding {
  id: string; clientId: string; name: string; clientName: string;
  assetClass: string; institution: string; status: string; maturity: string;
  currency: string; valueOrig: number; purchaseOrig: number; fxRate: number;
  value: number; purchase: number; gain: number; returnPct: number; units: number;
  fameAccountNo?: string; fundSource?: string;
}

interface Policy {
  id: string; policyName: string; clientName: string; clientIncome: number;
  insuranceType: string; benefits: string[]; status: string; insurer: string;
  policyNumber: string; sumAssured: number; annualPremium: number;
  commencementDate: string; maturityDate: string; beneficiary: string; notes: string;
  lifeCover: number; ciCover: number; paCover: number; tpdCover: number;
  medicalClass: string; policyOwner: string; lifeAssured: string;
}

interface CashflowRow {
  id: string; entry: string; month: string;
  income: number; fixed: number; variable: number; epf: number;
  surplus: number; savingsRate: number;
  breakdown: Record<string, Record<string, number>> | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtK = (n: number) =>
  n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
  : n >= 1000 ? `RM ${(n / 1000).toFixed(1)}K`
  : `RM ${Math.round(n).toLocaleString()}`;

const fmtMoney = (n: number) => `RM ${Math.round(n).toLocaleString()}`;

const fmtMonth = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' });
};

const ASSET_COLORS: Record<string, string> = {
  'EPF': '#4ADE80', 'Unit Trust': '#60A5FA', 'PRS': '#818CF8',
  'Fixed Deposit': '#F59E0B', 'Stocks': '#A78BFA', 'Bonds': '#F87171',
  'Money Market': '#34D399',
};
const assetColor = (a: string) => ASSET_COLORS[a] ?? '#9CB8A0';

// "PRS Acc A" / "PRS Acc B" etc. are just different PRS sub-accounts — showing
// the letter suffix in the group label reads as separate categories when
// they're not. Collapse to a single "PRS Acc" label; the account number
// already distinguishes the group.
const normalizeFundSource = (fs: string) => /^PRS\s*Acc/i.test(fs) ? 'PRS Acc' : fs;

const TYPE_COLORS: Record<string, string> = {
  'ILP': '#60A5FA', 'IUL': '#818CF8', 'UL': '#A78BFA',
  'VUL': '#F59E0B', 'Term Life': '#4ADE80', 'Endowment': '#34D399',
};
const typeColor = (t: string) => {
  const key = Object.keys(TYPE_COLORS).find(k => t?.includes(k));
  return key ? TYPE_COLORS[key] : '#9CB8A0';
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ dot, title, sub }: { dot: string; title: string; sub?: string }) {
  return (
    <div className="section-header">
      <div className="section-title">
        <span className="section-dot" style={{ background: dot }} />
        {title}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 12, color: 'var(--text3)', fontWeight: 600, paddingTop: 1 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : undefined, fontWeight: mono ? 600 : 400 }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ client }: { client: ReturnType<typeof useClients>['clients'][number] }) {
  const annualIncome = (client.income ?? 0) * 12;
  const age = client.dob
    ? Math.floor((Date.now() - new Date(client.dob).getTime()) / (365.25 * 86400000))
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      {/* Personal info */}
      <div className="section">
        <SectionHeader dot="var(--accent)" title="Personal Information" />
        <div style={{ padding: '0 20px 16px' }}>
          <InfoRow label="Full Name" value={client.name} />
          <InfoRow label="Date of Birth" value={client.dob ? `${formatDate(client.dob)}${age ? ` (Age ${age})` : ''}` : '—'} />
          <InfoRow label="Phone" value={client.phone} />
          <InfoRow label="Email" value={
            client.email
              ? <a href={`mailto:${client.email}`} style={{ color: 'var(--accent2)', textDecoration: 'none' }}>{client.email}</a>
              : '—'
          } />
          <InfoRow label="Onboarding" value={formatDate(client.onboarding)} />
        </div>
      </div>

      {/* Financial profile */}
      <div className="section">
        <SectionHeader dot="var(--green)" title="Financial Profile" />
        <div style={{ padding: '0 20px 16px' }}>
          <InfoRow label="Status" value={
            <span className={`badge ${statusClass(client.status)}`}>{client.status || '—'}</span>
          } />
          <InfoRow label="Segment" value={
            client.segment
              ? <span className={`badge ${segmentClass(client.segment)}`}>{segmentLabel(client.segment)}</span>
              : '—'
          } />
          <InfoRow label="Risk Profile" value={
            client.risk
              ? <span className={`badge ${riskClass(client.risk)}`}>{client.risk}</span>
              : '—'
          } />
          <InfoRow label="AUM" value={formatAUM(client.aum)} mono />
          <InfoRow label="Monthly Income" value={client.income ? fmtMoney(client.income) : '—'} mono />
          <InfoRow label="Annual Income" value={annualIncome ? fmtMoney(annualIncome) : '—'} mono />
        </div>
      </div>

      {/* Review schedule */}
      <div className="section">
        <SectionHeader dot="var(--blue)" title="Review Schedule" />
        <div style={{ padding: '0 20px 16px' }}>
          <InfoRow label="Last Review" value={formatDate(client.lastReview)} />
          <InfoRow label="Next Review" value={
            (() => {
              if (!client.nextReview) return '—';
              const days = Math.ceil((new Date(client.nextReview).getTime() - Date.now()) / 86400000);
              const color = days < 0 ? 'var(--red)' : days <= 14 ? 'var(--gold)' : 'var(--green)';
              const label = days < 0 ? `Overdue ${Math.abs(days)}d` : days === 0 ? 'Today' : `In ${days}d`;
              return (
                <span>
                  {formatDate(client.nextReview)}
                  <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 'var(--r-pill)', fontSize: 10, fontWeight: 700, background: `${color}18`, color }}>{label}</span>
                </span>
              );
            })()
          } />
          <InfoRow label="Financial Goals" value={
            client.goals?.length
              ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {client.goals.map(g => (
                    <span key={g} style={{ padding: '2px 8px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent2)', border: '1px solid var(--accent)33' }}>{g}</span>
                  ))}
                </div>
              : '—'
          } />
        </div>
      </div>
    </div>
  );
}

// ── Tab: Portfolio ────────────────────────────────────────────────────────────

function PortfolioTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/notion?type=portfolio', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          // Filter to this client by clientId first, then fall back to clientName match
          const mine = json.data.filter((h: Holding) =>
            h.clientId === clientId || h.clientName === clientName
          );
          setHoldings(mine);
        }
      })
      .finally(() => setLoading(false));
  }, [clientId, clientName]);

  const totalValue    = holdings.reduce((s, h) => s + h.value, 0);
  const totalPurchase = holdings.reduce((s, h) => s + h.purchase, 0);
  const totalGain     = totalValue - totalPurchase;
  const avgReturn     = totalPurchase > 0 ? ((totalGain / totalPurchase) * 100).toFixed(1) : '0.0';

  // Group holdings by FAME account no (e.g. "PMART" account M018415 holds several
  // underlying funds) so a wrapper account and its funds don't read as unrelated,
  // duplicated line items. Holdings with no account no (older manual entries) fall
  // into a single "Other" bucket.
  const accountGroups: { key: string; label: string; rows: Holding[] }[] = (() => {
    const byAccount = new Map<string, Holding[]>();
    const ungrouped: Holding[] = [];
    for (const h of holdings) {
      if (h.fameAccountNo) {
        const arr = byAccount.get(h.fameAccountNo) ?? [];
        arr.push(h);
        byAccount.set(h.fameAccountNo, arr);
      } else {
        ungrouped.push(h);
      }
    }
    const groups = Array.from(byAccount.entries()).map(([acct, rows]) => ({
      key: acct,
      label: `Account ${acct}${rows[0].fundSource ? ` · ${normalizeFundSource(rows[0].fundSource)}` : ''}`,
      rows,
    }));
    if (ungrouped.length) groups.push({ key: '__manual__', label: 'Other Holdings (manual entries)', rows: ungrouped });
    return groups;
  })();
  // Always show the account header, even for a single account — every
  // client's funds should consistently read as "belonging to account X".
  const showGroupHeaders = accountGroups.length > 0;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading portfolio…</div>;

  if (holdings.length === 0) return (
    <div className="section" style={{ padding: '48px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No holdings recorded</div>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Add holdings in FINVA Notion to see them here</div>
    </div>
  );

  return (
    <>
      {/* Summary cards */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card green">
          <div className="stat-icon green">📈</div>
          <div className="stat-label">Total AUM</div>
          <div className="stat-value">{fmtK(totalValue)}</div>
          <div className="stat-sub">{holdings.length} holdings</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">💵</div>
          <div className="stat-label">Total Gain / Loss</div>
          <div className="stat-value" style={{ color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtK(totalGain)}</div>
          <div className="stat-sub">{Number(avgReturn) >= 0 ? '+' : ''}{avgReturn}% avg return</div>
        </div>
      </div>

      {/* Holdings table */}
      <div className="section">
        <SectionHeader dot="var(--blue)" title="Holdings" sub={`${holdings.length} total`} />
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 80px 70px', padding: '8px 20px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'var(--bg2)' }}>
              <div>Fund / Holding</div>
              <div style={{ textAlign: 'right' }}>Value (MYR)</div>
              <div style={{ textAlign: 'right' }}>Cost (MYR)</div>
              <div style={{ textAlign: 'right' }}>Gain</div>
              <div style={{ textAlign: 'right' }}>Return</div>
            </div>
            {accountGroups.map(group => {
              const isCollapsed = showGroupHeaders && (collapsed[group.key] ?? true);
              return (
              <div key={group.key}>
                {showGroupHeaders && (
                  <div
                    onClick={() => setCollapsed(prev => ({ ...prev, [group.key]: !(prev[group.key] ?? true) }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent-dim)', borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text3)', transition: 'transform 0.15s', transform: isCollapsed ? 'none' : 'rotate(90deg)', display: 'inline-block' }}>▶</span>
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{group.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>· {group.rows.length} fund{group.rows.length === 1 ? '' : 's'}</span>
                  </div>
                )}
                {!isCollapsed && group.rows.map((h, i) => (
                  <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 80px 70px', padding: '12px 20px', alignItems: 'center', borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseOut={e => (e.currentTarget.style.background = '')}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 13, color: 'var(--text)', paddingLeft: showGroupHeaders ? 13 : 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: assetColor(h.assetClass), flexShrink: 0 }} />
                        {h.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, paddingLeft: showGroupHeaders ? 26 : 13 }}>
                        {[h.assetClass, h.institution].filter(Boolean).join(' · ')}
                        {h.maturity && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>⚠️ Matures {fmtMonth(h.maturity)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>{Math.round(h.value).toLocaleString()}</div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>{Math.round(h.purchase).toLocaleString()}</div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: h.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>{h.gain >= 0 ? '+' : ''}{Math.round(h.gain).toLocaleString()}</div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: h.returnPct >= 0 ? 'var(--green)' : 'var(--red)' }}>{h.returnPct >= 0 ? '+' : ''}{h.returnPct}%</div>
                  </div>
                ))}
                {showGroupHeaders && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>Subtotal — {group.label}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                      {Math.round(group.rows.reduce((s, h) => s + h.value, 0)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              );
            })}
            {/* Grand total */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 80px 70px', padding: '10px 20px', background: 'var(--surface2)', borderTop: '2px solid var(--text)', fontSize: 13, fontWeight: 700 }}>
              <div style={{ color: 'var(--text)' }}>TOTAL <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>(MYR equiv.)</span></div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totalValue).toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{Math.round(totalPurchase).toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>{totalGain >= 0 ? '+' : ''}{Math.round(totalGain).toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: Number(avgReturn) >= 0 ? 'var(--green)' : 'var(--red)' }}>{Number(avgReturn) >= 0 ? '+' : ''}{avgReturn}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Asset allocation */}
      {holdings.length > 0 && (
        <div className="section" style={{ marginTop: 16 }}>
          <SectionHeader dot="var(--gold)" title="Asset Class Allocation" />
          <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(
              holdings.reduce<Record<string, number>>((acc, h) => {
                acc[h.assetClass] = (acc[h.assetClass] ?? 0) + h.value;
                return acc;
              }, {})
            ).sort(([, a], [, b]) => b - a).map(([cls, val]) => {
              const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
              const color = assetColor(cls);
              return (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 110, fontSize: 12, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>{cls}</div>
                  <div style={{ flex: 1, height: 8, borderRadius: 'var(--r-pill)', background: 'var(--surface2)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 'var(--r-pill)', background: color, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ width: 46, fontSize: 12, fontWeight: 700, color, textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{pct.toFixed(1)}%</div>
                  <div style={{ width: 86, fontSize: 12, color: 'var(--text3)', textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtK(val)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab: Net Worth (Assets & Liabilities) ─────────────────────────────────────

interface AssetItem { id: string; name: string; client: string; itemType: string; category: string; value: number; notes: string }

function NetWorthLinkBar({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch('/api/networth/generate-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setUrl(d.url);
    } catch (e) { alert(`Could not generate link: ${e instanceof Error ? e.message : 'error'}`); }
    setBusy(false);
  }

  return (
    <div className="section" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button onClick={generate} disabled={busy} style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 'var(--r-pill)', cursor: 'pointer' }}>
        {busy ? 'Generating…' : '📤 Send Net Worth form to client'}
      </button>
      {url && (
        <>
          <input readOnly value={url} onClick={e => (e.target as HTMLInputElement).select()}
            style={{ flex: 1, minWidth: 220, padding: '8px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)' }} />
          <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <span style={{ width: '100%', fontSize: 11, color: 'var(--text3)' }}>Link valid 7 days. Client fills it in; results appear here automatically.</span>
        </>
      )}
    </div>
  );
}

function NetWorthTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [items, setItems] = useState<AssetItem[]>([]);
  const [invValue, setInvValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  function load() {
    const name = clientName.toLowerCase().trim();
    setLoading(true);
    Promise.all([
      fetch('/api/notion?type=assets', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/notion?type=portfolio', { cache: 'no-store' }).then(r => r.json()),
    ]).then(([a, p]) => {
      if (Array.isArray(a.data)) {
        setItems(a.data.filter((x: AssetItem) => (x.client || '').toLowerCase().trim() === name));
      }
      if (Array.isArray(p.data)) {
        const mine = p.data.filter((h: Holding) => h.clientId === clientId || h.clientName === clientName);
        setInvValue(mine.reduce((s: number, h: Holding) => s + (h.value || 0), 0));
      }
    }).finally(() => setLoading(false));
  }

  useEffect(load, [clientId, clientName]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading net worth…</div>;

  const assets      = items.filter(i => i.itemType === 'Asset');
  const liabilities = items.filter(i => i.itemType === 'Liability');
  const otherAssets = assets.reduce((s, i) => s + (i.value || 0), 0);
  const totalLiab   = liabilities.reduce((s, i) => s + (i.value || 0), 0);
  const totalAssets = otherAssets + invValue;       // other assets + investments
  const netWorth    = totalAssets - totalLiab;

  const addBar = (
    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={() => setFormOpen(true)} style={{
        padding: '8px 16px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff',
        border: 'none', borderRadius: 'var(--r-pill)', cursor: 'pointer',
      }}>＋ Add Item</button>
    </div>
  );

  const modal = formOpen && (
    <NetWorthFormModal clientName={clientName} items={items} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />
  );

  const empty = items.length === 0 && invValue === 0;
  if (empty) return (
    <>
      <NetWorthLinkBar clientId={clientId} clientName={clientName} />
      {addBar}
      {modal}
      <div className="section" style={{ padding: '48px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>💰</div>
        <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No assets or liabilities recorded</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Send the form to your client above, or add an item manually.</div>
      </div>
    </>
  );

  const Row = ({ i }: { i: AssetItem }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{i.name || i.category}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{i.category}{i.notes ? ` · ${i.notes}` : ''}</div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: i.itemType === 'Liability' ? 'var(--red)' : 'var(--text)' }}>
        {i.itemType === 'Liability' ? '−' : ''}{fmtK(i.value)}
      </div>
    </div>
  );

  return (
    <>
      <NetWorthLinkBar clientId={clientId} clientName={clientName} />
      {addBar}
      {modal}
      {/* Summary cards */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card green">
          <div className="stat-icon green">📊</div>
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{fmtK(totalAssets)}</div>
          <div className="stat-sub">incl. {fmtK(invValue)} investments</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">📉</div>
          <div className="stat-label">Total Liabilities</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{fmtK(totalLiab)}</div>
          <div className="stat-sub">{liabilities.length} liabilit{liabilities.length === 1 ? 'y' : 'ies'}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon blue">💰</div>
          <div className="stat-label">Net Worth</div>
          <div className="stat-value" style={{ color: netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtK(netWorth)}</div>
          <div className="stat-sub">assets − liabilities</div>
        </div>
      </div>

      {/* Assets */}
      <div className="section" style={{ marginBottom: 16 }}>
        <SectionHeader dot="var(--green)" title="Assets" sub={fmtK(totalAssets)} />
        {/* Investments roll-up from Portfolio */}
        {invValue > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Investment Holdings</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>from Portfolio (live)</div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmtK(invValue)}</div>
          </div>
        )}
        {assets.length > 0
          ? assets.map(i => <Row key={i.id} i={i} />)
          : invValue === 0 && <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text3)' }}>No other assets recorded.</div>}
      </div>

      {/* Liabilities */}
      <div className="section">
        <SectionHeader dot="var(--red)" title="Liabilities" sub={fmtK(totalLiab)} />
        {liabilities.length > 0
          ? liabilities.map(i => <Row key={i.id} i={i} />)
          : <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text3)' }}>No liabilities recorded.</div>}
      </div>
    </>
  );
}

// ── Tab: Insurance ────────────────────────────────────────────────────────────

function InsuranceTab({ clientName }: { clientName: string }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notion?type=insurance', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          setPolicies(json.data.filter((p: Policy) => p.clientName === clientName));
        }
      })
      .finally(() => setLoading(false));
  }, [clientName]);

  const activePolicies = policies.filter(p => p.status?.includes('Active'));
  const totalSumAssured = activePolicies.reduce((s, p) => s + p.sumAssured, 0);
  const totalPremium = activePolicies.reduce((s, p) => s + p.annualPremium, 0);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading insurance…</div>;

  if (policies.length === 0) return (
    <div className="section" style={{ padding: '48px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🛡️</div>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No insurance policies recorded</div>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Add policies in FINVA Notion to see them here</div>
    </div>
  );

  const COLS = '2fr 130px 1.5fr 100px 90px 80px';

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card blue">
          <div className="stat-icon blue">🛡️</div>
          <div className="stat-label">Total Sum Assured</div>
          <div className="stat-value">{fmtK(totalSumAssured)}</div>
          <div className="stat-sub">{activePolicies.length} active policies</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">📋</div>
          <div className="stat-label">Annual Premium</div>
          <div className="stat-value">{fmtK(totalPremium)}</div>
          <div className="stat-sub">{fmtK(Math.round(totalPremium / 12))}/month</div>
        </div>
      </div>

      <div className="section">
        <SectionHeader dot="var(--blue)" title="Policies" sub={`${policies.length} total · ${activePolicies.length} active`} />
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 700 }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 20px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'var(--bg2)' }}>
              <div>Policy / Insurer</div>
              <div>Type</div>
              <div>Benefits</div>
              <div style={{ textAlign: 'right' }}>Sum Assured</div>
              <div style={{ textAlign: 'right' }}>Premium/yr</div>
              <div style={{ textAlign: 'right' }}>Status</div>
            </div>

            {policies.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '13px 20px', alignItems: 'start', borderBottom: i < policies.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.12s' }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseOut={e => (e.currentTarget.style.background = '')}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{p.policyName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {[p.insurer, p.policyNumber].filter(Boolean).join(' · ')}
                    {p.maturityDate && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>⚠️ Matures {fmtMonth(p.maturityDate)}</span>}
                  </div>
                  {p.beneficiary && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>🎯 {p.beneficiary}</div>}
                  {p.medicalClass && <div style={{ marginTop: 5 }}><MedicalDetail value={p.medicalClass} align="left" /></div>}
                </div>
                <div style={{ paddingTop: 2 }}>
                  {p.insuranceType && (
                    <span style={{ padding: '3px 10px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700, background: `${typeColor(p.insuranceType)}18`, color: typeColor(p.insuranceType), border: `1px solid ${typeColor(p.insuranceType)}33`, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                      {p.insuranceType}
                    </span>
                  )}
                </div>
                <div style={{ paddingTop: 2, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {p.benefits.length > 0
                    ? p.benefits.map(b => (
                        <span key={b} style={{ padding: '2px 6px', borderRadius: 'var(--r-pill)', fontSize: 10, fontWeight: 600, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{b}</span>
                      ))
                    : <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>{p.sumAssured > 0 ? Math.round(p.sumAssured).toLocaleString() : '—'}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>{p.annualPremium > 0 ? Math.round(p.annualPremium).toLocaleString() : '—'}</div>
                <div style={{ textAlign: 'right', paddingTop: 2 }}>
                  <span style={{ padding: '3px 9px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 600, background: p.status?.includes('Active') ? 'var(--green-dim)' : 'var(--surface2)', color: p.status?.includes('Active') ? 'var(--green)' : 'var(--text3)' }}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}

            {/* Subtotal */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '10px 20px 18px', background: 'var(--bg2)', borderTop: '2px solid var(--border)' }}>
              <div style={{ color: 'var(--text3)', fontSize: 11, fontWeight: 600 }}>Subtotal (active)</div>
              <div /><div />
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{Math.round(totalSumAssured).toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--text3)' }}>{Math.round(totalPremium).toLocaleString()}</div>
              <div />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Tab: Cashflow ─────────────────────────────────────────────────────────────

function CashflowTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [rows, setRows] = useState<CashflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function load() {
    setLoading(true);
    fetch('/api/notion?type=cashflow', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          // Filter rows belonging to this client by matching entry title (clientName prefix)
          const mine = json.data.filter((r: CashflowRow) => {
            const entry = r.entry?.toLowerCase() ?? '';
            const name  = clientName.toLowerCase();
            return entry.includes(name) || entry.includes(clientId);
          });
          setRows(mine);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [clientId, clientName]);

  const fmt = (n: number) => Math.round(n).toLocaleString();
  const avgSavings = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.savingsRate, 0) / rows.length) : 0;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading cashflow…</div>;

  const addBar = (
    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={() => setFormOpen(true)} style={{
        padding: '8px 16px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff',
        border: 'none', borderRadius: 'var(--r-pill)', cursor: 'pointer',
      }}>＋ Add Month</button>
    </div>
  );

  const modal = formOpen && (
    <CashflowFormModal clientName={clientName} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />
  );

  if (rows.length === 0) return (
    <>
      {addBar}
      {modal}
      <div className="section" style={{ padding: '48px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
        <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No cashflow data yet</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Share a cashflow form link with this client, or add a month manually</div>
        <Link href="/cashflow" style={{ padding: '8px 20px', borderRadius: 'var(--r-pill)', background: 'var(--accent2)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
          Go to Cashflow →
        </Link>
      </div>
    </>
  );

  return (
    <>
      {addBar}
      {modal}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card green">
          <div className="stat-icon green">📊</div>
          <div className="stat-label">Months on Record</div>
          <div className="stat-value">{rows.length}</div>
          <div className="stat-sub">cashflow entries</div>
        </div>
        <div className={`stat-card ${avgSavings >= 30 ? 'green' : avgSavings >= 20 ? 'gold' : 'red'}`}>
          <div className={`stat-icon ${avgSavings >= 30 ? 'green' : avgSavings >= 20 ? 'gold' : 'red'}`}>💰</div>
          <div className="stat-label">Avg Savings Rate</div>
          <div className="stat-value">{avgSavings}%</div>
          <div className="stat-sub">{avgSavings >= 30 ? 'On track ✓' : avgSavings >= 20 ? 'Below target' : 'Needs attention'}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon blue">💵</div>
          <div className="stat-label">Latest Income</div>
          <div className="stat-value">{rows[0] ? fmtK(rows[0].income) : '—'}</div>
          <div className="stat-sub">{rows[0] ? fmtMonth(rows[0].month) : ''}</div>
        </div>
        <div className={`stat-card ${rows[0]?.surplus >= 0 ? 'green' : 'red'}`}>
          <div className={`stat-icon ${rows[0]?.surplus >= 0 ? 'green' : 'red'}`}>🏦</div>
          <div className="stat-label">Latest Surplus</div>
          <div className="stat-value" style={{ color: rows[0]?.surplus >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {rows[0] ? `${rows[0].surplus >= 0 ? '+' : ''}${fmtK(rows[0].surplus)}` : '—'}
          </div>
          <div className="stat-sub">{rows[0] ? `${rows[0].savingsRate}% savings rate` : ''}</div>
        </div>
      </div>

      <div className="section">
        <SectionHeader dot="var(--accent)" title="Monthly Cashflow History" sub={`${rows.length} months`} />
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 600 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr 80px 36px', padding: '8px 20px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'var(--bg2)' }}>
              <div>Month</div>
              <div style={{ textAlign: 'right' }}>Income</div>
              <div style={{ textAlign: 'right' }}>Fixed</div>
              <div style={{ textAlign: 'right' }}>Variable</div>
              <div style={{ textAlign: 'right' }}>EPF</div>
              <div style={{ textAlign: 'right' }}>Surplus</div>
              <div />
            </div>
            {rows.map((row, i) => (
              <div key={row.id}>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr 80px 36px', padding: '11px 20px', alignItems: 'center', borderBottom: '1px solid var(--border)', transition: 'background 0.12s', cursor: row.breakdown ? 'pointer' : 'default' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseOut={e => (e.currentTarget.style.background = '')}
                  onClick={() => row.breakdown && setExpandedId(expandedId === row.id ? null : row.id)}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{fmtMonth(row.month)}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{fmt(row.income)}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>{fmt(row.fixed)}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>{fmt(row.variable)}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>{fmt(row.epf)}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: row.surplus >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {row.surplus >= 0 ? '+' : ''}{fmt(row.surplus)}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', transition: 'transform 0.2s', transform: expandedId === row.id ? 'rotate(90deg)' : 'none' }}>
                    {row.breakdown ? '▶' : ''}
                  </div>
                </div>

                {/* Expandable breakdown */}
                {expandedId === row.id && row.breakdown && (
                  <div style={{ padding: '12px 20px 16px 36px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                    {Object.entries(row.breakdown).map(([category, items]) => (
                      <div key={category} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{category}</div>
                        {Object.entries(items).map(([item, amount]) => (
                          <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 }}>
                            <span style={{ color: 'var(--text2)' }}>{item}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)', minWidth: 80, textAlign: 'right' }}>RM {Math.round(amount as number).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Correspondence Tab ─────────────────────────────────────────────────────────

interface TimelineEmail {
  id: string; threadId: string; from: string; fromName: string; to: string;
  subject: string; snippet: string; date: string; direction: 'inbound' | 'outbound';
}

function CorrespondenceTab({ clientName }: { clientName: string }) {
  const [emails,  setEmails]  = useState<TimelineEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [state,   setState]   = useState<'ok' | 'disconnected' | 'no_whitelist' | 'error'>('ok');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/email/client-timeline?clientName=${encodeURIComponent(clientName)}`)
      .then(r => r.json())
      .then(d => {
        if (d.connected === false)  { setState('disconnected'); return; }
        if (d.noWhitelist)          { setState('no_whitelist'); return; }
        if (d.error)                { setState('error'); return; }
        setEmails(d.emails ?? []);
        setState('ok');
      })
      .catch(() => setState('error'))
      .finally(() => setLoading(false));
  }, [clientName]);

  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="section">
      <SectionHeader dot="#60A5FA" title="Correspondence" sub={`Emails with institutions mentioning ${clientName.split(' ')[0]}`} />

      {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading correspondence…</div>}

      {!loading && state === 'disconnected' && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          Gmail not connected. <Link href="/settings" style={{ color: 'var(--accent2)' }}>Connect in Settings</Link> to see client correspondence.
        </div>
      )}
      {!loading && state === 'no_whitelist' && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          No institutions configured. <Link href="/settings" style={{ color: 'var(--accent2)' }}>Add them in Settings → Email Hub</Link>.
        </div>
      )}
      {!loading && state === 'error' && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>Failed to load correspondence.</div>
      )}

      {!loading && state === 'ok' && emails.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          No institutional emails found mentioning this client yet.
        </div>
      )}

      {!loading && state === 'ok' && emails.length > 0 && (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
          {emails.map(email => (
            <a
              key={email.id}
              href="/emails"
              style={{ display: 'block', position: 'relative', marginBottom: 14, textDecoration: 'none' }}
            >
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -21, top: 4,
                width: 12, height: 12, borderRadius: '50%',
                background: email.direction === 'outbound' ? 'var(--accent2)' : '#60A5FA',
                border: '2px solid var(--bg)',
              }} />
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px',
                transition: 'border-color 0.15s',
              }}
                onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent2)')}
                onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: email.direction === 'outbound' ? 'var(--accent2)' : 'var(--text)' }}>
                    {email.direction === 'outbound' ? `→ ${email.to.split('@')[0] || 'Institution'}` : email.fromName}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{fmtWhen(email.date)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{email.subject}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.snippet}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'overview' | 'portfolio' | 'networth' | 'insurance' | 'cashflow' | 'correspondence';

export default function ClientDetailPage({ clientId }: { clientId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clients, loading } = useClients();
  const initialTab = (searchParams?.get('tab') as Tab) ?? 'overview';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const client = clients.find(c => c.id === clientId);

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
        Loading client…
      </div>
    );
  }

  if (!client) {
    return (
      <div style={{ padding: '64px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>❓</div>
        <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Client not found</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>This client may have been removed from Notion.</div>
        <button onClick={() => router.back()} style={{ padding: '8px 20px', borderRadius: 'var(--r-pill)', background: 'var(--text)', color: 'var(--bg)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ← Go Back
        </button>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview',       label: 'Overview',       icon: '👤' },
    { id: 'portfolio',      label: 'Portfolio',      icon: '📈' },
    { id: 'networth',       label: 'Net Worth',      icon: '💰' },
    { id: 'insurance',      label: 'Insurance',      icon: '🛡️' },
    { id: 'cashflow',       label: 'Cash Flow',      icon: '💸' },
    { id: 'correspondence', label: 'Correspondence', icon: '✉️' },
  ];

  return (
    <>
      {/* ── Hero header ── */}
      <div className="section" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* Back button */}
          <button
            onClick={() => router.back()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent2)'; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)'; }}
          >
            ← Back
          </button>

          {/* Avatar */}
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0, border: '2px solid var(--accent)33' }}>
            {initials(client.name)}
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span className={`badge ${statusClass(client.status)}`}>{client.status || 'Unknown'}</span>
              {client.segment && <span className={`badge ${segmentClass(client.segment)}`}>{segmentLabel(client.segment)}</span>}
              {client.risk && <span className={`badge ${riskClass(client.risk)}`}>{client.risk}</span>}
            </div>
          </div>

          {/* AUM + next review — right side */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{formatAUM(client.aum)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Next review: <span style={{ fontWeight: 600 }}>{formatDate(client.nextReview)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 'var(--r-pill)',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              background: activeTab === tab.id ? 'var(--text)' : 'transparent',
              color: activeTab === tab.id ? 'var(--bg)' : 'var(--text3)',
              transition: 'all 0.15s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'overview'       && <OverviewTab       client={client} />}
      {activeTab === 'portfolio'      && <PortfolioTab      clientId={client.id} clientName={client.name} />}
      {activeTab === 'networth'       && <NetWorthTab       clientId={client.id} clientName={client.name} />}
      {activeTab === 'insurance'      && <InsuranceTab      clientName={client.name} />}
      {activeTab === 'cashflow'       && <CashflowTab       clientId={client.id} clientName={client.name} />}
      {activeTab === 'correspondence' && <CorrespondenceTab clientName={client.name} />}
    </>
  );
}
