'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

const KB_ITEMS = [
  { tag: 'EPF / KWSP', title: 'EPF i-Saraan Guide', desc: 'Voluntary contribution scheme, eligibility, tax relief up to RM 4,000, how to advise clients.', date: 'Ask AI for full guide →', prompt: 'Explain EPF i-Saraan voluntary contribution scheme for a Malaysian financial consultant to advise clients on — include eligibility, contribution limits, tax relief, and how to apply' },
  { tag: 'Unit Trust', title: 'Malaysian Unit Trust Guide', desc: 'Public Mutual, Kenanga, Amanah Saham options for different risk profiles.', date: 'Ask AI for full guide →', prompt: 'Explain unit trust investment options available in Malaysia — Public Mutual, Kenanga, Amanah Saham. What should a Moderate risk profile client consider?' },
  { tag: 'Regulatory', title: 'BNM / SC Regulations 2026', desc: 'OPR outlook, PDPA compliance, SC licensing, what consultants need to know.', date: 'Ask AI for update →', prompt: 'What are the current BNM regulations a Malaysian financial consultant needs to know in 2026? Cover OPR, PDPA compliance, and SC licensing requirements.' },
  { tag: 'PDPA', title: 'Malaysia PDPA 2010', desc: 'Client data protection requirements, cloud storage compliance, what to include in your onboarding notice.', date: 'Ask AI for summary →', prompt: 'Explain Malaysia PDPA 2010 requirements for a financial consultant storing client data on cloud platforms like Notion. What do I need to tell clients?' },
  { tag: 'Tax Planning', title: 'Income Tax Relief Guide 2026', desc: 'EPF RM 4,000 relief, insurance RM 3,000, SSPN RM 8,000, lifestyle relief strategies.', date: 'Ask AI for full breakdown →', prompt: 'What are the best strategies for a Malaysian financial consultant to help clients optimise their income tax relief in 2026? Cover EPF, insurance, SSPN, lifestyle reliefs.' },
];

interface StoredDigest { digest: string; dataDate: string; generatedAt: string }

export default function KnowledgePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [digest, setDigest]   = useState<StoredDigest | null>(null);
  const [loadingDigest, setLoadingDigest] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.role === 'Admin') setAllowed(true);
      else { setAllowed(false); router.replace('/'); }
    }).catch(() => { setAllowed(false); router.replace('/'); });
  }, [router]);

  const loadDigest = useCallback(() => {
    setLoadingDigest(true);
    fetch('/api/market-digest', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.digest) setDigest(d.digest); })
      .catch(() => {})
      .finally(() => setLoadingDigest(false));
  }, []);

  useEffect(() => { if (allowed) loadDigest(); }, [allowed, loadDigest]);

  async function refreshDigest() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/market-digest', { method: 'POST' });
      const d = await res.json();
      if (d.digest) setDigest(d.digest);
    } catch { /* ignore */ }
    setRefreshing(false);
  }

  function askAI(prompt: string) {
    sessionStorage.setItem('aiPreloadPrompt', prompt);
    router.push('/ai');
  }

  if (allowed !== true) {
    return <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>Loading…</div>;
  }

  const generatedLabel = digest?.generatedAt
    ? new Date(digest.generatedAt).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Live Market Digest (Bank Negara Malaysia data) ── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--green)' }} />
            Market Digest
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>
              live figures from Bank Negara Malaysia{digest?.dataDate ? ` · data ${digest.dataDate}` : ''}
            </span>
          </div>
          <button className="section-action" onClick={refreshDigest} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : '↻ Refresh now'}
          </button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {loadingDigest && !digest ? (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading latest market data…</div>
          ) : digest ? (
            <>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)' }}>
                <ReactMarkdown>{digest.digest}</ReactMarkdown>
              </div>
              {generatedLabel && (
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)' }}>
                  Auto-updates daily · last generated {generatedLabel}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>
              No digest yet. Click <b>↻ Refresh now</b> to pull the latest figures.
            </div>
          )}
        </div>
      </div>

      {/* ── Knowledge shortcuts ── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--blue)' }} />
            Knowledge Base — Bill Morrisons
          </div>
        </div>
        <div className="kb-grid">
          {KB_ITEMS.map(item => (
            <div key={item.title} className="kb-card" onClick={() => askAI(item.prompt)}>
              <div className="kb-tag">{item.tag}</div>
              <div className="kb-title">{item.title}</div>
              <div className="kb-desc">{item.desc}</div>
              <div className="kb-date">{item.date}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
