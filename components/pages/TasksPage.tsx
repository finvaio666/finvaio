'use client';

import { useState, useEffect, useCallback } from 'react';
import { TASK_STATUSES, daysSince, type Task, type TaskStatus } from '@/lib/taskModel';

function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

/** Colour per stage — live work reads warm, blocked reads amber, done recedes. */
const STATUS_STYLE: Record<TaskStatus, { bg: string; fg: string; dot: string }> = {
  'Open':              { bg: 'var(--surface2)', fg: 'var(--text2)', dot: 'var(--text3)' },
  'In Progress':       { bg: 'rgba(243,115,56,0.12)', fg: '#F37338', dot: '#F37338' },
  'Waiting on Client': { bg: 'var(--gold-dim)', fg: 'var(--gold)', dot: 'var(--gold)' },
  'Done':              { bg: 'rgba(34,197,94,0.12)', fg: '#22c55e', dot: '#22c55e' },
};

/** A live task untouched this long is worth surfacing during a review. */
const STALE_DAYS = 14;

export default function TasksPage() {
  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notConfig, setNotConfig] = useState(false);
  const [filter,    setFilter]    = useState<'live' | TaskStatus | 'all'>('live');
  const [search,    setSearch]    = useState('');
  const [syncing,   setSyncing]   = useState(false);
  const [syncMsg,   setSyncMsg]   = useState('');
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [busy,      setBusy]      = useState<string | null>(null);
  const [error,     setError]     = useState('');
  // Add form
  const [newTask,   setNewTask]   = useState('');
  const [newClient, setNewClient] = useState('');
  const [newDue,    setNewDue]    = useState('');
  const [adding,    setAdding]    = useState(false);
  // Per-task "add an update" drafts, keyed by task id
  const [drafts,    setDrafts]    = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/tasks', { cache: 'no-store' });
      const data = await res.json();
      if (data.notConfigured) { setNotConfig(true); setLoading(false); return; }
      setTasks(data.tasks ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Every movement goes through here: a stage change, a typed progress note, or
   * both. The server appends to the task's log and stamps the last-moved date,
   * so the reload brings back the real history rather than a guess.
   */
  async function patch(taskId: string, change: { status?: TaskStatus; note?: string }) {
    setBusy(taskId); setError('');
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, ...change }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '' }));
        setError(j.error || 'Could not save that update.');
        return false;
      }
      await load();
      return true;
    } catch {
      setError('Network error — the update was not saved.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function addUpdate(t: Task) {
    const note = (drafts[t.id] ?? '').trim();
    if (!note) return;
    if (await patch(t.id, { note })) setDrafts(d => ({ ...d, [t.id]: '' }));
  }

  async function addTask() {
    if (!newTask.trim()) return;
    setAdding(true);
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: newTask, client: newClient, due: newDue || undefined }) });
    setNewTask(''); setNewClient(''); setNewDue('');
    await load();
    setAdding(false);
  }

  async function sync() {
    setSyncing(true); setSyncMsg('');
    const res = await fetch('/api/tasks/sync', { method: 'POST' });
    const data = await res.json();
    if (data.error) setSyncMsg(data.error);
    else setSyncMsg(`${data.created} new task${data.created === 1 ? '' : 's'} imported from meetings.`);
    await load();
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 4000);
  }

  async function remove(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
  }

  const filtered = tasks.filter(t => {
    if (filter === 'live' && t.status === 'Done') return false;
    if (filter !== 'live' && filter !== 'all' && t.status !== filter) return false;
    if (search && !`${t.task} ${t.client}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const liveCount  = tasks.filter(t => t.status !== 'Done').length;
  const staleCount = tasks.filter(t => {
    if (t.status === 'Done') return false;
    const d = daysSince(t.updated);
    return d !== null && d >= STALE_DAYS;
  }).length;

  if (notConfig) {
    return (
      <div className="section" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Tasks not set up yet</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
          Your Tasks database hasn&apos;t been configured. Ask your admin to create a Notion &quot;Tasks&quot; database and add its ID to your profile.
        </div>
      </div>
    );
  }

  const chips: ('live' | TaskStatus | 'all')[] = ['live', ...TASK_STATUSES, 'all'];

  return (
    <div className="section" style={{ padding: 0 }}>
      {/* Header */}
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Tasks</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {liveCount} live · {tasks.length} total
              {staleCount > 0 && <span style={{ color: 'var(--gold)' }}> · {staleCount} with no movement in {STALE_DAYS}+ days</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {syncMsg && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{syncMsg}</span>}
            <button onClick={sync} disabled={syncing} style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
              {syncing ? 'Importing…' : '↻ Import from meetings'}
            </button>
          </div>
        </div>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {chips.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 14px', fontSize: 13, fontWeight: 600,
              border: 'none', borderRadius: 'var(--r-pill)', cursor: 'pointer',
              background: filter === f ? '#F37338' : 'var(--surface)',
              color: filter === f ? '#fff' : 'var(--text3)',
              fontFamily: 'var(--font-sans)',
            }}>{f === 'live' ? 'Live' : f === 'all' ? 'All' : f}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks or client…" style={{ marginLeft: 'auto', padding: '7px 12px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', color: 'var(--text)', width: 220, fontFamily: 'var(--font-sans)' }} />
        </div>
      </div>

      {/* Add task */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(243,115,56,0.03)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask(); }} placeholder="Add a task…" style={{ flex: 2, minWidth: 200, padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
        <input value={newClient} onChange={e => setNewClient(e.target.value)} placeholder="Client (optional)" style={{ flex: 1, minWidth: 130, padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
        <input value={newDue} onChange={e => setNewDue(e.target.value)} type="date" style={{ padding: '8px 10px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
        <button onClick={addTask} disabled={adding || !newTask.trim()} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 'var(--r-pill)', cursor: 'pointer', opacity: adding || !newTask.trim() ? 0.6 : 1 }}>+ Add</button>
      </div>

      {error && (
        <div style={{ padding: '10px 24px', background: 'var(--red-dim)', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--red)' }}>{error}</div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading tasks…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          {filter === 'live' ? '🎉 Nothing outstanding — all caught up!' : 'No tasks here.'}
        </div>
      ) : (
        filtered.map(t => {
          const isOpen  = expanded === t.id;
          const st      = STATUS_STYLE[t.status];
          const idle    = t.status === 'Done' ? null : daysSince(t.updated);
          const isStale = idle !== null && idle >= STALE_DAYS;
          const last    = t.progress[t.progress.length - 1];

          return (
            <div key={t.id} style={{ borderBottom: '1px solid var(--border)', opacity: t.status === 'Done' ? 0.6 : 1 }}>
              {/* Summary row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 24px' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-sans)' }}
                >
                  <div style={{ fontSize: 14, color: 'var(--text)', textDecoration: t.status === 'Done' ? 'line-through' : 'none' }}>{t.task}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 'var(--r-pill)', background: st.bg, color: st.fg, fontWeight: 600 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot }} />
                      {t.status}
                    </span>
                    {t.client && <span>👤 {t.client}</span>}
                    {t.due && <span>📅 {fmtDate(t.due)}</span>}
                    {t.progress.length > 0 && <span>🗒 {t.progress.length} update{t.progress.length === 1 ? '' : 's'}</span>}
                    {isStale && <span style={{ color: 'var(--gold)', fontWeight: 600 }}>⚠ no movement in {idle}d</span>}
                    {t.source && <span style={{ opacity: 0.7 }}>· {t.source}</span>}
                    <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {!isOpen && last && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Last: {last.note}
                    </div>
                  )}
                </button>
                <button onClick={() => remove(t.id)} title="Delete task" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
              </div>

              {/* Expanded: stage control + movement log */}
              {isOpen && (
                <div style={{ padding: '0 24px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Stage */}
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Stage</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TASK_STATUSES.map(s => {
                        const active = t.status === s;
                        return (
                          <button key={s} disabled={busy === t.id || active}
                            onClick={() => patch(t.id, { status: s })}
                            style={{
                              padding: '5px 13px', borderRadius: 'var(--r-pill)', fontSize: 12.5, fontWeight: 600,
                              cursor: active ? 'default' : 'pointer', fontFamily: 'var(--font-sans)',
                              border: `1px solid ${active ? STATUS_STYLE[s].dot : 'var(--border)'}`,
                              background: active ? STATUS_STYLE[s].bg : 'none',
                              color: active ? STATUS_STYLE[s].fg : 'var(--text3)',
                              opacity: busy === t.id && !active ? 0.5 : 1,
                            }}>{s}</button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Movement log */}
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                      Progress {t.updated && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· last moved {fmtDate(t.updated)}</span>}
                    </div>
                    {t.progress.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: 'var(--text3)', fontStyle: 'italic' }}>No updates logged yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
                        {t.progress.map((e, i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13, lineHeight: 1.5 }}>
                            <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 11.5, flexShrink: 0, paddingTop: 1, minWidth: 62 }}>
                              {e.date ? fmtDate(e.date) : '—'}
                            </span>
                            <span style={{ color: 'var(--text2)' }}>{e.note}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add an update */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={drafts[t.id] ?? ''}
                      onChange={e => setDrafts(d => ({ ...d, [t.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addUpdate(t); }}
                      placeholder="Add an update — what moved?"
                      style={{ flex: 1, minWidth: 200, padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}
                    />
                    <button onClick={() => addUpdate(t)} disabled={busy === t.id || !(drafts[t.id] ?? '').trim()}
                      style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 'var(--r-pill)', cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: busy === t.id || !(drafts[t.id] ?? '').trim() ? 0.6 : 1 }}>
                      {busy === t.id ? 'Saving…' : 'Log update'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
