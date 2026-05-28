'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useClients, formatAUM, formatDate, initials } from '@/components/useClients';

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
  const [dataLoading,  setDataLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/notion?type=insurance', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/meetings',              { cache: 'no-store' }).then(r => r.json()),
    ]).then(([ins, mtg]) => {
      if (ins.data) setInsurance(ins.data);
      if (mtg.data) setMeetings(mtg.data);
    }).finally(() => setDataLoading(false));
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

  return (
    <>
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
