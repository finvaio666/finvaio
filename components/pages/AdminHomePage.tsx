'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { AdminOverview } from '@/app/api/admin/overview/route';
import type { InsuranceOverview } from '@/app/api/admin/insurance-overview/route';
import type { DataQualityReport } from '@/app/api/admin/data-quality/route';

interface TaskItem {
  id: string; task: string; client: string;
  status: 'Open' | 'Done'; due: string; source: string; type: string;
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

// Whole ringgit — these are rollups of many records, so cents read as false
// precision. Same rule as the Admin Dashboard.
const money = (n: number) => `RM ${Math.round(n).toLocaleString('en-MY')}`;

/** Compact figure for the at-a-glance strip; `href` deep-links to the tab that explains it. */
function Figure({ label, value, sub, color = 'var(--text)', href }: {
  label: string; value: string; sub?: string; color?: string; href?: string;
}) {
  const body = (
    <>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 5, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
    </>
  );
  const style: React.CSSProperties = {
    flex: '1 1 150px', minWidth: 150, padding: '14px 18px',
    borderRight: '1px solid var(--border)', textDecoration: 'none', display: 'block',
  };
  return href ? <Link href={href} style={style}>{body}</Link> : <div style={style}>{body}</div>;
}

/**
 * Company position at a glance, above the admin's own task list.
 *
 * Deliberately figures only — the charts and tables stay on the Admin
 * Dashboard. This answers "is anything wrong this morning"; the other page
 * answers "why". Every figure links to the tab that explains it, so the two
 * pages stay one story rather than two copies of it.
 */
function CompanyGlance() {
  const [inv, setInv] = useState<AdminOverview | null>(null);
  const [ins, setIns] = useState<InsuranceOverview | null>(null);
  const [dq,  setDq]  = useState<DataQualityReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const grab = <T,>(url: string, set: (v: T) => void) =>
      fetch(url, { cache: 'no-store' }).then(r => r.json())
        .then(d => { if (alive && !d.error) set(d); else if (alive) setFailed(true); })
        .catch(() => { if (alive) setFailed(true); });
    // Independent requests, rendered as each lands — the data-quality scan
    // walks the whole book and shouldn't hold up the AUM figure.
    grab<AdminOverview>('/api/admin/overview', setInv);
    grab<InsuranceOverview>('/api/admin/insurance-overview', setIns);
    grab<DataQualityReport>('/api/admin/data-quality', setDq);
    return () => { alive = false; };
  }, []);

  const notesToConfirm = inv?.attention.length ?? 0;
  const dqErrors = dq?.checks.filter(c => c.severity === 'error').reduce((n, c) => n + c.findings.length, 0) ?? 0;

  if (failed && !inv && !ins && !dq) return null;   // stay silent rather than show a broken strip

  return (
    <div className="section" style={{ marginBottom: 20 }}>
      <div className="section-header">
        <div className="section-title">
          <span className="section-dot" style={{ background: '#F37338' }} />
          Company at a glance
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>
            across every advisor
          </span>
        </div>
        <Link href="/admin" style={{ fontSize: 12, fontWeight: 600, color: '#F37338', textDecoration: 'none' }}>
          Full dashboard →
        </Link>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <Figure
          label="Combined AUM"
          value={inv ? money(inv.totalAUM) : '…'}
          sub={inv ? `${inv.totalHoldings.toLocaleString('en-MY')} holdings` : undefined}
          color="#22c55e"
          href="/admin"
        />
        <Figure
          label="In-force Premium"
          value={ins ? money(ins.inForcePremium) : '…'}
          sub={ins ? `${ins.inForceCount} policies · ${ins.lapseRate.toFixed(1)}% lapsed` : undefined}
          color="#38bdf8"
          href="/admin"
        />
        <Figure
          label="Clients"
          value={inv ? String(inv.totalClients) : '…'}
          sub={inv ? `${inv.investedClients} invested` : undefined}
          color="#818cf8"
          href="/admin"
        />
        <Figure
          label="Notes to confirm"
          value={inv ? String(notesToConfirm) : '…'}
          sub={inv ? (notesToConfirm ? 'KI/KO awaiting sign-off' : 'all clear') : undefined}
          color={notesToConfirm ? '#ef4444' : 'var(--text3)'}
          href="/admin"
        />
        <Figure
          label="Data issues"
          value={dq ? String(dq.totalFindings) : '…'}
          sub={dq ? (dqErrors ? `${dqErrors} need correction` : dq.totalFindings ? 'gaps to fill' : 'book is clean') : undefined}
          color={dqErrors ? '#ef4444' : dq?.totalFindings ? '#d97706' : 'var(--text3)'}
          href="/admin"
        />
      </div>
    </div>
  );
}

