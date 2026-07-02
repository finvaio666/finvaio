'use client';

/**
 * MeetingCapture — post-meeting "golden loop" modal.
 * ───────────────────────────────────────────────────
 * Capture (typed notes or voice memo) → AI structures into summary, action
 * items, next review date and a follow-up email → one confirmation screen →
 * saves the meeting note, creates Tasks, updates the client's review dates,
 * and optionally sends the follow-up email. Designed to be usable one-handed
 * on a phone right after a client meeting.
 */

import { useState, useRef, useEffect } from 'react';
import ClientSearchCombobox, { ComboboxClient } from '@/components/ClientSearchCombobox';

export interface CaptureClient extends ComboboxClient {
  email?: string;
}

export interface CapturePrefill {
  clientId?:    string;
  clientName?:  string;
  meetingDate?: string;   // YYYY-MM-DD
  meetingType?: string;
  title?:       string;   // appointment title, shown as context
}

interface ActionRow { task: string; due: string; }

interface Structured {
  transcript?:    string;
  summary:        string;
  actionItems:    ActionRow[];
  nextReviewDate: string;
  email:          { subject: string; body: string };
}

const MEETING_TYPES = ['Annual Review', 'Follow-up', 'Phone Call', 'Video Call', 'Ad-hoc', 'Onboarding'];

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)', padding: '9px 12px', color: 'var(--text)',
  fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase',
  letterSpacing: '0.06em', display: 'block', marginBottom: 5,
};

