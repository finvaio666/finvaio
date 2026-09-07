'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminOverview, FAStats, AttentionGroup } from '@/app/api/admin/overview/route';
import type { AdminClient } from '@/app/api/admin/clients/route';
import type { DataQualityReport } from '@/app/api/admin/data-quality/route';
import type { InsuranceOverview } from '@/app/api/admin/insurance-overview/route';
import type { PlatformGroup } from '@/lib/platformGroups';
import { upperName } from '@/lib/displayName';
import DonutBreakdown from '@/components/DonutBreakdown';
import LoadingSpinner from '@/components/LoadingSpinner';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Whole ringgit only — AUM rollups are summed from many holdings, so trailing
// cents ("RM 64,772,314.88") read as false precision rather than useful detail.
function fmt(n: number) { return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }
function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysUntil(d: string) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function StatCard({ label, value, sub, color = '#F37338' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 22px', flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: active ? '#22c55e' : 'var(--text3)', marginRight: 6 }} />;
}

// ── Today tab ─────────────────────────────────────────────────────────────────

interface TaskItem {
  id: string; task: string; client: string;
  status: 'Open' | 'Done'; due: string; source: string; type: string;
}

/**
 * The admin's own work — what used to be the separate Admin Home page. It
 * leads the tab set because it is the only one that asks anything of the
 * person reading it; the rest report on the firm.
 */
function TodayTab() {
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

// ── Insurance tab ─────────────────────────────────────────────────────────────

function MiniStat({ label, value, sub, color = 'var(--text)' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/**
 * Company insurance book. Everything headline is measured in force, because a
 * lapsed policy keeps its premium and sum assured on the record — the lapsed
 * figures are shown beside them as what was lost, not blended in.
 */
function InsuranceTab({ data: d, error: err }: { data: InsuranceOverview | null; error: string }) {
  if (err)  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{err}</div>;
  if (!d)   return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading insurance book…</div>;

  if (d.totalPolicies === 0) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '36px 20px', textAlign: 'center', color: 'var(--text3)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🛡️</div>
        <div style={{ fontSize: 13 }}>No policies recorded yet.</div>
      </div>
    );
  }

  const lapseTone = d.lapseRate >= 20 ? '#ef4444' : d.lapseRate >= 10 ? '#d97706' : '#22c55e';
  const maxYear   = Math.max(...d.newByYear.map(y => y.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* In force vs lost, side by side — the second is the reason to look. */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>In force</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <MiniStat label="Annual premium" value={fmt(d.inForcePremium)} color="#22c55e" sub={`${d.inForceCount} policies`} />
            <MiniStat label="Sum assured"    value={fmt(d.inForceSumAssured)} sub={`${d.clientsCovered} clients covered`} />
          </div>
        </div>
        <div style={{ flex: '1 1 340px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${lapseTone}`, borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>No longer in force</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: lapseTone }}>{d.lapseRate.toFixed(1)}% lapse rate</div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <MiniStat label="Lapsed" value={fmt(d.lapsedPremium)} color={lapseTone} sub={`${d.lapsedCount} policies · premium/yr lost`} />
            <MiniStat label="Surrendered" value={fmt(d.surrenderedPremium)} sub={`${d.surrenderedCount} policies`} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <DonutBreakdown title="In-force premium by insurer" items={d.byInsurer} emptyHint="No in-force policies." />
        <DonutBreakdown title="Protection in force by type" items={d.coverMix} emptyHint="No cover recorded." />
      </div>

      {/* Per-advisor, with lapse rate beside the book it belongs to. */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Insurance book by advisor</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.3fr 1.3fr 1fr', padding: '8px 20px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          {['Advisor', 'In force', 'Annual premium', 'Sum assured', 'Lapse rate'].map(h => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
          ))}
        </div>
        {d.advisors.map(a => {
          const tone = a.lapseRate >= 20 ? '#ef4444' : a.lapseRate >= 10 ? '#d97706' : 'var(--text3)';
          return (
            <div key={a.name} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.3fr 1.3fr 1fr', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{a.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>{a.policies}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmt(a.premium)}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{fmt(a.sumAssured)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: tone }}>{a.lapseRate.toFixed(1)}%<span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}> ({a.lapsed})</span></div>
            </div>
          );
        })}
      </div>

      {/* Policies written per year — the only new-business trend the record supports. */}
      {d.newByYear.length > 1 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Policies written per year</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>By commencement date, all statuses</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 110 }}>
            {d.newByYear.map(y => (
              <div key={y.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>{y.count}</div>
                <div style={{ width: '100%', maxWidth: 46, height: `${Math.max((y.count / maxYear) * 74, 3)}px`, background: '#F37338', borderRadius: '4px 4px 0 0' }} />
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{y.year}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Data quality tab ──────────────────────────────────────────────────────────

/**
 * Standing checks over the whole book. Passing checks stay on screen rather
 * than being hidden: "0 duplicate rows" is the reassurance an admin comes here
 * for, and a list that only ever shows problems can't be distinguished from one
 * that failed to load.
 */
function DataQualityTab({ report, error: err, onRescan }: {
  report: DataQualityReport | null; error: string; onRescan: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const load = onRescan;

  if (err)     return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{err}</div>;
  if (!report) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Scanning the book…</div>;

  const failing = report.checks.filter(c => c.findings.length > 0);
  const passing = report.checks.filter(c => c.findings.length === 0);
  const errors  = failing.filter(c => c.severity === 'error').reduce((n, c) => n + c.findings.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          Scanned {report.holdingsScanned.toLocaleString('en-MY')} holdings and {report.clientsScanned.toLocaleString('en-MY')} clients ·{' '}
          {report.totalFindings === 0
            ? 'no issues found'
            : `${report.totalFindings} finding${report.totalFindings === 1 ? '' : 's'}${errors ? ` (${errors} needing correction)` : ''}`}
        </div>
        <button onClick={load} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>⟳ Re-scan</button>
      </div>

      {report.totalFindings === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '28px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Every check passed</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Nothing in the book is missing data these checks look for.</div>
        </div>
      )}

      {failing.map(c => {
        const isOpen = expanded[c.id] ?? false;
        const tone   = c.severity === 'error' ? '#ef4444' : '#d97706';
        const shown  = isOpen ? c.findings : c.findings.slice(0, 5);
        return (
          <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${tone}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.title}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, color: tone, background: `${tone}1f`, border: `1px solid ${tone}59` }}>
                  {c.findings.length}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{c.impact}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>Fix: {c.fix}</div>
            </div>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {shown.map(fd => (
                <div key={`${c.id}-${fd.id}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.6fr', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, overflowWrap: 'anywhere' }}>{fd.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {fd.clientName || '—'}
                    {fd.advisor && <div style={{ fontSize: 11 }}>{fd.advisor}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{fd.detail}</div>
                </div>
              ))}
              {c.findings.length > 5 && (
                <button
                  onClick={() => setExpanded(p => ({ ...p, [c.id]: !isOpen }))}
                  style={{ width: '100%', padding: '9px 20px', fontSize: 12, fontWeight: 600, border: 'none', background: 'none', color: '#F37338', cursor: 'pointer', textAlign: 'left' }}
                >
                  {isOpen ? 'Show less' : `Show all ${c.findings.length}`}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {passing.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Passing ({passing.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {passing.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)' }}>
                <span style={{ color: '#22c55e' }}>✓</span>{c.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Advisors tab ──────────────────────────────────────────────────────────────

function AdvisorsTab({ advisors, onSelectFA }: { advisors: FAStats[]; onSelectFA: (fa: FAStats) => void }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 1fr', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        {['Advisor', 'Status', 'AUM', 'Clients', 'Gmail'].map(h => (
          <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
        ))}
      </div>
      {advisors.length === 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No advisors found.</div>
      )}
      {advisors.map(fa => (
        <div
          key={fa.id}
          onClick={() => onSelectFA(fa)}
          style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 1fr', padding: '14px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(243,115,56,0.04)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fa.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>@{fa.username}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot active={fa.active} />
            <span style={{ fontSize: 12, color: fa.active ? '#22c55e' : 'var(--text3)' }}>{fa.active ? 'Active' : 'Inactive'}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fa.totalAUM > 0 ? fmt(fa.totalAUM) : '—'}</div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>{fa.clientCount}</div>
          <div style={{ fontSize: 12, color: fa.hasGmail ? '#22c55e' : 'var(--text3)' }}>{fa.hasGmail ? '✓ Connected' : 'Not set'}</div>
        </div>
      ))}
    </div>
  );
}

// ── Clients tab ───────────────────────────────────────────────────────────────

function ClientsTab({ faId, faName, onBack }: { faId?: string; faName?: string; onBack?: () => void }) {
  const router = useRouter();
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    setLoading(true);
    const url = faId ? `/api/admin/clients?fa=${faId}` : '/api/admin/clients';
    fetch(url).then(r => r.json()).then(d => {
      setClients(d.clients ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [faId]);

  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.advisorName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 99, padding: '6px 12px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>← Back</button>
          )}
          {faName && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)' }}>Clients of {faName}</span>}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients or advisor…"
          style={{ padding: '8px 14px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text)', width: 240, fontFamily: 'var(--font-sans)' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading clients…</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr 1fr', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            {['Client', 'Advisor', 'AUM', 'Risk', 'Segment', 'Next Review'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              {search ? 'No clients match your search.' : 'No clients found.'}
            </div>
          )}
          {filtered.map(client => {
            const days = daysUntil(client.nextReview);
            const reviewColor = days === null ? 'var(--text3)' : days < 0 ? 'var(--red)' : days <= 30 ? 'var(--orange)' : 'var(--text2)';
            return (
              <div
                key={client.id}
                onClick={() => router.push(`/clients/${encodeURIComponent(client.id)}`)}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(243,115,56,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{upperName(client.name)}</div>
                  {client.email && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{client.email}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{client.advisorName}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{client.aum > 0 ? fmt(client.aum) : '—'}</div>
                <div>
                  {client.risk && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(243,115,56,0.1)', color: 'var(--orange)', fontWeight: 600 }}>{client.risk}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{client.segment || '—'}</div>
                <div style={{ fontSize: 12, color: reviewColor, fontWeight: days !== null && days <= 30 ? 600 : 400 }}>
                  {client.nextReview ? fmtDate(client.nextReview) : '—'}
                  {days !== null && days < 0 && <div style={{ fontSize: 10 }}>OVERDUE</div>}
                  {days !== null && days >= 0 && days <= 30 && <div style={{ fontSize: 10 }}>{days}d</div>}
                </div>
              </div>
            );
          })}
          {filtered.length > 0 && (
            <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text3)' }}>
              {filtered.length} client{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────

// ── Platforms tab ─────────────────────────────────────────────────────────────

function PlatformsTab() {
  const [groups,  setGroups]  = useState<PlatformGroup[]>([]);
  const [inUse,   setInUse]   = useState<string[]>([]);   // platforms seen on live holdings
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');
  const [err,     setErr]     = useState('');
  const [newPlatform, setNewPlatform] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, pRes] = await Promise.all([
        fetch('/api/admin/platform-groups').then(r => r.json()),
        fetch('/api/notion?type=portfolio').then(r => r.json()),
      ]);
      if (gRes.error) { setErr(gRes.error); return; }
      setGroups(gRes.groups ?? []);
      if (Array.isArray(pRes.data)) {
        setInUse([...new Set(
          (pRes.data as { platform?: string }[]).map(h => h.platform ?? '').filter(Boolean),
        )].sort());
      }
    } catch { setErr('Failed to load platform groups.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Platforms present in holdings that no group claims — these are what an
  // advisor sees as "uncategorised" on the Investment page.
  const assigned   = new Set(groups.flatMap(g => g.platforms.map(p => p.toLowerCase())));
  const unassigned = inUse.filter(p => !assigned.has(p.toLowerCase()));

  function update(next: PlatformGroup[]) { setGroups(next); setMsg(''); setErr(''); }

  const addGroup = () => update([...groups, { id: `group-${Date.now()}`, name: '', platforms: [] }]);
  const removeGroup = (id: string) => update(groups.filter(g => g.id !== id));
  const renameGroup = (id: string, name: string) =>
    update(groups.map(g => (g.id === id ? { ...g, name } : g)));
  const addPlatform = (id: string, platform: string) => {
    const clean = platform.trim();
    if (!clean) return;
    update(groups.map(g => (g.id === id && !g.platforms.some(p => p.toLowerCase() === clean.toLowerCase())
      ? { ...g, platforms: [...g.platforms, clean] } : g)));
    setNewPlatform(prev => ({ ...prev, [id]: '' }));
  };
  const removePlatform = (id: string, platform: string) =>
    update(groups.map(g => (g.id === id ? { ...g, platforms: g.platforms.filter(p => p !== platform) } : g)));

  async function save() {
    setSaving(true); setMsg(''); setErr('');
    try {
      const res  = await fetch('/api/admin/platform-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Could not save.'); return; }
      setGroups(data.groups);
      setMsg('Saved. The Investment page will use these groups.');
    } catch { setErr('Could not save.'); }
    finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading platform groups…</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.6 }}>
        Group the platforms your holdings sit on. The Investment page breaks total AUM down by these groups,
        so a platform can only belong to one group.
      </div>

      {/* Unassigned platforms — surfaces new custodians as soon as holdings appear */}
      {unassigned.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>
            ⚠️ {unassigned.length} platform{unassigned.length === 1 ? '' : 's'} not in any group
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
            Found on live holdings but not grouped yet — their AUM shows as “Ungrouped”.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unassigned.map(p => (
              <span key={p} style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>{p}</span>
            ))}
          </div>
        </div>
      )}

      {/* Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(g => (
          <div key={g.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <input
                value={g.name}
                onChange={e => renameGroup(g.id, e.target.value)}
                placeholder="Group name (e.g. Offshore EAM)"
                style={{ flex: 1, padding: '8px 12px', fontSize: 14, fontWeight: 700, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
              />
              <button onClick={() => removeGroup(g.id)} title="Delete group"
                style={{ padding: '8px 12px', fontSize: 13, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text3)', cursor: 'pointer' }}>🗑</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {g.platforms.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>No platforms yet.</span>
              )}
              {g.platforms.map(p => (
                <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent2)', border: '1px solid var(--border)' }}>
                  {p}
                  {inUse.some(u => u.toLowerCase() === p.toLowerCase()) && (
                    <span title="In use by live holdings" style={{ fontSize: 9, color: 'var(--green)' }}>●</span>
                  )}
                  <button onClick={() => removePlatform(g.id, p)} title={`Remove ${p}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, lineHeight: 1, padding: '0 3px' }}>×</button>
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newPlatform[g.id] ?? ''}
                onChange={e => setNewPlatform(prev => ({ ...prev, [g.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlatform(g.id, newPlatform[g.id] ?? ''); } }}
                placeholder="Add platform (e.g. SwissQuote)"
                list={`platforms-in-use-${g.id}`}
                style={{ flex: 1, maxWidth: 280, padding: '7px 11px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
              />
              <datalist id={`platforms-in-use-${g.id}`}>
                {unassigned.map(p => <option key={p} value={p} />)}
              </datalist>
              <button onClick={() => addPlatform(g.id, newPlatform[g.id] ?? '')}
                style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer' }}>＋ Add</button>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button onClick={addGroup}
          style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text2)', cursor: 'pointer' }}>＋ Add Group</button>
        <button onClick={save} disabled={saving}
          style={{ padding: '9px 20px', fontSize: 13, fontWeight: 700, background: '#F37338', border: 'none', borderRadius: 99, color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save Groups'}
        </button>
        {msg && <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ {msg}</span>}
        {err && <span style={{ fontSize: 13, color: 'var(--red)' }}>{err}</span>}
      </div>
    </div>
  );
}

// ── Needs Action tab ──────────────────────────────────────────────────────────
// Every Matured / KO / KI structured note company-wide, grouped by ISIN so a
// note shared across several clients (and possibly several FAs) shows up as
// ONE entry naming every affected FA — not as unrelated-looking duplicate
// rows an admin has to notice are actually the same note. Confirming exit on
// a group is one bulk action that redeems every client's copy of that note
// at once (see POST /api/portfolio/confirm-note-exit) — the whole reason this
// is grouped in the first place, rather than left as individual confirm
// buttons that could be clicked one at a time and leave siblings behind.
function NeedsActionTab({ groups, onConfirm, confirmingKey }: {
  groups: AttentionGroup[];
  onConfirm: (g: AttentionGroup) => void;
  confirmingKey: string;
}) {
  if (!groups.length) {
    return (
      <div className="section" style={{ padding: '64px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Nothing needs action</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>No structured note is flagged Matured, likely knocked-out, or KI-breached right now.</div>
      </div>
    );
  }

  const flagMeta = {
    ki:              { label: 'KI breached',  color: '#d97706', bg: 'rgba(217,119,6,0.12)',  border: 'rgba(217,119,6,0.35)' },
    'likely-ko':     { label: 'Likely KO',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)' },
    'likely-matured': { label: 'Matured',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)' },
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
        {groups.length} note{groups.length === 1 ? '' : 's'} flagged. A note shared by several clients (and possibly several FAs) shows once, with every
        affected FA named — confirming it redeems every client&apos;s copy in one action. Knock-in is a risk warning on a note still held; there is nothing to confirm there.
      </div>
      {groups.map(g => {
        const meta = flagMeta[g.flag];
        const key = g.productName;
        const isConfirming = confirmingKey === key;
        return (
          <div key={key} style={{ background: 'var(--surface)', border: `1px solid ${meta.border}`, borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{g.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
                    {meta.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  {g.rows.length} client{g.rows.length === 1 ? '' : 's'} affected · {fmt(g.totalValueMyr)} total
                  {g.advisors.length > 1 && (
                    <span style={{ marginLeft: 6, color: '#F37338', fontWeight: 600 }}>· shared across {g.advisors.length} FAs</span>
                  )}
                </div>
              </div>
              {g.flag === 'ki' ? (
                <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>Monitor only — still held</span>
              ) : (
                <button
                  onClick={() => onConfirm(g)}
                  disabled={isConfirming}
                  title={`Mark all ${g.rows.length} affected holding(s) Redeemed`}
                  style={{
                    flexShrink: 0, padding: '7px 16px', fontSize: 12, fontWeight: 700, borderRadius: 8,
                    cursor: isConfirming ? 'wait' : 'pointer',
                    background: isConfirming ? 'var(--surface)' : '#ef4444',
                    color: isConfirming ? 'var(--text3)' : '#fff',
                    border: '1px solid #ef4444', opacity: isConfirming ? 0.6 : 1,
                  }}
                >
                  {isConfirming ? 'Saving…' : g.rows.length > 1 ? `Confirm exit (all ${g.rows.length})` : 'Confirm exit'}
                </button>
              )}
            </div>

            {/* Who this actually touches — the FAs and their clients, so an
                admin acting on a shared note sees the full blast radius before
                clicking, not just a count. */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.rows.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text2)' }}>{r.clientName || '—'} <span style={{ color: 'var(--text3)' }}>· {r.advisor || '—'}</span></span>
                  <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{fmt(r.valueMyr)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type AdminTab = 'today' | 'investment' | 'action' | 'insurance' | 'advisors' | 'clients' | 'platforms' | 'quality';

export default function AdminPage() {
  const router = useRouter();
  const [tab,      setTab]      = useState<AdminTab>('today');
  const [overview,  setOverview]  = useState<AdminOverview | null>(null);
  const [insurance, setInsurance] = useState<InsuranceOverview | null>(null);
  const [insErr,    setInsErr]    = useState('');
  const [quality,   setQuality]   = useState<DataQualityReport | null>(null);
  const [qualErr,   setQualErr]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [selectedFA, setSelectedFA] = useState<FAStats | null>(null);
  const [confirmingId, setConfirmingId] = useState<string>('');

  /**
   * The three company-wide reads run in parallel: the headline row draws on all
   * of them, so serialising would delay the whole page for no reason. Each
   * failure is reported where that data is shown rather than blanking the page
   * — the investment side stays usable when the policy scan or the data-quality
   * scan is the thing that broke.
   *
   * Only the investment fetch gates `loading`, because the header and tabs can
   * render as soon as it lands; the other two fill in their own cards.
   */
  const loadOverview = useCallback(async () => {
    setLoading(true);
    const [inv, ins, dq] = await Promise.allSettled([
      fetch('/api/admin/overview').then(r => r.json()),
      fetch('/api/admin/insurance-overview').then(r => r.json()),
      fetch('/api/admin/data-quality').then(r => r.json()),
    ]);

    if (inv.status === 'fulfilled' && !inv.value.error) { setOverview(inv.value); setErr(''); }
    else setErr(inv.status === 'fulfilled' ? inv.value.error : 'Failed to load admin data.');

    if (ins.status === 'fulfilled' && !ins.value.error) { setInsurance(ins.value); setInsErr(''); }
    else setInsErr(ins.status === 'fulfilled' ? ins.value.error : 'Failed to load the insurance book.');

    if (dq.status === 'fulfilled' && !dq.value.error) { setQuality(dq.value); setQualErr(''); }
    else setQualErr(dq.status === 'fulfilled' ? dq.value.error : 'Failed to run the data-quality checks.');

    setLoading(false);
  }, []);

  const qualityErrors = quality?.checks
    .filter(c => c.severity === 'error')
    .reduce((n, c) => n + c.findings.length, 0) ?? 0;

  useEffect(() => { loadOverview(); }, [loadOverview]);

  /**
   * Confirm a flagged note has actually exited — for EVERY client holding a
   * copy of it, in one action. The KO/maturity flag itself is a system hint
   * and never changes status on its own, so nothing leaves an advisor's book
   * without an admin saying so here; this is the only thing that writes it.
   *
   * A shared note is one row per client, but the underlying fact (it knocked
   * out / matured) is the same for all of them — so this calls the bulk
   * endpoint keyed on the ISIN, not a single holding id, and it redeems every
   * client's copy across every FA at once. See POST /api/portfolio/confirm-note-exit.
   *
   * Deliberately offered for KO/maturity only — a KI is a principal-protection
   * warning on a note that is still held, so there is nothing to confirm.
   */
  async function confirmExit(g: AttentionGroup) {
    const label = g.flag === 'likely-matured' ? 'matured' : 'knocked out';
    const who = g.rows.length > 1
      ? `${g.rows.length} clients across ${g.advisors.join(', ')}`
      : `${g.rows[0]?.clientName || '—'} (${g.rows[0]?.advisor || '—'})`;
    if (!confirm(
      `Confirm this note has ${label}?\n\n${g.name}\n` +
      `Affects: ${who}\nTotal value: ${fmt(g.totalValueMyr)}\n\n` +
      `All ${g.rows.length} holding(s) will be marked Redeemed and removed from active AUM.`
    )) return;
    setConfirmingId(g.productName);
    try {
      const res = await fetch('/api/portfolio/confirm-note-exit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productName: g.productName }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error ?? 'Could not confirm this note.'); return; }
      await loadOverview();
    } catch {
      alert('Could not confirm this note — network error.');
    } finally {
      setConfirmingId('');
    }
  }

  function handleSelectFA(fa: FAStats) {
    setSelectedFA(fa);
    setTab('clients');
  }

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Dashboard</h1>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Bill Morrisons Group — your work, and where the firm stands</div>
          </div>
          <button onClick={loadOverview} style={{ padding: '8px 14px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>⟳ Refresh</button>
        </div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading platform data…</div>}
      {err    && <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{err}</div>}

      {!loading && !err && overview && (
        <>
          {/* Headline row — both books the firm runs, side by side. Premium is
              in force only, so it can't be read against AUM as if lapsed
              policies still earned. Gmail connection is an ops detail, not a
              company figure; it lives on the Advisors tab where it belongs. */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
            <StatCard label="Combined AUM"  value={overview.totalAUM > 0 ? fmt(overview.totalAUM) : '—'} sub={`across ${overview.totalHoldings.toLocaleString('en-MY')} holdings`} color="#22c55e" />
            <StatCard
              label="In-force Premium"
              value={insurance ? fmt(insurance.inForcePremium) : '—'}
              sub={insurance ? `${insurance.inForceCount} active policies` : 'insurance book unavailable'}
              color="#38bdf8"
            />
            <StatCard label="Invested Clients" value={String(overview.investedClients)} sub={`of ${overview.totalClients} total clients`} color="#818cf8" />
            <StatCard label="Advisors"      value={String(overview.activeFAs)} sub={`${overview.totalFAs - overview.activeFAs} inactive`} />
            <StatCard
              label="Needs Action"
              value={String(overview.attention.length)}
              sub={overview.attention.length ? 'notes to confirm' : 'all clear'}
              color={overview.attention.length ? '#ef4444' : 'var(--text3)'}
            />
            <StatCard
              label="Data Issues"
              value={quality ? String(quality.totalFindings) : '—'}
              sub={quality
                ? (qualityErrors ? `${qualityErrors} need correction` : quality.totalFindings ? 'gaps to fill' : 'book is clean')
                : 'not scanned'}
              color={qualityErrors ? '#ef4444' : quality?.totalFindings ? '#d97706' : 'var(--text3)'}
            />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {([
              { id: 'today',      label: '🏠 Today'      },
              { id: 'investment', label: '📈 Investment' },
              { id: 'action',     label: `🔔 Needs Action${overview.attention.length ? ` (${overview.attention.length})` : ''}` },
              { id: 'insurance',  label: '🛡️ Insurance'  },
              { id: 'advisors',   label: '👥 Advisors'   },
              { id: 'clients',    label: '📋 All Clients' },
              { id: 'platforms',  label: '🏦 Platforms'  },
              { id: 'quality',    label: '🩺 Data Quality' },
            ] as { id: AdminTab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); if (t.id !== 'clients') setSelectedFA(null); }}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  border: 'none', background: 'none',
                  color: tab === t.id ? '#F37338' : 'var(--text3)',
                  borderBottom: tab === t.id ? '2px solid #F37338' : '2px solid transparent',
                  cursor: 'pointer', marginBottom: -1,
                }}
              >{t.label}</button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'today' && <TodayTab />}

          {tab === 'investment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* What the company's money is actually in, and where it's custodied. */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <DonutBreakdown title="AUM by asset class" items={overview.byAssetClass} emptyHint="No holdings recorded yet." />
                <DonutBreakdown title="AUM by platform group" items={overview.byPlatformGroup} emptyHint="No holdings recorded yet." />
              </div>

              {/* Who holds it. Sorted by AUM with a share bar, so the split across
                  the firm reads at a glance instead of as a flat list. */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>AUM by advisor</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Click an advisor to see their clients</div>
                </div>
                {overview.advisors.filter(fa => fa.totalAUM > 0 || fa.clientCount > 0).map(fa => {
                  const share = overview.totalAUM > 0 ? (fa.totalAUM / overview.totalAUM) * 100 : 0;
                  return (
                    <div key={fa.id} onClick={() => handleSelectFA(fa)}
                      style={{ padding: '10px 8px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(243,115,56,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(243,115,56,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#F37338', flexShrink: 0 }}>
                            {fa.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {fa.name}
                              {!fa.active && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>inactive</span>}
                              {fa.needsAction > 0 && (
                                <span title={`${fa.needsAction} note(s) awaiting your confirmation`} style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 4, padding: '0 5px' }}>
                                  ⚠ {fa.needsAction}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                              {fa.investedClients} invested · {fa.clientCount} clients · {fa.holdingCount} holdings
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fa.totalAUM > 0 ? fmt(fa.totalAUM) : '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{share >= 0.1 ? `${share.toFixed(1)}%` : '—'}</div>
                        </div>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                        <div style={{ width: `${share}%`, height: '100%', background: '#F37338', borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* The one thing on this page that needs a decision, not just a
                  read — full detail (grouped by note, with bulk confirm) lives
                  on its own tab so it isn't squeezed into a capped preview. */}
              {overview.attentionGroups.length > 0 && (
                <div
                  onClick={() => setTab('action')}
                  style={{ background: 'var(--surface)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '16px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
                      {overview.attentionGroups.length} note{overview.attentionGroups.length === 1 ? '' : 's'} flagged Matured / KO / KI ({overview.attention.length} client holding{overview.attention.length === 1 ? '' : 's'} affected)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      A note shared across FAs shows once, naming everyone it touches — confirming it redeems every client&apos;s copy together.
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>Review →</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setTab('advisors')} style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, background: '#F37338', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>👥 Manage Advisors</button>
                <button onClick={() => { setTab('clients'); setSelectedFA(null); }} style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>📋 View All Clients</button>
                <button onClick={() => router.push('/portfolio')} style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>📈 Open Investments</button>
              </div>
            </div>
          )}

          {tab === 'action' && (
            <NeedsActionTab groups={overview.attentionGroups} onConfirm={confirmExit} confirmingKey={confirmingId} />
          )}

          {tab === 'advisors' && (
            <AdvisorsTab advisors={overview.advisors} onSelectFA={handleSelectFA} />
          )}

          {tab === 'insurance' && <InsuranceTab data={insurance} error={insErr} />}

          {tab === 'platforms' && <PlatformsTab />}

          {tab === 'quality' && <DataQualityTab report={quality} error={qualErr} onRescan={loadOverview} />}

          {tab === 'clients' && (
            <ClientsTab
              faId={selectedFA?.id}
              faName={selectedFA?.name}
              onBack={selectedFA ? () => { setSelectedFA(null); setTab('advisors'); } : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
