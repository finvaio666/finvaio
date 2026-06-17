'use client';

import { useState, useEffect } from 'react';

// Minimal typing for the beforeinstallprompt event (not in standard lib.dom)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'aria-install-dismissed';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show,     setShow]     = useState(false);
  const [isIOS,    setIsIOS]    = useState(false);

  useEffect(() => {
    // Already installed (standalone) → never show
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // Previously dismissed (within 14 days) → don't nag
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissed && Date.now() - dismissed < 14 * 86400000) return;

    const ua  = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua); // Safari on iOS
    const isMobile = /android|iphone|ipad|ipod/.test(ua);
    if (!isMobile) return; // only nudge on phones

    if (ios) {
      setIsIOS(true);
      setShow(true);
      return;
    }

    // Android / Chrome — capture the install event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 9990,
      background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e5e5)',
      borderRadius: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
      maxWidth: 460, margin: '0 auto',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#0A0F0D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <line x1="16" y1="7" x2="5" y2="25" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
          <line x1="16" y1="7" x2="27" y2="25" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
          <line x1="5" y1="25" x2="27" y2="25" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
          <circle cx="5" cy="25" r="3.5" fill="#6B7280" opacity="0.7"/>
          <circle cx="27" cy="25" r="3.5" fill="#6B7280" opacity="0.7"/>
          <circle cx="16" cy="7" r="5" fill="#F97316"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #1a1a1a)' }}>Install FINVA</div>
        <div style={{ fontSize: 12, color: 'var(--text3, #888)', lineHeight: 1.4 }}>
          {isIOS
            ? <>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> for the app experience.</>
            : 'Add FINVA to your home screen for one-tap daily access.'}
        </div>
      </div>
      {!isIOS && (
        <button onClick={install} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'var(--text3, #999)', cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}>×</button>
    </div>
  );
}