export default function MeetingCapture({
  clients, prefill, onClose, onSaved,
}: {
  clients: CaptureClient[];
  prefill?: CapturePrefill;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

  const [step, setStep] = useState<'capture' | 'confirm' | 'done'>('capture');
  const [clientId,    setClientId]    = useState(prefill?.clientId ?? '');
  const [clientName,  setClientName]  = useState(prefill?.clientName ?? '');
  const [meetingDate, setMeetingDate] = useState(prefill?.meetingDate ?? today);
  const [meetingType, setMeetingType] = useState(prefill?.meetingType ?? 'Follow-up');
  const [notes,       setNotes]       = useState('');
  const [error,       setError]       = useState('');
  const [structuring, setStructuring] = useState(false);

  // ── Voice recording ─────────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recSecs,   setRecSecs]   = useState(0);
  const [micDenied, setMicDenied] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {  // cleanup on unmount
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach(t => t.stop());
  }, []);

  const recSecsRef = useRef(0);

  async function startRecording() {
    setError('');
    try {
      const media    = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined;
      const rec      = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        media.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        void structureFromAudio(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      recSecsRef.current = 0;
      setRecSecs(0);
      timerRef.current = setInterval(() => {
        recSecsRef.current += 1;
        setRecSecs(recSecsRef.current);
        if (recSecsRef.current >= 180) stopRecording();  // hard cap 3 min
      }, 1000);
    } catch {
      setMicDenied(true);
      setError('Microphone unavailable — type your notes below instead.');
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  async function structureFromAudio(blob: Blob) {
    const b64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(String(r.result).split(',')[1] ?? '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    await runStructure({ audio: { data: b64, mimeType: blob.type || 'audio/webm' } });
  }

  // ── AI structuring ──────────────────────────────────────────────────────────
  const [result, setResult] = useState<Structured | null>(null);

  async function runStructure(input: { notes?: string; audio?: { data: string; mimeType: string } }) {
    setStructuring(true); setError('');
    try {
      const res = await fetch('/api/meetings/structure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, clientName, meetingDate, meetingType }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || 'AI structuring failed — you can still save the raw notes.'); return; }
      setResult(data);
      if (data.transcript && !notes.trim()) setNotes(data.transcript);
      setStep('confirm');
    } catch {
      setError('Network error — you can still save the raw notes.');
    } finally {
      setStructuring(false);
    }
  }

  // Save raw notes without AI (fallback path)
  const [savingRaw, setSavingRaw] = useState(false);
  async function saveRaw() {
    if (!validate()) return;
    setSavingRaw(true); setError('');
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientName, meetingDate, meetingType, notes, actionItems: '', nextReviewDate: '' }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error || 'Save failed.'); return; }
      setStep('done'); setDoneMsg('Meeting note saved.');
      onSaved?.();
    } catch { setError('Network error.'); }
    finally { setSavingRaw(false); }
  }

  function validate(): boolean {
    if (!clientId && !clientName) { setError('Please select a client.'); return false; }
    if (!meetingDate)             { setError('Please enter the meeting date.'); return false; }
    return true;
  }

  // ── Confirmation state ──────────────────────────────────────────────────────
  const [summary,     setSummary]     = useState('');
  const [actions,     setActions]     = useState<ActionRow[]>([]);
  const [nextReview,  setNextReview]  = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody,   setEmailBody]   = useState('');
  const [sendEmail,   setSendEmail]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [doneMsg,     setDoneMsg]     = useState('');

  useEffect(() => {
    if (!result) return;
    setSummary(result.summary);
    setActions(result.actionItems);
    setNextReview(result.nextReviewDate);
    setEmailSubject(result.email.subject);
    setEmailBody(result.email.body);
  }, [result]);

  const clientEmail = clients.find(c => c.id === clientId)?.email ?? '';

  async function confirmSave() {
    if (!validate()) return;
    setSaving(true); setError('');
    const problems: string[] = [];
    try {
      // 1. Meeting note (also updates client's last/next review dates)
      const mres = await fetch('/api/meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, clientName, meetingDate, meetingType,
          notes: summary || notes,
          actionItems: actions.map(a => `${a.task}${a.due ? ` (due ${a.due})` : ''}`).join('\n'),
          nextReviewDate: nextReview,
        }),
      });
      if (!mres.ok) problems.push('meeting note');

      // 2. Tasks
      let tasksOk = 0;
      for (const a of actions) {
        if (!a.task.trim()) continue;
        const tres = await fetch('/api/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: a.task.trim(), client: clientName, due: a.due || undefined, type: 'Client' }),
        });
        if (tres.ok) tasksOk++;
      }
      if (tasksOk < actions.filter(a => a.task.trim()).length) problems.push('some tasks');

      // 3. Follow-up email
      let emailNote = '';
      if (sendEmail && emailSubject && emailBody) {
        if (!clientEmail) {
          emailNote = ' Follow-up email NOT sent — no email address on record for this client.';
        } else {
          const eres = await fetch('/api/email/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: clientEmail, subject: emailSubject, body: emailBody, isNew: true }),
          });
          if (!eres.ok) {
            const j = await eres.json().catch(() => ({ error: '' }));
            emailNote = ` Follow-up email failed: ${j.error || 'send error'}.`;
          } else {
            emailNote = ` Follow-up email sent to ${clientEmail}.`;
          }
        }
      }

      if (problems.length) {
        setError(`Saved with issues — could not save: ${problems.join(', ')}. Please check and retry.`);
      } else {
        setDoneMsg(`Meeting logged, ${tasksOk} task${tasksOk === 1 ? '' : 's'} created${nextReview ? `, next review set for ${nextReview}` : ''}.${emailNote}`);
        setStep('done');
        onSaved?.();
      }
    } catch { setError('Network error while saving.'); }
    finally { setSaving(false); }
  }

  const setAction = (i: number, field: keyof ActionRow, val: string) =>
    setActions(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,19,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--r)', width: '100%', maxWidth: 620, maxHeight: '94vh', overflow: 'auto', boxShadow: 'var(--shadow)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {step === 'capture' ? '🎙️ Log Meeting' : step === 'confirm' ? '✨ Review & Confirm' : '✅ Done'}
            </div>
            {prefill?.title && step !== 'done' && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>📅 {prefill.title}</div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', lineHeight: 1 }}>✕</button>
        </div>

        {/* ── STEP: capture ── */}
        {step === 'capture' && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Client *</label>
                <ClientSearchCombobox
                  clients={clients}
                  value={clientId}
                  onChange={c => { setClientId(c?.id ?? ''); setClientName(c?.name ?? ''); }}
                  placeholder="Search client…"
                  inputStyle={{ border: '1px solid var(--border)', background: 'var(--bg)' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Type</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MEETING_TYPES.map(t => (
                  <button key={t} onClick={() => setMeetingType(t)} style={{
                    padding: '6px 12px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)',
                    background: meetingType === t ? 'var(--text)' : 'var(--bg)',
                    color: meetingType === t ? 'var(--bg)' : 'var(--text3)',
                    fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}>{t}</button>
                ))}
              </div>
            </div>

            {/* Voice capture */}
            {!micDenied && typeof window !== 'undefined' && 'MediaRecorder' in window && (
              <div style={{ textAlign: 'center', padding: '10px 0 2px' }}>
                <button
                  onClick={recording ? stopRecording : startRecording}
                  disabled={structuring}
                  style={{
                    width: 74, height: 74, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: recording ? 'var(--red)' : '#F37338', color: '#fff', fontSize: 28,
                    boxShadow: recording ? '0 0 0 8px rgba(220,38,38,0.15)' : '0 2px 10px rgba(243,115,56,0.35)',
                    transition: 'all 0.2s', animation: recording ? 'pulse 1.2s infinite' : undefined,
                  }}
                >{recording ? '⏹' : '🎙️'}</button>
                <div style={{ fontSize: 12.5, color: recording ? 'var(--red)' : 'var(--text3)', marginTop: 8, fontWeight: recording ? 700 : 400 }}>
                  {recording
                    ? `Recording ${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, '0')} — tap to finish`
                    : structuring ? '' : 'Tap and talk through the meeting — I\'ll structure it for you'}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>or type</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Karen worried about market dip, agreed to switch RM50k from equity to bond fund, send her the factsheet by Friday, review again in October…"
              rows={5} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />

            {error && <div style={{ padding: '9px 13px', background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--red)' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={saveRaw} disabled={savingRaw || structuring || !notes.trim()}
                style={{ padding: '9px 16px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: !notes.trim() ? 0.5 : 1 }}>
                {savingRaw ? 'Saving…' : 'Save as-is (skip AI)'}
              </button>
              <button
                onClick={() => { if (validate() && notes.trim()) void runStructure({ notes }); else if (!notes.trim()) setError('Type some notes first (or use the mic).'); }}
                disabled={structuring || savingRaw}
                style={{ padding: '9px 22px', borderRadius: 'var(--r-pill)', border: 'none', background: '#F37338', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: structuring ? 0.6 : 1 }}>
                {structuring ? '🤖 Structuring…' : '✨ Structure with AI'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: confirm ── */}
        {step === 'confirm' && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Meeting Summary (saved as the note)</label>
              <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div>
              <label style={labelStyle}>Action Items → become Tasks</label>
              {actions.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>None found — add one below if needed.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {actions.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <input value={a.task} onChange={e => setAction(i, 'task', e.target.value)}
                      style={{ ...inputStyle, flex: 2, minWidth: 160, width: 'auto', padding: '6px 9px', fontSize: 13 }} />
                    <input value={a.due} onChange={e => setAction(i, 'due', e.target.value)} type="date"
                      style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 }} />
                    <button onClick={() => setActions(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setActions(prev => [...prev, { task: '', due: '' }])}
                style={{ marginTop: 8, padding: '5px 12px', fontSize: 12, background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r-pill)', color: 'var(--text3)', cursor: 'pointer' }}>
                + Add task
              </button>
            </div>

            <div>
              <label style={labelStyle}>Next Review Date (updates CRM)</label>
              <input type="date" value={nextReview} onChange={e => setNextReview(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
            </div>

            {/* Follow-up email */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: sendEmail ? 10 : 0 }}>
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                  ✉️ Send follow-up email {clientEmail ? `to ${clientEmail}` : ''}
                </span>
              </label>
              {sendEmail && !clientEmail && (
                <div style={{ fontSize: 12.5, color: 'var(--gold)', marginBottom: 8 }}>⚠ No email address on record for this client — add one in the CRM first, or untick.</div>
              )}
              {sendEmail && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject" style={{ ...inputStyle, fontSize: 13 }} />
                  <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={7} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55, fontSize: 13 }} />
                </div>
              )}
            </div>

            {error && <div style={{ padding: '9px 13px', background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--red)' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button onClick={() => setStep('capture')} disabled={saving}
                style={{ padding: '9px 16px', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                ← Back
              </button>
              <button onClick={confirmSave} disabled={saving}
                style={{ padding: '10px 26px', borderRadius: 'var(--r-pill)', border: 'none', background: saving ? 'var(--surface2)' : '#F37338', color: saving ? 'var(--text3)' : '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)' }}>
                {saving ? '⏳ Saving…' : `✅ Save${actions.filter(a => a.task.trim()).length ? ` + ${actions.filter(a => a.task.trim()).length} task${actions.filter(a => a.task.trim()).length === 1 ? '' : 's'}` : ''}${sendEmail && clientEmail ? ' + send email' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: done ── */}
        {step === 'done' && (
          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>All wrapped up</div>
            <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 20px' }}>{doneMsg}</div>
            <button onClick={onClose}
              style={{ padding: '10px 28px', borderRadius: 'var(--r-pill)', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              Close
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }`}</style>
    </div>
  );
}
