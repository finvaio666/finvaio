'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!username && !password) {
      setError('Please enter your username and password.');
      return;
    }
    if (!username) {
      setError('Please enter your username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Login failed. Please try again.');
      } else {
        // Stamp activity NOW so the idle-logout check doesn't fire on a stale
        // timestamp from a previous session.
        try { localStorage.setItem('aria-last-active', String(Date.now())); } catch { /* ignore */ }
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          {/* D1 icon */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <img src="/finva-logo.svg" width={80} height={80} alt="FINVA" />
          </div>
          <div style={{
            fontSize: 42, fontWeight: 800, letterSpacing: '-0.04em',
            color: 'var(--text)', lineHeight: 1,
          }}>
            FINVA
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Financial Intelligence Navigator &amp; Virtual Advisor
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, opacity: 0.7 }}>
            Bill Morrisons Financial Consulting
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r)',
          padding: '36px 32px',
          boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            Sign in
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28 }}>
            Enter your credentials to access the dashboard
          </div>

          <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Username */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                autoFocus
                style={{
                  width: '100%', padding: '11px 14px',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent2)')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  style={{
                    width: '100%', padding: '11px 44px 11px 14px',
                    border: '1.5px solid var(--border)',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 14,
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent2)')}
                  onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <button
                  type="button"
                  onMouseDown={() => setShowPassword(true)}
                  onMouseUp={() => setShowPassword(false)}
                  onMouseLeave={() => setShowPassword(false)}
                  onTouchStart={() => setShowPassword(true)}
                  onTouchEnd={() => setShowPassword(false)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title="Hold to show password"
                  style={{
                    position: 'absolute',
                    right: 6, top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32,
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', color: 'var(--text3)', padding: 0,
                  }}
                >
                  {showPassword ? (
                    /* eye-off */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    /* eye */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'var(--red-dim)', border: '1px solid rgba(235,0,27,0.2)',
                borderRadius: 'var(--r-sm)', padding: '10px 14px',
                fontSize: 13, color: 'var(--red)',
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '13px',
                background: loading ? 'var(--text3)' : 'var(--text)',
                color: 'var(--bg)',
                border: 'none', borderRadius: 'var(--r-sm)',
                fontSize: 14, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                marginTop: 4,
              }}
            >
              {loading ? 'Signing in…' : 'Sign in to FINVA'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'var(--text3)' }}>
          Protected by FINVA · Bill Morrisons Financial Consulting
        </div>
      </div>
    </div>
  );
}
