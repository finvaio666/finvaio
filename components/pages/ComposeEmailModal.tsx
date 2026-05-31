'use client';

import { useState } from 'react';
import type { Institution } from '@/app/api/email/institutions/route';

interface Props {
  institutions: Institution[];
  advisorEmail: string;
  onClose:      () => void;
  onSent:       () => void;
}

export default function ComposeEmailModal({ institutions, onClose, onSent }: Props) {
  const [step,        setStep]        = useState<'compose' | 'draft'>('compose');
  const [toInstitution, setToInstitution] = useState<Institution | null>(null);
  const [toCustom,    setToCustom]    = useState('');
  const [purpose,     setPurpose]     = useState('');
  const [subject,     setSubject]     = useState('');
  const [body,        setBody]        = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [sending,     setSending]     = useState(false);
  const [error,       setError]       = useState('');

  const toEmail = toInstitution?.email || toCustom;
  const toName  = toInstitution?.name  || toCustom;

  async function handleAIDraft() {
    if (!toName || !purpose) { setError('Please fill in recipient and purpose first.'); return; }
    setError('');
    setDraftLoading(true);
    setStep('draft');
    try {
      const res  = await fetch('/api/email/draft', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'new', toName, purpose }),
      });
      const data = await res.json();
      if (data.subject) setSubject(data.subject);
      if (data.body)    setBody(data.body);
    } catch {
      setError('AI draft failed. You can still write manually.');
    }
    setDraftLoading(false);
  }

  async function handleSend() {
    if (!toEmail) { setError('Please enter a recipient email address.'); return; }
    if (!subject) { setError('Subject is required.'); return; }
    if (!body)    { setError('Email body is required.'); return; }
    setError('');
    setSending(true);
    try {
      const res  = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toEmail, subject, body, isNew: true }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setSending(false); return; }
      onSent();
    } catch {
      setError('Failed to send email.');
      setSending(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)', borderRadius: 12,
          border: '1px solid var(--border)',
          width: '100%', maxWidth: 580,
          maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Modal header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>New Email</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Step 1: To + Purpose */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>To</label>
            {institutions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select
                  value={toInstitution?.id ?? ''}
                  onChange={e => {
                    const inst = institutions.find(i => i.id === e.target.value) ?? null;
                    setToInstitution(inst);
                    if (inst) setToCustom('');
                  }}
                  style={{
                    padding: '8px 12px', fontSize: 13,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)',
                    width: '100%',
                  }}
                >
                  <option value="">Select institution…</option>
                  {institutions.map(i => (
                    <option key={i.id} value={i.id}>{i.name} — {i.email}</option>
                  ))}
                  <option value="__custom__">Other (enter manually)</option>
                </select>
                {(!toInstitution || toInstitution === null) && (
                  <input
                    value={toCustom}
                    onChange={e => setToCustom(e.target.value)}
                    placeholder="Or enter email address manually…"
                    type="email"
                    style={{
                      padding: '8px 12px', fontSize: 13,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 8, color: 'var(--text)', width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>
            ) : (
              <input
                value={toCustom}
                onChange={e => setToCustom(e.target.value)}
                placeholder="Enter recipient email address…"
                type="email"
                style={{
                  padding: '8px 12px', fontSize: 13,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)', width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
              What is this email about?
            </label>
            <input
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Request policy surrender value for client Karen Chew"
              style={{
                padding: '8px 12px', fontSize: 13,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* AI Draft button */}
          {step === 'compose' && (
            <button
              onClick={handleAIDraft}
              disabled={!toName || !purpose}
              style={{
                background: 'rgba(243,115,56,0.12)', color: 'var(--orange)',
                border: 'none', borderRadius: 'var(--r-pill)',
                padding: '9px 18px', fontSize: 13, fontWeight: 600,
                cursor: (!toName || !purpose) ? 'not-allowed' : 'pointer',
                opacity: (!toName || !purpose) ? 0.5 : 1,
                marginBottom: 14, width: '100%',
              }}
            >🤖 Generate AI Draft</button>
          )}

          {/* Draft editor */}
          {(step === 'draft' || subject || body) && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Subject</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder={draftLoading ? 'AI generating…' : 'Email subject…'}
                  style={{
                    padding: '8px 12px', fontSize: 13,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)', width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
                  Body {draftLoading && <span style={{ color: 'var(--text3)' }}>(AI writing…)</span>}
                </label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder={draftLoading ? 'AI is drafting your email…' : 'Write your email here…'}
                  style={{
                    padding: '8px 12px', fontSize: 13,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)', width: '100%',
                    minHeight: 200, resize: 'vertical', lineHeight: 1.6,
                    fontFamily: 'var(--font-sans)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {step === 'draft' && !draftLoading && (
              <button
                onClick={() => setStep('compose')}
                style={{
                  padding: '9px 16px', fontSize: 13,
                  background: 'none', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-pill)', color: 'var(--text3)', cursor: 'pointer',
                }}
              >← Back</button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '9px 16px', fontSize: 13,
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--r-pill)', color: 'var(--text3)', cursor: 'pointer',
              }}
            >Cancel</button>
            {(step === 'draft' || body) && (
              <button
                onClick={handleSend}
                disabled={sending || !toEmail || !subject || !body}
                style={{
                  padding: '9px 20px', fontSize: 13, fontWeight: 600,
                  background: 'var(--orange)', color: '#fff',
                  border: 'none', borderRadius: 'var(--r-pill)',
                  cursor: (sending || !toEmail || !subject || !body) ? 'not-allowed' : 'pointer',
                  opacity: (sending || !toEmail || !subject || !body) ? 0.6 : 1,
                }}
              >{sending ? 'Sending…' : '✉ Send Email'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
