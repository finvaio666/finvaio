'use client';

import { useState, useEffect, useCallback } from 'react';

interface Task {
  id: string; task: string; client: string;
  status: 'Open' | 'Done'; due: string; source: string; doneDate: string;
}

function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

export default function TasksPage() {
  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notConfig, setNotConfig] = useState(false);
  const [filter,    setFilter]    = useState<'open' | 'done' | 'all'>('open');
  const [search,    setSearch]    = useState('');
  const [syncing,   setSyncing]   = useState(false);
  const [syncMsg,   setSyncMsg]   = useState('');
  // Add form
  const [newTask,   setNewTask]   = useState('');
  const [newClient, setNewClient] = useState('');
  const [newDue,    setNewDue]    = useState('');
  const [adding,    setAdding]    = useState(false);

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

  async function toggle(t: Task) {
    // optimistic
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: x.status === 'Open' ? 'Done' : 'Open' } : x));
    await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: t.id, done: t.status === 'Open' }) });
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
    if (filter === 'open' && t.status !== 'Open') return false;
    if (filter === 'done' && t.status !== 'Done') return false;
    if (search && !`${t.task} ${t.client}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCount = tasks.filter(t => t.status === 'Open').length;

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

  return (
    <div className="section" style={{ padding: 0 }}>
      {/* Header */}
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Tasks</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{openCount} open · {tasks.length} total</div>
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
          {(['open', 'done', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 14px', fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
              border: 'none', borderRadius: 'var(--r-pill)', cursor: 'pointer',
              background: filter === f ? '#F37338' : 'var(--surface)',
              color: filter === f ? '#fff' : 'var(--text3)',
            }}>{f}</button>
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

      {/* List */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading tasks…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          {filter === 'open' ? '🎉 No open tasks — all caught up!' : 'No tasks here.'}
        </div>
      ) : (
        filtered.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 24px', borderBottom: '1px solid var(--border)', opacity: t.status === 'Done' ? 0.55 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--text)', textDecoration: t.status === 'Done' ? 'line-through' : 'none' }}>{t.task}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {t.client && <span>👤 {t.client}</span>}
                {t.due && <span>📅 {fmtDate(t.due)}</span>}
                {t.source && <span style={{ opacity: 0.7 }}>· {t.source}</span>}
              </div>
            </div>
            <button onClick={() => toggle(t)} style={{
              padding: '5px 12px', borderRadius: 'var(--r-pill)', flexShrink: 0, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: t.status === 'Done' ? 'var(--text3)' : '#22c55e',
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
            }}>{t.status === 'Done' ? '↩ Reopen' : '✓ Mark as Done'}</button>
            <button onClick={() => remove(t.id)} title="Delete task" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
          </div>
        ))
      )}
    </div>
  );
}
