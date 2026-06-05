'use client';

import { useState, useEffect } from 'react';
import ClientSearchCombobox from '@/components/ClientSearchCombobox';

interface Policy {
  id: string;
  policyName: string;
  clientName: string;
  clientIncome: number;
  insuranceType: string;
  benefits: string[];
  status: string;
  insurer: string;
  policyNumber: string;
  sumAssured: number;
  annualPremium: number;
  commencementDate: string;
  maturityDate: string;
  beneficiary: string;
  notes: string;
  lifeCover:    number;
  ciCover:      number;
  paCover:      number;
  tpdCover:     number;
  medicalClass: string;
  policyOwner:  string;
  lifeAssured:  string;
}

interface ClientData {
  id: string;
  name: string;
  income: number;
  aum: number;
}

// ── Colors ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  'ILP':       '#60A5FA',
  'IUL':       '#818CF8',
  'UL':        '#A78BFA',
  'VUL':       '#F59E0B',
  'Term Life': '#4ADE80',
  'Endowment': '#34D399',
};
const typeColor = (t: string) => {
  const key = Object.keys(TYPE_COLORS).find(k => t?.includes(k));
  return key ? TYPE_COLORS[key] : '#9CB8A0';
};

// Coverage gap rules — keys match actual Notion benefit names
const COVERAGE_RULES = [
  { key: '🛡️ Life Cover',            label: '🛡️ Life Cover',         rec: (income: number) => income * 10, desc: 'Recommended: 10× annual income' },
  { key: '🏥 Medical',               label: '🏥 Medical',             rec: () => 0,                        desc: 'Should have active medical cover' },
  { key: '❤️ Critical Illness (CI)', label: '❤️ Critical Illness',    rec: (income: number) => income * 5,  desc: 'Recommended: 5× annual income' },
  { key: '🦺 Personal Accident',     label: '🦺 Personal Accident',   rec: (income: number) => income * 3,  desc: 'Recommended: 3× annual income' },
];

