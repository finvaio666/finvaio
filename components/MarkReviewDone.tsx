'use client';

/**
 * MarkReviewDone — quick-complete action for a review, without opening the
 * full Log Meeting modal. "✓ Done" prompts for a next review date (updates
 * CRM + logs a lightweight meeting note); the "▾" menu offers "Clear — no
 * next review" for reviews with no follow-up scheduled.
 *
 * Popover renders via a portal with fixed positioning (computed from the
 * trigger's bounding rect) because both call sites place this inside
 * `.section`, which has `overflow: hidden` — an absolutely-positioned
 * popover would get clipped, especially for the last row in a list.
 */

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const todayKL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

function addOneYear(dateStr: string) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function MarkReviewDone({
  client, onDone,
}: {
  client: { id: string; name: string };
  onDone: () => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos,      setPos]      = useState<{ top: number; right: number } | null>(null);
  const [open,     setOpen]     = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nextDate, setNextDate] = useState(() => addOneYear(todayKL()));
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  function closeAll() { setOpen(false); setMenuOpen(false); setError(''); }

  function positionFromAnchor() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }

  async function submit(opts: { nextReviewDate?: string; clear?: boolean }) {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id, clientName: client.name, meetingDate: todayKL(),
          meetingType: 'Review',
          notes: opts.clear ? 'Review completed — no follow-up scheduled.' : 'Review completed.',
          actionItems: '',
          nextReviewDate: opts.nextReviewDate ?? '',
          clearNextReview: !!opts.clear,
        }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Failed to save.'); return; }
      closeAll();
      onDone();
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  const btnStyle: React.CSSProperties = {
    padding: '5px 10px', border: '1px solid var(--border)', background: 'var(--surface2)',
    color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
  };

  return (
    <span ref={anchorRef} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
        <button
          onClick={e => { e.stopPropagation(); positionFromAnchor(); setMenuOpen(false); setOpen(o => !o); }}
          disabled={saving}
          style={{ ...btnStyle, color: 'var(--green)', borderRight: 'none' }}
        >✓ Done</button>
        <button
          onClick={e => { e.stopPropagation(); positionFromAnchor(); setOpen(false); setMenuOpen(o => !o); }}
          disabled={saving}
          style={{ ...btnStyle, padding: '5px 7px' }}
          aria-label="More review options"
        >▾</button>
      </span>

      {(open || menuOpen) && pos && createPortal(
        <>
          <div onClick={e => { e.stopPropagation(); closeAll(); }} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />

          {open && (
            <div onClick={e => e.stopPropagation()} style={{
              position: 'fixed', top: pos.top, right: pos.right, zIndex: 151, width: 230,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
              boxShadow: 'var(--shadow)', padding: 12,
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Next review date
              </div>
              <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '7px 9px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', marginBottom: 8 }} />
              {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={closeAll} disabled={saving}
                  style={{ padding: '6px 12px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  Cancel
                </button>
                <button onClick={() => submit({ nextReviewDate: nextDate })} disabled={saving || !nextDate}
                  style={{ padding: '6px 14px', borderRadius: 'var(--r-pill)', border: 'none', background: 'var(--green)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: saving ? 0.6 : 1 }}>
                  {saving ? '…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          {menuOpen && (
            <div onClick={e => e.stopPropagation()} style={{
              position: 'fixed', top: pos.top, right: pos.right, zIndex: 151, minWidth: 200,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
              boxShadow: 'var(--shadow)', padding: 4,
            }}>
              {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px' }}>{error}</div>}
              <button
                onClick={() => submit({ clear: true })}
                disabled={saving}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseOut={e => (e.currentTarget.style.background = 'none')}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 6, color: 'var(--text2)', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)' }}
              >
                {saving ? 'Saving…' : 'Clear — no next review'}
              </button>
            </div>
          )}
        </>,
        document.body,
      )}
    </span>
  );
}
