'use client';

import { useEffect, useState } from 'react';

export interface Quota { used: number; limit: number; remaining: number; resetsAt: string }

/**
 * "Tokens left today" for the signed-in FA. Loads itself once, and takes the
 * fresh figure that every Ask FINVA answer carries so it stays current without
 * polling. The allowance refreshes at 12:00 am Malaysia time.
 *
 * One quiet line - label, short bar, hint - so it reads as a status, not as a
 * divider between the question box and the quick buttons.
 */
export default function TokenMeter({ quota: fresh, compact = false }: { quota?: Quota | null; compact?: boolean }) {
  const [loaded, setLoaded] = useState<Quota | null>(null);
  useEffect(() => {
    fetch('/api/ai-quota').then(r => (r.ok ? r.json() : null)).then(q => q && setLoaded(q)).catch(() => {});
  }, []);
  const q = fresh ?? loaded;
  if (!q || !q.limit) return null;

  const pctLeft = Math.max(0, Math.min(100, Math.round((q.remaining / q.limit) * 100)));
  const color = q.remaining === 0 ? 'var(--red)' : pctLeft <= 20 ? '#D97706' : '#F37338';
  const approxAnswers = Math.floor(q.remaining / 7000);

  return (
    <div
      title={`Used ${q.used.toLocaleString('en-MY')} of ${q.limit.toLocaleString('en-MY')} tokens today. Your daily allowance refreshes at 12:00 am (Malaysia time).`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        fontSize: 12, color: 'var(--text2)',
        margin: compact ? '2px 4px 12px' : '4px 4px 14px',
      }}
    >
      <span>
        Tokens left today{' '}
        <strong style={{ color, fontWeight: 700 }}>{q.remaining.toLocaleString('en-MY')}</strong>
        <span style={{ color: 'var(--text3)' }}> / {q.limit.toLocaleString('en-MY')}</span>
      </span>
      <span aria-hidden style={{ width: 110, height: 5, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', width: `${pctLeft}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.3s' }} />
      </span>
      <span style={{ color: 'var(--text3)' }}>
        {q.remaining > 0 ? `≈ ${approxAnswers} answers · ` : 'Limit reached · '}refreshes 12:00 am
      </span>
    </div>
  );
}
