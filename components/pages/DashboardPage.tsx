'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useClients, formatAUM, formatDate, initials } from '@/components/useClients';

// ─── Ask ARIA — dashboard daily co-pilot ─────────────────────────────────────
interface PendingTask { task: string; client: string; due: string; }

function AskAria({ buildContext, onTasksAdded }: { buildContext: () => string; onTasksAdded?: () => void }) {
  const [question, setQuestion] = useState('');
  const [answer,   setAnswer]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [asked,    setAsked]    = useState('');
  const [pending,  setPending]  = useState<PendingTask[] | null>(null);
  const [savingTasks, setSavingTasks] = useState(false);

  async function ask(q: string) {
    const query = q.trim();
    if (!query || loading) return;
    setLoading(true); setAnswer(''); setAsked(query); setQuestion(''); setPending(null);
    try {
      const res = await fetch('/api/dashboard-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query, context: buildContext() }),
      });
      const data = await res.json();
      if (Array.isArray(data.pendingTasks)) {
        setPending(data.pendingTasks.length ? data.pendingTasks : []);
      } else {
        setAnswer(data.answer || data.error || 'No response.');
      }
    } catch {
      setAnswer('Sorry, I could not reach the assistant. Please try again.');
    }
    setLoading(false);
  }

  function updatePending(i: number, field: keyof PendingTask, val: string) {
    setPending(prev => prev ? prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t) : prev);
  }
  function removePending(i: number) {
    setPending(prev => prev ? prev.filter((_, idx) => idx !== i) : prev);
  }

  async function confirmTasks() {
    if (!pending || pending.length === 0) return;
    setSavingTasks(true);
    let created = 0;
    for (const t of pending) {
      if (!t.task.trim()) continue;
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: t.task.trim(), client: t.client.trim(), due: t.due || undefined }),
      });
      if (res.ok) created++;
    }
    setSavingTasks(false);
    setPending(null);
    setAnswer(`✅ Added ${created} task${created === 1 ? '' : 's'} to your list.`);
    onTasksAdded?.();
  }

  const quick = [
    "Draft my morning plan",
    "What's urgent right now?",
    "Who do I need to follow up with?",
    "Any reviews or birthdays coming up?",
  ];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(243,115,56,0.08), rgba(243,115,56,0.02))',
      border: '1px solid rgba(243,115,56,0.25)', borderRadius: 14,
      padding: '16px 18px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: '#F37338', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>💬</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Ask ARIA</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>your daily co-pilot</div>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ask(question); }}
          placeholder="Ask anything about your day — e.g. what's urgent today?"
          style={{
            flex: 1, padding: '10px 14px', fontSize: 13,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-pill)', color: 'var(--text)', fontFamily: 'var(--font-sans)',
          }}
        />
        <button
          onClick={() => ask(question)}
          disabled={loading || !question.trim()}
          style={{
            padding: '10px 20px', fontSize: 13, fontWeight: 700,
            background: '#F37338', color: '#fff', border: 'none', borderRadius: 'var(--r-pill)',
            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !question.trim() ? 0.6 : 1, whiteSpace: 'nowrap',
          }}
        >{loading ? '…' : 'Ask'}</button>
      </div>

      {/* Quick buttons */}
      {!answer && !loading && !pending && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {quick.map(q => (
            <button
              key={q}
              onClick={() => ask(q)}
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-pill)', color: 'var(--text2)', cursor: 'pointer',
              }}
            >{q}</button>
          ))}
        </div>
      )}

      {/* Pending tasks — review & confirm before adding */}
      {pending && (
        <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {pending.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              I couldn&apos;t find a clear task in that. Try e.g. “remind me to call Karen on Friday”.
              <button onClick={() => setPending(null)} style={{ marginLeft: 8, fontSize: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 99, padding: '3px 10px', color: 'var(--text3)', cursor: 'pointer' }}>Dismiss</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Review {pending.length} task{pending.length === 1 ? '' : 's'} before adding</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>Fill in the client, fix wording or set a due date, then add.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pending.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <input value={t.task} onChange={e => updatePending(i, 'task', e.target.value)} placeholder="Task…"
                      style={{ flex: 2, minWidth: 160, padding: '6px 9px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
                    <input value={t.client} onChange={e => updatePending(i, 'client', e.target.value)} placeholder="Client (optional)"
                      style={{ flex: 1, minWidth: 120, padding: '6px 9px', fontSize: 13, background: t.client ? 'var(--bg)' : 'rgba(243,115,56,0.06)', border: `1px solid ${t.client ? 'var(--border)' : 'rgba(243,115,56,0.4)'}`, borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
                    <input value={t.due} onChange={e => updatePending(i, 'due', e.target.value)} type="date"
                      style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                    <button onClick={() => removePending(i)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={confirmTasks} disabled={savingTasks} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer', opacity: savingTasks ? 0.6 : 1 }}>
                  {savingTasks ? 'Adding…' : `✓ Add ${pending.length} task${pending.length === 1 ? '' : 's'}`}
                </button>
                <button onClick={() => setPending(null)} style={{ padding: '8px 14px', fontSize: 13, background: 'none', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text3)', cursor: 'pointer' }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Answer */}
      {(loading || answer) && (
        <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {asked && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, fontStyle: 'italic' }}>“{asked}”</div>}
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>🤖 Thinking…</div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }} className="aria-answer">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          )}
          {answer && !loading && (
            <button
              onClick={() => { setAnswer(''); setAsked(''); }}
              style={{ marginTop: 10, padding: '4px 12px', fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', color: 'var(--text3)', cursor: 'pointer' }}
            >Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface InsurancePolicy {
  id: string; policyName: string; clientName: string;
  insurer: string; insuranceType: string; status: string;
  maturityDate: string; annualPremium: number;
}
interface Meeting {
  id: string; clientId: string; clientName: string; meetingDate: string;
  meetingType: string; notes: string; actionItems: string;
}
interface FollowUp {
  threadId: string; messageId: string; subject: string;
  to: string; toName: string; sentDate: string;
  daysWaiting: number; isOverdue: boolean;
}
interface ClientAlert {
  clientId: string; clientName: string; threadId: string;
  subject: string; snippet: string; from: string; fromName: string;
  date: string; isRead: boolean;
}
interface TaskItem {
  id: string; task: string; client: string;
  status: 'Open' | 'Done'; due: string; source: string;
}
interface CalEvent {
  id: string; title: string; start: string; end: string; allDay: boolean; location: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function daysUntilBirthday(dob: string): number | null {
  if (!dob) return null;
  const d   = new Date(dob);
  const now = new Date();
  const bday = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (bday.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    bday.setFullYear(now.getFullYear() + 1);
  }
  return Math.ceil((bday.getTime() - Date.now()) / 86_400_000);
}

function fmt(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtShort(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

const MEETING_TYPE_COLOR: Record<string, string> = {
  'Annual Review': 'var(--blue)',   'Follow-up':  'var(--green)',
  'Phone Call':    'var(--gold)',   'Video Call': 'var(--purple)',
  'Ad-hoc':        'var(--text3)', 'Onboarding': 'var(--accent)',
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { clients, loading, totalAum, activeCount, prospectCount } = useClients();
  const router = useRouter();

  const [insurance,    setInsurance]    = useState<InsurancePolicy[]>([]);
  const [meetings,     setMeetings]     = useState<Meeting[]>([]);
  const [followUps,    setFollowUps]    = useState<FollowUp[]>([]);
  const [clientAlerts, setClientAlerts] = useState<ClientAlert[]>([]);
  const [openTasks,    setOpenTasks]    = useState<TaskItem[]>([]);
  const [appointments, setAppointments] = useState<CalEvent[]>([]);
  const [completing,   setCompleting]   = useState<string[]>([]);
  const [dataLoading,  setDataLoading]  = useState(true);

  async function completeTask(id: string) {
    if (completing.includes(id)) return;
    setCompleting(prev => [...prev, id]); // show checked + strikethrough
    fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: id, done: true }) }).catch(() => {});
    setTimeout(() => {
      setOpenTasks(prev => prev.filter(x => x.id !== id));
      setCompleting(prev => prev.filter(x => x !== id));
    }, 900);
  }

  const loadTasks = () => fetch('/api/tasks?status=Open', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => { if (d.tasks) setOpenTasks(d.tasks); })
    .catch(() => {});

  useEffect(() => {
    Promise.all([
      fetch('/api/notion?type=insurance', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/meetings',              { cache: 'no-store' }).then(r => r.json()),
    ]).then(([ins, mtg]) => {
      if (ins.data) setInsurance(ins.data);
      if (mtg.data) setMeetings(mtg.data);
    }).finally(() => setDataLoading(false));

    // Follow-ups + client alerts load separately (Gmail calls can be slower) — non-blocking
    fetch('/api/email/followups', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.followUps) setFollowUps(d.followUps); })
      .catch(() => {});

    fetch('/api/email/client-alerts', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.alerts) setClientAlerts(d.alerts); })
      .catch(() => {});

    loadTasks();

    fetch('/api/calendar/events', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.events) setAppointments(d.events); })
      .catch(() => {});
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────

  // Reviews overdue or due within 14 days
  const reviewAlerts = clients
    .filter(c => { const d = daysUntil(c.nextReview); return d !== null && d <= 14; })
    .sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());

  // Birthdays in next 30 days
  const upcomingBirthdays = clients
    .filter(c => { const d = daysUntilBirthday(c.dob); return d !== null && d <= 30; })
    .sort((a, b) => (daysUntilBirthday(a.dob) ?? 99) - (daysUntilBirthday(b.dob) ?? 99));

  // Policies expiring within 60 days
  const expiringPolicies = insurance
    .filter(p => {
      if (!p.maturityDate || p.status?.toLowerCase().includes('lapsed')) return false;
      const d = daysUntil(p.maturityDate);
      return d !== null && d >= 0 && d <= 60;
    })
    .sort((a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime());

  // Last 5 meetings
  const recentMeetings = [...meetings]
    .filter(m => m.meetingDate)
    .sort((a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime())
    .slice(0, 5);

  // Stat counts
  const reviewsDue30   = clients.filter(c => { const d = daysUntil(c.nextReview); return d !== null && d <= 30; }).length;
  const pendingActions = meetings.filter(m => m.actionItems?.trim()).length;

  // ── Shared styles ────────────────────────────────────────────────────────────
  const pillStyle = (urgent: boolean, warning?: boolean): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700,
    flexShrink: 0, whiteSpace: 'nowrap' as const,
    background: urgent ? 'var(--red-dim)'
              : warning ? 'rgba(217,119,6,0.08)'
              : 'var(--surface2)',
    color: urgent ? 'var(--red)' : warning ? 'var(--gold)' : 'var(--text3)',
    border: `1px solid ${urgent ? 'rgba(220,38,38,0.2)' : warning ? 'rgba(217,119,6,0.2)' : 'var(--border)'}`,
  });

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 24px', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', transition: 'background 0.12s',
  };

  // Build a live snapshot of everything actionable for the AI co-pilot
  function buildContext(): string {
    const L: string[] = [];
    L.push(`Total clients: ${clients.length} (${activeCount} active, ${prospectCount} prospects). Combined AUM: ${formatAUM(totalAum)}.`);

    L.push('\n# REVIEWS DUE (next 14 days)');
    if (reviewAlerts.length === 0) L.push('None.');
    else reviewAlerts.forEach(c => {
      const d = daysUntil(c.nextReview) ?? 0;
      L.push(`- ${c.name}: review ${fmt(c.nextReview)} (${d < 0 ? `${Math.abs(d)}d OVERDUE` : d === 0 ? 'TODAY' : `in ${d}d`}); AUM ${formatAUM(c.aum)}, ${c.risk || 'n/a'} risk`);
    });

    L.push('\n# PENDING FOLLOW-UPS (emails to institutions awaiting reply)');
    if (followUps.length === 0) L.push('None.');
    else followUps.forEach(f => L.push(`- "${f.subject}" to ${f.toName}: waiting ${f.daysWaiting}d${f.isOverdue ? ' (OVERDUE)' : ''}`));

    L.push('\n# NEW CLIENT CORRESPONDENCE (unactioned institution emails)');
    if (clientAlerts.length === 0) L.push('None.');
    else clientAlerts.forEach(a => L.push(`- ${a.clientName}: "${a.subject}" from ${a.fromName} (${fmtShort(a.date)})${a.isRead ? '' : ' [NEW]'}`));

    L.push('\n# UPCOMING BIRTHDAYS (next 30 days)');
    if (upcomingBirthdays.length === 0) L.push('None.');
    else upcomingBirthdays.forEach(c => { const d = daysUntilBirthday(c.dob); L.push(`- ${c.name}: in ${d}d`); });

    L.push('\n# POLICIES EXPIRING (next 60 days)');
    if (expiringPolicies.length === 0) L.push('None.');
    else expiringPolicies.forEach(p => L.push(`- ${p.clientName}: ${p.policyName} (${p.insurer}) expires ${fmt(p.maturityDate)}`));

    // OPEN TASKS is the single source of truth for to-dos (reflects done/not-done).
    L.push('\n# CALENDAR APPOINTMENTS (next 14 days)');
    if (appointments.length === 0) L.push('None.');
    else appointments.slice(0, 15).forEach(a => {
      const d = new Date(a.start);
      const when = a.allDay
        ? d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' }) + ' (all day)'
        : d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
      L.push(`- ${when}: ${a.title}${a.location ? ` @ ${a.location}` : ''}`);
    });

    L.push('\n# OPEN TASKS — the authoritative to-do list (only these are outstanding)');
    if (openTasks.length === 0) L.push('None — all tasks done.');
    else openTasks.forEach(t => {
      const d = t.due ? daysUntil(t.due) : null;
      const when = d === null ? '' : d < 0 ? ` (${Math.abs(d)}d OVERDUE)` : d === 0 ? ' (due TODAY)' : ` (due in ${d}d)`;
      L.push(`- ${t.task}${t.client ? ` · ${t.client}` : ''}${when}`);
    });

    // Recent meetings for CONTEXT ONLY — do NOT treat their action items as
    // outstanding to-dos (those are tracked in OPEN TASKS above, with completion).
    L.push('\n# RECENT MEETINGS (context only — NOT a to-do list; do not list these as tasks)');
    if (recentMeetings.length === 0) L.push('None.');
    else recentMeetings.forEach(m => {
      L.push(`- ${m.clientName} · ${m.meetingType} · ${fmt(m.meetingDate)}`);
    });

    return L.join('\n');
  }

  return (
    <>
      {/* ── Ask ARIA — daily co-pilot ── */}
      <AskAria buildContext={buildContext} onTasksAdded={loadTasks} />

      {/* ── Stat Cards ── */}
      <div className="stat-grid">
        <div className="stat-card green" onClick={() => router.push('/clients')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon green">👥</div>
          <div className="stat-label">Total Clients</div>
          <div className="stat-value">{loading ? '…' : clients.length}</div>
          <div className="stat-sub">{activeCount} active · {prospectCount} prospects</div>
        </div>
        <div className="stat-card gold" onClick={() => router.push('/portfolio')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon gold">💰</div>
          <div className="stat-label">Total AUM</div>
          <div className="stat-value">{loading ? '…' : formatAUM(totalAum)}</div>
          <div className="stat-sub">Across all portfolios</div>
        </div>
        <div className="stat-card blue" onClick={() => router.push('/reviews')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon blue">📅</div>
          <div className="stat-label">Reviews Due</div>
          <div className="stat-value">{loading ? '…' : reviewsDue30}</div>
          <div className="stat-sub">Within 30 days</div>
        </div>
        <div className="stat-card red" onClick={() => router.push('/reviews')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon red">⚠️</div>
          <div className="stat-label">Action Items</div>
          <div className="stat-value">{dataLoading ? '…' : pendingActions}</div>
          <div className="stat-sub">{pendingActions === 0 ? 'All clear' : `${pendingActions} with open items`}</div>
        </div>
      </div>

      {/* ── New Client Correspondence — inbound institution emails matched to clients ── */}
      {clientAlerts.length > 0 && (
        <div className="section" style={{ marginBottom: 20, border: '1px solid var(--accent)', borderLeft: '3px solid var(--accent2)' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--accent2)' }} />
              New Client Correspondence
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>
                institution emails about your clients · last 14 days
              </span>
            </div>
            <Link href="/emails" className="section-action">Email Hub →</Link>
          </div>
          {clientAlerts.map(a => (
            <div
              key={a.threadId}
              style={rowStyle}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseOut={e  => (e.currentTarget.style.background = '')}
              onClick={() => router.push(`/emails?thread=${encodeURIComponent(a.threadId)}`)}
            >
              <div className="client-avatar" style={{ width: 36, height: 36, fontSize: 13, flexShrink: 0 }}>
                {initials(a.clientName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a.clientName}</span>
                  {!a.isRead && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent2)', background: 'var(--accent-dim)', padding: '1px 6px', borderRadius: 99, letterSpacing: '0.04em' }}>NEW</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.fromName}: {a.subject}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {fmtShort(a.date)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Follow-up Tracker — institutional emails awaiting reply ── */}
      {followUps.length > 0 && (
        <div className="section" style={{ marginBottom: 20 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--accent2)' }} />
              Pending Follow-ups
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>
                emails to institutions awaiting a reply
              </span>
            </div>
            <Link href="/emails" className="section-action">Email Hub →</Link>
          </div>
          {followUps.map(f => (
            <div
              key={f.threadId}
              style={rowStyle}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseOut={e  => (e.currentTarget.style.background = '')}
              onClick={() => router.push('/emails')}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: f.isOverdue ? 'var(--red-dim)' : 'var(--accent-dim)',
                fontSize: 16,
              }}>
                {f.isOverdue ? '🔴' : '⏳'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.subject}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  To: {f.toName} · sent {fmtShort(f.sentDate)}
                </div>
              </div>
              <div style={pillStyle(f.isOverdue, !f.isOverdue && f.daysWaiting >= 2)}>
                {f.daysWaiting === 0 ? 'Today' : `${f.daysWaiting}d waiting`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Today's Appointments (calendar) ── */}
      {appointments.length > 0 && (() => {
        const todayStr = new Date().toDateString();
        const fmtTime = (iso: string, allDay: boolean) => {
          const d = new Date(iso);
          const dayLabel = d.toDateString() === todayStr ? 'Today' : d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
          return allDay ? `${dayLabel} · all day` : `${dayLabel} · ${d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}`;
        };
        return (
          <div className="section" style={{ marginBottom: 20 }}>
            <div className="section-header">
              <div className="section-title">
                <span className="section-dot" style={{ background: 'var(--blue)' }} />
                Appointments
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>next 14 days</span>
              </div>
            </div>
            {appointments.slice(0, 6).map(a => {
              const isToday = new Date(a.start).toDateString() === todayStr;
              return (
                <div key={a.id} style={{ ...rowStyle, cursor: 'default' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? 'var(--accent-dim)' : 'var(--surface2)', fontSize: 16 }}>📅</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    {a.location && <div style={{ fontSize: 12, color: 'var(--text3)' }}>📍 {a.location}</div>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isToday ? 'var(--accent2)' : 'var(--text3)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {fmtTime(a.start, a.allDay)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Open Tasks (to-do reminders) ── */}
      {openTasks.length > 0 && (
        <div className="section" style={{ marginBottom: 20 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: '#22c55e' }} />
              My Tasks
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>
                {openTasks.length} open
              </span>
            </div>
            <Link href="/tasks" className="section-action">All tasks →</Link>
          </div>
          {[...openTasks]
            .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
            .slice(0, 6)
            .map(t => {
              const d = t.due ? daysUntil(t.due) : null;
              const overdue = d !== null && d < 0;
              const soon = d !== null && d >= 0 && d <= 3;
              const isDone = completing.includes(t.id);
              return (
                <div key={t.id} style={{ ...rowStyle, cursor: 'default', opacity: isDone ? 0.5 : 1, transition: 'opacity 0.3s' }}>
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
                    {t.client && <div style={{ fontSize: 12, color: 'var(--text3)' }}>👤 {t.client}</div>}
                  </div>
                  {isDone ? (
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>✓ Done</div>
                  ) : d !== null && (
                    <div style={pillStyle(overdue, soon)}>
                      {overdue ? `${Math.abs(d)}d overdue` : d === 0 ? 'Today' : `${d}d`}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* ── Row 1: Review Alerts + Birthday Reminders ── */}
      <div className="two-col">

        {/* Review Alerts */}
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--gold)' }} />
              Review Alerts
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>next 14 days</span>
            </div>
            <Link href="/reviews" className="section-action">All reviews →</Link>
          </div>

          {loading ? (
            <div style={{ padding: '24px', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
          ) : reviewAlerts.length === 0 ? (
            <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 13 }}>No reviews due in the next 14 days</div>
            </div>
          ) : reviewAlerts.map(c => {
            const days = daysUntil(c.nextReview) ?? 0;
            const overdue = days < 0;
            return (
              <div key={c.id} style={rowStyle}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseOut={e  => (e.currentTarget.style.background = '')}
                onClick={() => router.push('/reviews')}
              >
                <div className="client-avatar" style={{ width: 36, height: 36, fontSize: 13, flexShrink: 0 }}>
                  {initials(c.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Review: {formatDate(c.nextReview)}</div>
                </div>
                <div style={pillStyle(overdue, !overdue && days <= 7)}>
                  {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Birthday Reminders */}
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--blue)' }} />
              Birthday Reminders
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>next 30 days</span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '24px', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
          ) : upcomingBirthdays.length === 0 ? (
            <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🎂</div>
              <div style={{ fontSize: 13 }}>No birthdays in the next 30 days</div>
            </div>
          ) : upcomingBirthdays.map(c => {
            const days = daysUntilBirthday(c.dob) ?? 0;
            return (
              <div key={c.id} style={{ ...rowStyle, cursor: 'default' }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseOut={e  => (e.currentTarget.style.background = '')}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--surface2)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>🎂</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtShort(c.dob)}</div>
                </div>
                <div style={{
                  ...pillStyle(false),
                  background: days === 0 ? 'rgba(22,163,74,0.1)' : 'var(--surface2)',
                  color: days === 0 ? 'var(--green)' : 'var(--text3)',
                  border: days === 0 ? '1px solid rgba(22,163,74,0.2)' : '1px solid var(--border)',
                }}>
                  {days === 0 ? 'Today 🎉' : `${days}d`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Row 2: Recent Activity + Policy Expiry Radar ── */}
      <div className="two-col">

        {/* Recent Activity Feed */}
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--green)' }} />
              Recent Activity
            </div>
            <Link href="/reviews" className="section-action">All meetings →</Link>
          </div>

          {dataLoading ? (
            <div style={{ padding: '24px', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
          ) : recentMeetings.length === 0 ? (
            <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
              <div style={{ fontSize: 13 }}>No meetings logged yet</div>
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {recentMeetings.map((m, idx) => (
                <div
                  key={m.id}
                  style={{ display: 'flex', gap: 14, padding: '10px 24px', cursor: 'pointer', transition: 'background 0.12s' }}
                  onClick={() => {
                    const target = m.clientId
                      ? `/reviews?client=${encodeURIComponent(m.clientId)}`
                      : `/reviews?clientName=${encodeURIComponent(m.clientName)}`;
                    router.push(target);
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseOut={e  => (e.currentTarget.style.background = '')}
                >
                  {/* Timeline */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                      background: MEETING_TYPE_COLOR[m.meetingType] || 'var(--text3)',
                      border: '2px solid var(--surface)',
                      boxShadow: `0 0 0 2px ${MEETING_TYPE_COLOR[m.meetingType] || 'var(--text3)'}30`,
                    }} />
                    {idx < recentMeetings.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />
                    )}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: idx < recentMeetings.length - 1 ? 8 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.clientName || '—'}</span>
                      <span style={{
                        fontSize: 11, padding: '1px 8px', borderRadius: 'var(--r-pill)',
                        background: 'var(--surface2)', fontWeight: 600,
                        color: MEETING_TYPE_COLOR[m.meetingType] || 'var(--text3)',
                      }}>{m.meetingType}</span>
                    </div>
                    {m.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {m.notes}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{fmt(m.meetingDate)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Policy Expiry Radar */}
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--red)' }} />
              Policy Expiry Radar
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>next 60 days</span>
            </div>
            <Link href="/insurance" className="section-action">All policies →</Link>
          </div>

          {dataLoading ? (
            <div style={{ padding: '24px', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
          ) : expiringPolicies.length === 0 ? (
            <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🛡️</div>
              <div style={{ fontSize: 13 }}>No policies expiring in the next 60 days</div>
            </div>
          ) : expiringPolicies.map(p => {
            const days    = daysUntil(p.maturityDate) ?? 0;
            const urgent  = days <= 14;
            const warning = days <= 30;
            return (
              <div key={p.id} style={{ ...rowStyle, cursor: 'default', alignItems: 'flex-start' }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseOut={e  => (e.currentTarget.style.background = '')}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--r-sm)', flexShrink: 0,
                  background: urgent ? 'var(--red-dim)' : 'var(--surface2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
                }}>🛡️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {p.policyName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.clientName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                    {p.insurer || p.insuranceType} · Expires {fmtShort(p.maturityDate)}
                  </div>
                </div>
                <div style={pillStyle(urgent, warning && !urgent)}>
                  {days === 0 ? 'Today' : `${days}d`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