const fmtK = (n: number) => n >= 1_000_000 ? `RM ${(n/1_000_000).toFixed(2)}M` : n >= 1000 ? `RM ${(n/1000).toFixed(1)}K` : `RM ${Math.round(n).toLocaleString()}`;
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// ── Badge components ─────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const color = typeColor(type);
  return (
    <span style={{ padding: '3px 10px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}33`, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
      {type}
    </span>
  );
}

// ── Coverage gap card ────────────────────────────────────────────────────────

function CoverageGapCard({ clientName, clientData, policies }: {
  clientName: string;
  clientData: ClientData | undefined;
  policies: Policy[];
}) {
  const income = (clientData?.income ?? 0) * 12;
  const activePolicies = policies.filter(p => p.status?.includes('Active'));

  const hasBenefit = (key: string) => activePolicies.some(p => p.benefits.includes(key));

  // Map each benefit key to the specific coverage field
  const coverField: Record<string, keyof Policy> = {
    '🛡️ Life Cover':             'lifeCover',
    '❤️ Critical Illness (CI)':  'ciCover',
    '🦺 Personal Accident':      'paCover',
    '♿ TPD':                     'tpdCover',
  };

  const sumForBenefit = (key: string) => {
    const field = coverField[key];
    if (!field) return 0;
    return activePolicies
      .filter(p => p.benefits.includes(key))
      .reduce((s, p) => s + ((p[field] as number) || 0), 0);
  };

  // True if all specific coverage amounts are still 0 (data not yet filled)
  const coverageNotFilled = activePolicies.every(
    p => p.lifeCover === 0 && p.ciCover === 0 && p.paCover === 0 && p.tpdCover === 0
  );

  const gaps = COVERAGE_RULES.map(rule => {
    const has = hasBenefit(rule.key);
    const current = sumForBenefit(rule.key);
    const recommended = rule.rec(income);
    const isMedical = rule.key === '🏥 Medical';
    const adequate = isMedical ? has : (has && (recommended === 0 || current >= recommended * 0.8));
    return { ...rule, has, current, recommended, adequate };
  });

  const totalPremium = activePolicies.reduce((s, p) => s + p.annualPremium, 0);
  const premiumRatio = income > 0 ? ((totalPremium / income) * 100).toFixed(1) : '—';
  const gapCount = gaps.filter(g => !g.adequate).length;

  return (
    <div className="section" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
          {initials(clientName)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{clientName}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            Annual income {income > 0 ? fmtK(income) : '—'} · Premium {fmtK(totalPremium)}/yr
            {income > 0 && <span style={{ marginLeft: 6, color: Number(premiumRatio) > 15 ? 'var(--red)' : 'var(--green)' }}>({premiumRatio}% of income)</span>}
          </div>
        </div>
        {gapCount === 0
          ? <span style={{ padding: '4px 14px', borderRadius: 'var(--r-pill)', background: 'var(--green-dim)', color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>✓ Well covered</span>
          : <span style={{ padding: '4px 14px', borderRadius: 'var(--r-pill)', background: 'var(--red-dim)', color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>⚠️ {gapCount} gap{gapCount > 1 ? 's' : ''}</span>
        }
      </div>

      {coverageNotFilled && (
        <div style={{ margin: '0 20px 0', padding: '8px 14px', background: 'var(--gold-dim, #FEF3C720)', border: '1px solid var(--gold, #F59E0B)44', borderRadius: 8, fontSize: 11, color: 'var(--gold, #F59E0B)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>⚠️</span>
          <span>Individual coverage amounts not filled yet — fill in the update template and import to get accurate gap analysis.</span>
        </div>
      )}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
        {gaps.map(g => {
          const isMedical = g.key === '🏥 Medical';
          const medClass = isMedical
            ? activePolicies.filter(p => p.benefits.includes(g.key)).map(p => p.medicalClass).filter(Boolean).join(', ')
            : '';
          return (
            <div key={g.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 180px 36px', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{g.label}</div>
              <div>
                {g.recommended > 0 ? (
                  <div>
                    <div style={{ position: 'relative', height: 8, borderRadius: 'var(--r-pill)', background: 'var(--surface2)', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 'var(--r-pill)', background: g.adequate ? 'var(--green)' : coverageNotFilled ? 'var(--gold, #F59E0B)' : 'var(--red)', width: coverageNotFilled ? 0 : `${Math.min((g.current / (g.recommended || 1)) * 100, 100)}%`, transition: 'width 0.4s' }} />
                      <div style={{ position: 'absolute', left: '80%', top: 0, width: 2, height: '100%', background: 'var(--text)', opacity: 0.2 }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>{g.desc}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>{g.desc}</div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {isMedical
                  ? g.has
                    ? <span style={{ color: 'var(--green)' }}>✓ {medClass || 'Active policy'}</span>
                    : <span style={{ color: 'var(--red)' }}>Not covered</span>
                  : coverageNotFilled
                    ? <span style={{ color: 'var(--gold, #F59E0B)', fontStyle: 'italic' }}>Amounts pending</span>
                    : g.recommended > 0
                      ? `${fmtK(g.current)} / ${fmtK(g.recommended)}`
                      : g.has ? '✓ Active' : 'Not covered'}
              </div>
              <div style={{ textAlign: 'center', fontSize: 14 }}>
                {isMedical || !coverageNotFilled
                  ? g.adequate
                    ? <span style={{ color: 'var(--green)' }}>✓</span>
                    : <span style={{ color: 'var(--red)' }}>⚠️</span>
                  : <span style={{ color: 'var(--gold, #F59E0B)' }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [clients,  setClients]  = useState<ClientData[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filterClientId, setFilterId] = useState<string>('');   // '' = none, 'All' = all, id = specific
  const [activeView, setView]   = useState<'policies' | 'gaps'>('policies');
  const [search, setSearch]     = useState('');

  const loadData = () => {
    setLoading(true);
    setLoadError('');
    Promise.all([
      fetch('/api/notion?type=insurance', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/notion?type=clients',   { cache: 'no-store' }).then(r => r.json()),
    ]).then(([ins, cli]) => {
      if (ins.data) setPolicies(ins.data);
      else if (ins.error) setLoadError(ins.error);
      if (cli.data) setClients(cli.data);
    }).catch(e => setLoadError(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const clientNames = Array.from(new Set(policies.map(p => p.clientName).filter(Boolean))).sort();

  // Derive name from id for filtering (policies only have clientName)
  const filterClient: string | null = filterClientId === ''
    ? null
    : filterClientId === 'All'
    ? 'All'
    : clients.find(c => c.id === filterClientId)?.name ?? null;

  // The Policy Owner is who the policies are categorised under. Fall back to the
  // linked client when no owner is recorded.
  const ownerOf = (p: Policy) => (p.policyOwner || '').trim() || p.clientName;

  const visible = filterClient === null ? [] : filterClient === 'All'
    ? policies
    : policies.filter(p => p.clientName === filterClient || ownerOf(p) === filterClient);
  const activePolicies = visible.filter(p => p.status?.includes('Active'));

  const totalSumAssured    = activePolicies.reduce((s, p) => s + p.sumAssured, 0);
  const totalAnnualPremium = activePolicies.reduce((s, p) => s + p.annualPremium, 0);
  const clientsCovered     = new Set(visible.map(ownerOf)).size;

  // Group by Policy Owner (each owner can hold policies for several Life Assured)
  const ownerKeys = Array.from(new Set(visible.map(ownerOf).filter(Boolean))).sort();
  const grouped = ownerKeys.map(owner => ({
    clientName: owner,
    policies:   visible.filter(p => ownerOf(p) === owner),
    clientData: clients.find(c => c.name === owner),
  }));

  const coverFieldMap: Record<string, keyof Policy> = {
    '🛡️ Life Cover':            'lifeCover',
    '❤️ Critical Illness (CI)': 'ciCover',
    '🦺 Personal Accident':     'paCover',
    '♿ TPD':                    'tpdCover',
  };

  const gapCount = grouped.reduce((count, g) => {
    const income = (g.clientData?.income ?? 0) * 12;
    const active = g.policies.filter(p => p.status?.includes('Active'));
    const allZero = active.every(p => p.lifeCover === 0 && p.ciCover === 0 && p.paCover === 0 && p.tpdCover === 0);
    const hasGap = COVERAGE_RULES.some(rule => {
      const has = active.some(p => p.benefits.includes(rule.key));
      if (rule.key === '🏥 Medical') return !has;
      if (allZero) return false; // can't assess without amounts
      const field = coverFieldMap[rule.key];
      const sum = field ? active.filter(p => p.benefits.includes(rule.key)).reduce((s, p) => s + ((p[field] as number) || 0), 0) : 0;
      const rec = rule.rec(income);
      return !has || (rec > 0 && sum < rec * 0.8);
    });
    return count + (hasGap ? 1 : 0);
  }, 0);

  return (
    <>
      {/* ── Client selector ── always visible at top ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 300 }}>
          <ClientSearchCombobox
            clients={clients}
            value={filterClientId === 'All' ? '' : filterClientId}
            onChange={c => { setFilterId(c?.id ?? ''); setSearch(''); }}
            placeholder="Search client…"
          />
        </div>

        {/* All Clients toggle */}
        <button
          onClick={() => { setFilterId(filterClientId === 'All' ? '' : 'All'); setSearch(''); }}
          style={{
            padding: '9px 16px', borderRadius: 'var(--r-pill)', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
            border: `1.5px solid ${filterClientId === 'All' ? 'var(--accent2)' : 'var(--border)'}`,
            background: filterClientId === 'All' ? 'var(--accent2)' : 'var(--surface)',
            color: filterClientId === 'All' ? '#fff' : 'var(--text3)',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
        >
          👥 All Clients
        </button>

        {filterClientId && filterClientId !== 'All' && (
          <button onClick={() => { setFilterId(''); setSearch(''); }} style={{
            padding: '8px 14px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)',
            background: 'var(--surface2)', color: 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>✕ Clear</button>
        )}
      </div>

      {/* ── Empty state — no client selected ── */}
      {!filterClient && !loading && (
        <div className="section" style={{ padding: '64px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🛡️</div>
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Select a client to view their insurance</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Choose a client from the dropdown above to see their policies and coverage gap analysis.</div>
        </div>
      )}

      {/* ── Stat cards — only when client selected ── */}
      {filterClient && <div className="stat-grid">
        <div className="stat-card blue">
          <div className="stat-icon blue">🛡️</div>
          <div className="stat-label">Clients Covered</div>
          <div className="stat-value">{loading ? '…' : clientsCovered}</div>
          <div className="stat-sub">{activePolicies.length} active policies</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon green">💰</div>
          <div className="stat-label">Total Sum Assured</div>
          <div className="stat-value">{loading ? '…' : fmtK(totalSumAssured)}</div>
          <div className="stat-sub">Active policies only</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">📋</div>
          <div className="stat-label">Annual Premium</div>
          <div className="stat-value">{loading ? '…' : fmtK(totalAnnualPremium)}</div>
          <div className="stat-sub">{fmtK(Math.round(totalAnnualPremium / 12))}/month</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">⚠️</div>
          <div className="stat-label">Coverage Gaps</div>
          <div className="stat-value">{loading ? '…' : gapCount}</div>
          <div className="stat-sub">Clients with under-coverage</div>
        </div>
      </div>}

      {/* ── View toggle — only when client selected ── */}
      {filterClient && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: 3, gap: 2 }}>
          {(['policies', 'gaps'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 16px', borderRadius: 'var(--r-pill)', border: 'none', cursor: 'pointer',
              background: activeView === v ? 'var(--text)' : 'transparent',
              color: activeView === v ? 'var(--bg)' : 'var(--text3)',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
            }}>
              {v === 'policies' ? '📋 Policies' : '⚠️ Coverage Gaps'}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* ── Loading / error / no policies ── */}
      {filterClient && loading && (
        <div className="section" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 13 }}>Loading…</div>
          <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text3)' }}>This may take a few seconds</div>
        </div>
      )}
      {filterClient && !loading && loadError && (
        <div className="section" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>⚠️ {loadError}</div>
          <button onClick={loadData} style={{ padding: '8px 20px', borderRadius: 'var(--r-pill)', background: 'var(--accent2)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🔄 Retry
          </button>
        </div>
      )}
      {filterClient && !loading && policies.length === 0 && (
        <div className="section" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🛡️</div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No insurance policies yet</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Add policies directly in ARIA to get started</div>
        </div>
      )}

      {/* ── Policies view ── */}
      {filterClient && !loading && activeView === 'policies' && policies.length > 0 && grouped.map(({ clientName, policies: rows }) => (
        <div key={clientName} className="section" style={{ marginBottom: 12 }}>
          {/* Policy Owner header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{initials(clientName)}</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{clientName}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>👤 Policy Owner</span>
              {(() => {
                const lives = Array.from(new Set(rows.map(p => (p.lifeAssured || '').trim()).filter(Boolean)));
                return lives.length > 0 ? <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Insuring: {lives.join(', ')}</div> : null;
              })()}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{rows.length} {rows.length === 1 ? 'policy' : 'policies'}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              {fmtK(rows.filter(p => p.status?.includes('Active')).reduce((s, p) => s + p.sumAssured, 0))} assured
            </span>
          </div>

          {/* Column header — same grid as data rows and subtotal */}
          {(() => {
            const COLS = '2fr 120px 105px 95px 95px 90px 64px';
            const MIN_W = 860;
            const activeRows = rows.filter(p => p.status?.includes('Active'));
            // Life and TPD are typically the same as the Sum Assured — show in one column
            const lifeTpd  = (p: Policy) => p.lifeCover || p.tpdCover || p.sumAssured;
            const fmtCover = (n: number) =>
              n <= 0 ? '—'
              : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
              : n >= 1000 ? `${Math.round(n / 1000)}K`
              : Math.round(n).toLocaleString();
            const colNum = (val: number, strong = false): React.CSSProperties => ({
              textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, paddingTop: 2,
              fontWeight: strong ? 600 : 500,
              color: val > 0 ? 'var(--text)' : 'var(--text3)',
            });
            return (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: MIN_W }}>
                <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 20px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <div>Policy / Insurer</div>
                  <div>Type</div>
                  <div style={{ textAlign: 'right' }}>Life / TPD</div>
                  <div style={{ textAlign: 'right' }}>CI</div>
                  <div style={{ textAlign: 'right' }}>Accident</div>
                  <div style={{ textAlign: 'right' }}>Premium/yr</div>
                  <div style={{ textAlign: 'right' }}>Status</div>
                </div>

                {rows.map((p, i) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '13px 20px', alignItems: 'start', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.12s' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseOut={e => (e.currentTarget.style.background = '')}>

                    {/* Policy name */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{p.policyName}</span>
                        {/* Life Assured badge — who this specific policy insures */}
                        {p.lifeAssured && (
                          <span style={{ padding: '1px 8px', borderRadius: 'var(--r-pill)', fontSize: 10, fontWeight: 700, background: 'rgba(96,165,250,0.14)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.3)', whiteSpace: 'nowrap' }}>
                            🧑 Life Assured: {p.lifeAssured}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {[p.insurer, p.policyNumber].filter(Boolean).join(' · ')}
                        {p.medicalClass && <span style={{ marginLeft: 6 }}>🏥 {p.medicalClass}</span>}
                        {p.maturityDate && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>⚠️ Matures {new Date(p.maturityDate).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}</span>}
                      </div>
                      {p.beneficiary && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>🎯 Beneficiary: {p.beneficiary}</div>}
                    </div>

                    {/* Type */}
                    <div style={{ overflow: 'hidden', paddingTop: 2 }}>
                      <TypeBadge type={p.insuranceType} />
                    </div>

                    {/* Life / TPD (= Sum Assured) */}
                    <div style={colNum(lifeTpd(p), true)}>{fmtCover(lifeTpd(p))}</div>

                    {/* CI */}
                    <div style={colNum(p.ciCover)}>{fmtCover(p.ciCover)}</div>

                    {/* Accident (PA) */}
                    <div style={colNum(p.paCover)}>{fmtCover(p.paCover)}</div>

                    {/* Premium/yr */}
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)', fontSize: 12, paddingTop: 2 }}>
                      {p.annualPremium > 0 ? Math.round(p.annualPremium).toLocaleString() : '—'}
                    </div>

                    {/* Status */}
                    <div style={{ textAlign: 'right', paddingTop: 2 }}>
                      <span style={{ padding: '3px 9px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 600, background: p.status?.includes('Active') ? 'var(--green-dim)' : 'var(--surface2)', color: p.status?.includes('Active') ? 'var(--green)' : 'var(--text3)' }}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Subtotal — same COLS so totals align under each coverage column */}
                <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '10px 20px 18px', background: 'var(--bg2)', borderTop: '2px solid var(--border)' }}>
                  <div style={{ color: 'var(--text3)', fontSize: 11, fontWeight: 600 }}>Subtotal (active)</div>
                  <div />
                  <div style={{ ...colNum(1, true), fontWeight: 700 }}>{fmtCover(activeRows.reduce((s, p) => s + lifeTpd(p), 0))}</div>
                  <div style={{ ...colNum(activeRows.reduce((s, p) => s + p.ciCover, 0), true), fontWeight: 700 }}>{fmtCover(activeRows.reduce((s, p) => s + p.ciCover, 0))}</div>
                  <div style={{ ...colNum(activeRows.reduce((s, p) => s + p.paCover, 0), true), fontWeight: 700 }}>{fmtCover(activeRows.reduce((s, p) => s + p.paCover, 0))}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--text3)' }}>
                    {Math.round(activeRows.reduce((s, p) => s + p.annualPremium, 0)).toLocaleString()}
                  </div>
                  <div />
                </div>
              </div>
              </div>
            );
          })()}
        </div>
      ))}

      {/* ── Coverage Gaps view ── */}
      {filterClient && !loading && activeView === 'gaps' && grouped.map(({ clientName, policies: rows, clientData }) => (
        <CoverageGapCard key={clientName} clientName={clientName} clientData={clientData} policies={rows} />
      ))}
    </>
  );
}
