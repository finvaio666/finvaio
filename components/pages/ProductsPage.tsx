'use client';

import { useState, useEffect } from 'react';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface InsurancePlan {
  id: string;
  name: string;
  insurer: string;
  type: string;
  minAge: number;
  maxAge: number;
  minSumAssured: number;
  maxSumAssured: number;
  estMonthlyPremium: string;
  keyFeatures: string;
  epfApproved: boolean;
  status: string;
}

interface Fund {
  id: string;
  name: string;
  fundHouse: string;
  assetClass: string;
  region: string;
  riskLevel: string;
  return3Y: number;
  minInvestment: number;
  salesCharge: number;
  epfApproved: boolean;
  status: string;
  description: string;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtRM(n: number) {
  if (n >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `RM ${(n / 1_000).toFixed(0)}K`;
  return `RM ${n}`;
}

const RISK_COLORS: Record<string, { bg: string; color: string }> = {
  Conservative: { bg: '#DBEAFE', color: '#1D4ED8' },
  Moderate:     { bg: '#FEF3C7', color: '#92400E' },
  Aggressive:   { bg: '#FCE7F3', color: '#9D174D' },
};

const INS_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  'Life':               { bg: '#DBEAFE', color: '#1D4ED8' },
  'Critical Illness':   { bg: '#FCE7F3', color: '#9D174D' },
  'Medical':            { bg: '#D1FAE5', color: '#065F46' },
  'Investment-Linked':  { bg: '#EDE9FE', color: '#5B21B6' },
  'Takaful':            { bg: '#FEF3C7', color: '#92400E' },
};

const ASSET_COLORS: Record<string, { bg: string; color: string }> = {
  'Equity':        { bg: '#FCE7F3', color: '#9D174D' },
  'Bond':          { bg: '#DBEAFE', color: '#1D4ED8' },
  'Mixed':         { bg: '#EDE9FE', color: '#5B21B6' },
  'Money Market':  { bg: '#D1FAE5', color: '#065F46' },
};

function ColorBadge({ label, map }: { label: string; map: Record<string, { bg: string; color: string }> }) {
  const style = map[label] ?? { bg: 'var(--surface2)', color: 'var(--text3)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, background: style.bg, color: style.color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

/* ── InsurancePlanCard ────────────────────────────────────────────────────── */
function InsurancePlanCard({ plan }: { plan: InsurancePlan }) {
  const [open, setOpen] = useState(false);
  const features = plan.keyFeatures.split('·').map(f => f.trim()).filter(Boolean);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r)',
      padding: '18px 20px',
      cursor: 'pointer',
      transition: 'box-shadow 0.15s, border-color 0.15s',
    }}
      onClick={() => setOpen(o => !o)}
      onMouseOver={e  => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.borderColor = 'var(--accent2)'; }}
      onMouseOut={e   => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>{plan.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ColorBadge label={plan.type} map={INS_TYPE_COLORS} />
            <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
              🏢 {plan.insurer}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
              👤 Age {plan.minAge}–{plan.maxAge}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent2)' }}>{plan.estMonthlyPremium}/mo</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
            {fmtRM(plan.minSumAssured)}–{fmtRM(plan.maxSumAssured)}
          </div>
        </div>
      </div>

      {/* Expanded features */}
      {open && features.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Key Features</div>
          <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {features.map((f, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand hint */}
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
        {open ? '▲ Less' : '▼ Key features'}
      </div>
    </div>
  );
}

/* ── FundCard ─────────────────────────────────────────────────────────────── */
function FundCard({ fund }: { fund: Fund }) {
  const [open, setOpen] = useState(false);
  const returnColor = fund.return3Y >= 10 ? 'var(--green)' : fund.return3Y >= 5 ? 'var(--accent2)' : 'var(--text3)';

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r)',
      padding: '18px 20px',
      cursor: 'pointer',
      transition: 'box-shadow 0.15s, border-color 0.15s',
    }}
      onClick={() => setOpen(o => !o)}
      onMouseOver={e  => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.borderColor = 'var(--accent2)'; }}
      onMouseOut={e   => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>{fund.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ColorBadge label={fund.assetClass} map={ASSET_COLORS} />
            <ColorBadge label={fund.riskLevel} map={RISK_COLORS} />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>🏢 {fund.fundHouse}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>🌏 {fund.region}</span>
            {fund.epfApproved && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#065F46', background: '#D1FAE5', padding: '1px 7px', borderRadius: 99 }}>✓ EPF</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: returnColor }}>
            {fund.return3Y > 0 ? `+${fund.return3Y}%` : `${fund.return3Y}%`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>3Y p.a.</div>
        </div>
      </div>

      {/* Expanded details */}
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 20px' }}>
          {fund.description && (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 4 }}>
              {fund.description}
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Min Investment</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>RM {fund.minInvestment.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Sales Charge</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fund.salesCharge}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>EPF Approved</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: fund.epfApproved ? 'var(--green)' : 'var(--text3)' }}>
              {fund.epfApproved ? '✓ Yes' : '✗ No'}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
        {open ? '▲ Less' : '▼ Details'}
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function ProductsPage() {
  const [tab, setTab]   = useState<'insurance' | 'funds'>('insurance');
  const [plans,  setPlans]  = useState<InsurancePlan[]>([]);
  const [funds,  setFunds]  = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]  = useState('');
  const [authorized, setAuthorized] = useState<boolean | null>(null); // null = checking

  const [insFilter, setInsFilter] = useState('All');
  const [fundFilter, setFundFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [epfOnly, setEpfOnly] = useState(false);

  useEffect(() => {
    // Check feature access before loading product data
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        const hasAccess = Array.isArray(d.features) && d.features.includes('products');
        setAuthorized(hasAccess);
        if (!hasAccess) { setLoading(false); return; }

        return Promise.all([
          fetch('/api/notion?type=insurance-products', { cache: 'no-store' }).then(r => r.json()),
          fetch('/api/notion?type=funds',              { cache: 'no-store' }).then(r => r.json()),
        ]).then(([ins, fnd]) => {
          setPlans(ins.data ?? []);
          setFunds(fnd.data ?? []);
        });
      })
      .catch(() => { setAuthorized(false); })
      .finally(() => setLoading(false));
  }, []);

  // ── Not authorized ────────────────────────────────────────────────────────
  if (authorized === false) {
    return (
      <div className="section" style={{ padding: '80px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          Feature Not Available
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 340, margin: '0 auto', lineHeight: 1.7 }}>
          The Product Catalogue is not enabled for your account.
          Please contact your administrator to request access.
        </div>
      </div>
    );
  }

  // Derived filter lists
  const insTypes  = ['All', ...Array.from(new Set(plans.map(p => p.type))).sort()];
  const fundTypes = ['All', ...Array.from(new Set(funds.map(f => f.assetClass))).sort()];
  const riskLevels = ['All', 'Conservative', 'Moderate', 'Aggressive'];

  const filteredPlans = plans.filter(p => {
    if (insFilter !== 'All' && p.type !== insFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.insurer.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredFunds = funds.filter(f => {
    if (fundFilter !== 'All' && f.assetClass !== fundFilter) return false;
    if (riskFilter !== 'All' && f.riskLevel !== riskFilter) return false;
    if (epfOnly && !f.epfApproved) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) &&
        !f.fundHouse.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const chipStyle = (active: boolean) => ({
    padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
    border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
    background: active ? 'var(--text)' : 'var(--surface)',
    color: active ? 'var(--bg)' : 'var(--text3)',
    borderColor: active ? 'var(--text)' : 'var(--border)',
  });

  return (
    <>
      {/* ── Header ── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--accent2)' }} />
            Product Catalogue
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading ? (
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                {plans.length} plans · {funds.length} funds
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 20px', lineHeight: 1.6 }}>
          Browse available insurance plans and investment funds. Use the filters to find products that match your client's profile.
          Products are managed in ARIA — contact your administrator to add or update listings.
        </p>

        {/* Search bar */}
        <input
          type="text"
          placeholder={tab === 'insurance' ? 'Search plans or insurer…' : 'Search funds or fund house…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', boxSizing: 'border-box',
            border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)',
            background: 'var(--bg)', color: 'var(--text)',
            fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
            marginBottom: 16,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent2)')}
          onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
        />

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button style={chipStyle(tab === 'insurance')} onClick={() => { setTab('insurance'); setSearch(''); }}>
            🛡️ Insurance Plans ({plans.length})
          </button>
          <button style={chipStyle(tab === 'funds')} onClick={() => { setTab('funds'); setSearch(''); }}>
            📈 Investment Funds ({funds.length})
          </button>
        </div>

        {/* ── Insurance filters ── */}
        {tab === 'insurance' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {insTypes.map(t => (
              <button key={t} style={chipStyle(insFilter === t)} onClick={() => setInsFilter(t)}>{t}</button>
            ))}
          </div>
        )}

        {/* ── Funds filters ── */}
        {tab === 'funds' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', alignSelf: 'center', marginRight: 4 }}>Asset Class</span>
              {fundTypes.map(t => (
                <button key={t} style={chipStyle(fundFilter === t)} onClick={() => setFundFilter(t)}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', alignSelf: 'center', marginRight: 4 }}>Risk</span>
              {riskLevels.map(r => (
                <button key={r} style={chipStyle(riskFilter === r)} onClick={() => setRiskFilter(r)}>{r}</button>
              ))}
              <button
                style={{
                  ...chipStyle(epfOnly),
                  background: epfOnly ? '#D1FAE5' : 'var(--surface)',
                  color: epfOnly ? '#065F46' : 'var(--text3)',
                  borderColor: epfOnly ? '#6EE7B7' : 'var(--border)',
                }}
                onClick={() => setEpfOnly(o => !o)}
              >
                ✓ EPF Only
              </button>
            </div>
          </div>
        )}

        {/* ── Grid ── */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : tab === 'insurance' ? (
          filteredPlans.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No plans match your filter.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {filteredPlans.map(p => <InsurancePlanCard key={p.id} plan={p} />)}
            </div>
          )
        ) : (
          filteredFunds.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No funds match your filter.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {filteredFunds.map(f => <FundCard key={f.id} fund={f} />)}
            </div>
          )
        )}
      </div>

      {/* ── Setup guide (shown if no data from Notion) ── */}
      {!loading && tab === 'insurance' && plans.length === 0 && (
        <div className="section" style={{ borderLeft: '3px solid var(--accent2)', paddingLeft: 20 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            🗂️ Set up your Insurance Plans database
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
            Create a Notion database called <strong>Insurance Products</strong> with these fields:<br />
            <code style={{ fontSize: 11, background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>
              Name (Title) · Insurer (Select) · Type (Select) · Min Age · Max Age · Min Sum Assured · Max Sum Assured · Est Monthly Premium (Text) · Key Features (Text) · Status (Select: Active)
            </code><br />
            Then add the DB ID to your ARIA advisor settings as <strong>Insurance Plans DB ID</strong>.
          </div>
        </div>
      )}

      {!loading && tab === 'funds' && funds.length === 0 && (
        <div className="section" style={{ borderLeft: '3px solid var(--accent2)', paddingLeft: 20 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            🗂️ Set up your Funds database
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
            Create a Notion database called <strong>Investment Funds</strong> with these fields:<br />
            <code style={{ fontSize: 11, background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>
              Name (Title) · Fund House (Select) · Asset Class (Select) · Region (Select) · Risk Level (Select) · 3Y Return % (Number) · Min Investment (Number) · Sales Charge % (Number) · EPF Approved (Checkbox) · Description (Text) · Status (Select: Active)
            </code><br />
            Then add the DB ID to your ARIA advisor settings as <strong>Funds DB ID</strong>.
          </div>
        </div>
      )}
    </>
  );
}
