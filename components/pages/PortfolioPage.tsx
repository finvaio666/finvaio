'use client';

import { useState, useEffect } from 'react';
import PortfolioSwitchPanel from '@/components/PortfolioSwitchPanel';
import NavUpdatePanel from '@/components/NavUpdatePanel';

interface Holding {
  id: string;
  clientId: string;
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
  'EPF': '#4ADE80', 'Unit Trust': '#60A5FA', 'PRS': '#818CF8',
  'Fixed Deposit': '#F59E0B', 'Stocks': '#A78BFA', 'Bonds': '#F87171',
  'Money Market': '#34D399',
};
const ccyColor   = (c: string) => CCY_COLORS[c]  ?? '#9CB8A0';
const assetColor = (a: string) => ASSET_COLORS[a] ?? '#9CB8A0';
const fmtK = (n: number) => n >= 1_000_000 ? `RM ${(n/1_000_000).toFixed(2)}M` : n >= 1000 ? `RM ${(n/1000).toFixed(1)}K` : `RM ${Math.round(n)}`;
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function PortfolioPage() {
  const [holdings,     setHoldings]    = useState<Holding[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [activeTab,    setTab]         = useState<string | null>(null);
  const [showSwitch,   setShowSwitch]  = useState(false);
  const [showNav,      setShowNav]     = useState(false);

  const loadHoldings = () => {
    setLoading(true);
    fetch('/api/notion?type=portfolio', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.data) setHoldings(json.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadHoldings(); }, []);

  const clientNames = Array.from(new Set(holdings.map(h => h.clientName || 'Unknown'))).sort();

  const visible = activeTab === null ? [] : activeTab === 'All'
    ? holdings
    : holdings.filter(h => h.clientName === activeTab);

  const totalValue    = visible.reduce((s, h) => s + h.value, 0);
  const totalPurchase = visible.reduce((s, h) => s + h.purchase, 0);
  const totalGain     = totalValue - totalPurchase;
  const avgReturn     = totalPurchase > 0 ? ((totalGain / totalPurchase) * 100).toFixed(1) : '0.0';
  const foreignCount  = visible.filter(h => h.currency && h.currency !== 'MYR').length;
  const currencies    = [...new Set(visible.map(h => h.currency || 'MYR'))];

  // Group rows by client for visual separation
  const grouped: { client: string; rows: Holding[] }[] = activeTab === 'All'
    ? clientNames.map(c => ({ client: c, rows: holdings.filter(h => h.clientName === c) }))
    : activeTab ? [{ client: activeTab, rows: visible }] : [];

  return (
    <>
      {/* ── Client selector ── always visible at top ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ position: 'relative' }}>
          <select
            value={activeTab ?? ''}
            onChange={e => setTab(e.target.value || null)}
            style={{
              padding: '10px 36px 10px 18px', borderRadius: 'var(--r-pill)',
              border: `1.5px solid ${activeTab ? 'var(--accent2)' : 'var(--border)'}`,
              background: 'var(--surface)', color: activeTab ? 'var(--text)' : 'var(--text3)',
              fontSize: 14, fontFamily: 'var(--font-sans)', fontWeight: 600,
              cursor: 'pointer', outline: 'none', appearance: 'none',
              boxShadow: 'var(--shadow-sm)', minWidth: 220,
            }}
          >
            <option value=''>— Select a client —</option>
            <option value='All'>All Clients</option>
            {clientNames.map(name => (
              <option key={name} value={name}>
                {name} ({holdings.filter(h => h.clientName === name).length} holdings)
              </option>
            ))}
          </select>
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10, color: 'var(--text3)' }}>▼</span>
        </div>

        {activeTab && (
          <button onClick={() => setTab(null)} style={{
            padding: '8px 16px', borderRadius: 'var(--r-pill)',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>✕ Clear</button>
        )}

        {/* Action buttons — right-aligned, shown only when client selected */}
        {activeTab && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => setShowNav(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 'var(--r-pill)',
              background: 'var(--surface)', border: '1.5px solid var(--accent2)',
              color: 'var(--accent2)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)', transition: 'opacity 0.15s',
            }}
              onMouseOver={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseOut={e => (e.currentTarget.style.opacity = '1')}
            >
              📊 Update NAV
            </button>
            <button onClick={() => setShowSwitch(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 'var(--r-pill)',
              background: 'var(--accent2)', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'opacity 0.15s',
            }}
              onMouseOver={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseOut={e => (e.currentTarget.style.opacity = '1')}
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
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Select a client to view their portfolio</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Choose a client from the dropdown above to see their holdings, gains, and asset allocation.</div>
        </div>
      )}

      {/* ── Stat cards — only when client selected ── */}
      {activeTab && (
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-icon green">📈</div>
          <div className="stat-label">Total AUM</div>
          <div className="stat-value">{loading ? '…' : fmtK(totalValue)}</div>
          <div className="stat-sub">{visible.length} holdings · MYR equiv.</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">💵</div>
          <div className="stat-label">Total Gains</div>
          <div className="stat-value" style={{ color: Number(avgReturn) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {loading ? '…' : fmtK(totalGain)}
          </div>
          <div className="stat-sub">{Number(avgReturn) >= 0 ? '+' : ''}{avgReturn}% avg return</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon blue">📦</div>
          <div className="stat-label">Holdings</div>
          <div className="stat-value">{loading ? '…' : visible.length}</div>
          <div className="stat-sub">{activeTab === 'All' ? `${clientNames.length} clients` : 'Active holdings'}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">🌐</div>
          <div className="stat-label">Currencies</div>
          <div className="stat-value">{loading ? '…' : currencies.length}</div>
          <div className="stat-sub">{foreignCount > 0 ? `${currencies.filter(c => c !== 'MYR').join(', ')}` : 'All MYR'}</div>
        </div>
      </div>
      )}

      {/* ── FX bar ── */}
      {activeTab && !loading && foreignCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {holdings.filter(h => h.currency && h.currency !== 'MYR' && h.fxRate > 0)
            .filter((h, i, arr) => arr.findIndex(x => x.currency === h.currency) === i)
            .map(h => (
              <div key={h.currency} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 'var(--r-pill)', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: ccyColor(h.currency), fontFamily: 'var(--font-mono)' }}>{h.currency}</span>
                <span style={{ color: 'var(--text3)' }}>=</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>RM {h.fxRate.toFixed(4)}</span>
              </div>
            ))}
          <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>ℹ️ Update FX rates to refresh</div>
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

      {/* ── Holdings table ── */}
      {activeTab && <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--blue)' }} />
            {activeTab === 'All' ? 'All Holdings' : `${activeTab}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{visible.length} holdings</div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 680 }}>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: activeTab === 'All' ? '160px 1fr 120px 120px 90px 80px' : '1fr 120px 120px 90px 80px',
              padding: '8px 20px', fontSize: 11, fontWeight: 700,
              color: 'var(--text3)', borderBottom: '1px solid var(--border)',
              background: 'var(--bg2)', letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              {activeTab === 'All' && <div>Client</div>}
              <div>Fund / Holding</div>
              <div style={{ textAlign: 'right' }}>Value (MYR)</div>
              <div style={{ textAlign: 'right' }}>Purchase (MYR)</div>
              <div style={{ textAlign: 'right' }}>Gain / Loss</div>
              <div style={{ textAlign: 'right' }}>Return</div>
            </div>

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
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{client}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 2 }}>· {rows.length} holdings</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                      {fmtK(rows.reduce((s, h) => s + h.value, 0))}
                    </span>
                  </div>
                )}

                {/* Holding rows */}
                {rows.map((h, i) => {
                  const cols = activeTab === 'All'
                    ? '160px 1fr 120px 120px 90px 80px'
                    : '1fr 120px 120px 90px 80px';
                  return (
                    <div key={h.id} style={{
                      display: 'grid', gridTemplateColumns: cols,
                      padding: '13px 20px', alignItems: 'center',
                      borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.12s',
                    }}
                      onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseOut={e => (e.currentTarget.style.background = '')}
                    >
                      {/* Client col — only "All" view */}
                      {activeTab === 'All' && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', paddingRight: 8 }}>
                          {h.clientName?.split(' ').slice(0, 2).join(' ')}
                        </div>
                      )}

                      {/* Holding name */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 13, color: 'var(--text)', flexWrap: 'wrap' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: assetColor(h.assetClass), flexShrink: 0 }} />
                          {h.name}
                          {h.currency && h.currency !== 'MYR' && (
                            <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', background: `${ccyColor(h.currency)}22`, color: ccyColor(h.currency), border: `1px solid ${ccyColor(h.currency)}44` }}>{h.currency}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, paddingLeft: 13 }}>
                          {[h.assetClass, h.institution].filter(Boolean).join(' · ')}
                          {h.maturity && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>⚠️ Matures {new Date(h.maturity).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}</span>}
                        </div>
                        {h.currency && h.currency !== 'MYR' && h.valueOrig > 0 && (
                          <div style={{ fontSize: 10, color: ccyColor(h.currency), fontFamily: 'var(--font-mono)', marginTop: 2, paddingLeft: 13 }}>
                            {h.currency} {h.valueOrig.toLocaleString()} @ {h.fxRate.toFixed(4)}
                          </div>
                        )}
                      </div>

                      {/* Value */}
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>
                        {Math.round(h.value).toLocaleString()}
                      </div>

                      {/* Purchase */}
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)', fontSize: 12 }}>
                        {Math.round(h.purchase).toLocaleString()}
                      </div>

                      {/* Gain */}
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: h.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {h.gain >= 0 ? '+' : ''}{Math.round(h.gain).toLocaleString()}
                      </div>

                      {/* Return % */}
                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: h.returnPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {h.returnPct >= 0 ? '+' : ''}{h.returnPct}%
                      </div>
                    </div>
                  );
                })}

                {/* Client subtotal — only in "All" view */}
                {activeTab === 'All' && (() => {
                  const sv = rows.reduce((s, h) => s + h.value, 0);
                  const sp = rows.reduce((s, h) => s + h.purchase, 0);
                  const sg = sv - sp;
                  const sr = sp > 0 ? ((sg / sp) * 100).toFixed(1) : '0.0';
                  return (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '160px 1fr 120px 120px 90px 80px',
                      padding: '8px 20px', background: 'var(--bg2)',
                      borderBottom: '2px solid var(--border)', fontSize: 12, fontWeight: 700,
                    }}>
                      <div />
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
              gridTemplateColumns: activeTab === 'All' ? '160px 1fr 120px 120px 90px 80px' : '1fr 120px 120px 90px 80px',
              padding: '12px 20px', background: 'var(--surface2)',
              borderTop: '2px solid var(--text)', fontSize: 13, fontWeight: 700,
            }}>
              {activeTab === 'All' && <div />}
              <div style={{ color: 'var(--text)' }}>TOTAL <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>(MYR equiv.)</span></div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{Math.round(totalValue).toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{Math.round(totalPurchase).toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>{totalGain >= 0 ? '+' : ''}{Math.round(totalGain).toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: Number(avgReturn) >= 0 ? 'var(--green)' : 'var(--red)' }}>{Number(avgReturn) >= 0 ? '+' : ''}{avgReturn}%</div>
            </div>
          </div>
          </div>
        )}
      </div>}

      {/* ── Asset allocation ── */}
      {activeTab && !loading && visible.length > 0 && (
        <div className="section" style={{ marginBottom: 48 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--gold)' }} />
              Asset Class Allocation
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 28 }}>
            {Object.entries(
              visible.reduce<Record<string, number>>((acc, h) => {
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
