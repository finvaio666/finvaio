'use client';

import AIChat from '@/components/AIChat';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClients, formatAUM, formatDate, initials, riskClass, segmentClass, statusClass } from '@/components/useClients';

const QUICK_PROMPTS = [
  { label: '📋 Briefing', prompt: "Generate a concise pre-meeting briefing for Ahmad Rizal bin Abdullah. Cover: 1) Quick 3-sentence client snapshot, 2) Portfolio performance, 3) Top 3 things to discuss, 4) Key questions to ask, 5) Red flags or opportunities." },
  { label: '📊 Retirement', prompt: "Run a retirement projection for Ahmad Rizal. Show projected EPF and investment balances at age 60, whether sufficient for RM 8,000/month retirement income (adjusted for 3.5% inflation), retirement gap, and 3 specific actions to close it." },
  { label: '📅 Reviews', prompt: "Who is due for a review in the next 90 days? What should I prepare for each upcoming meeting?" },
  { label: '✉️ Email draft', prompt: "Draft a professional post-meeting follow-up email and short WhatsApp message for Ahmad Rizal. Include warm opening, topics discussed (portfolio review, FD maturity, insurance gap), agreed actions, and next meeting August 16 2026." },
];

export default function DashboardPage() {
  const { clients, loading, totalAum, activeCount, prospectCount, reviewsDue } = useClients();
  const router = useRouter();

  return (
    <>
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
          <div className="stat-value">{loading ? '…' : reviewsDue}</div>
          <div className="stat-sub">
            {clients[0]?.nextReview ? `Next: ${formatDate(clients[0].nextReview)}` : 'No upcoming reviews'}
          </div>
        </div>
        <div className="stat-card red" onClick={() => router.push('/reviews')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon red">⚠️</div>
          <div className="stat-label">Action Items</div>
          <div className="stat-value">3</div>
          <div className="stat-sub">{clients[0] ? `Pending for ${clients[0].name.split(' ')[0]}` : 'No items'}</div>
        </div>
      </div>

      <div className="two-col">
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--accent)' }} />
              Client CRM — Live from Notion
            </div>
            <Link href="/clients" className="section-action">View all →</Link>
          </div>
          <div className="client-table">
            <div className="client-row header">
              <div>Client</div><div>Status</div><div>Segment</div>
              <div>AUM</div><div>Next Review</div><div>Risk</div>
            </div>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                Loading from Notion…
              </div>
            ) : clients.map(client => (
              <div
                key={client.id}
                className="client-row"
                onClick={() => {
                  sessionStorage.setItem('aiPreloadPrompt', `Give me a full profile summary of ${client.name} — their portfolio, risk profile, goals, and top 3 action items for our next meeting.`);
                  router.push('/ai');
                }}
              >
                <div className="client-name-cell">
                  <div className="client-avatar">{initials(client.name)}</div>
                  <div>
                    <div className="client-name">{client.name}</div>
                    <div className="client-meta">Onboarded {formatDate(client.onboarding)}</div>
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

        <div className="section" style={{ minHeight: 400 }}>
          <AIChat quickPrompts={QUICK_PROMPTS} height="340px" />
        </div>
      </div>
    </>
  );
}
