'use client';

import Link from 'next/link';
import { useClients, formatAUM, formatDate, initials, riskClass, segmentClass, statusClass } from '@/components/useClients';

export default function ClientsPage() {
  const { clients, loading, error, totalAum, activeCount, prospectCount } = useClients();
  const inactiveCount = clients.filter(c => c.status?.toLowerCase().includes('inactive')).length;

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
            All Clients — Notion CRM
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {loading ? 'Loading…' : `${clients.length} client${clients.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="client-table">
          <div className="client-row header">
            <div>Client</div><div>Status</div><div>Segment</div>
            <div>AUM</div><div>Next Review</div><div>Risk</div>
          </div>
          {loading && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              Loading from Notion…
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
              <div><span className={`badge ${segmentClass(client.segment)}`}>{client.segment}</span></div>
              <div><span className="aum-val">{formatAUM(client.aum)}</span></div>
              <div><span className="review-date">{formatDate(client.nextReview)}</span></div>
              <div><span className={`badge ${riskClass(client.risk)}`}>{client.risk}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="section" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>➕</div>
        <div style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Add your next client</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          Add a new row in your Notion Clients database — it appears here instantly
        </div>
        <Link href="/templates" className="section-action">Go to Templates →</Link>
      </div>
    </>
  );
}
