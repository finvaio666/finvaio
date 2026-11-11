'use client';

import { useState, useEffect, useCallback } from 'react';

const num = (n: number) => n.toLocaleString('en-MY');

/** Malaysia time, since that is where every FA using this actually is. */
const fmtWhen = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
};

/** "3 hours ago" — the thing you actually scan for in an audit trail. */
function fmtAgo(iso: string): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

const OUTCOMES: { id: string; label: string; color: string }[] = [
  { id: 'success',      label: 'Signed in',      color: 'var(--green)' },
  { id: 'bad_password', label: 'Wrong password',  color: 'var(--red)'   },
  { id: 'unknown_user', label: 'Unknown user',    color: 'var(--gold)'  },
  { id: 'inactive',     label: 'Disabled account',color: 'var(--gold)'  },
  { id: 'rate_limited', label: 'Rate limited',    color: 'var(--red)'   },
];
const outcomeMeta = (id: string) =>
  OUTCOMES.find(o => o.id === id) ?? { id, label: id, color: 'var(--text3)' };

interface AdvisorSummary {
  advisorId: string; name: string; username: string; role: string;
  logins: number; lastSeen: string;
}
interface Row {
  id: string; createdAt: string; advisorId: string; username: string;
  name: string; role: string; outcome: string; ip: string; userAgent: string; source: string;
}
interface Report {
  days: number;
  totals: { attempts: number; successes: number; failures: number; advisors: number };
  advisors: AdvisorSummary[];
  advisorOptions: { id: string; name: string }[];
  rows: Row[];
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone ?? '#F37338', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/** Shortens a User-Agent to something a human can read at a glance. */
function device(ua: string): string {
  if (!ua) return '—';
  const os =
    /iPhone|iPad/i.test(ua) ? 'iOS'
    : /Android/i.test(ua)   ? 'Android'
    : /Mac OS X/i.test(ua)  ? 'macOS'
    : /Windows/i.test(ua)   ? 'Windows'
    : /Linux/i.test(ua)     ? 'Linux'
    : '';
  const browser =
    /Edg\//i.test(ua)                     ? 'Edge'
    : /OPR\//i.test(ua)                   ? 'Opera'
    : /Chrome\//i.test(ua)                ? 'Chrome'
    : /Safari\//i.test(ua)                ? 'Safari'
    : /Firefox\//i.test(ua)               ? 'Firefox'
    : '';
  return [os, browser].filter(Boolean).join(' · ') || ua.slice(0, 28);
}

const ctl: React.CSSProperties = { padding: '5px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' };
const pill = (on: boolean): React.CSSProperties => ({
  padding: '5px 12px', fontSize: 12, borderRadius: 99, cursor: 'pointer',
  border: '1px solid var(--border)', background: on ? '#F37338' : 'none', color: on ? '#fff' : 'var(--text2)',
});

/**
 * Who signed in, when, from where — and what failed.
 * Company-wide, Admin only. Every number follows the filter bar.
 */
export default function LoginLogTab() {
  const [days,    setDays]    = useState(30);
  const [advisor, setAdvisor] = useState('');
  const [outcome, setOutcome] = useState('');
  const [search,  setSearch]  = useState('');
  const [q,       setQ]       = useState('');
  const [report,  setReport]  = useState<Report | null>(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [shown,   setShown]   = useState(100);

  // Apply the search box after a short pause rather than on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setShown(100); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError(''); setLoading(true);
    try {
      const p = new URLSearchParams({ days: String(days) });
      if (advisor) p.set('advisor', advisor);
      if (outcome) p.set('outcome', outcome);
      if (q)       p.set('q', q);
      const res  = await fetch(`/api/admin/login-log?${p.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load the login log');
      setReport(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load the login log'); }
    finally { setLoading(false); }
  }, [days, advisor, outcome, q]);
  useEffect(() => { load(); }, [load]);

  if (error && !report) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)', fontSize: 13, lineHeight: 1.6 }}>{error}</div>;
  if (!report)          return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading login log…</div>;

  const t = report.totals;
  const anyFilter = !!(advisor || outcome || q);
  const visible = report.rows.slice(0, shown);

  function exportCsv() {
    const head = ['When (MYT)', 'Name', 'Username', 'Role', 'Outcome', 'IP', 'Device', 'User agent', 'Source'];
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const body = report!.rows.map(r => [
      fmtWhen(r.createdAt), r.name, r.username, r.role,
      outcomeMeta(r.outcome).label, r.ip, device(r.userAgent), r.userAgent, r.source,
    ].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finva-login-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
        {[7, 30, 90, 365].map(d => (
          <button key={d} onClick={() => { setDays(d); setShown(100); }} style={pill(days === d)}>
            {d === 365 ? '1 year' : `${d} days`}
          </button>
        ))}

        <select value={advisor} onChange={e => { setAdvisor(e.target.value); setShown(100); }} style={{ ...ctl, marginLeft: 6 }}>
          <option value="">All advisors</option>
          {report.advisorOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select value={outcome} onChange={e => { setOutcome(e.target.value); setShown(100); }} style={ctl}>
          <option value="">All outcomes</option>
          {OUTCOMES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, username or IP…"
          style={{ ...ctl, minWidth: 190, flex: 1 }} />

        {anyFilter && (
          <button onClick={() => { setAdvisor(''); setOutcome(''); setSearch(''); setQ(''); }}
            style={{ ...pill(false), color: 'var(--text3)' }}>Clear filters</button>
        )}
        <button onClick={exportCsv} disabled={report.rows.length === 0} style={{ ...pill(false), opacity: report.rows.length ? 1 : 0.5 }}>
          ⬇ CSV
        </button>
      </div>

      {/* ── Cards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Card label="Sign-ins"   value={num(t.successes)} sub={`last ${report.days} days`} tone="var(--green)" />
        <Card label="Failed"     value={num(t.failures)}  sub={t.failures ? 'wrong password / unknown user' : 'none'} tone={t.failures ? 'var(--red)' : undefined} />
        <Card label="Advisors"   value={num(t.advisors)}  sub="distinct FAs who signed in" />
        <Card label="Attempts"   value={num(t.attempts)}  sub="successes + failures" />
      </div>

      {/* ── Per-advisor: last seen ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
          Last seen
        </div>
        {report.advisors.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--text3)' }}>Nobody signed in during this window.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text3)', textAlign: 'left' }}>
                <th style={{ padding: '8px 14px', fontWeight: 600 }}>Advisor</th>
                <th style={{ padding: '8px 8px',  fontWeight: 600 }}>Username</th>
                <th style={{ padding: '8px 8px',  fontWeight: 600 }}>Role</th>
                <th style={{ padding: '8px 8px',  fontWeight: 600, textAlign: 'right' }}>Sign-ins</th>
                <th style={{ padding: '8px 14px', fontWeight: 600 }}>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {report.advisors.map(a => (
                <tr key={a.advisorId || a.username} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 14px', color: 'var(--text)', fontWeight: 600 }}>{a.name || '—'}</td>
                  <td style={{ padding: '8px 8px',  color: 'var(--text2)' }}>{a.username}</td>
                  <td style={{ padding: '8px 8px',  color: 'var(--text3)' }}>{a.role || '—'}</td>
                  <td style={{ padding: '8px 8px',  color: 'var(--text2)', textAlign: 'right' }}>{num(a.logins)}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--text2)' }}>
                    {fmtWhen(a.lastSeen)} <span style={{ color: 'var(--text3)' }}>· {fmtAgo(a.lastSeen)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Full attempt log ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Every attempt</span>
          <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>
            {num(report.rows.length)} attempt{report.rows.length === 1 ? '' : 's'} · Malaysia time
          </span>
        </div>

        {report.rows.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--text3)' }}>No attempts match these filters.</div>
        ) : (
          <>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text3)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 14px', fontWeight: 600 }}>When</th>
                  <th style={{ padding: '8px 8px',  fontWeight: 600 }}>Who</th>
                  <th style={{ padding: '8px 8px',  fontWeight: 600 }}>Outcome</th>
                  <th style={{ padding: '8px 8px',  fontWeight: 600 }}>IP</th>
                  <th style={{ padding: '8px 14px', fontWeight: 600 }}>Device</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const o = outcomeMeta(r.outcome);
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 14px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {fmtWhen(r.createdAt)}
                      </td>
                      <td style={{ padding: '8px 8px', color: 'var(--text)' }}>
                        {r.name || r.username}
                        {r.name && <span style={{ color: 'var(--text3)' }}> · {r.username}</span>}
                      </td>
                      <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: o.color, fontWeight: 600 }}>
                          {r.outcome === 'success' ? '✓' : '✕'} {o.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 8px', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{r.ip || '—'}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text3)' }} title={r.userAgent}>{device(r.userAgent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {report.rows.length > visible.length && (
              <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                <button onClick={() => setShown(s => s + 200)} style={pill(false)}>
                  Show more ({num(report.rows.length - visible.length)} left)
                </button>
              </div>
            )}
          </>
        )}

        <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)', lineHeight: 1.6 }}>
          IP addresses and devices are recorded so an unexpected sign-in is recognisable, so this view is Admin-only.
          Passwords are never logged — a failed attempt records only that it failed.
        </div>
      </div>
    </div>
  );
}
