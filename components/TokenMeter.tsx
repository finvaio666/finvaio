'use client';

import { useEffect, useState } from 'react';

export interface Quota { used: number; limit: number; remaining: number; resetsAt: string }

/**
 * "Tokens left today" for the signed-in FA. Loads itself once, and takes the
 * fresh figure that every Ask FINVA answer carries so it stays current without
 * polling. The allowance refreshes at 12:00 am Malaysia time.
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
    <div title="Your daily FINVA allowance refreshes at 12:00 am (Malaysia time)." style={{ fontSize: 11, color: 'var(--text3)', marginTop: compact ? 6 : 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span>
          Tokens left today: <strong style={{ color }}>{q.remaining.toLocaleString('en-MY')}</strong> of {q.limit.toLocaleString('en-MY')}
          {q.remaining > 0 && ` (about ${approxAnswers} more answers)`}
        </span>
        <span>Refreshes 12:00 am</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${pctLeft}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}
