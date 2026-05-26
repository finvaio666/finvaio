'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useClients, formatAUM, formatDate, initials, riskClass, segmentClass, segmentLabel, statusClass } from '@/components/useClients';

export default function ClientsPage() {
  const { clients, loading, error, totalAum, activeCount, prospectCount, reload } = useClients();
  const inactiveCount = clients.filter(c => c.status?.toLowerCase().includes('inactive')).length;

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState<string | null>(null); // clientId being generated

  const handleGenerateReport = useCallback(async (clientId: string, clientName: string) => {
    setGeneratingReport(clientId);
    try {
      const res = await fetch(`/api/reports/client?clientId=${encodeURIComponent(clientId)}`);
      if (!res.ok) {
        const err = await res.json();
        alert(`Could not generate report: ${err.error ?? 'Unknown error'}`);
        return;
      }
      const data = await res.json();
      // Dynamically import PDF generator (client-side only)
      const { generateClientReport } = await import('@/lib/generateClientReport');
      generateClientReport(data);
    } catch (e) {
      alert(`Failed to generate report: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setGeneratingReport(null);
    }
  }, []);

  async function handleSyncAUM() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/sync-aum', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setSyncMsg(`✅ Synced ${data.updated.length} client${data.updated.length !== 1 ? 's' : ''}`);
      reload();
    } catch (e: unknown) {
      setSyncMsg(`❌ ${e instanceof Error ? e.message : 'Error'}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <div className="stat-grid-3">
        <div className="stat-card green">
          <div className="stat-icon green">🟢</div>
          <div className="stat-label">Active Clients</div>
          <div className="stat-value">{loading ? '…' : activeCount}</div>
          <div className="stat-sub">{formatAUM(totalAum)} total AUM</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-icon purple">🟡</div>
          <div className="stat-label">Prospects</div>
          <div className="stat-value">{loading ? '…' : prospectCount}</div>
          <div className="stat-sub">{prospectCount === 0 ? 'No prospects yet' : `${prospectCount} in pipeline`}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">🔴</div>
          <div className="stat-label">Inactive</div>
          <div className="stat-value">{loading ? '…' : inactiveCount}</div>
          <div className="stat-sub">{inactiveCount === 0 ? 'No inactive clients' : `${inactiveCount} clients`}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--accent)' }} />
            All Clients
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {syncMsg && (
              <span style={{ fontSize: 11, color: syncMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>
                {syncMsg}
              </span>
            )}
            <button
              onClick={handleSyncAUM}
              disabled={syncing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 'var(--r-pill)',
                background: syncing ? 'var(--surface2)' : 'var(--text)',
                color: syncing ? 'var(--text3)' : 'var(--bg)',
                border: 'none', cursor: syncing ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              {syncing ? (
                <>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--text3)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  Syncing…
                </>
              ) : '↻ Sync AUM'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {loading ? 'Loading…' : `${clients.length} client${clients.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
        <div className="client-table">
          <div className="client-row header">
            <div>Client</div><div>Status</div><div>Segment</div>
            <div>AUM</div><div>Next Review</div><div>Risk</div><div></div>
          </div>
          {loading && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--red)', fontSize: 12 }}>
              ⚠️ {error}
            </div>
          )}
          {!loading && clients.map(client => (
            <div key={client.id} className="client-row">
              <div className="client-name-cell">
                <div className="client-avatar">{initials(client.name)}</div>
                <div>
                  <div className="client-name">{client.name}</div>
                  <div className="client-meta">{client.phone} · {client.email}</div>
                </div>
              </div>
              <div><span className={`badge ${statusClass(client.status)}`}>{client.status}</span></div>
              <div><span className={`badge ${segmentClass(client.segment)}`}>{segmentLabel(client.segment)}</span></div>
              <div><span className="aum-val">{formatAUM(client.aum)}</span></div>
              <div><span className="review-date">{formatDate(client.nextReview)}</span></div>
              <div><span className={`badge ${riskClass(client.risk)}`}>{client.risk}</span></div>
              <div>
                <button
                  onClick={() => handleGenerateReport(client.id, client.name)}
                  disabled={generatingReport === client.id}
                  title="Generate Wealth Summary PDF"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 'var(--r-pill)',
                    border: '1px solid var(--border)',
                    background: generatingReport === client.id ? 'var(--surface2)' : 'var(--surface)',
                    color: generatingReport === client.id ? 'var(--text3)' : 'var(--text2)',
                    fontSize: 11, fontWeight: 600, cursor: generatingReport === client.id ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                  onMouseOver={e => { if (generatingReport !== client.id) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dim)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent2)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent2)'; } }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
                >
                  {generatingReport === client.id ? (
                    <>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--text3)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                      Generating…
                    </>
                  ) : (
                    <>📄 Report</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>➕</div>
        <div style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Add your next client</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          Add a new client in ARIA — they'll appear here instantly
        </div>
        <Link href="/templates" className="section-action">Go to Templates →</Link>
      </div>
    </>
  );
}
