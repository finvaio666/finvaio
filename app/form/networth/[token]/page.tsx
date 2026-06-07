'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { NW_ASSETS, NW_LIABILITIES } from '@/lib/networthForm';

interface TokenInfo { valid: boolean; clientName?: string; error?: string }

const num = (v: string) => parseFloat(v) || 0;
const fmtRM = (v: number) => `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function AmtInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid #eee' }}>
      <label style={{ fontSize: 14, color: '#333', flex: 1 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, color: '#999' }}>RM</span>
        <input
          inputMode="decimal" value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="0"
          style={{ width: 130, padding: '8px 10px', fontSize: 14, textAlign: 'right', border: '1px solid #ccc', borderRadius: 8, outline: 'none' }}
        />
      </div>
    </div>
  );
}

export default function NetWorthFormPage() {
  const params = useParams();
  const token  = (params?.token as string) ?? '';
  const [info, setInfo] = useState<TokenInfo>({ valid: false });
  const [step, setStep] = useState<'loading' | 'form' | 'submitting' | 'done' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ totalAssets: number; totalLiabilities: number; netWorth: number } | null>(null);

  useEffect(() => {
    if (!token) { setStep('error'); setErrMsg('No token in URL.'); return; }
    try {
      const parts = token.split('.');
      const p = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      if (!p.clientName || !p.advisorId || !p.exp) throw new Error('bad');
      if (Date.now() > p.exp) { setInfo({ valid: false, error: 'This link has expired. Please ask your financial advisor for a new one.' }); setStep('error'); return; }
      setInfo({ valid: true, clientName: p.clientName });
      setStep('form');
    } catch {
      setInfo({ valid: false, error: 'This link is invalid or has been tampered with.' });
      setStep('error');
    }
  }, [token]);

  const set = (k: string) => (v: string) => setVals(s => ({ ...s, [k]: v }));

  const totals = useMemo(() => {
    const a = NW_ASSETS.reduce((s, i) => s + num(vals[i.key] ?? ''), 0);
    const l = NW_LIABILITIES.reduce((s, i) => s + num(vals[i.key] ?? ''), 0);
    return { a, l, net: a - l };
  }, [vals]);

  async function submit() {
    if (totals.a === 0 && totals.l === 0) { alert('Please enter at least one amount.'); return; }
    setStep('submitting');
    try {
      const res = await fetch('/api/networth/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...vals }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Submission failed');
      setResult({ totalAssets: d.totalAssets, totalLiabilities: d.totalLiabilities, netWorth: d.netWorth });
      setStep('done');
    } catch (e) {
      setStep('form'); alert(`Could not submit: ${e instanceof Error ? e.message : 'error'}`);
    }
  }

  const wrap: React.CSSProperties = { maxWidth: 620, margin: '0 auto', padding: '24px 18px 80px', fontFamily: 'system-ui, sans-serif', color: '#222' };

  if (step === 'loading') return <div style={wrap}>Loading…</div>;
  if (step === 'error')   return <div style={{ ...wrap, textAlign: 'center', paddingTop: 80 }}><div style={{ fontSize: 40 }}>🔒</div><h2>Link problem</h2><p style={{ color: '#666' }}>{info.error}</p></div>;
  if (step === 'done' && result) return (
    <div style={{ ...wrap, textAlign: 'center', paddingTop: 60 }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <h2>Thank you!</h2>
      <p style={{ color: '#666' }}>Your net worth statement has been submitted to your financial advisor.</p>
      <div style={{ margin: '24px auto', maxWidth: 360, textAlign: 'left', background: '#f7f7f8', borderRadius: 12, padding: 18 }}>
        <Row k="Total Assets" v={fmtRM(result.totalAssets)} />
        <Row k="Total Liabilities" v={`− ${fmtRM(result.totalLiabilities)}`} />
        <div style={{ borderTop: '2px solid #ddd', marginTop: 8, paddingTop: 8 }}>
          <Row k="Net Worth" v={fmtRM(result.netWorth)} bold />
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#999' }}>You can close this page now.</p>
    </div>
  );

  return (
    <div style={wrap}>
      <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Net Worth Statement</div>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>For: {info.clientName}</div>
      </div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>
        Enter the current value of each item you have. Leave blank if it doesn&apos;t apply. All amounts in MYR. Your advisor uses this for retirement &amp; education planning.
      </p>

      <h3 style={{ fontSize: 15, color: '#1e3a5f', borderBottom: '2px solid #1e3a5f', paddingBottom: 6 }}>Assets — what you own</h3>
      {NW_ASSETS.map(i => <AmtInput key={i.key} label={i.label} value={vals[i.key] ?? ''} onChange={set(i.key)} />)}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 800, color: '#1e7a3a' }}>
        <span>Total Assets</span><span>{fmtRM(totals.a)}</span>
      </div>

      <h3 style={{ fontSize: 15, color: '#1e3a5f', borderBottom: '2px solid #1e3a5f', paddingBottom: 6, marginTop: 24 }}>Liabilities — what you owe</h3>
      {NW_LIABILITIES.map(i => <AmtInput key={i.key} label={i.label} value={vals[i.key] ?? ''} onChange={set(i.key)} />)}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 800, color: '#b03a3a' }}>
        <span>Total Liabilities</span><span>{fmtRM(totals.l)}</span>
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '2px solid #1e3a5f', marginTop: 16, padding: '14px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
          <span>Net Worth</span>
          <span style={{ color: totals.net >= 0 ? '#1e7a3a' : '#b03a3a' }}>{fmtRM(totals.net)}</span>
        </div>
        <button onClick={submit} disabled={step === 'submitting'}
          style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 800, background: '#F37338', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          {step === 'submitting' ? 'Submitting…' : 'Submit to my advisor'}
        </button>
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: bold ? 800 : 500, fontSize: bold ? 16 : 14 }}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}
