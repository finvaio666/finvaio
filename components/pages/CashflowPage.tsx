'use client';

import { useState, useEffect, useCallback } from 'react';
import { useClients } from '@/components/useClients';
import ClientSearchCombobox from '@/components/ClientSearchCombobox';

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
}

const fmt = (n: number) => n.toLocaleString();
const fmtK = (n: number) => n >= 1000 ? `RM ${(n / 1000).toFixed(1)}K` : `RM ${Math.round(n)}`;

export default function CashflowPage() {
  const { clients, loading: clientsLoading } = useClients();
  const [cashflow,    setCashflow]    = useState<CashflowEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedId,  setSelectedId]  = useState('');   // '' | clientId
  const [sending,     setSending]     = useState(false);
  const [linkModal,   setLinkModal]   = useState<{ url: string; clientName: string } | null>(null);
  const [copied,      setCopied]      = useState(false);

  useEffect(() => {
    fetch('/api/notion?type=cashflow', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.data) setCashflow(json.data); })
      .finally(() => setLoading(false));
  }, []);

  // Determine which client's data to show
  const selectedClient = clients.find(c => c.id === selectedId);

  // Filter cashflow by client name (parsed from entry like "ClientName — May 2026")
  const filtered = selectedId
    ? cashflow.filter(row => {
        const entryName = row.entry.split('—')[0].trim().toLowerCase();
        return selectedClient && entryName.includes(selectedClient.name.split(' ')[0].toLowerCase());
      })
    : cashflow;

  const latest = filtered[0];
  const income      = latest?.income ?? 0;
  const fixed       = latest?.fixed ?? 0;
  const variable    = latest?.variable ?? 0;
  const epf         = latest?.epf ?? 0;
  const surplus     = latest?.surplus ?? 0;
  const savingsRate = latest?.savingsRate ?? 0;

  // Default target month = current month (first of month)
  const thisMonth = new Date();
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

  const isReady = !loading && !clientsLoading && !!latest;
  const displayName = selectedClient?.name?.split(' ')[0] ?? (clients[0]?.name?.split(' ')[0] ?? '…');

  return (
    <>
      {/* ── Client selector + Send Form ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 300 }}>
          <ClientSearchCombobox
            clients={clients}
            value={selectedId}
            onChange={c => setSelectedId(c?.id ?? '')}
            placeholder="Filter by client…"
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
              {sending ? (
                <><span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #fff6', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Generating…</>
              ) : '📤 Send Cash Flow Form'}
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-icon green">💵</div>
          <div className="stat-label">Monthly Income</div>
          <div className="stat-value">{loading ? '…' : fmtK(income)}</div>
          <div className="stat-sub">
            {latest?.month ? new Date(latest.month + 'T00:00:00').toLocaleString('en-MY', { month: 'short', year: 'numeric' }) : '—'}
            {selectedClient ? ` · ${selectedClient.name.split(' ')[0]}` : ''}
          </div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">💸</div>
          <div className="stat-label">Total Expenses</div>
          <div className="stat-value">{loading ? '…' : fmtK(fixed + variable)}</div>
          <div className="stat-sub">Fixed {fmtK(fixed)} + Variable {fmtK(variable)}</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">🏦</div>
          <div className="stat-label">EPF Contribution</div>
          <div className="stat-value">{loading ? '…' : fmtK(epf)}</div>
          <div className="stat-sub">Monthly deduction</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon green">📈</div>
          <div className="stat-label">Monthly Surplus</div>
          <div className="stat-value">{loading ? '…' : fmtK(surplus)}</div>
          <div className="stat-sub">{loading ? '…' : `${savingsRate}% savings rate`} {savingsRate >= 30 ? '✅' : '⚠️'}</div>
        </div>
      </div>

      {/* ── Cash Flow table ── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--accent)' }} />
            Cash Flow History {selectedClient ? `— ${selectedClient.name.split(' ')[0]}` : '(All Clients)'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}</div>
        </div>
        <div>
          <div className="cf-row header">
            <div>Client / Month</div><div>Income (MYR)</div><div>Fixed Exp</div>
            <div>Variable Exp</div><div>EPF</div><div>Surplus</div>
          </div>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              {selectedClient ? `No cash flow entries for ${selectedClient.name} yet.` : 'No cash flow data yet.'}
              {selectedClient && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={handleSendForm} disabled={sending} style={{ padding: '8px 16px', borderRadius: 'var(--r-pill)', background: 'var(--accent2)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    📤 Send form to {selectedClient.name.split(' ')[0]}
                  </button>
                </div>
              )}
            </div>
          ) : (
            filtered.map(row => (
              <div key={row.id} className="cf-row"
                onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseOut={e => (e.currentTarget.style.background = '')}>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{row.entry}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {row.month ? new Date(row.month + 'T00:00:00').toLocaleString('en-MY', { month: 'long', year: 'numeric' }) : ''}
                  </div>
                </div>
                <div><span className="cf-val cf-neutral">{fmt(row.income)}</span></div>
                <div><span className="cf-val cf-neg">{fmt(row.fixed)}</span></div>
                <div><span className="cf-val cf-neg">{fmt(row.variable)}</span></div>
                <div><span className="cf-val cf-neutral">{fmt(row.epf)}</span></div>
                <div><span className="cf-val cf-pos">+{fmt(row.surplus)}</span></div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="two-col">
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--blue)' }} />
              Expense Breakdown
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <div className="chart-title" style={{ marginBottom: 12 }}>{isReady ? latest.entry : '—'}</div>
            {isReady && income > 0 && [
              { label: 'Fixed expenses',  pct: Math.round((fixed / income) * 100),    color: '#F87171', val: `RM ${fmt(fixed)}` },
              { label: 'Variable exp.',   pct: Math.round((variable / income) * 100), color: '#F59E0B', val: `RM ${fmt(variable)}` },
              { label: 'EPF',             pct: Math.round((epf / income) * 100),      color: '#60A5FA', val: `RM ${fmt(epf)}` },
              { label: 'Surplus 💚',      pct: Math.round((surplus / income) * 100),  color: '#4ADE80', val: `RM ${fmt(surplus)}` },
            ].map(b => (
              <div key={b.label} className="bar-row" style={{ marginBottom: 8 }}>
                <div className="bar-label">{b.label}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(b.pct, 1)}%`, background: b.color }} /></div>
                <div className="bar-val">{b.val}</div>
              </div>
            ))}
            {!isReady && <div style={{ color: 'var(--text3)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>Select a client with data to see breakdown</div>}
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
              { label: displayName, pct: Math.min(savingsRate * 2, 100), color: '#4ADE80', val: `${savingsRate}%` },
              { label: 'BM Target',  pct: 60,                            color: '#60A5FA', val: '30%' },
              { label: 'MY Average', pct: 30,                            color: '#5A7A5E', val: '15%' },
            ].map(b => (
              <div key={b.label} className="bar-row">
                <div className="bar-label" style={{ width: 130 }}>{b.label}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(b.pct, 1)}%`, background: b.color }} /></div>
                <div className="bar-val">{b.val}</div>
              </div>
            ))}
            {isReady && (
              <div style={{ marginTop: 8, padding: 10, background: savingsRate >= 30 ? 'var(--accent-dim)' : 'var(--gold-dim)', borderRadius: 'var(--r-sm)', fontSize: 12, color: savingsRate >= 30 ? 'var(--accent2)' : 'var(--gold)' }}>
                {savingsRate >= 30
                  ? `✅ ${displayName} is saving ${(savingsRate / 15).toFixed(1)}× the Malaysian average — excellent financial discipline.`
                  : `⚠️ Savings rate ${savingsRate}% is below the 30% target. Review expenses.`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Share Link Modal ── */}
      {linkModal && (
        <>
          <div onClick={() => setLinkModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--surface)', borderRadius: 20, padding: '32px 28px', zIndex: 1001,
            width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>📤</div>
            <h3 style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)', textAlign: 'center', marginBottom: 8 }}>
              Cash Flow Form Ready
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              Send this link to <strong>{linkModal.clientName}</strong> via WhatsApp or Email. It expires in <strong>7 days</strong>.
            </p>

            {/* Link box */}
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 14px', marginBottom: 16, wordBreak: 'break-all',
              fontSize: 12, color: 'var(--text2)', fontFamily: 'monospace', lineHeight: 1.5,
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
