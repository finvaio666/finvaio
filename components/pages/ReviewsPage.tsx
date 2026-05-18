'use client';

export default function ReviewsPage() {
  return (
    <>
      <div className="stat-grid-3">
        <div className="stat-card green">
          <div className="stat-icon green">✅</div>
          <div className="stat-label">Completed this month</div>
          <div className="stat-value">1</div>
          <div className="stat-sub">Ahmad Rizal — May 16</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon gold">⏳</div>
          <div className="stat-label">Upcoming (90 days)</div>
          <div className="stat-value">1</div>
          <div className="stat-sub">Ahmad Rizal — Aug 16</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">❌</div>
          <div className="stat-label">Overdue</div>
          <div className="stat-value">0</div>
          <div className="stat-sub">All clients up to date</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--gold)' }} />
            Upcoming Reviews
          </div>
        </div>
        <div className="review-list">
          <div className="review-item">
            <div className="review-date-block">
              <div className="review-day">16</div>
              <div className="review-month">Aug</div>
            </div>
            <div className="review-content">
              <div className="review-client">Ahmad Rizal bin Abdullah</div>
              <div className="review-type">Quarterly Review · Moderate · Affluent · RM 250,000 AUM</div>
              <div className="review-type" style={{ marginTop: 4, color: 'var(--gold)' }}>
                ⚠️ Agenda: FD maturity plan, insurance gap, surplus deployment
              </div>
            </div>
            <div className="days-away later">90 days</div>
          </div>
          <div className="review-item" style={{ opacity: 0.4 }}>
            <div className="review-date-block">
              <div className="review-day">16</div>
              <div className="review-month">Nov</div>
            </div>
            <div className="review-content">
              <div className="review-client">Ahmad Rizal bin Abdullah</div>
              <div className="review-type">FD Maturity Review · Maybank FD RM 50,000 matures</div>
            </div>
            <div className="days-away later">182 days</div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--accent)' }} />
            Completed Reviews
          </div>
        </div>
        <div className="review-list">
          <div className="review-item">
            <div className="review-date-block">
              <div className="review-day">16</div>
              <div className="review-month">May</div>
            </div>
            <div className="review-content">
              <div className="review-client">Ahmad Rizal bin Abdullah</div>
              <div className="review-type">Initial onboarding meeting · KYC completed · Financial plan initiated</div>
            </div>
            <span className="badge active" style={{ flexShrink: 0 }}>Done</span>
          </div>
        </div>
      </div>
    </>
  );
}
