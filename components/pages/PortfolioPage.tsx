'use client';

import { useState, useEffect } from 'react';

interface Holding {
  id: string;
  name: string;
  assetClass: string;
  institution: string;
  status: string;
  maturity: string;
  value: number;
  purchase: number;
  gain: number;
  returnPct: number;
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

  const fmt = (n: number) => n.toLocaleString();
  const fmtK = (n: number) => n >= 1000 ? `RM ${(n/1000).toFixed(0)}K` : `RM ${n}`;

  const COLORS: Record<string, string> = {
    'EPF': '#4ADE80',
    'Unit Trust': '#60A5FA',
    'Fixed Deposit': '#F59E0B',
    'Stocks': '#A78BFA',
    'Bonds': '#F87171',
  };
  const getColor = (assetClass: string) => COLORS[assetClass] ?? '#9CB8A0';

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-icon green">📈</div>
          <div className="stat-label">Total AUM</div>
          <div className="stat-value">{loading ? '…' : fmtK(totalValue)}</div>
          <div className="stat-sub">Across {holdings.length} holdings</div>
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
          <div className="stat-icon red">⏰</div>
          <div className="stat-label">Maturing Soon</div>
          <div className="stat-value">{loading ? '…' : maturingSoon}</div>
          <div className="stat-sub">{holdings.find(h => h.maturity) ? `${holdings.find(h=>h.maturity)?.name} — ${new Date(holdings.find(h=>h.maturity)!.maturity).toLocaleString('en-MY',{month:'short',year:'numeric'})}` : 'None upcoming'}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--blue)' }} />
            Portfolio Holdings — Live from Notion
          </div>
        </div>
        <div className="client-table">
          <div className="cf-row header" style={{ gridTemplateColumns: '1fr 120px 120px 100px 100px 100px' }}>
            <div>Holding</div><div>Value (MYR)</div><div>Purchase (MYR)</div>
            <div>Gain/Loss</div><div>Return %</div><div>Status</div>
          </div>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading from Notion…</div>
          ) : holdings.map(h => (
            <div key={h.id} className="cf-row" style={{ gridTemplateColumns: '1fr 120px 120px 100px 100px 100px', cursor: 'pointer' }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseOut={e => (e.currentTarget.style.background = '')}>
              <div>
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{h.name}</div>
                <div style={{ fontSize: 11, color: h.maturity ? 'var(--gold)' : 'var(--text3)' }}>
                  {h.institution} · {h.assetClass}
                  {h.maturity && ` · ⚠️ Matures ${new Date(h.maturity).toLocaleString('en-MY',{month:'short',year:'numeric'})}`}
                </div>
              </div>
              <div><span className="cf-val cf-neutral">{fmt(h.value)}</span></div>
              <div><span className="cf-val cf-neutral">{fmt(h.purchase)}</span></div>
              <div><span className={`cf-val ${h.gain >= 0 ? 'cf-pos' : 'cf-neg'}`}>{h.gain >= 0 ? '+' : ''}{fmt(h.gain)}</span></div>
              <div><span className={`cf-val ${h.returnPct >= 0 ? 'cf-pos' : 'cf-neg'}`}>{h.returnPct >= 0 ? '+' : ''}{h.returnPct}%</span></div>
              <div><span className="badge active" style={{ fontSize: 10 }}>{h.status}</span></div>
            </div>
          ))}
          {!loading && holdings.length > 0 && (
            <div className="cf-row" style={{ gridTemplateColumns: '1fr 120px 120px 100px 100px 100px', background: 'var(--surface2)', fontWeight: 600 }}>
              <div style={{ color: 'var(--text)' }}>TOTAL</div>
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
            <div className="chart-title">By value</div>
            {holdings.map(h => (
              <div key={h.id} className="bar-row">
                <div className="bar-label">{h.name.split(' ').slice(0,2).join(' ')}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${totalValue > 0 ? Math.round((h.value/totalValue)*100) : 0}%`, background: getColor(h.assetClass) }} /></div>
                <div className="bar-val">{fmtK(h.value)}</div>
              </div>
            ))}
            {holdings.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="chart-title">By return</div>
                {holdings.map(h => (
                  <div key={h.id} className="bar-row">
                    <div className="bar-label">{h.assetClass} ({h.returnPct}%)</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(Math.abs(h.returnPct)*2, 100)}%`, background: getColor(h.assetClass) }} /></div>
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
                      stroke={getColor(h.assetClass)} strokeWidth="18"
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
                  <div className="legend-dot" style={{ background: getColor(h.assetClass) }}/>
                  {h.assetClass} — {totalValue > 0 ? Math.round((h.value/totalValue)*100) : 0}% · {fmtK(h.value)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
