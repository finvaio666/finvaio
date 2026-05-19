'use client';

import { useState, useEffect } from 'react';

interface Holding {
  id: string;
  name: string;
  clientName: string;
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
}

const CCY_COLORS: Record<string, string> = {
  MYR: '#4ADE80', USD: '#60A5FA', SGD: '#F59E0B',
  GBP: '#A78BFA', EUR: '#F87171', AUD: '#34D399', HKD: '#FB923C',
};
const ASSET_COLORS: Record<string, string> = {
  'EPF': '#4ADE80', 'Unit Trust': '#60A5FA',
  'Fixed Deposit': '#F59E0B', 'Stocks': '#A78BFA', 'Bonds': '#F87171',
  'Money Market': '#34D399', 'PRS': '#818CF8',
};
const ccyColor  = (c: string) => CCY_COLORS[c]  ?? '#9CB8A0';
const assetColor = (a: string) => ASSET_COLORS[a] ?? '#9CB8A0';

const fmt  = (n: number) => 'RM ' + Math.round(n).toLocaleString();
const fmtK = (n: number) => n >= 1_000_000 ? `RM ${(n/1_000_000).toFixed(2)}M` : n >= 1000 ? `RM ${(n/1000).toFixed(1)}K` : `RM ${n}`;
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function CcyBadge({ currency }: { currency: string }) {
  if (!currency || currency === 'MYR') return null;
  return (
    <span style={{
      padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      fontFamily: 'var(--font-mono)', background: `${ccyColor(currency)}22`,
      color: ccyColor(currency), border: `1px solid ${ccyColor(currency)}44`, marginLeft: 5,
    }}>{currency}</span>
  );
}

