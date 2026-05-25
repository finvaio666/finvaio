'use client';

import { useState, useEffect } from 'react';
import { useClients } from '@/components/useClients';

interface CashflowEntry {
  id: string;
  entry: string;
  month: string;
  income: number;
  fixed: number;
  variable: number;
  epf: number;
  surplus: number;
  savingsRate: number;
}

export default function CashflowPage() {
  const { clients, loading: clientsLoading } = useClients();
  const [cashflow, setCashflow] = useState<CashflowEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notion?type=cashflow', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.data) setCashflow(json.data); })
      .finally(() => setLoading(false));
  }, []);

  const latest = cashflow[0];
  const income = latest?.income ?? 0;
  const fixed = latest?.fixed ?? 0;
  const variable = latest?.variable ?? 0;
  const epf = latest?.epf ?? 0;
  const surplus = latest?.surplus ?? 0;
  const savingsRate = latest?.savingsRate ?? 0;
  const clientName = clients[0]?.name?.split(' ')[0] ?? '…';

  const fmt = (n: number) => n.toLocaleString();
  const isReady = !loading && !clientsLoading && !!latest;

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-icon green">💵</div>
          <div className="stat-label">Monthly Income</div>
          <div className="stat-value">{loading ? '…' : `RM ${(income/1000).toFixed(0)}K`}</div>
          <div className="stat-sub">{clientName} · {latest?.month ? new Date(latest.month).toLocaleString('en-MY', { month: 'short', year: 'numeric' }) : '…'}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">💸</div>
          <div className="stat-label">Total Expenses</div>
          <div className="stat-value">{loading ? '…' : `RM ${((fixed+variable)/1000).toFixed(1)}K`}</div>
          <div className="stat-sub">Fixed RM {(fixed/1000).toFixed(1)}K + Variable RM {(variable/1000).toFixed(1)}K</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">🏦</div>
          <div className="stat-label">EPF Contribution</div>
          <div className="stat-value">{loading ? '…' : `RM ${(epf/1000).toFixed(2)}K`}</div>
          <div className="stat-sub">Monthly deduction</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon green">📈</div>
          <div className="stat-label">Monthly Surplus</div>
          <div className="stat-value">{loading ? '…' : `RM ${(surplus/1000).toFixed(2)}K`}</div>
          <div className="stat-sub">{loading ? '…' : `${savingsRate}% savings rate`} {savingsRate >= 30 ? '✅' : '⚠️'}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--accent)' }} />
            Cash Flow Planner
          </div>
        </div>
        <div>
          <div className="cf-row header">
            <div>Client / Month</div><div>Income (MYR)</div><div>Fixed Exp</div>
            <div>Variable Exp</div><div>EPF</div><div>Surplus</div>
          </div>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading…</div>
          ) : cashflow.map(row => (
            <div key={row.id} className="cf-row"
              onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseOut={e => (e.currentTarget.style.background = '')}>
              <div>
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{row.entry}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {row.month ? new Date(row.month).toLocaleString('en-MY', { month: 'long', year: 'numeric' }) : ''}
                </div>
              </div>
              <div><span className="cf-val cf-neutral">{fmt(row.income)}</span></div>
              <div><span className="cf-val cf-neg">{fmt(row.fixed)}</span></div>
              <div><span className="cf-val cf-neg">{fmt(row.variable)}</span></div>
              <div><span className="cf-val cf-neutral">{fmt(row.epf)}</span></div>
              <div><span className="cf-val cf-pos">+{fmt(row.surplus)}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="two-col">
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--blue)' }} />
              Expense Breakdown
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <div className="chart-title" style={{ marginBottom: 12 }}>{isReady ? latest.entry : '…'}</div>
            {isReady && income > 0 && [
              { label: 'Fixed expenses', pct: Math.round((fixed/income)*100), color: '#F87171', val: `RM ${fmt(fixed)}` },
              { label: 'Variable exp.', pct: Math.round((variable/income)*100), color: '#F59E0B', val: `RM ${fmt(variable)}` },
              { label: 'EPF', pct: Math.round((epf/income)*100), color: '#60A5FA', val: `RM ${fmt(epf)}` },
              { label: 'Surplus 💚', pct: Math.round((surplus/income)*100), color: '#4ADE80', val: `RM ${fmt(surplus)}` },
            ].map(b => (
              <div key={b.label} className="bar-row" style={{ marginBottom: 8 }}>
                <div className="bar-label">{b.label}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(b.pct,1)}%`, background: b.color }} /></div>
                <div className="bar-val">{b.val}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--accent)' }} />
              Savings Rate Benchmark
            </div>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: clientName, pct: Math.min(savingsRate * 2, 100), color: '#4ADE80', val: `${savingsRate}%` },
              { label: 'BM Target',  pct: 60, color: '#60A5FA', val: '30%' },
              { label: 'MY Average', pct: 30, color: '#5A7A5E', val: '15%' },
            ].map(b => (
              <div key={b.label} className="bar-row">
                <div className="bar-label" style={{ width: 130 }}>{b.label}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(b.pct,1)}%`, background: b.color }} /></div>
                <div className="bar-val">{b.val}</div>
              </div>
            ))}
            {isReady && (
              <div style={{ marginTop: 8, padding: 10, background: savingsRate >= 30 ? 'var(--accent-dim)' : 'var(--gold-dim)', borderRadius: 'var(--r-sm)', fontSize: 12, color: savingsRate >= 30 ? 'var(--accent2)' : 'var(--gold)' }}>
                {savingsRate >= 30
                  ? `✅ ${clientName} is saving ${(savingsRate/15).toFixed(1)}× the Malaysian average — excellent financial discipline.`
                  : `⚠️ Savings rate ${savingsRate}% is below the 30% target. Review expenses.`}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
