'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const IDLE_MINUTES  = 30;          // warn after 30 min of no activity
const WARN_SECONDS  = 60;          // countdown duration before auto-logout
const IDLE_MS       = IDLE_MINUTES * 60 * 1000;
const LAST_ACTIVE_KEY = 'aria-last-active';
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

function markActive() {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ }
}
function idleFor(): number {
  try {
    const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
    return last ? Date.now() - last : 0;
  } catch { return 0; }
}

export default function SessionTimeout() {
  const router   = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showWarning, setShowWarning] = useState(false);
  const [countdown,   setCountdown]   = useState(WARN_SECONDS);

  const doLogout = useCallback(async () => {
    clearTimeout(timerRef.current!);
    clearInterval(warnRef.current!);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }, [router]);

  const startWarning = useCallback(() => {
    setCountdown(WARN_SECONDS);
    setShowWarning(true);

    warnRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(warnRef.current!);
          doLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [doLogout]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    markActive(); // persist last-activity so we can enforce idle across reloads/resumes
    timerRef.current = setTimeout(startWarning, IDLE_MS);
  }, [startWarning]);

  // "Stay logged in" button
  const stayLoggedIn = useCallback(() => {
    clearInterval(warnRef.current!);
    setShowWarning(false);
    setCountdown(WARN_SECONDS);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    // On mount: if we were already idle past the limit (tab was closed / phone
    // locked / PWA suspended and reopened later), log out immediately.
    if (idleFor() > IDLE_MS) { doLogout(); return; }

    // Start idle timer on mount
    resetTimer();

    // Listen to user activity — only reset if warning is NOT shown
    const handleActivity = () => {
      if (!showWarning) resetTimer();
    };

    // When the tab/app regains focus or visibility, re-check idle time.
    // This catches "left it for a long time then came back" even if timers
    // were frozen while backgrounded.
    const handleResume = () => {
      if (document.visibilityState === 'hidden') return;
      if (idleFor() > IDLE_MS) { doLogout(); return; }
      if (!showWarning) resetTimer();
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current)  clearInterval(warnRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWarning]);  // re-register listeners when warning state changes

  if (!showWarning) return null;

  const pct = (countdown / WARN_SECONDS) * 100;
  const isUrgent = countdown <= 15;

  return (
    <>
      {/* Backdrop */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s ease',
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          padding: '36px 32px',
          width: '100%', maxWidth: 400,
          textAlign: 'center',
          animation: 'slideUp 0.25s ease',
        }}>
          {/* Icon */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: isUrgent ? 'var(--red-dim)' : 'rgba(var(--accent-rgb, 249,115,22),0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            transition: 'background 0.3s',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke={isUrgent ? 'var(--red)' : 'var(--accent2)'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12,6 12,12 16,14"/>
            </svg>
          </div>

          {/* Title */}
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Session Expiring Soon
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 24 }}>
            You've been inactive for {IDLE_MINUTES} minutes.
            <br />
            You'll be automatically signed out in:
          </div>

          {/* Countdown ring */}
          <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 24px' }}>
            <svg width="88" height="88" style={{ transform: 'rotate(-90deg)' }}>
              {/* Track */}
              <circle cx="44" cy="44" r="38"
                fill="none" stroke="var(--border)" strokeWidth="6"/>
              {/* Progress */}
              <circle cx="44" cy="44" r="38"
                fill="none"
                stroke={isUrgent ? 'var(--red)' : 'var(--accent2)'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 38}`}
                strokeDashoffset={`${2 * Math.PI * 38 * (1 - pct / 100)}`}
                style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800,
              color: isUrgent ? 'var(--red)' : 'var(--text)',
              transition: 'color 0.3s',
            }}>
              {countdown}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={stayLoggedIn}
              style={{
                width: '100%', padding: '13px',
                background: 'var(--text)',
                color: 'var(--bg)',
                border: 'none', borderRadius: 'var(--r-sm)',
                fontSize: 14, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseOut={e  => (e.currentTarget.style.opacity = '1')}
            >
              Stay logged in
            </button>
            <button
              onClick={doLogout}
              style={{
                width: '100%', padding: '11px',
                background: 'none',
                color: 'var(--text3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                fontSize: 13, fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'var(--red-dim)';
                e.currentTarget.style.color = 'var(--red)';
                e.currentTarget.style.borderColor = 'rgba(235,0,27,0.3)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = 'var(--text3)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              Sign out now
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </>
  );
}
