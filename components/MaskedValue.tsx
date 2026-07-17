'use client';

import { useRef, useState } from 'react';

/**
 * Display-only masked value with a hold-to-reveal eye button (same interaction
 * as the password fields on the Settings page). If `onReveal` is provided, the
 * plaintext is fetched lazily on first reveal and cached for the component's
 * lifetime — so sensitive values never ride along in the page's initial data.
 */
export default function MaskedValue({ masked, onReveal }: {
  masked: string;
  onReveal?: () => Promise<string>;
}) {
  const [shown, setShown] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const show = () => {
    setShown(true);
    if (onReveal && !fetchedRef.current && !loading) {
      setLoading(true);
      onReveal()
        .then(v => { fetchedRef.current = true; setPlain(v); })
        .catch(() => { /* stay masked on failure */ })
        .finally(() => setLoading(false));
    }
  };
  const hide = () => setShown(false);

  const display = shown
    ? (onReveal ? (plain ?? (loading ? '·····' : masked)) : masked)
    : masked;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span>{display}</span>
      <button
        type="button"
        onMouseDown={show} onMouseUp={hide} onMouseLeave={hide}
        onTouchStart={show} onTouchEnd={hide}
        aria-label={shown ? 'Hide value' : 'Show value'}
        title="Hold to show"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, padding: 0, border: 'none', borderRadius: 4,
          background: 'transparent', color: 'var(--text3)', cursor: 'pointer',
        }}
      >
        {shown ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}
