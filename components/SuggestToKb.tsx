'use client';

import { useState } from 'react';

/**
 * "💡 Suggest to KB" under an Ask FINVA answer. The FA can add a note or a
 * correction; the server de-identifies it, drafts a knowledge entry and puts it
 * in Admin > KB Review. Nothing changes FINVA's answers until an Admin approves.
 */
export default function SuggestToKb({ question, answer }: { question: string; answer: string }) {
  const [state, setState] = useState<'idle' | 'open' | 'sending' | 'sent'>('idle');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [similar, setSimilar] = useState<string | null>(null);

  // Gate messages and one-liners are not knowledge worth reviewing.
  if (!question || answer.length < 150) return null;

  async function send() {
    setState('sending'); setError('');
    try {
      const res = await fetch('/api/kb/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not send');
      setSimilar(json.similarTitle ?? null);
      setState('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
      setState('open');
    }
  }

  const pill: React.CSSProperties = { padding: '4px 12px', fontSize: 11, borderRadius: 'var(--r-pill)', cursor: 'pointer', border: '1px solid var(--border)', background: 'none', color: 'var(--text3)' };

  if (state === 'sent') {
    return (
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--green)' }}>
        ✓ Sent to Admin for review. It will only be used by FINVA after approval.
        {similar && <span style={{ color: 'var(--text3)' }}> Similar existing entry: “{similar}”.</span>}
      </div>
    );
  }

  if (state === 'idle') {
    return (
      <button onClick={() => setState('open')} style={{ ...pill, marginTop: 10, marginLeft: 6 }} title="Suggest this answer for the firm's knowledge base">
        💡 Suggest to KB
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Suggest this for the firm&apos;s knowledge base</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 8px' }}>
        Add what you know from experience, or correct anything FINVA got wrong — your note matters more than the answer.
        Client names and personal details are removed automatically. An Admin reviews it before FINVA uses it.
      </div>
      <textarea
        value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={4000}
        placeholder="e.g. In practice I also… / This part is wrong because…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' }}
      />
      {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={send} disabled={state === 'sending'}
          style={{ ...pill, border: 'none', background: '#F37338', color: '#fff', fontWeight: 600 }}>
          {state === 'sending' ? 'Sending…' : 'Send for review'}
        </button>
        <button onClick={() => { setState('idle'); setError(''); }} style={pill}>Cancel</button>
      </div>
    </div>
  );
}
