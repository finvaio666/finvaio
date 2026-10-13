'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AiUsageReport, UsageGroup, UsageTotals } from '@/app/api/admin/ai-usage/route';

const usd = (n: number) => `US$${n.toFixed(n < 1 ? 4 : 2)}`;
const num = (n: number) => n.toLocaleString('en-MY');

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 170 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#F37338', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function GroupTable({ title, rows, keyLabel }: { title: string; rows: UsageGroup[]; keyLabel: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', flex: 1, minWidth: 300 }}>
      <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>{title}</div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text3)', textAlign: 'left' }}>
            <th style={{ padding: '8px 14px', fontWeight: 600 }}>{keyLabel}</th>
            <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Calls</th>
            <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Tokens</th>
            <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} style={{ padding: 14, color: 'var(--text3)' }}>No usage in this period.</td></tr>}
          {rows.map(r => (
            <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 14px', color: 'var(--text)' }}>{r.key}</td>
              <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text2)' }}>{num(r.calls)}</td>
              <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text2)' }}>{num(r.totalTokens)}</td>
              <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{usd(r.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sub = (t: UsageTotals) => `${num(t.calls)} calls · ${num(t.totalTokens)} tokens`;

/** Company-wide AI usage and estimated cost. Real FA use and test runs are kept apart. */
export default function AiUsageTab() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<AiUsageReport | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/admin/ai-usage?days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load AI usage');
      setReport(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load AI usage'); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  if (error)   return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{error}</div>;
  if (!report) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading AI usage…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Since {report.since} · estimated at list price, not the Google invoice</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 99, cursor: 'pointer',
              border: '1px solid var(--border)', background: days === d ? '#F37338' : 'none',
              color: days === d ? '#fff' : 'var(--text2)',
            }}>{d} days</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Card label="Real FA usage" value={usd(report.real.costUsd)} sub={sub(report.real)} />
        <Card label="Test runs" value={usd(report.test.costUsd)} sub={sub(report.test)} />
        <Card label="Thinking tokens (real)" value={num(report.real.thinkingTokens)} sub="billed as output" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <GroupTable title="By FA (real use)" rows={report.byAdvisor} keyLabel="Advisor" />
        <GroupTable title="By feature (real use)" rows={report.byFeature} keyLabel="Feature" />
        <GroupTable title="By model (all calls)" rows={report.byModel} keyLabel="Model" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>By day (real + test)</div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text3)', textAlign: 'left' }}>
              <th style={{ padding: '8px 14px', fontWeight: 600 }}>Date</th>
              <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Calls</th>
              <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Tokens</th>
              <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>of which test</th>
              <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {report.byDay.map(d => (
              <tr key={d.key} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 14px', color: 'var(--text)' }}>{d.key}</td>
                <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text2)' }}>{num(d.calls)}</td>
                <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text2)' }}>{num(d.totalTokens)}</td>
                <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text3)' }}>{usd(d.testCostUsd)}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{usd(d.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>Latest calls</div>
        {report.recent.map(r => (
          <div key={r.id} style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 12, display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text3)', minWidth: 78 }}>{r.date}</span>
            <span style={{ color: 'var(--text2)', minWidth: 90 }}>{r.advisor}</span>
            <span style={{ color: 'var(--text3)', minWidth: 90 }}>{r.feature}{r.isTest ? ' · test' : ''}</span>
            <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.question || '—'}</span>
            <span style={{ color: 'var(--text2)', minWidth: 62, textAlign: 'right' }}>{num(r.totalTokens)}</span>
            <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: 70, textAlign: 'right' }}>{usd(r.estCostUsd)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{report.note}</div>
    </div>
  );
}