export default function AdminHomePage() {
  const [tasks,      setTasks]      = useState<TaskItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [newTask,    setNewTask]    = useState('');
  const [adding,     setAdding]     = useState(false);
  const [completing, setCompleting] = useState<string[]>([]);

  const load = () => fetch('/api/tasks?status=Open&type=Admin', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => { if (d.tasks) setTasks(d.tasks); })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function addTask() {
    const text = newTask.trim();
    if (!text || adding) return;
    setAdding(true);
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: text, type: 'Admin' }),
    }).catch(() => {});
    setNewTask('');
    setAdding(false);
    load();
  }

  function completeTask(id: string) {
    if (completing.includes(id)) return;
    setCompleting(prev => [...prev, id]);
    fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: id, done: true }) }).catch(() => {});
    setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== id));
      setCompleting(prev => prev.filter(x => x !== id));
    }, 900);
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 24px', borderBottom: '1px solid var(--border)',
  };

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Admin Home</h1>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
          Where the firm stands today, and your own admin work.
        </div>
      </div>

      <CompanyGlance />

      {/* ── Admin Tasks ── */}
      <div className="section" style={{ marginBottom: 20 }}>
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: '#22c55e' }} />
            Admin Tasks
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>
              {tasks.length} open
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
          <input
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
            placeholder="Add an admin task…"
            style={{ flex: 1, padding: '8px 14px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}
          />
          <button
            onClick={addTask}
            disabled={adding || !newTask.trim()}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 'var(--r-pill)', cursor: adding || !newTask.trim() ? 'not-allowed' : 'pointer', opacity: adding || !newTask.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >{adding ? '…' : '+ Add'}</button>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: 'var(--text3)', fontSize: 13 }}><LoadingSpinner /></div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 13 }}>No open admin tasks</div>
          </div>
        ) : [...tasks]
            .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
            .map(t => {
              const d = t.due ? daysUntil(t.due) : null;
              const overdue = d !== null && d < 0;
              const isDone = completing.includes(t.id);
              return (
                <div key={t.id} style={{ ...rowStyle, opacity: isDone ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                  <button
                    onClick={() => completeTask(t.id)}
                    title="Mark done"
                    style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
                      border: `2px solid ${isDone ? '#22c55e' : 'var(--border)'}`,
                      background: isDone ? '#22c55e' : 'transparent',
                      color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >{isDone ? '✓' : ''}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textDecoration: isDone ? 'line-through' : 'none' }}>{t.task}</div>
                  </div>
                  {d !== null && !isDone && (
                    <div style={{
                      padding: '3px 10px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
                      background: overdue ? 'var(--red-dim)' : 'var(--surface2)',
                      color: overdue ? 'var(--red)' : 'var(--text3)',
                      border: `1px solid ${overdue ? 'rgba(220,38,38,0.2)' : 'var(--border)'}`,
                    }}>
                      {overdue ? `${Math.abs(d)}d overdue` : d === 0 ? 'Today' : `${d}d`}
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {/* ── FA Enquiries (placeholder — ticket system not yet built) ── */}
      <div className="section" style={{ marginBottom: 20 }}>
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--blue)' }} />
            FA Enquiries
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>questions raised by advisors</span>
          </div>
        </div>
        <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13 }}>No enquiries yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>FAs will be able to raise a ticket here when FINVA can&apos;t resolve their question.</div>
        </div>
      </div>
    </>
  );
}
