'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useClients } from '@/components/useClients';
import ClientSearchCombobox from '@/components/ClientSearchCombobox';
import { upperName } from '@/lib/displayName';

interface AssetRow {
  id:       string;
  name:     string;
  client:   string;
  itemType: 'Asset' | 'Liability';
  category: string;
  value:    number;
  notes:    string;
}

const fmt  = (n: number) => Math.round(n).toLocaleString();
const fmtK = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}RM ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000)      return `${sign}RM ${(abs / 1000).toFixed(1)}K`;
  return `${sign}RM ${Math.round(abs)}`;
};

// Category display order — mirrors lib/networthForm.ts NW_ITEMS grouping
const ASSET_CATEGORIES      = ['Cash & Deposits', 'EPF / Retirement', 'Property', 'Other Investment', 'Business', 'Other Asset'];
const LIABILITY_CATEGORIES  = ['Mortgage', 'Car Loan', 'Personal Loan', 'Credit Card', 'Study Loan', 'Other Liability'];

function LineItemGroup({ title, color, rows }: { title: string; color: string; rows: AssetRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {title}
      </div>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{r.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            RM {fmt(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function NetworthPage() {
  const { clients, loading: clientsLoading } = useClients();
  const [rows,       setRows]       = useState<AssetRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(searchParams?.get('client') ?? '');
  const [sending,    setSending]    = useState(false);
  const [linkModal,  setLinkModal]  = useState<{ url: string; clientName: string } | null>(null);
  const [copied,     setCopied]     = useState(false);

  // Sync when navigating from another page with ?client= param
  useEffect(() => {
    const id = searchParams?.get('client');
    if (id) setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/notion?type=assets', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.data) setRows(json.data); })
      .finally(() => setLoading(false));
  }, []);

  const selectedClient = clients.find(c => c.id === selectedId);

  // Rows carry the raw client name as typed/submitted — match loosely against
  // the selected client's first name, same approach as CashflowPage.
  const norm = (s: string) => (s ?? '').trim().toLowerCase();
  const rowMatchesClient = (r: AssetRow, name: string) => {
    const rc = norm(r.client), cn = norm(name);
    if (!rc || !cn) return false;
    return rc === cn || rc.includes(cn.split(' ')[0]) || cn.includes(rc.split(' ')[0]);
  };

  const filtered = selectedId && selectedClient
    ? rows.filter(r => rowMatchesClient(r, selectedClient.name))
    : rows;

  // ── Per-client aggregation (overview stats) ─────────────────────────────────
  const byClient = new Map<string, AssetRow[]>();
  for (const r of rows) {
    const key = r.client?.trim();
    if (!key) continue;
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key)!.push(r);
  }
  const clientSummaries = Array.from(byClient.values()).map(items => {
    const totalAssets      = items.filter(i => i.itemType === 'Asset').reduce((s, i) => s + i.value, 0);
    const totalLiabilities = items.filter(i => i.itemType === 'Liability').reduce((s, i) => s + i.value, 0);
    return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
  });
  const uniqueClients  = clientSummaries.length;
  const avgNetWorth    = uniqueClients > 0 ? clientSummaries.reduce((s, c) => s + c.netWorth, 0) / uniqueClients : 0;
  const positiveCount  = clientSummaries.filter(c => c.netWorth >= 0).length;

  // ── Selected-client stats ────────────────────────────────────────────────────
  const assetRows        = filtered.filter(r => r.itemType === 'Asset');
  const liabilityRows    = filtered.filter(r => r.itemType === 'Liability');
  const totalAssets      = assetRows.reduce((s, r) => s + r.value, 0);
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.value, 0);
  const netWorth         = totalAssets - totalLiabilities;
  const debtRatio        = totalAssets > 0 ? Math.round((totalLiabilities / totalAssets) * 100) : 0;

  const handleSendForm = useCallback(async () => {
    if (!selectedClient) return;
    setSending(true);
    try {
      const res = await fetch('/api/networth/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient.id, clientName: selectedClient.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate link');
      setLinkModal({ url: data.url, clientName: selectedClient.name });
    } catch (e: unknown) {
      alert(`Could not generate link: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  }, [selectedClient]);

  const handleCopy = () => {
    if (!linkModal) return;
    navigator.clipboard.writeText(linkModal.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const firstName   = upperName(selectedClient?.name?.split(' ')[0] ?? '');
  const clientReady = !loading && !clientsLoading && !!selectedId && filtered.length > 0;

  // Category-grouped rows for the selected client's breakdown panel
  const assetGroups = ASSET_CATEGORIES
    .map(cat => ({ cat, items: assetRows.filter(r => r.category === cat) }))
    .filter(g => g.items.length > 0);
  const uncategorizedAssets = assetRows.filter(r => !ASSET_CATEGORIES.includes(r.category));
  if (uncategorizedAssets.length) assetGroups.push({ cat: 'Other Asset', items: uncategorizedAssets });

  const liabilityGroups = LIABILITY_CATEGORIES
    .map(cat => ({ cat, items: liabilityRows.filter(r => r.category === cat) }))
    .filter(g => g.items.length > 0);
  const uncategorizedLiabilities = liabilityRows.filter(r => !LIABILITY_CATEGORIES.includes(r.category));
  if (uncategorizedLiabilities.length) liabilityGroups.push({ cat: 'Other Liability', items: uncategorizedLiabilities });

  // Asset allocation bars (top categories by value, for the selected client)
  const allocationBars = assetGroups
    .map(g => ({ label: g.cat, value: g.items.reduce((s, i) => s + i.value, 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const barColors = ['var(--accent)', 'var(--blue)', 'var(--gold)', 'var(--purple)', 'var(--green)', 'var(--red)'];

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
                : '📤 Send Net Worth Form'}
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
            <div className="stat-sub">{rows.length} total line item{rows.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon green">💰</div>
            <div className="stat-label">Avg Net Worth</div>
            <div className="stat-value">{loading ? '…' : fmtK(avgNetWorth)}</div>
            <div className="stat-sub">Across all submissions</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon green">✅</div>
            <div className="stat-label">Positive Net Worth</div>
            <div className="stat-value">{loading ? '…' : positiveCount}</div>
            <div className="stat-sub">
              {uniqueClients > 0 ? `${Math.round((positiveCount / uniqueClients) * 100)}% of clients` : '—'}
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
            <div className="stat-icon green">📈</div>
            <div className="stat-label">Total Assets</div>
            <div className="stat-value">{loading ? '…' : fmtK(totalAssets)}</div>
            <div className="stat-sub">{assetRows.length} item{assetRows.length !== 1 ? 's' : ''}{firstName ? ` · ${firstName}` : ''}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon red">📉</div>
            <div className="stat-label">Total Liabilities</div>
            <div className="stat-value">{loading ? '…' : fmtK(totalLiabilities)}</div>
            <div className="stat-sub">{liabilityRows.length} item{liabilityRows.length !== 1 ? 's' : ''}</div>
          </div>
          <div className={`stat-card ${netWorth >= 0 ? 'green' : 'red'}`}>
            <div className={`stat-icon ${netWorth >= 0 ? 'green' : 'red'}`}>{netWorth >= 0 ? '💰' : '⚠️'}</div>
            <div className="stat-label">Net Worth</div>
            <div className="stat-value" style={{ color: netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {loading ? '…' : `${netWorth >= 0 ? '+' : ''}${fmtK(netWorth)}`}
            </div>
            <div className="stat-sub">Assets minus liabilities</div>
          </div>
          <div className="stat-card gold">
            <div className="stat-icon gold">⚖️</div>
            <div className="stat-label">Debt-to-Asset Ratio</div>
            <div className="stat-value">{loading ? '…' : `${debtRatio}%`}</div>
            <div className="stat-sub">{debtRatio <= 40 ? '✅ Healthy' : '⚠️ Elevated'}</div>
          </div>
        </div>
      )}

      {/* ── Net Worth breakdown ── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--accent)' }} />
            {selectedClient ? `Net Worth — ${firstName}` : 'Net Worth (All Clients)'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {filtered.length} line item{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Empty state — no client selected and no data yet */}
        {!loading && rows.length === 0 && !selectedId && (
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📭</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>No net worth data yet</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
              Select a client above and send them a net worth form to get started.
            </div>
          </div>
        )}

        {/* Prompt to select a client when data exists but no filter active */}
        {!loading && rows.length > 0 && !selectedId && (
          <div style={{ padding: '24px 32px' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Showing all {rows.length} line items across {uniqueClients} client{uniqueClients !== 1 ? 's' : ''}. Select a client above to view their breakdown.
            </div>
          </div>
        )}

        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading…</div>
        )}

        {!loading && selectedId && filtered.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              No net worth data for {selectedClient?.name ?? 'this client'} yet
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                onClick={handleSendForm}
                disabled={sending}
                style={{ padding: '9px 18px', borderRadius: 'var(--r-pill)', background: 'var(--accent2)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
              >
                📤 Send Net Worth Form to {firstName}
              </button>
            </div>
          </div>
        )}

        {!loading && selectedId && filtered.length > 0 && (
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {assetGroups.map(g => (
                <LineItemGroup key={g.cat} title={g.cat} color="var(--green)" rows={g.items} />
              ))}
              {assetGroups.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No assets recorded.</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {liabilityGroups.map(g => (
                <LineItemGroup key={g.cat} title={g.cat} color="var(--red)" rows={g.items} />
              ))}
              {liabilityGroups.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No liabilities recorded.</div>}
            </div>
          </div>
        )}
      </div>

      {/* ── Asset Allocation chart (only when a client is selected with data) ── */}
      {clientReady && allocationBars.length > 0 && (
        <div className="two-col">
          <div className="section">
            <div className="section-header">
              <div className="section-title">
                <span className="section-dot" style={{ background: 'var(--blue)' }} />
                Asset Allocation
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div className="chart-title" style={{ marginBottom: 12 }}>{firstName}&apos;s assets by category</div>
              {allocationBars.map((b, i) => (
                <div key={b.label} className="bar-row" style={{ marginBottom: 8 }}>
                  <div className="bar-label">{b.label}</div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${totalAssets > 0 ? Math.max(Math.round((b.value / totalAssets) * 100), 1) : 1}%`, background: barColors[i % barColors.length] }} /></div>
                  <div className="bar-val">{fmtK(b.value)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <div className="section-title">
                <span className="section-dot" style={{ background: 'var(--accent)' }} />
                Financial Health
              </div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="bar-row">
                <div className="bar-label" style={{ width: 130 }}>Debt-to-Asset</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(debtRatio, 100)}%`, background: debtRatio <= 40 ? 'var(--green)' : 'var(--red)' }} /></div>
                <div className="bar-val">{debtRatio}%</div>
              </div>
              <div className="bar-row">
                <div className="bar-label" style={{ width: 130 }}>Healthy Target</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: '40%', background: 'var(--blue)' }} /></div>
                <div className="bar-val">≤40%</div>
              </div>
              <div style={{
                marginTop: 8, padding: 10,
                background: debtRatio <= 40 ? 'var(--accent-dim)' : 'var(--gold-dim)',
                borderRadius: 'var(--r-sm)', fontSize: 12,
                color: debtRatio <= 40 ? 'var(--accent2)' : 'var(--gold)',
              }}>
                {debtRatio <= 40
                  ? `✅ ${firstName}'s liabilities are ${debtRatio}% of assets — within a healthy range.`
                  : `⚠️ Liabilities are ${debtRatio}% of assets — above the 40% guideline. Review debt reduction with ${firstName}.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Prompt to select a client to see charts ── */}
      {!selectedId && rows.length > 0 && (
        <div className="two-col">
          {['Asset Allocation', 'Financial Health'].map(title => (
            <div key={title} className="section">
              <div className="section-header">
                <div className="section-title">
                  <span className="section-dot" style={{ background: title === 'Asset Allocation' ? 'var(--blue)' : 'var(--accent)' }} />
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
              Net Worth Form Ready
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              Send this link to <strong style={{ color: 'var(--text)' }}>{upperName(linkModal.clientName)}</strong> via WhatsApp or Email.
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
