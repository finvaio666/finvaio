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

interface LimitRow { advisor: string; usedToday: number; limit: number; isOverride: boolean }

/** Daily token limit per advisor: usage so far today, and an Admin-editable limit. */
function LimitsPanel() {
  const [rows, setRows] = useState<LimitRow[] | null>(null);
  const [defaultLimit, setDefaultLimit] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai-limits');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load limits');
      setRows(json.advisors); setDefaultLimit(json.defaultLimit);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed to load limits'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(advisor: string, limit: number | null) {
    setMsg('');
    const res = await fetch('/api/admin/ai-limits', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisor, limit }),
    });
    const json = await res.json();
    if (!res.ok) { setMsg(json.error || 'Could not save'); return; }
    setDraft(d => { const n = { ...d }; delete n[advisor]; return n; });
    load();
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        Daily token limit per FA
        <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>
          default {num(defaultLimit)} tokens a day (about 25–30 answers) · resets at midnight Malaysia time · off-topic questions are blocked
        </span>
      </div>
      {msg && <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--red)' }}>{msg}</div>}
      {!rows && !msg && <div style={{ padding: 14, fontSize: 12, color: 'var(--text3)' }}>Loading…</div>}
      {rows?.map(r => {
        const pct = r.limit > 0 ? Math.min(100, Math.round((r.usedToday / r.limit) * 100)) : 100;
        const val = draft[r.advisor] ?? String(r.limit);
        return (
          <div key={r.advisor} style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
            <span style={{ minWidth: 130, color: 'var(--text)', fontWeight: 600 }}>{r.advisor}</span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--red)' : '#F37338' }} />
              </div>
              <div style={{ color: 'var(--text3)', marginTop: 3 }}>{num(r.usedToday)} of {num(r.limit)} used today ({pct}%){r.isOverride ? ' · custom limit' : ''}</div>
            </div>
            <input
              value={val} inputMode="numeric"
              onChange={e => setDraft(d => ({ ...d, [r.advisor]: e.target.value.replace(/[^0-9]/g, '') }))}
              style={{ width: 100, padding: '5px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
            />
            <button onClick={() => save(r.advisor, Number(val))} disabled={draft[r.advisor] === undefined}
              style={{ padding: '5px 12px', fontSize: 12, borderRadius: 99, border: 'none', background: draft[r.advisor] === undefined ? 'var(--border)' : '#F37338', color: '#fff', cursor: 'pointer' }}>Save</button>
            {r.isOverride && (
              <button onClick={() => save(r.advisor, null)}
                style={{ padding: '5px 12px', fontSize: 12, borderRadius: 99, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>Use default</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Every question asked on one Malaysia day: who, what, how much it cost, and whether FINVA blocked it. */
function QuestionLog({ report, date, onDate }: { report: AiUsageReport; date: string; onDate: (d: string) => void }) {
  const [advisor, setAdvisor] = useState('');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [testToo, setTestToo] = useState(false);

  const all = report.questions.filter(q => testToo || !q.isTest);
  const advisors = [...new Set(all.map(q => q.advisor))].sort();
  const shown = all.filter(q => (!advisor || q.advisor === advisor) && (!blockedOnly || q.feature.startsWith('Blocked')));
  const blockedCount = all.filter(q => q.feature.startsWith('Blocked')).length;
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Questions asked</span>
        <input type="date" value={date} onChange={e => e.target.value && onDate(e.target.value)}
          style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }} />
        <select value={advisor} onChange={e => setAdvisor(e.target.value)}
          style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}>
          <option value="">All FAs</option>
          {advisors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={blockedOnly} onChange={e => setBlockedOnly(e.target.checked)} /> Blocked only ({blockedCount})
        </label>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={testToo} onChange={e => setTestToo(e.target.checked)} /> Include test runs
        </label>
        <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>{shown.length} question{shown.length === 1 ? '' : 's'} · Malaysia time</span>
      </div>
      {shown.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--text3)' }}>No questions on this day.</div>}
      {shown.map(q => {
        const blocked = q.feature.startsWith('Blocked');
        return (
          <div key={q.id} style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 12, display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text3)', minWidth: 52 }}>{fmtTime(q.createdAt)}</span>
            <span style={{ color: 'var(--text2)', minWidth: 100, fontWeight: 600 }}>{q.advisor}</span>
            <span style={{ minWidth: 118, color: blocked ? 'var(--red)' : 'var(--text3)' }}>{blocked ? `🚫 ${q.feature.replace('Blocked: ', 'blocked: ')}` : q.feature}{q.isTest ? ' · test' : ''}</span>
            <span style={{ color: 'var(--text)', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{q.question || '—'}</span>
            <span style={{ color: 'var(--text2)', minWidth: 58, textAlign: 'right' }}>{num(q.totalTokens)}</span>
            <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: 66, textAlign: 'right' }}>{usd(q.estCostUsd)}</span>
          </div>
        );
      })}
      <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
        Questions are stored as typed (first 280 characters) and may mention client names, so this view is Admin-only. Answers are not stored.
      </div>
    </div>
  );
}

const sub = (t: UsageTotals) => `${num(t.calls)} calls · ${num(t.totalTokens)} tokens`;

/** Company-wide AI usage and estimated cost. Real FA use and test runs are kept apart. */
export default function AiUsageTab() {
  const [days, setDays] = useState(30);
  const [qDate, setQDate] = useState(() => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10));
  const [report, setReport] = useState<AiUsageReport | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/admin/ai-usage?days=${days}&date=${qDate}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load AI usage');
      setReport(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load AI usage'); }
  }, [days, qDate]);
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

      <LimitsPanel />

      <QuestionLog report={report} date={qDate} onDate={setQDate} />

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
