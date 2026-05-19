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
  value: number;     // MYR
  purchase: number;  // MYR
  gain: number;      // MYR
  returnPct: number;
}

const CCY_COLORS: Record<string, string> = {
  MYR: '#4ADE80', USD: '#60A5FA', SGD: '#F59E0B',
  GBP: '#A78BFA', EUR: '#F87171', AUD: '#34D399', HKD: '#FB923C',
};
const ccyColor = (c: string) => CCY_COLORS[c] ?? '#9CB8A0';

const ASSET_COLORS: Record<string, string> = {
  'EPF': '#4ADE80', 'Unit Trust': '#60A5FA',
  'Fixed Deposit': '#F59E0B', 'Stocks': '#A78BFA', 'Bonds': '#F87171',
};
const assetColor = (a: string) => ASSET_COLORS[a] ?? '#9CB8A0';

function CcyBadge({ currency }: { currency: string }) {
  if (!currency || currency === 'MYR') return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1px 6px',
      borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
      background: `${ccyColor(currency)}22`, color: ccyColor(currency),
      border: `1px solid ${ccyColor(currency)}44`, marginLeft: 6,
    }}>{currency}</span>
  );
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notion?type=portfolio', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.data) setHoldings(json.data); })
      .finally(() => setLoading(false));
  }, []);

  const totalValue    = holdings.reduce((s, h) => s + h.value, 0);
  const totalPurchase = holdings.reduce((s, h) => s + h.purchase, 0);
  const totalGain     = totalValue - totalPurchase;
  const avgReturn     = totalPurchase > 0 ? Math.round((totalGain / totalPurchase) * 100) : 0;
  const maturingSoon  = holdings.filter(h => h.maturity).length;
  const foreignCount  = holdings.filter(h => h.currency && h.currency !== 'MYR').length;
  const currencies    = [...new Set(holdings.map(h => h.currency || 'MYR'))];

  const fmt  = (n: number) => n.toLocaleString();
  const fmtK = (n: number) => n >= 1_000_000 ? `RM ${(n/1_000_000).toFixed(2)}M` : n >= 1000 ? `RM ${(n/1000).toFixed(0)}K` : `RM ${n}`;
  const fmtOrig = (n: number, ccy: string) => {
    if (!n || ccy === 'MYR') return null;
    return `${ccy} ${n.toLocaleString()}`;
  };

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-icon green">📈</div>
          <div className="stat-label">Total AUM</div>
          <div className="stat-value">{loading ? '…' : fmtK(totalValue)}</div>
          <div className="stat-sub">Across {holdings.length} holdings · MYR equivalent</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">💵</div>
          <div className="stat-label">Total Gains</div>
          <div className="stat-value">{loading ? '…' : fmtK(totalGain)}</div>
          <div className="stat-sub">+{avgReturn}% avg return</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon blue">📊</div>
          <div className="stat-label">Holdings</div>
          <div className="stat-value">{loading ? '…' : holdings.length}</div>
          <div className="stat-sub">{holdings.map(h => h.assetClass).filter((v,i,a) => a.indexOf(v)===i).join(', ')}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">🌐</div>
          <div className="stat-label">Currencies</div>
          <div className="stat-value">{loading ? '…' : currencies.length}</div>
          <div className="stat-sub">
            {loading ? '…' : foreignCount > 0
              ? `${foreignCount} foreign · ${currencies.filter(c => c !== 'MYR').join(', ')}`
              : 'All MYR'}
          </div>
        </div>
      </div>

      {/* Currency FX summary bar — only shown when there are foreign holdings */}
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
            ℹ️ FX rates from Notion · update manually to refresh
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--blue)' }} />
            Portfolio Holdings — Live from Notion
          </div>
        </div>
        <div className="client-table">
          <div className="cf-row header" style={{ gridTemplateColumns: '1fr 140px 140px 100px 100px 100px' }}>
            <div>Holding</div>
            <div>Value (MYR)</div>
            <div>Purchase (MYR)</div>
            <div>Gain/Loss</div>
            <div>Return %</div>
            <div>Status</div>
          </div>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading from Notion…</div>
          ) : holdings.map(h => (
            <div key={h.id} className="cf-row" style={{ gridTemplateColumns: '1fr 140px 140px 100px 100px 100px', cursor: 'pointer' }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseOut={e => (e.currentTarget.style.background = '')}>
              <div>
                <div style={{ fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  {h.name}
                  <CcyBadge currency={h.currency} />
                </div>
                <div style={{ fontSize: 11, color: h.maturity ? 'var(--gold)' : 'var(--text3)', marginTop: 2 }}>
                  {h.institution} · {h.assetClass}
                  {h.clientName && ` · ${h.clientName.split(' ')[0]}`}
                  {h.maturity && ` · ⚠️ Matures ${new Date(h.maturity).toLocaleString('en-MY',{month:'short',year:'numeric'})}`}
                </div>
                {/* Show original currency value when not MYR */}
                {h.currency && h.currency !== 'MYR' && h.valueOrig > 0 && (
                  <div style={{ fontSize: 11, color: ccyColor(h.currency), fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {fmtOrig(h.valueOrig, h.currency)} @ {h.fxRate.toFixed(4)}
                  </div>
                )}
              </div>
              <div>
                <span className="cf-val cf-neutral">{fmt(h.value)}</span>
              </div>
              <div>
                <span className="cf-val cf-neutral">{fmt(h.purchase)}</span>
                {h.currency && h.currency !== 'MYR' && h.purchaseOrig > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{fmtOrig(h.purchaseOrig, h.currency)}</div>
                )}
              </div>
              <div><span className={`cf-val ${h.gain >= 0 ? 'cf-pos' : 'cf-neg'}`}>{h.gain >= 0 ? '+' : ''}{fmt(h.gain)}</span></div>
              <div><span className={`cf-val ${h.returnPct >= 0 ? 'cf-pos' : 'cf-neg'}`}>{h.returnPct >= 0 ? '+' : ''}{h.returnPct}%</span></div>
              <div><span className="badge active" style={{ fontSize: 10 }}>{h.status}</span></div>
            </div>
          ))}
          {!loading && holdings.length > 0 && (
            <div className="cf-row" style={{ gridTemplateColumns: '1fr 140px 140px 100px 100px 100px', background: 'var(--surface2)', fontWeight: 600 }}>
              <div style={{ color: 'var(--text)', fontSize: 12 }}>
                TOTAL <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>(MYR equivalent)</span>
              </div>
              <div><span className="cf-val" style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(totalValue)}</span></div>
              <div><span className="cf-val" style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(totalPurchase)}</span></div>
              <div><span className="cf-val cf-pos" style={{ fontWeight: 600 }}>+{fmt(totalGain)}</span></div>
              <div><span className="cf-val cf-pos" style={{ fontWeight: 600 }}>+{avgReturn}%</span></div>
              <div />
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--gold)' }} />
            Allocation Chart
          </div>
        </div>
        <div className="chart-container">
          <div className="mini-chart">
            <div className="chart-title">By value (MYR equivalent)</div>
            {holdings.map(h => (
              <div key={h.id} className="bar-row">
                <div className="bar-label">
                  {h.name.split(' ').slice(0,2).join(' ')}
                  {h.currency && h.currency !== 'MYR' && <span style={{ fontSize: 9, color: ccyColor(h.currency), marginLeft: 4 }}>({h.currency})</span>}
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${totalValue > 0 ? Math.round((h.value/totalValue)*100) : 0}%`, background: assetColor(h.assetClass) }} /></div>
                <div className="bar-val">{fmtK(h.value)}</div>
              </div>
            ))}
            {holdings.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="chart-title">By return</div>
                {holdings.map(h => (
                  <div key={h.id} className="bar-row">
                    <div className="bar-label">{h.assetClass} ({h.returnPct}%)</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(Math.abs(h.returnPct)*2, 100)}%`, background: assetColor(h.assetClass) }} /></div>
                    <div className="bar-val">{h.gain >= 0 ? '+' : ''}{fmtK(h.gain)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="donut-container">
            <svg width="130" height="130" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="44" fill="none" stroke="#172010" strokeWidth="18"/>
              {(() => {
                const circumference = 2 * Math.PI * 44;
                let offset = 0;
                return holdings.map(h => {
                  const pct = totalValue > 0 ? h.value / totalValue : 0;
                  const dash = pct * circumference;
                  const el = (
                    <circle key={h.id} cx="60" cy="60" r="44" fill="none"
                      stroke={assetColor(h.assetClass)} strokeWidth="18"
                      strokeDasharray={`${dash} ${circumference}`}
                      strokeDashoffset={-offset}
                      transform="rotate(-90 60 60)" />
                  );
                  offset += dash;
                  return el;
                });
              })()}
              <text x="60" y="56" textAnchor="middle" fill="#E8F5EA" fontSize="16" fontFamily="DM Serif Display">{avgReturn}%</text>
              <text x="60" y="70" textAnchor="middle" fill="#9CB8A0" fontSize="9" fontFamily="DM Sans">avg return</text>
            </svg>
            <div className="donut-legend">
              {holdings.map(h => (
                <div key={h.id} className="legend-row">
                  <div className="legend-dot" style={{ background: assetColor(h.assetClass) }}/>
                  {h.assetClass} — {totalValue > 0 ? Math.round((h.value/totalValue)*100) : 0}% · {fmtK(h.value)}
                  {h.currency && h.currency !== 'MYR' && <span style={{ color: ccyColor(h.currency), marginLeft: 4, fontSize: 10 }}>({h.currency})</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