function AssetBadge({ assetClass }: { assetClass: string }) {
  if (!assetClass) return null;
  const color = assetColor(assetClass);
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 'var(--r-pill)', fontSize: 10, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}33`,
    }}>{assetClass}</span>
  );
}

// ── Client group card ────────────────────────────────────────────────────────

function ClientGroup({ clientName, holdings, defaultOpen }: {
  clientName: string;
  holdings: Holding[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const totalValue    = holdings.reduce((s, h) => s + h.value, 0);
  const totalPurchase = holdings.reduce((s, h) => s + h.purchase, 0);
  const totalGain     = totalValue - totalPurchase;
  const avgReturn     = totalPurchase > 0 ? ((totalGain / totalPurchase) * 100).toFixed(1) : '0.0';
  const isPos         = totalGain >= 0;

  // Asset class breakdown for mini pills
  const assetBreakdown = holdings.reduce<Record<string, number>>((acc, h) => {
    acc[h.assetClass] = (acc[h.assetClass] ?? 0) + h.value;
    return acc;
  }, {});

  return (
    <div className="section" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
      {/* Client header — click to expand/collapse */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
          cursor: 'pointer', userSelect: 'none',
          background: open ? 'var(--surface)' : 'var(--surface)',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          transition: 'background 0.15s',
        }}
        onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
        onMouseOut={e => (e.currentTarget.style.background = 'var(--surface)')}
      >
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: 'var(--accent-dim)', color: 'var(--accent2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 13,
        }}>{initials(clientName)}</div>

        {/* Name + asset pills */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 5 }}>
            {clientName}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {Object.entries(assetBreakdown).map(([cls]) => (
              <AssetBadge key={cls} assetClass={cls} />
            ))}
          </div>
        </div>

        {/* Summary numbers */}
        <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
            {fmtK(totalValue)}
          </div>
          <div style={{ fontSize: 11, color: isPos ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {isPos ? '+' : ''}{fmtK(totalGain)} ({isPos ? '+' : ''}{avgReturn}%)
          </div>
        </div>

        {/* Holdings count */}
        <div style={{ textAlign: 'center', flexShrink: 0, width: 48 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{holdings.length}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>holdings</div>
        </div>

        {/* Chevron */}
        <div style={{ color: 'var(--text3)', fontSize: 12, flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</div>
      </div>

      {/* Holdings table */}
      {open && (
        <div>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 130px 130px 90px 80px',
            padding: '8px 20px', fontSize: 11, fontWeight: 600,
            color: 'var(--text3)', borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)',
          }}>
            <div>Holding</div>
            <div style={{ textAlign: 'right' }}>Value (MYR)</div>
            <div style={{ textAlign: 'right' }}>Purchase (MYR)</div>
            <div style={{ textAlign: 'right' }}>Gain/Loss</div>
            <div style={{ textAlign: 'right' }}>Return</div>
          </div>

          {holdings.map((h, i) => (
            <div key={h.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 130px 130px 90px 80px',
              padding: '12px 20px', fontSize: 13,
              borderBottom: i < holdings.length - 1 ? '1px solid var(--border)' : 'none',
              transition: 'background 0.12s',
            }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseOut={e => (e.currentTarget.style.background = '')}
            >
              {/* Holding name */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontWeight: 500, color: 'var(--text)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: assetColor(h.assetClass), flexShrink: 0 }} />
                  {h.name}
                  <CcyBadge currency={h.currency} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, paddingLeft: 10 }}>
                  {h.institution && <span>{h.institution}</span>}
                  {h.institution && h.assetClass && <span> · </span>}
                  {h.assetClass && <span>{h.assetClass}</span>}
                  {h.maturity && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>⚠️ Matures {new Date(h.maturity).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}</span>}
                </div>
                {h.currency && h.currency !== 'MYR' && h.valueOrig > 0 && (
                  <div style={{ fontSize: 10, color: ccyColor(h.currency), fontFamily: 'var(--font-mono)', marginTop: 2, paddingLeft: 10 }}>
                    {h.currency} {h.valueOrig.toLocaleString()} @ {h.fxRate.toFixed(4)}
                  </div>
                )}
              </div>

              {/* Value */}
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text)', alignSelf: 'center' }}>
                {Math.round(h.value).toLocaleString()}
              </div>

              {/* Purchase */}
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)', alignSelf: 'center' }}>
                {Math.round(h.purchase).toLocaleString()}
              </div>

              {/* Gain/Loss */}
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: h.gain >= 0 ? 'var(--green)' : 'var(--red)', alignSelf: 'center', fontSize: 12 }}>
                {h.gain >= 0 ? '+' : ''}{Math.round(h.gain).toLocaleString()}
              </div>

              {/* Return % */}
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: h.returnPct >= 0 ? 'var(--green)' : 'var(--red)', alignSelf: 'center', fontSize: 12 }}>
                {h.returnPct >= 0 ? '+' : ''}{h.returnPct}%
              </div>
            </div>
          ))}

          {/* Client subtotal */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 130px 130px 90px 80px',
            padding: '10px 20px', background: 'var(--bg2)',
            borderTop: '2px solid var(--border)', fontSize: 12, fontWeight: 700,
          }}>
            <div style={{ color: 'var(--text3)' }}>Subtotal · {holdings.length} holdings</div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{Math.round(totalValue).toLocaleString()}</div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{Math.round(totalPurchase).toLocaleString()}</div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: isPos ? 'var(--green)' : 'var(--red)' }}>{isPos ? '+' : ''}{Math.round(totalGain).toLocaleString()}</div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: isPos ? 'var(--green)' : 'var(--red)' }}>{isPos ? '+' : ''}{avgReturn}%</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [holdings, setHoldings]   = useState<Holding[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterClient, setFilter] = useState<string>('All');

  useEffect(() => {
    fetch('/api/notion?type=portfolio', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.data) setHoldings(json.data); })
      .finally(() => setLoading(false));
  }, []);

  // Group by client
  const clientNames = ['All', ...Array.from(new Set(holdings.map(h => h.clientName || 'Unknown'))).sort()];
  const filtered = filterClient === 'All' ? holdings : holdings.filter(h => h.clientName === filterClient);

  const groups = filtered.reduce<Record<string, Holding[]>>((acc, h) => {
    const key = h.clientName || 'Unknown';
    acc[key] = acc[key] ?? [];
    acc[key].push(h);
    return acc;
  }, {});

  const totalValue    = filtered.reduce((s, h) => s + h.value, 0);
  const totalPurchase = filtered.reduce((s, h) => s + h.purchase, 0);
  const totalGain     = totalValue - totalPurchase;
  const avgReturn     = totalPurchase > 0 ? Math.round((totalGain / totalPurchase) * 100) : 0;
  const foreignCount  = holdings.filter(h => h.currency && h.currency !== 'MYR').length;
  const currencies    = [...new Set(holdings.map(h => h.currency || 'MYR'))];

  // Asset class breakdown across all holdings
  const assetBreakdown = filtered.reduce<Record<string, number>>((acc, h) => {
    acc[h.assetClass] = (acc[h.assetClass] ?? 0) + h.value;
    return acc;
  }, {});

  return (
    <>
      {/* ── Stat cards ── */}
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-icon green">📈</div>
          <div className="stat-label">Total AUM</div>
          <div className="stat-value">{loading ? '…' : fmtK(totalValue)}</div>
          <div className="stat-sub">Across {filtered.length} holdings · MYR equiv.</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">💵</div>
          <div className="stat-label">Total Gains</div>
          <div className="stat-value">{loading ? '…' : fmtK(totalGain)}</div>
          <div className="stat-sub">{avgReturn >= 0 ? '+' : ''}{avgReturn}% avg return</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon blue">👥</div>
          <div className="stat-label">Clients</div>
          <div className="stat-value">{loading ? '…' : Object.keys(groups).length}</div>
          <div className="stat-sub">{filtered.length} holdings total</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">🌐</div>
          <div className="stat-label">Currencies</div>
          <div className="stat-value">{loading ? '…' : currencies.length}</div>
          <div className="stat-sub">{foreignCount > 0 ? `${foreignCount} foreign · ${currencies.filter(c => c !== 'MYR').join(', ')}` : 'All MYR'}</div>
        </div>
      </div>

      {/* ── FX bar ── */}
      {!loading && foreignCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {holdings.filter(h => h.currency && h.currency !== 'MYR' && h.fxRate > 0)
            .filter((h, i, arr) => arr.findIndex(x => x.currency === h.currency) === i)
            .map(h => (
              <div key={h.currency} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: ccyColor(h.currency), fontFamily: 'var(--font-mono)' }}>{h.currency}</span>
                <span style={{ color: 'var(--text3)' }}>1 {h.currency} =</span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>RM {h.fxRate.toFixed(4)}</span>
              </div>
            ))}
          <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
            ℹ️ FX rates from Notion — update manually to refresh
          </div>
        </div>
      )}

      {/* ── Client filter tabs ── */}
      {!loading && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {clientNames.map(name => (
            <button
              key={name}
              onClick={() => setFilter(name)}
              style={{
                padding: '6px 14px', borderRadius: 'var(--r-pill)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                background: filterClient === name ? 'var(--text)' : 'var(--surface)',
                color: filterClient === name ? 'var(--bg)' : 'var(--text3)',
                boxShadow: filterClient === name ? 'none' : 'var(--shadow-sm)',
              }}
            >
              {name === 'All' ? `All Clients (${holdings.length})` : `${name.split(' ')[0]} ${name.split(' ')[1] ?? ''} (${holdings.filter(h => h.clientName === name).length})`}
            </button>
          ))}
        </div>
      )}

      {/* ── Client groups ── */}
      {loading ? (
        <div className="section" style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          Loading from Notion…
        </div>
      ) : Object.entries(groups).map(([clientName, clientHoldings], i) => (
        <ClientGroup
          key={clientName}
          clientName={clientName}
          holdings={clientHoldings}
          defaultOpen={filterClient !== 'All' || i === 0}
        />
      ))}

      {/* ── Allocation breakdown ── */}
      {!loading && filtered.length > 0 && (
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--gold)' }} />
              Asset Class Breakdown
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
            {Object.entries(assetBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([cls, val]) => {
                const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
                const color = assetColor(cls);
                return (
                  <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 120, fontSize: 12, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>{cls}</div>
                    <div style={{ flex: 1, height: 8, borderRadius: 'var(--r-pill)', background: 'var(--surface2)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 'var(--r-pill)', background: color, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ width: 50, fontSize: 12, fontWeight: 600, color, textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {pct.toFixed(1)}%
                    </div>
                    <div style={{ width: 90, fontSize: 12, color: 'var(--text3)', textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {fmtK(val)}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </>
  );
}
