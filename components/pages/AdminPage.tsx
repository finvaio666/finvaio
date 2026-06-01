'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminOverview, FAStats } from '@/app/api/admin/overview/route';
import type { AdminClient } from '@/app/api/admin/clients/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 0 })}`; }
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{client.name}</div>
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

type AdminTab = 'overview' | 'advisors' | 'clients';

export default function AdminPage() {
  const [tab,      setTab]      = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [selectedFA, setSelectedFA] = useState<FAStats | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/overview');
      const data = await res.json();
      if (data.error) { setErr(data.error); return; }
      setOverview(data);
    } catch { setErr('Failed to load admin data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

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
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Admin Dashboard</h1>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Bill Morrisons Financial Consulting — Platform Overview</div>
          </div>
          <button onClick={loadOverview} style={{ padding: '8px 14px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>⟳ Refresh</button>
        </div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading platform data…</div>}
      {err    && <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{err}</div>}

      {!loading && !err && overview && (
        <>
          {/* Stat cards */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
            <StatCard label="Total Advisors"  value={String(overview.totalFAs)}     sub={`${overview.activeFAs} active`} />
            <StatCard label="Total Clients"   value={String(overview.totalClients)} sub="across all advisors" color="#818cf8" />
            <StatCard label="Combined AUM"    value={overview.totalAUM > 0 ? fmt(overview.totalAUM) : '—'} sub="managed assets" color="#22c55e" />
            <StatCard label="Gmail Connected" value={String(overview.advisors.filter(a => a.hasGmail).length)} sub={`of ${overview.activeFAs} active FAs`} color="#3b82f6" />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {([
              { id: 'overview', label: '📊 Overview'  },
              { id: 'advisors', label: '👥 Advisors'  },
              { id: 'clients',  label: '📋 All Clients' },
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
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Advisor breakdown */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Advisor Breakdown</div>
                {overview.advisors.map(fa => (
                  <div key={fa.id} onClick={() => handleSelectFA(fa)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(243,115,56,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(243,115,56,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#F37338', flexShrink: 0 }}>
                        {fa.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fa.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fa.clientCount} clients</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fa.totalAUM > 0 ? fmt(fa.totalAUM) : '—'}</div>
                      <StatusDot active={fa.active} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Platform Health</div>
                  {[
                    { label: 'Active Advisors',   value: `${overview.activeFAs} / ${overview.totalFAs}`, ok: overview.activeFAs > 0 },
                    { label: 'Gmail Connected',   value: `${overview.advisors.filter(a => a.hasGmail).length} / ${overview.activeFAs}`, ok: overview.advisors.filter(a => a.hasGmail && a.active).length > 0 },
                    { label: 'Total Clients',     value: String(overview.totalClients), ok: overview.totalClients > 0 },
                    { label: 'Combined AUM',      value: fmt(overview.totalAUM), ok: overview.totalAUM > 0 },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                        <span style={{ color: item.ok ? '#22c55e' : 'var(--text3)' }}>●</span>
                        {item.label}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.value}</span>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'rgba(243,115,56,0.06)', border: '1px solid rgba(243,115,56,0.2)', borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F37338', marginBottom: 8 }}>Quick Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => { setTab('advisors'); }} style={{ padding: '8px 14px', fontSize: 13, background: '#F37338', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>👥 Manage Advisors</button>
                    <button onClick={() => { setTab('clients'); setSelectedFA(null); }} style={{ padding: '8px 14px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>📋 View All Clients</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'advisors' && (
            <AdvisorsTab advisors={overview.advisors} onSelectFA={handleSelectFA} />
          )}

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
