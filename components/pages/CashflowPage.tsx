'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useClients } from '@/components/useClients';
import ClientSearchCombobox from '@/components/ClientSearchCombobox';

interface CashflowBreakdown {
  income:   Record<string, number>;
  fixed:    Record<string, number>;
  variable: Record<string, number>;
  epf:      Record<string, number>;
  advisorNotes?: string;
}

interface CashflowEntry {
  id:          string;
  entry:       string;
  month:       string;
  income:      number;
  fixed:       number;
  variable:    number;
  epf:         number;
  surplus:     number;
  savingsRate: number;
  breakdown:   CashflowBreakdown | null;
}

const fmt  = (n: number) => n.toLocaleString();
const fmtK = (n: number) => n >= 1000 ? `RM ${(n / 1000).toFixed(1)}K` : `RM ${Math.round(n)}`;

function BreakdownSection({ title, color, items }: {
  title: string;
  color: string;
  items: { label: string; val: number | undefined }[];
}) {
  const active = items.filter(i => (i.val ?? 0) > 0);
  if (active.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {title}
      </div>
      {active.map(item => (
        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{item.label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            RM {(item.val ?? 0).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CashflowPage() {
  const { clients, loading: clientsLoading } = useClients();
  const [cashflow,   setCashflow]   = useState<CashflowEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(searchParams?.get('client') ?? '');
  const [sending,    setSending]    = useState(false);
  const [linkModal,  setLinkModal]  = useState<{ url: string; clientName: string } | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sync when navigating from another page with ?client= param
  useEffect(() => {
    const id = searchParams?.get('client');
    if (id) setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/notion?type=cashflow', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.data) setCashflow(json.data); })
      .finally(() => setLoading(false));
  }, []);

  const selectedClient = clients.find(c => c.id === selectedId);

  // Filter by client when one is selected
  const filtered = selectedId
    ? cashflow.filter(row => {
        const entryName = row.entry.split('—')[0].trim().toLowerCase();
        return selectedClient && entryName.includes(selectedClient.name.split(' ')[0].toLowerCase());
      })
    : cashflow;

  // ── Per-client stats (only when a client is selected) ──────────────────────
  const clientLatest   = filtered[0];
  const clientIncome   = clientLatest?.income      ?? 0;
  const clientFixed    = clientLatest?.fixed        ?? 0;
  const clientVariable = clientLatest?.variable     ?? 0;
  const clientEpf      = clientLatest?.epf          ?? 0;
  const clientSurplus  = clientLatest?.surplus      ?? 0;
  const clientRate     = clientLatest?.savingsRate  ?? 0;

  // ── Aggregate overview (shown when no client selected) ─────────────────────
  const uniqueClients = new Set(
    cashflow.map(r => r.entry.split('—')[0].trim().toLowerCase())
  ).size;
  const avgSavingsRate = cashflow.length > 0
    ? Math.round(cashflow.reduce((s, r) => s + r.savingsRate, 0) / cashflow.length)
    : 0;
  const clientsOnTrack = cashflow.length > 0
    ? new Set(
        cashflow
          .filter(r => r.savingsRate >= 30)
          .map(r => r.entry.split('—')[0].trim().toLowerCase())
      ).size
    : 0;

  // Default target month = current month
  const thisMonth    = new Date();
  const defaultMonth = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}-01`;

  const handleSendForm = useCallback(async () => {
    if (!selectedClient) return;
    setSending(true);
    try {
      const res = await fetch('/api/cashflow/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId:   selectedClient.id,
          clientName: selectedClient.name,
          month:      defaultMonth,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate link');
      setLinkModal({ url: data.url, clientName: selectedClient.name });
    } catch (e: unknown) {
      alert(`Could not generate link: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  }, [selectedClient, defaultMonth]);

  const handleCopy = () => {
    if (!linkModal) return;
    navigator.clipboard.writeText(linkModal.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const router      = useRouter();
  const clientReady = !loading && !clientsLoading && !!clientLatest && !!selectedId;
  const firstName   = selectedClient?.name?.split(' ')[0] ?? '';

  // Find the client ID from an entry title like "JANICE QUEK KHANG WEN — May 2026"
  const clientIdFromEntry = (entry: string) => {
    const entryName = entry.split('—')[0].trim().toLowerCase();
    const match = clients.find(c =>
      entryName.includes(c.name.split(' ')[0].toLowerCase()) ||
      c.name.toLowerCase().includes(entryName.split(' ')[0].toLowerCase())
    );
    return match?.id ?? null;
  };

  return (
    <>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 300 }}>
          <ClientSearchCombobox
            clients={clients}
            value={selectedId}
            onChange={c => setSelectedId(c?.id ?? '')}
            placeholder="Select a client…"
          />
        </div>
        {selectedId && (
          <button
            onClick={() => setSelectedId('')}
            style={{ padding: '8px 14px', borderRadius: 'var(--r-pill)', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >✕ Clear</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selectedClient && (
            <button
              onClick={handleSendForm}
              disabled={sending}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: 'var(--r-pill)',
                background: sending ? 'var(--surface2)' : 'var(--accent2)',
                color: sending ? 'var(--text3)' : '#fff',
                border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
                boxShadow: sending ? 'none' : '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {sending
                ? <><span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #fff6', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Generating…</>
                : '📤 Send Cash Flow Form'}
            </button>
          )}
        </div>
      </div>

      {/* ── Overview stat cards (no client selected) ── */}
      {!selectedId && (
        <div className="stat-grid">
          <div className="stat-card blue">
            <div className="stat-icon blue">📋</div>
            <div className="stat-label">Clients with Data</div>
            <div className="stat-value">{loading ? '…' : uniqueClients}</div>
            <div className="stat-sub">{cashflow.length} total entr{cashflow.length !== 1 ? 'ies' : 'y'}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon green">📈</div>
            <div className="stat-label">Avg Savings Rate</div>
            <div className="stat-value">{loading ? '…' : `${avgSavingsRate}%`}</div>
            <div className="stat-sub">Across all submissions</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon green">✅</div>
            <div className="stat-label">On Track (≥30%)</div>
            <div className="stat-value">{loading ? '…' : clientsOnTrack}</div>
            <div className="stat-sub">
              {uniqueClients > 0 ? `${Math.round((clientsOnTrack / uniqueClients) * 100)}% of clients` : '—'}
            </div>
          </div>
          <div className="stat-card gold">
            <div className="stat-icon gold">📤</div>
            <div className="stat-label">Quick Action</div>
            <div className="stat-value" style={{ fontSize: 14, marginTop: 8 }}>Select a client</div>
            <div className="stat-sub">to view details or send a form</div>
          </div>
        </div>
      )}

      {/* ── Client stat cards (client selected) ── */}
      {selectedId && (
        <div className="stat-grid">
          <div className="stat-card green">
            <div className="stat-icon green">💵</div>
            <div className="stat-label">Monthly Income</div>
            <div className="stat-value">{loading ? '…' : fmtK(clientIncome)}</div>
            <div className="stat-sub">
              {clientLatest?.month
                ? new Date(clientLatest.month + 'T00:00:00').toLocaleString('en-MY', { month: 'short', year: 'numeric' })
                : '—'}
              {firstName ? ` · ${firstName}` : ''}
            </div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon red">💸</div>
            <div className="stat-label">Total Expenses</div>
            <div className="stat-value">{loading ? '…' : fmtK(clientFixed + clientVariable)}</div>
            <div className="stat-sub">Fixed {fmtK(clientFixed)} + Variable {fmtK(clientVariable)}</div>
          </div>
          <div className="stat-card gold">
            <div className="stat-icon gold">🏦</div>
            <div className="stat-label">EPF Contribution</div>
            <div className="stat-value">{loading ? '…' : fmtK(clientEpf)}</div>
            <div className="stat-sub">Monthly deduction</div>
          </div>
          <div className={`stat-card ${clientSurplus >= 0 ? 'green' : 'red'}`}>
            <div className={`stat-icon ${clientSurplus >= 0 ? 'green' : 'red'}`}>{clientSurplus >= 0 ? '📈' : '📉'}</div>
            <div className="stat-label">{clientSurplus >= 0 ? 'Monthly Surplus' : 'Monthly Deficit'}</div>
            <div className="stat-value" style={{ color: clientSurplus >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {loading ? '…' : fmtK(Math.abs(clientSurplus))}
            </div>
            <div className="stat-sub">{loading ? '…' : `${clientRate}% savings rate`} {clientRate >= 30 ? '✅' : '⚠️'}</div>
          </div>
        </div>
      )}

      {/* ── Cash Flow table ── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--accent)' }} />
            {selectedClient
              ? `Cash Flow History — ${firstName}`
              : 'Cash Flow History (All Clients)'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}
          </div>
        </div>

        {/* Empty state — no client selected and no data yet */}
        {!loading && cashflow.length === 0 && !selectedId && (
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📭</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>No cash flow data yet</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
              Select a client above and send them a cash flow form to get started.
            </div>
          </div>
        )}

        {/* Prompt to select a client when data exists but no filter active */}
        {!loading && cashflow.length > 0 && !selectedId && (
          <div style={{ padding: '24px 32px 12px' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>
              Showing all {cashflow.length} entries across {uniqueClients} client{uniqueClients !== 1 ? 's' : ''}. Select a client above to filter.
            </div>
          </div>
        )}

        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading…</div>
        )}

        {!loading && filtered.length === 0 && selectedId && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              No entries for {selectedClient?.name ?? 'this client'} yet
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                onClick={handleSendForm}
                disabled={sending}
                style={{ padding: '9px 18px', borderRadius: 'var(--r-pill)', background: 'var(--accent2)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
              >
                📤 Send Cash Flow Form to {firstName}
              </button>
            </div>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div>
            <div className="cf-row header">
              <div>Client / Month</div>
              <div>Income (MYR)</div>
              <div>Fixed Exp</div>
              <div>Variable Exp</div>
              <div>EPF</div>
              <div>Surplus</div>
            </div>
            {filtered.map(row => {
              const isExpanded = expandedId === row.id;
              const bd = row.breakdown;
              return (
                <div key={row.id}>
                  {/* ── Summary row ── */}
                  <div
                    className="cf-row"
                    style={{ background: isExpanded ? 'var(--accent-dim)' : '' }}
                    onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--surface2)'; }}
                    onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                      {/* ▶ toggle — expands breakdown */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                        style={{ background: 'none', border: 'none', padding: '2px 6px 0 0', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
                        title="View breakdown"
                      >
                        <span style={{ fontSize: 10, color: 'var(--text3)', display: 'inline-block', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      </button>
                      {/* Client name — navigates to this client's cashflow view */}
                      <div>
                        <div
                          onClick={() => {
                            const cid = clientIdFromEntry(row.entry);
                            if (cid) router.push(`/cashflow?client=${encodeURIComponent(cid)}`);
                          }}
                          style={{ fontWeight: 500, color: 'var(--accent2)', cursor: 'pointer', textDecoration: 'none' }}
                          onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
                          title="View this client's cash flow"
                        >
                          {row.entry}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {row.month ? new Date(row.month + 'T00:00:00').toLocaleString('en-MY', { month: 'long', year: 'numeric' }) : ''}
                        </div>
                      </div>
                    </div>
                    <div><span className="cf-val cf-neutral">{fmt(row.income)}</span></div>
                    <div><span className="cf-val cf-neg">{fmt(row.fixed)}</span></div>
                    <div><span className="cf-val cf-neg">{fmt(row.variable)}</span></div>
                    <div><span className="cf-val cf-neutral">{fmt(row.epf)}</span></div>
                    <div>
                      <span className={`cf-val ${row.surplus >= 0 ? 'cf-pos' : 'cf-neg'}`}>
                        {row.surplus >= 0 ? '+' : ''}{fmt(row.surplus)}
                      </span>
                    </div>
                  </div>

                  {/* ── Expanded breakdown panel ── */}
                  {isExpanded && (
                    <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '16px 24px 20px' }}>
                      {bd ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                          {/* Fixed Expenses */}
                          <BreakdownSection title="Fixed Expenses" color="var(--red)" items={[
                            { label: 'Housing / Mortgage', val: bd.fixed.housing },
                            { label: 'Car Loan',           val: bd.fixed.carLoan },
                            { label: 'Insurance Premiums', val: bd.fixed.insurancePremium },
                            { label: 'Education',          val: bd.fixed.education },
                            { label: 'Internet & Phone',   val: bd.fixed.internet },
                            { label: 'Subscriptions',      val: bd.fixed.subscriptions },
                            { label: 'Other Fixed',        val: bd.fixed.otherFixed },
                          ]} />
                          {/* Variable Expenses */}
                          <BreakdownSection title="Variable Expenses" color="var(--gold)" items={[
                            { label: 'Food & Groceries',       val: bd.variable.food },
                            { label: 'Dining Out / Delivery',  val: bd.variable.diningOut },
                            { label: 'Transport',              val: bd.variable.transport },
                            { label: 'Entertainment',          val: bd.variable.entertainment },
                            { label: 'Healthcare',             val: bd.variable.healthcare },
                            { label: 'Clothing & Personal',    val: bd.variable.clothing },
                            { label: 'Education / Courses',    val: bd.variable.selfDevelopment },
                            { label: 'Travel & Holidays',      val: bd.variable.travel },
                            { label: 'Gifts & Donations',      val: bd.variable.gifts },
                            { label: 'Other Variable',         val: bd.variable.otherVariable },
                          ]} />
                          {/* Income */}
                          <BreakdownSection title="Income Breakdown" color="var(--green)" items={[
                            { label: 'Salary / Employment', val: bd.income.salary },
                            { label: 'Business Income',     val: bd.income.business },
                            { label: 'Rental Income',       val: bd.income.rental },
                            { label: 'Investment Returns',  val: bd.income.investment },
                            { label: 'Other Income',        val: bd.income.otherIncome },
                          ]} />
                          {/* EPF */}
                          <BreakdownSection title="EPF & Savings" color="var(--blue)" items={[
                            { label: 'EPF Employee (deducted)',    val: bd.epf.epfEmployee },
                            { label: 'EPF Employer (not deducted)',val: bd.epf.epfEmployer },
                            { label: 'Other Savings',              val: bd.epf.otherSavings },
                          ]} />
                          {/* Notes */}
                          {bd.advisorNotes && (
                            <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: '10px 14px', background: 'var(--surface)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 8 }}>Notes</span>
                              {bd.advisorNotes}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>
                          No detailed breakdown available — client submitted before detailed tracking was enabled.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Charts (only when a client is selected with data) ── */}
      {clientReady && (
        <div className="two-col">
          <div className="section">
            <div className="section-header">
              <div className="section-title">
                <span className="section-dot" style={{ background: 'var(--blue)' }} />
                Expense Breakdown
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div className="chart-title" style={{ marginBottom: 12 }}>{clientLatest.entry}</div>
              {clientIncome > 0 && [
                { label: 'Fixed expenses', pct: Math.round((clientFixed    / clientIncome) * 100), color: 'var(--red)',    val: `RM ${fmt(clientFixed)}` },
                { label: 'Variable exp.',  pct: Math.round((clientVariable / clientIncome) * 100), color: 'var(--gold)',   val: `RM ${fmt(clientVariable)}` },
                { label: 'EPF',            pct: Math.round((clientEpf      / clientIncome) * 100), color: 'var(--blue)',   val: `RM ${fmt(clientEpf)}` },
                { label: 'Surplus 💚',     pct: Math.round((clientSurplus  / clientIncome) * 100), color: 'var(--green)',  val: `RM ${fmt(clientSurplus)}` },
              ].map(b => (
                <div key={b.label} className="bar-row" style={{ marginBottom: 8 }}>
                  <div className="bar-label">{b.label}</div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(b.pct, 1)}%`, background: b.color }} /></div>
                  <div className="bar-val">{b.val}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <div className="section-title">
                <span className="section-dot" style={{ background: 'var(--accent)' }} />
                Savings Rate Benchmark
              </div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: firstName,    pct: Math.min(clientRate * 2, 100), color: 'var(--green)', val: `${clientRate}%` },
                { label: 'BM Target',  pct: 60,                            color: 'var(--blue)',  val: '30%' },
                { label: 'MY Average', pct: 30,                            color: 'var(--text3)', val: '15%' },
              ].map(b => (
                <div key={b.label} className="bar-row">
                  <div className="bar-label" style={{ width: 130 }}>{b.label}</div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(b.pct, 1)}%`, background: b.color }} /></div>
                  <div className="bar-val">{b.val}</div>
                </div>
              ))}
              <div style={{
                marginTop: 8, padding: 10,
                background: clientRate >= 30 ? 'var(--accent-dim)' : 'var(--gold-dim)',
                borderRadius: 'var(--r-sm)', fontSize: 12,
                color: clientRate >= 30 ? 'var(--accent2)' : 'var(--gold)',
              }}>
                {clientRate >= 30
                  ? `✅ ${firstName} is saving ${(clientRate / 15).toFixed(1)}× the Malaysian average — excellent financial discipline.`
                  : `⚠️ Savings rate ${clientRate}% is below the 30% target. Review expenses with ${firstName}.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Prompt to select a client to see charts ── */}
      {!selectedId && cashflow.length > 0 && (
        <div className="two-col">
          {['Expense Breakdown', 'Savings Rate Benchmark'].map(title => (
            <div key={title} className="section">
              <div className="section-header">
                <div className="section-title">
                  <span className="section-dot" style={{ background: title === 'Expense Breakdown' ? 'var(--blue)' : 'var(--accent)' }} />
                  {title}
                </div>
              </div>
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>👆</div>
                Select a client to see their {title.toLowerCase()}.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Share Link Modal ── */}
      {linkModal && (
        <>
          <div onClick={() => setLinkModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--surface)', borderRadius: 'var(--r)', padding: '32px 28px', zIndex: 1001,
            width: '90%', maxWidth: 480, boxShadow: 'var(--shadow)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>📤</div>
            <h3 style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)', textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em' }}>
              Cash Flow Form Ready
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              Send this link to <strong style={{ color: 'var(--text)' }}>{linkModal.clientName}</strong> via WhatsApp or Email.
              It expires in <strong style={{ color: 'var(--accent2)' }}>7 days</strong>.
            </p>
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
              padding: '10px 14px', marginBottom: 16, wordBreak: 'break-all',
              fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono)', lineHeight: 1.5,
            }}>
              {linkModal.url}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCopy}
                style={{
                  flex: 2, padding: '12px 0', borderRadius: 'var(--r-pill)',
                  background: copied ? 'var(--green)' : 'var(--accent2)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700, transition: 'background 0.2s',
                }}
              >
                {copied ? '✓ Copied!' : '📋 Copy Link'}
              </button>
              <button
                onClick={() => setLinkModal(null)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 'var(--r-pill)',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text3)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
