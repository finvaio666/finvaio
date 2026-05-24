'use client';

import { useState, useEffect } from 'react';

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

const BENEFIT_COLORS: Record<string, string> = {
  '🛡️ Life Cover':              '#60A5FA',
  '❤️ Critical Illness (CI)':   '#F87171',
  '🌟 Early CI':                '#FB923C',
  '🏥 Medical':                 '#4ADE80',
  '🦺 Personal Accident':       '#F59E0B',
  '♿ TPD':                     '#A78BFA',
  '⏸️ Waiver of Premium':       '#34D399',
  '👶 Payor Benefit':           '#E879F9',
};
const benefitColor = (b: string) => BENEFIT_COLORS[b] ?? '#9CB8A0';

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

function BenefitPill({ benefit }: { benefit: string }) {
  const color = benefitColor(benefit);
  return (
    <span style={{ padding: '2px 8px', borderRadius: 'var(--r-pill)', fontSize: 10, fontWeight: 600, background: `${color}15`, color, border: `1px solid ${color}30`, whiteSpace: 'nowrap' }}>
      {benefit}
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
  const [filterClient, setFilter] = useState<string | null>(null);
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
  const visible = filterClient === null ? [] : filterClient === 'All'
    ? policies
    : policies.filter(p => p.clientName === filterClient);
  const activePolicies = visible.filter(p => p.status?.includes('Active'));

  const totalSumAssured    = activePolicies.reduce((s, p) => s + p.sumAssured, 0);
  const totalAnnualPremium = activePolicies.reduce((s, p) => s + p.annualPremium, 0);
  const clientsCovered     = new Set(visible.map(p => p.clientName)).size;

  const grouped = (filterClient === 'All' ? clientNames : filterClient ? [filterClient] : []).map(name => ({
    clientName: name,
    policies:   visible.filter(p => p.clientName === name),
    clientData: clients.find(c => c.name === name),
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <select
            value={filterClient ?? ''}
            onChange={e => { setFilter(e.target.value || null); setSearch(''); }}
            style={{
              padding: '10px 36px 10px 18px', borderRadius: 'var(--r-pill)',
              border: `1.5px solid ${filterClient ? 'var(--accent2)' : 'var(--border)'}`,
              background: 'var(--surface)', color: filterClient ? 'var(--text)' : 'var(--text3)',
              fontSize: 14, fontFamily: 'var(--font-sans)', fontWeight: 600,
              cursor: 'pointer', outline: 'none', appearance: 'none',
              boxShadow: 'var(--shadow-sm)', minWidth: 220,
            }}
          >
            <option value=''>— Select a client —</option>
            <option value='All'>All Clients</option>
            {clientNames.map(n => (
              <option key={n} value={n}>{n} ({policies.filter(p => p.clientName === n).length} policies)</option>
            ))}
          </select>
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10, color: 'var(--text3)' }}>▼</span>
        </div>

        {filterClient && (
          <button onClick={() => { setFilter(null); setSearch(''); }} style={{
            padding: '8px 16px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)',
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
          <div style={{ fontSize: 13 }}>Loading from Notion…</div>
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
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Add policies directly in your Notion Insurance database</div>
        </div>
      )}

      {/* ── Policies view ── */}
      {filterClient && !loading && activeView === 'policies' && policies.length > 0 && grouped.map(({ clientName, policies: rows }) => (
        <div key={clientName} className="section" style={{ marginBottom: 12 }}>
          {/* Client header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{initials(clientName)}</div>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', flex: 1 }}>{clientName}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{rows.length} {rows.length === 1 ? 'policy' : 'policies'}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              {fmtK(rows.filter(p => p.status?.includes('Active')).reduce((s, p) => s + p.sumAssured, 0))} assured
            </span>
          </div>

          {/* Column header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 200px 110px 110px 80px', padding: '8px 20px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <div>Policy / Insurer</div>
            <div>Type</div>
            <div>Benefits</div>
            <div style={{ textAlign: 'right' }}>Sum Assured</div>
            <div style={{ textAlign: 'right' }}>Premium/yr</div>
            <div style={{ textAlign: 'right' }}>Status</div>
          </div>

          {rows.map((p, i) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 200px 110px 110px 80px', padding: '13px 20px', alignItems: 'center', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.12s' }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseOut={e => (e.currentTarget.style.background = '')}>
              {/* Policy name */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{p.policyName}</span>
                  {/* Flag when Policy Owner ≠ Life Assured */}
                  {p.lifeAssured && p.policyOwner && p.lifeAssured !== p.policyOwner && (
                    <span style={{ padding: '1px 7px', borderRadius: 'var(--r-pill)', fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: 'var(--gold, #F59E0B)', border: '1px solid rgba(245,158,11,0.3)' }}>
                      Owner ≠ Assured
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {[p.insurer, p.policyNumber].filter(Boolean).join(' · ')}
                  {p.maturityDate && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>⚠️ Matures {new Date(p.maturityDate).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}</span>}
                </div>
                {/* Life Assured & Policy Owner */}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                  {p.lifeAssured && (
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                      🧑 <span style={{ fontWeight: 600, color: 'var(--text2)' }}>Life Assured:</span> {p.lifeAssured}
                    </div>
                  )}
                  {p.policyOwner && (
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                      👤 <span style={{ fontWeight: 600, color: 'var(--text2)' }}>Policy Owner:</span> {p.policyOwner}
                    </div>
                  )}
                </div>
                {p.beneficiary && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>🎯 Beneficiary: {p.beneficiary}</div>}
              </div>

              {/* Type */}
              <div><TypeBadge type={p.insuranceType} /></div>

              {/* Benefits */}
              <div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {p.benefits.length > 0
                    ? p.benefits.map(b => <BenefitPill key={b} benefit={b} />)
                    : <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>}
                </div>
                {/* Per-benefit coverage amounts (shown when filled) */}
                {(p.lifeCover > 0 || p.ciCover > 0 || p.paCover > 0 || p.tpdCover > 0) && (
                  <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {p.lifeCover > 0 && <span>🛡️ {fmtK(p.lifeCover)}</span>}
                    {p.ciCover   > 0 && <span>❤️ {fmtK(p.ciCover)}</span>}
                    {p.paCover   > 0 && <span>🦺 {fmtK(p.paCover)}</span>}
                    {p.tpdCover  > 0 && <span>♿ {fmtK(p.tpdCover)}</span>}
                    {p.medicalClass  && <span>🏥 {p.medicalClass}</span>}
                  </div>
                )}
              </div>

              {/* Sum Assured */}
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>
                {p.sumAssured > 0 ? Math.round(p.sumAssured).toLocaleString() : '—'}
              </div>

              {/* Premium */}
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)', fontSize: 12 }}>
                {p.annualPremium > 0 ? Math.round(p.annualPremium).toLocaleString() : '—'}
              </div>

              {/* Status */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ padding: '3px 9px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 600, background: p.status?.includes('Active') ? 'var(--green-dim)' : 'var(--surface2)', color: p.status?.includes('Active') ? 'var(--green)' : 'var(--text3)' }}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}

          {/* Subtotal */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 200px 110px 110px 80px', padding: '10px 20px', background: 'var(--bg2)', borderTop: '2px solid var(--border)', fontSize: 12, fontWeight: 700, paddingBottom: 20 }}>
            <div style={{ color: 'var(--text3)', fontSize: 11 }}>Subtotal (active)</div>
            <div /><div />
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{Math.round(rows.filter(p => p.status?.includes('Active')).reduce((s, p) => s + p.sumAssured, 0)).toLocaleString()}</div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{Math.round(rows.filter(p => p.status?.includes('Active')).reduce((s, p) => s + p.annualPremium, 0)).toLocaleString()}</div>
            <div />
          </div>
        </div>
      ))}

      {/* ── Coverage Gaps view ── */}
      {filterClient && !loading && activeView === 'gaps' && grouped.map(({ clientName, policies: rows, clientData }) => (
        <CoverageGapCard key={clientName} clientName={clientName} clientData={clientData} policies={rows} />
      ))}
    </>
  );
}
