'use client';

import { useState, useEffect } from 'react';
import ClientSearchCombobox from '@/components/ClientSearchCombobox';

interface Client {
  id: string; name: string; nextReview: string; lastReview: string;
  risk: string; segment: string; aum: number;
}

interface Meeting {
  id: string; clientId: string; clientName: string;
  meetingDate: string; meetingType: string;
  notes: string; actionItems: string; nextReviewDate: string;
}

function fmt(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(d: string) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

function dayLabel(d: string) {
  const n = daysUntil(d);
  if (n === null) return null;
  if (n < 0)  return { label: `${Math.abs(n)}d overdue`, cls: 'soon' };
  if (n === 0) return { label: 'Today', cls: 'soon' };
  if (n <= 7)  return { label: `${n}d`, cls: 'soon' };
  return { label: `${n}d`, cls: 'later' };
}

const MEETING_TYPES = ['Annual Review', 'Follow-up', 'Phone Call', 'Video Call', 'Ad-hoc', 'Onboarding'];

const TYPE_COLORS: Record<string, string> = {
  'Annual Review': 'var(--blue)', 'Follow-up': 'var(--green)', 'Phone Call': 'var(--gold)',
  'Video Call': 'var(--purple)', 'Ad-hoc': 'var(--text3)', 'Onboarding': 'var(--accent)',
};

// ── Log Meeting Modal ─────────────────────────────────────────────────────────
function LogMeetingModal({
  clients, preselectedClient, onClose, onSaved,
}: { clients: Client[]; preselectedClient?: Client | null; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    clientId:      preselectedClient?.id      ?? '',
    clientName:    preselectedClient?.name    ?? '',
    meetingDate:   today,
    meetingType:   'Annual Review',
    notes:         '',
    actionItems:   '',
    nextReviewDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.clientId) { setError('Please select a client.'); return; }
    if (!form.meetingDate) { setError('Please enter a meeting date.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error || 'Save failed.'); return; }
      onSaved();
      onClose();
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: '9px 12px', color: 'var(--text)',
    fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,19,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--r)', width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>📝 Log Meeting</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Record meeting notes and set next follow-up</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', lineHeight: 1 }}>✕</button>
        </div>

        {/* Form */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Client + Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Client *</label>
              <ClientSearchCombobox
                clients={clients}
                value={form.clientId}
                onChange={c => setForm(p => ({ ...p, clientId: c?.id ?? '', clientName: c?.name ?? '' }))}
                placeholder="Search client…"
                inputStyle={{ border: '1px solid var(--border)', background: 'var(--bg)' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Meeting Date *</label>
              <input type="date" value={form.meetingDate} onChange={e => set('meetingDate')(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Meeting Type */}
          <div>
            <label style={labelStyle}>Meeting Type</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {MEETING_TYPES.map(t => (
                <button key={t} onClick={() => set('meetingType')(t)} style={{
                  padding: '6px 14px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)',
                  background: form.meetingType === t ? 'var(--text)' : 'var(--bg)',
                  color: form.meetingType === t ? 'var(--bg)' : 'var(--text3)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: 'var(--font-sans)',
                }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Meeting Notes / Remarks</label>
            <textarea value={form.notes} onChange={e => set('notes')(e.target.value)}
              placeholder="What was discussed in this meeting..."
              rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>

          {/* Action Items */}
          <div>
            <label style={labelStyle}>Action Items</label>
            <textarea value={form.actionItems} onChange={e => set('actionItems')(e.target.value)}
              placeholder="1. Follow up on...\n2. Review...\n3. Send..."
              rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>

          {/* Next Review Date */}
          <div>
            <label style={labelStyle}>Next Review Date</label>
            <input type="date" value={form.nextReviewDate} onChange={e => set('nextReviewDate')(e.target.value)} style={inputStyle} />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              This will update the client&apos;s next review date in your CRM
            </div>
          </div>

          {error && <div style={{ padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid rgba(235,0,27,0.2)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--red)' }}>{error}</div>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 24px', borderRadius: 'var(--r-pill)', border: 'none', background: saving ? 'var(--surface2)' : 'var(--text)', color: saving ? 'var(--text3)' : 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s' }}>
              {saving ? '⏳ Saving…' : '✅ Save Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Reviews Page ─────────────────────────────────────────────────────────
export default function ReviewsPage() {
  const [clients,      setClients]      = useState<Client[]>([]);
  const [meetings,     setMeetings]     = useState<Meeting[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [preselected,  setPreselected]  = useState<Client | null>(null);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState(''); // '' = All
  const [logDays,      setLogDays]      = useState(90); // 0 = All time

  function loadAll() {
    setLoading(true);
    Promise.all([
      fetch('/api/notion?type=clients',  { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/meetings',              { cache: 'no-store' }).then(r => r.json()),
    ]).then(([cj, mj]) => {
      if (cj.data) setClients(cj.data);
      if (mj.data) setMeetings(mj.data);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { loadAll(); }, []);

  // ── Date windows ──────────────────────────────────────────────────────────
  const now            = Date.now();
  const logWindowStart = logDays === 0 ? 0 : now - logDays * 86_400_000;
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  // filterClient name (for display labels)
  const filterClientName = clients.find(c => c.id === filterClientId)?.name ?? '';

  // ── Filtered meetings — chosen window + optional client ──────────────────
  const visibleMeetings = meetings.filter(m => {
    const t = new Date(m.meetingDate).getTime();
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    const inWindow = t >= logWindowStart && t <= endOfToday.getTime();
    const matchesClient =
      filterClientId === '' ||
      m.clientId === filterClientId ||                    // match by ID (preferred)
      m.clientName === filterClientName;                  // fallback: match by name
    return inWindow && matchesClient;
  });

  // ── Filtered upcoming — next 90 days + optional client ───────────────────
  const upcoming = clients.filter(c => {
    const d = daysUntil(c.nextReview);
    const matchesClient = filterClientId === '' || c.id === filterClientId;
    return matchesClient && d !== null && d >= 0 && d <= 90;
  }).sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());

  const overdue = clients.filter(c => {
    const d = daysUntil(c.nextReview);
    const matchesClient = filterClientId === '' || c.id === filterClientId;
    return matchesClient && d !== null && d < 0;
  });

  // ── Stats (always based on full dataset, but client-filtered) ─────────────
  const completedThisMonth = meetings.filter(m => {
    const t = new Date(m.meetingDate).getTime();
    const matchesClient =
      filterClientId === '' ||
      m.clientId === filterClientId ||
      m.clientName === filterClientName;
    return matchesClient && t >= thisMonthStart && t <= now;
  }).length;

  function openLog(client?: Client) {
    setPreselected(client ?? null);
    setShowModal(true);
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text3)', fontSize: 15 }}>
      Loading reviews…
    </div>
  );

  return (
    <>
      {/* ── Client Filter Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 280 }}>
          <ClientSearchCombobox
            clients={clients}
            value={filterClientId}
            onChange={c => { setFilterClientId(c?.id ?? ''); setExpandedMeeting(null); }}
            placeholder="Filter by client…"
          />
        </div>

        {/* Duration chips for Meeting History window */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 4 }}>📋 Meeting logs:</span>
          {([
            { label: '1M', days: 30 },
            { label: '3M', days: 90 },
            { label: '6M', days: 180 },
            { label: '1Y', days: 365 },
            { label: 'All', days: 0 },
          ] as { label: string; days: number }[]).map(opt => (
            <button key={opt.label} onClick={() => setLogDays(opt.days)} style={{
              padding: '5px 12px', borderRadius: 'var(--r-pill)', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
              border: `1px solid ${logDays === opt.days ? 'var(--accent2)' : 'var(--border)'}`,
              background: logDays === opt.days ? 'var(--accent2)' : 'var(--surface)',
              color: logDays === opt.days ? '#fff' : 'var(--text3)',
              transition: 'all 0.15s',
            }}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid-3">
        <div className="stat-card green">
          <div className="stat-icon green">✅</div>
          <div className="stat-label">Completed This Month</div>
          <div className="stat-value">{completedThisMonth}</div>
          <div className="stat-sub">{completedThisMonth === 0 ? 'No meetings logged yet' : `${completedThisMonth} meeting${completedThisMonth > 1 ? 's' : ''} recorded`}</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">⏳</div>
          <div className="stat-label">Upcoming (90 days)</div>
          <div className="stat-value">{upcoming.length}</div>
          <div className="stat-sub">{upcoming[0] ? `Next: ${upcoming[0].name.split(' ')[0]} · ${fmt(upcoming[0].nextReview)}` : 'All clear'}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">❌</div>
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{overdue.length}</div>
          <div className="stat-sub">{overdue.length === 0 ? 'All clients up to date' : `${overdue[0].name.split(' ')[0]} needs attention`}</div>
        </div>
      </div>

      {/* ── Upcoming Reviews ── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--gold)' }} />
            Upcoming Reviews
            {filterClientId && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>· { filterClientName }</span>}
          </div>
          <button onClick={() => openLog()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 'var(--r-pill)', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            ✏️ Log Meeting
          </button>
        </div>

        {upcoming.length === 0 && overdue.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
            <div style={{ fontSize: 15 }}>
              {filterClientId
                ? `No upcoming reviews for ${ filterClientName } in the next 90 days`
                : 'No upcoming reviews in the next 90 days'}
            </div>
          </div>
        ) : (
          <div className="review-list">
            {[...overdue, ...upcoming].map(c => {
              const dl = dayLabel(c.nextReview);
              const d = new Date(c.nextReview);
              return (
                <div key={c.id} className="review-item">
                  <div className="review-date-block">
                    <div className="review-day">{d.getDate()}</div>
                    <div className="review-month">{d.toLocaleString('en', { month: 'short' }).toUpperCase()}</div>
                  </div>
                  <div className="review-content">
                    <div className="review-client">{c.name}</div>
                    <div className="review-type">
                      {c.risk} · {c.segment} · RM {(c.aum / 1000).toFixed(0)}K AUM
                      {c.lastReview && <span style={{ marginLeft: 8, color: 'var(--text3)' }}>· Last seen: {fmt(c.lastReview)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {dl && <div className={`days-away ${dl.cls}`}>{dl.label}</div>}
                    <button onClick={() => openLog(c)} style={{ padding: '5px 12px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
                      + Log
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Meeting History (last 30 days) ── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--accent)' }} />
            Meeting History
            {filterClientId && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>· { filterClientName }</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--surface2)', padding: '4px 10px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)' }}>
              {logDays === 0 ? 'All time' : logDays === 30 ? 'Last 1 month' : logDays === 90 ? 'Last 3 months' : logDays === 180 ? 'Last 6 months' : 'Last 1 year'} · {visibleMeetings.length} meeting{visibleMeetings.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {visibleMeetings.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
            <div style={{ fontSize: 15 }}>
              {filterClientId
                ? `No meetings logged for ${ filterClientName } in this period`
                : 'No meetings logged in this period'}
            </div>
          </div>
        ) : (
          <div className="review-list">
            {visibleMeetings.map(m => {
              const isExpanded = expandedMeeting === m.id;
              const d = new Date(m.meetingDate);
              return (
                <div key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Summary row */}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '14px 24px', cursor: 'pointer', transition: 'background 0.15s' }}
                    onClick={() => setExpandedMeeting(isExpanded ? null : m.id)}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseOut={e => (e.currentTarget.style.background = '')}
                  >
                    <div className="review-date-block">
                      <div className="review-day">{d.getDate()}</div>
                      <div className="review-month">{d.toLocaleString('en', { month: 'short' }).toUpperCase()}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>{m.clientName}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 'var(--r-pill)', background: 'var(--surface2)', color: TYPE_COLORS[m.meetingType] || 'var(--text3)', fontWeight: 600, border: `1px solid ${TYPE_COLORS[m.meetingType] || 'var(--border)'}20` }}>
                          {m.meetingType}
                        </span>
                        {m.notes && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{m.notes.slice(0, 80)}{m.notes.length > 80 ? '…' : ''}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {m.nextReviewDate && (
                        <span style={{ fontSize: 12, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                          → {fmt(m.nextReviewDate)}
                        </span>
                      )}
                      <span style={{ fontSize: 13, color: 'var(--text3)' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '0 24px 20px 88px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {m.notes && (
                        <div style={{ background: 'var(--bg2)', borderRadius: 'var(--r-sm)', padding: '12px 14px', borderLeft: '3px solid var(--accent)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Meeting Notes</div>
                          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.notes}</div>
                        </div>
                      )}
                      {m.actionItems && (
                        <div style={{ background: 'var(--gold-dim)', borderRadius: 'var(--r-sm)', padding: '12px 14px', borderLeft: '3px solid var(--gold)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Action Items</div>
                          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.actionItems}</div>
                        </div>
                      )}
                      {m.nextReviewDate && (
                        <div style={{ fontSize: 13, color: 'var(--blue)' }}>
                          📅 Next review scheduled: <strong>{fmt(m.nextReviewDate)}</strong>
                        </div>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); openLog(clients.find(c => c.id === m.clientId) ?? undefined); }}
                        style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        + Log follow-up for {m.clientName.split(' ')[0]}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <LogMeetingModal
          clients={clients}
          preselectedClient={preselected}
          onClose={() => setShowModal(false)}
          onSaved={loadAll}
        />
      )}
    </>
  );
}
