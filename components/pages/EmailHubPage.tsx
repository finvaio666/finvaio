'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EmailSummary, EmailThread } from '@/lib/gmail';
import type { SummaryResult } from '@/lib/emailClassifier';
import type { Institution } from '@/app/api/email/institutions/route';
import ComposeEmailModal from '@/components/pages/ComposeEmailModal';
import { DEFAULT_THEMES, themeFromList, type Theme, type ThemeId } from '@/lib/emailThemes';

// ── Status helpers ────────────────────────────────────────────────────────────

function threadStatus(thread: EmailThread | null, email: EmailSummary): 'pending' | 'replied' | 'monitoring' | 'closed' {
  if (!thread) return email.status === 'monitoring' ? 'monitoring' : 'pending';
  const msgs = thread.messages;
  if (msgs.length === 0) return 'pending';

  const last       = msgs[msgs.length - 1];
  const hasInbound = msgs.some(m => !m.isFromAdvisor); // at least one external message

  // Purely outbound thread (forwarded email, new email sent by advisor) → Monitoring
  if (!hasInbound) return 'monitoring';

  // Has inbound → Replied if advisor sent last message, Pending otherwise
  return last.isFromAdvisor ? 'replied' : 'pending';
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending:    { bg: 'rgba(243,115,56,0.12)', color: 'var(--orange)',  label: '● Pending'    },
    replied:    { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e',        label: '✓ Replied'    },
    monitoring: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8',        label: '↑ Monitoring' },
    closed:     { bg: 'rgba(120,120,120,0.12)',color: 'var(--text3)',    label: '✕ Closed'    },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span style={{
      background: c.bg, color: c.color,
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 99, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  }
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString('en-MY', { weekday: 'short' });
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

// ── Connect Gmail panel ───────────────────────────────────────────────────────

function ConnectGmailPanel({ onConnect }: { onConnect: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleConnect() {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/email/auth');
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      window.location.href = data.url; // redirect to Google OAuth
    } catch {
      setError('Failed to initiate connection.');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 20, textAlign: 'center', padding: 40 }}>
      <div style={{ width: 72, height: 72, borderRadius: 18, background: 'rgba(243,115,56,0.1)', border: '1.5px solid rgba(243,115,56,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#F37338" strokeWidth="1.5">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Connect Your Gmail</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', maxWidth: 360, lineHeight: 1.6 }}>
          Link your Gmail account so ARIA can monitor work emails from insurance companies and fund houses, and help you draft professional replies.
        </div>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, maxWidth: 400 }}>{error}</div>}
      <button
        onClick={handleConnect}
        disabled={loading}
        style={{
          background: '#F37338', color: '#fff',
          border: 'none', borderRadius: 99,
          padding: '12px 28px', fontSize: 14, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
          boxShadow: '0 2px 12px rgba(243,115,56,0.35)',
          letterSpacing: '0.01em',
        }}
      >
        {loading ? 'Redirecting…' : '📧 Connect Gmail'}
      </button>
      <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 340 }}>
        ARIA only reads emails from whitelisted domains you configure. Your email stays private.
      </div>
    </div>
  );
}

// ── HTML email body (sandboxed iframe — preserves tables & formatting) ─────────

function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  function onLoad() {
    try {
      const doc = ref.current?.contentDocument;
      if (doc?.body) setHeight(Math.min(doc.body.scrollHeight + 24, 1200));
    } catch { /* cross-origin — keep default */ }
  }

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank">
<style>
  body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#1b1b1b;line-height:1.6;margin:0;padding:2px;word-break:break-word;}
  img{max-width:100%;height:auto;}
  table{max-width:100%;border-collapse:collapse;}
  td,th{padding:3px 6px;}
  a{color:#F37338;}
  blockquote{border-left:3px solid #ddd;margin:8px 0;padding-left:10px;color:#666;}
</style></head><body>${html}</body></html>`;

  // sandbox WITHOUT allow-scripts → email JS can't run; allow-same-origin only
  // so we can measure height; allow-popups so links can open in a new tab.
  return (
    <iframe
      ref={ref}
      onLoad={onLoad}
      sandbox="allow-same-origin allow-popups"
      srcDoc={srcDoc}
      style={{ width: '100%', border: 0, height, background: '#fff', borderRadius: 6 }}
      title="Email content"
    />
  );
}

// ── AI Summary panel ──────────────────────────────────────────────────────────

function AISummaryPanel({ summary, loading }: { summary: SummaryResult | null; loading: boolean }) {
  if (loading) return (
    <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>🤖 Analysing…</div>
    </div>
  );
  if (!summary) return null;

  const urgencyColor = { high: 'var(--red)', medium: 'var(--orange)', low: '#22c55e' }[summary.urgency] ?? 'var(--text3)';

  return (
    <div style={{ padding: '12px 16px', background: 'rgba(243,115,56,0.06)', borderRadius: 8, border: '1px solid rgba(243,115,56,0.2)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Summary</span>
        <span style={{ fontSize: 11, color: urgencyColor, background: `${urgencyColor}18`, padding: '2px 6px', borderRadius: 99 }}>{summary.urgency} urgency</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: '0 0 8px' }}>{summary.summary}</p>
      {summary.actionItems.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Items</div>
          {summary.actionItems.map((item, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--text2)', paddingLeft: 12, marginBottom: 2 }}>• {item}</div>
          ))}
        </div>
      )}
      {summary.clientHint && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>🔗 Client hint: {summary.clientHint}</div>
      )}
    </div>
  );
}

// ── Email detail + reply panel ────────────────────────────────────────────────

function EmailDetailPanel({
  email,
  thread,
  aiSummary,
  summaryLoading,
  onSend,
  onClose,
}: {
  email:         EmailSummary;
  thread:        EmailThread | null;
  aiSummary:     SummaryResult | null;
  summaryLoading: boolean;
  onSend:        (opts: { to: string; body: string; threadId?: string; inReplyTo?: string }) => Promise<void>;
  onClose:       () => void;
}) {
  const [replyMode,   setReplyMode]   = useState(false);
  const [replyText,   setReplyText]   = useState('');
  const [replyTo,     setReplyTo]     = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [sending,     setSending]     = useState(false);
  const [sent,        setSent]        = useState(false);
  const [sendError,   setSendError]   = useState('');
  const [instruction, setInstruction] = useState('');

  // Make-task flow
  const [taskOpen,   setTaskOpen]   = useState(false);
  const [taskText,   setTaskText]   = useState('');
  const [taskClient, setTaskClient] = useState('');
  const [taskDue,    setTaskDue]    = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskDone,   setTaskDone]   = useState(false);

  function openTaskForm() {
    setTaskText(aiSummary?.followUpTask || aiSummary?.actionItems?.[0] || `Follow up: ${email.subject}`);
    setTaskClient(aiSummary?.clientHint || '');
    setTaskDue('');
    setTaskOpen(true);
  }
  async function saveTask() {
    if (!taskText.trim()) return;
    setTaskSaving(true);
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: taskText.trim(), client: taskClient.trim(), due: taskDue || undefined }),
    });
    setTaskSaving(false);
    if (res.ok) { setTaskDone(true); setTaskOpen(false); }
  }

  const status = threadStatus(thread, email);
  const lastMsg = thread?.messages[thread.messages.length - 1];

  // Best-guess recipient: the original institution sender.
  const suggestedTo = (() => {
    const msgs = thread?.messages ?? [];
    const advisorAddr = (msgs.find(m => m.isFromAdvisor)?.fromEmail ?? '').toLowerCase();

    // 1. Real inbound reply — the sender of the last non-advisor message
    const lastInbound = [...msgs].reverse().find(m => !m.isFromAdvisor);
    if (lastInbound?.fromEmail) return lastInbound.fromEmail;

    // 2. Forwarded email — the original sender is inside the body's "From:" line.
    //    Extract the first email address on a "From:" line that isn't the advisor.
    for (const m of msgs) {
      const fromLine = m.body.match(/From:\s*[^\n]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      const candidate = fromLine?.[1] ?? '';
      if (candidate && candidate.toLowerCase() !== advisorAddr) return candidate;
    }

    // 3. Any institution email in the body that isn't the advisor's own
    for (const m of msgs) {
      const all = m.body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
      const inst = all.find(e => {
        const lo = e.toLowerCase();
        return lo !== advisorAddr && !lo.endsWith('gmail.com');
      });
      if (inst) return inst;
    }

    return '';
  })();

  function openReply(prefillDraft = false) {
    setReplyTo(suggestedTo);
    setSendError('');
    setReplyMode(true);
    if (!prefillDraft) setReplyText('');
  }

  async function loadDraft() {
    setDraftLoading(true);
    openReply(true);
    try {
      const inbound = thread?.messages.find(m => !m.isFromAdvisor) ?? thread?.messages[0];
      const res = await fetch('/api/email/draft', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode:        'reply',
          from:        email.from,
          subject:     email.subject,
          emailBody:   inbound?.body ?? email.snippet,
          clientName:  aiSummary?.clientHint || undefined,
          instruction: instruction || undefined,
        }),
      });
      const data = await res.json();
      if (data.draft) setReplyText(data.draft);
    } catch { /* ignore */ }
    setDraftLoading(false);
  }

  async function handleSend() {
    setSendError('');
    if (!replyText.trim()) { setSendError('Please write a reply first.'); return; }
    if (!replyTo.trim() || !replyTo.includes('@')) { setSendError('Please enter a valid recipient email address.'); return; }
    setSending(true);
    try {
      await onSend({
        to:        replyTo.trim(),
        body:      replyText,
        threadId:  email.threadId,
        inReplyTo: lastMsg?.messageIdHeader || undefined,
      });
      setSent(true);
      setReplyMode(false);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  }

  const messages = thread?.messages ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4, wordBreak: 'break-word' }}>{email.subject}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {email.fromName} · {formatDate(email.date)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <StatusBadge status={sent ? 'replied' : status} />
            {!sent && status !== 'closed' && (
              <button
                onClick={onClose}
                style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'none', color: 'var(--text3)', cursor: 'pointer' }}
              >Close</button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <AISummaryPanel summary={aiSummary} loading={summaryLoading} />

        {/* Follow-up flag → Make Task */}
        {aiSummary?.needsFollowUp && !taskDone && (
          <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(243,115,56,0.06)', border: '1px solid rgba(243,115,56,0.25)', borderRadius: 8 }}>
            {!taskOpen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>
                  📌 <b>This needs follow-up.</b>{aiSummary.followUpTask ? ` ${aiSummary.followUpTask}` : ''}
                </span>
                <button onClick={openTaskForm} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  📋 Make Task
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>Review the task before adding</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={taskText} onChange={e => setTaskText(e.target.value)} placeholder="Task…"
                    style={{ padding: '8px 10px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input value={taskClient} onChange={e => setTaskClient(e.target.value)} placeholder="Client (optional)"
                      style={{ flex: 1, minWidth: 140, padding: '8px 10px', fontSize: 13, background: taskClient ? 'var(--bg)' : 'rgba(243,115,56,0.06)', border: `1px solid ${taskClient ? 'var(--border)' : 'rgba(243,115,56,0.4)'}`, borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
                    <input value={taskDue} onChange={e => setTaskDue(e.target.value)} type="date"
                      style={{ padding: '8px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={saveTask} disabled={taskSaving || !taskText.trim()} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer', opacity: taskSaving ? 0.6 : 1 }}>
                    {taskSaving ? 'Adding…' : '✓ Add Task'}
                  </button>
                  <button onClick={() => setTaskOpen(false)} style={{ padding: '7px 14px', fontSize: 13, background: 'none', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text3)', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
        {taskDone && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
            ✓ Task added to your list.
          </div>
        )}

        {/* Thread messages */}
        {messages.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                padding: '12px 16px', borderRadius: 8,
                background: msg.isFromAdvisor ? 'rgba(243,115,56,0.06)' : 'var(--surface)',
                border: `1px solid ${msg.isFromAdvisor ? 'rgba(243,115,56,0.2)' : 'var(--border)'}`,
                marginLeft: msg.isFromAdvisor ? 20 : 0,
                marginRight: msg.isFromAdvisor ? 0 : 20,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: msg.isFromAdvisor ? 'var(--orange)' : 'var(--text)' }}>
                    {msg.isFromAdvisor ? 'You' : msg.fromName}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{formatDate(msg.date)}</span>
                </div>
                {msg.bodyHtml
                  ? <HtmlBody html={msg.bodyHtml} />
                  : <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {msg.body || '(No content)'}
                    </div>
                }
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>{email.snippet}</div>
        )}

        {/* Mark Done — at the end of the email content */}
        {!replyMode && !sent && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.3)', borderRadius: 'var(--r-pill)',
                padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >✓ Mark Done</button>
          </div>
        )}

        {/* Reply box */}
        {replyMode && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>
              ✏️ Reply Draft {draftLoading && <span style={{ color: 'var(--text3)' }}>(AI writing…)</span>}
            </div>
            {/* Editable recipient */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>To:</span>
              <input
                value={replyTo}
                onChange={e => setReplyTo(e.target.value)}
                placeholder="recipient@institution.com"
                type="email"
                style={{
                  flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '6px 10px',
                  fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-sans)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              style={{
                width: '100%', minHeight: 140,
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '8px 12px',
                fontSize: 13, color: 'var(--text)', lineHeight: 1.6,
                resize: 'vertical', fontFamily: 'var(--font-sans)',
                boxSizing: 'border-box',
              }}
              placeholder="Write your reply here…"
            />
            {sendError && (
              <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>⚠ {sendError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button
                onClick={handleSend}
                disabled={sending || !replyText.trim()}
                style={{
                  background: 'var(--orange)', color: '#fff',
                  border: 'none', borderRadius: 'var(--r-pill)',
                  padding: '8px 18px', fontSize: 13, fontWeight: 600,
                  cursor: sending ? 'wait' : 'pointer', opacity: (sending || !replyText.trim()) ? 0.6 : 1,
                }}
              >{sending ? 'Sending…' : '✉ Send'}</button>
              <button
                onClick={() => { setReplyMode(false); setSendError(''); }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '8px 14px', fontSize: 13, color: 'var(--text3)', cursor: 'pointer' }}
              >Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions — "What do you want to do with this?" */}
      {!replyMode && !sent && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Choose an action
          </div>
          {/* AI instruction (optional) */}
          <input
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="Optional: tell AI what the reply should say…"
            style={{
              width: '100%', padding: '8px 12px', fontSize: 12, marginBottom: 8,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={loadDraft}
              style={{
                background: 'rgba(243,115,56,0.12)', color: 'var(--orange)',
                border: 'none', borderRadius: 'var(--r-pill)',
                padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >🤖 AI Draft Reply</button>
            <button
              onClick={() => openReply(false)}
              style={{
                background: 'var(--orange)', color: '#fff',
                border: 'none', borderRadius: 'var(--r-pill)',
                padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >✉ Write Reply</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Email Hub page ───────────────────────────────────────────────────────

type FilterTab = 'all' | 'pending' | 'replied' | 'monitoring';

export default function EmailHubPage() {
  const searchParams = useSearchParams();
  const threadParam  = searchParams?.get('thread') ?? '';
  const [autoOpened, setAutoOpened] = useState(false);
  const [connected,       setConnected]       = useState<boolean | null>(null);
  const [emails,          setEmails]          = useState<EmailSummary[]>([]);
  const [institutions,    setInstitutions]    = useState<Institution[]>([]);
  const [advisorEmail,    setAdvisorEmail]    = useState('');
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [thread,          setThread]          = useState<EmailThread | null>(null);
  const [threadLoading,   setThreadLoading]   = useState(false);
  const [aiSummary,       setAiSummary]       = useState<SummaryResult | null>(null);
  const [summaryLoading,  setSummaryLoading]  = useState(false);
  const [filter,          setFilter]          = useState<FilterTab>('all');
  const [themes,          setThemes]          = useState<Theme[]>(DEFAULT_THEMES);
  const [themeFilter,     setThemeFilter]     = useState<ThemeId | 'all'>(searchParams?.get('theme') ?? 'all');
  const [composeOpen,     setComposeOpen]     = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  // Check for connection success/error in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      window.history.replaceState({}, '', '/emails');
    }
    if (params.get('error')) {
      setError(`Gmail connection failed: ${params.get('error')}`);
      window.history.replaceState({}, '', '/emails');
    }
  }, []);

  const loadEmails = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      // Manual refresh bypasses the server-side cache for fresh data.
      const res  = await fetch(`/api/email/list${isRefresh ? '?fresh=1' : ''}`);
      const data = await res.json();

      if (data.connected === false) {
        setConnected(false);
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }

      setConnected(true);
      const fresh: EmailSummary[] = data.emails ?? [];
      setEmails(fresh);
      setInstitutions(data.institutions ?? []);
      setAdvisorEmail(data.advisorEmail ?? '');
      if (Array.isArray(data.themes) && data.themes.length) setThemes(data.themes);
      if (data.noWhitelist) setError('no_whitelist');

      // Phase 2 — background AI categorisation for emails rules couldn't resolve.
      // Runs detached, in small batches, so the theme chips show instantly and
      // their counts tick up as each batch returns.
      (async () => {
        const todo = fresh.filter(e => !e.category);
        for (let i = 0; i < todo.length; i += 8) {
          const batch = todo.slice(i, i + 8);
          try {
            const r = await fetch('/api/email/categorize', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: batch.map(e => ({ id: e.id, from: e.from, subject: e.subject, snippet: e.snippet })) }),
            });
            const d = await r.json();
            if (d.results) {
              setEmails(prev => prev.map(e => (!e.category && d.results[e.id]) ? { ...e, category: d.results[e.id] } : e));
            }
          } catch { /* ignore batch failure */ }
        }
      })();
    } catch {
      setError('Failed to load emails.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadEmails(); }, [loadEmails]);

  // Deep link: /emails?thread=<id> — auto-open that thread once emails are loaded
  useEffect(() => {
    if (!threadParam || autoOpened || emails.length === 0) return;
    const match = emails.find(e => e.threadId === threadParam);
    if (match) {
      loadThread(match);
      setAutoOpened(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParam, emails, autoOpened]);

  async function loadThread(email: EmailSummary) {
    setSelectedId(email.threadId);
    setThread(null);
    setAiSummary(null);
    setThreadLoading(true);
    setSummaryLoading(true);

    try {
      const res  = await fetch(`/api/email/thread?id=${encodeURIComponent(email.threadId)}&mid=${encodeURIComponent(email.id)}`);
      const data = await res.json();
      if (data.thread)    setThread(data.thread);
      if (data.aiSummary) setAiSummary(data.aiSummary);
    } catch { /* ignore */ }
    setThreadLoading(false);
    setSummaryLoading(false);
  }

  async function handleSend(opts: { to: string; body: string; threadId?: string; inReplyTo?: string }) {
    const email = emails.find(e => e.threadId === selectedId);
    if (!email) throw new Error('No email selected.');

    const subject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;

    const res = await fetch('/api/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to:        opts.to,
        subject,
        body:      opts.body,
        threadId:  opts.threadId,
        inReplyTo: opts.inReplyTo,
        references: opts.inReplyTo,
        isNew:     false,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || `Send failed (HTTP ${res.status})`);
    }

    // Update local status only after confirmed success
    setEmails(prev => prev.map(e =>
      e.threadId === selectedId ? { ...e, status: 'replied' } : e
    ));
  }

  async function handleClose() {
    const email = emails.find(e => e.threadId === selectedId);
    if (!email) return;
    await fetch('/api/email/close', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: email.threadId }),
    });
    setEmails(prev => prev.filter(e => e.threadId !== selectedId));
    setSelectedId(null);
    setThread(null);
  }

  const selectedEmail = emails.find(e => e.threadId === selectedId) ?? null;

  // Get status for display — use thread data if available
  function getStatus(email: EmailSummary): string {
    if (selectedId === email.threadId && thread) {
      return threadStatus(thread, email);
    }
    return email.status;
  }

  // Status filter (tabs)
  const statusPass = (e: EmailSummary) => {
    const s = getStatus(e);
    if (filter === 'all')        return true;
    if (filter === 'pending')    return s === 'pending';
    if (filter === 'replied')    return s === 'replied';
    if (filter === 'monitoring') return s === 'monitoring';
    return true;
  };

  // Combined filter: status tab AND theme chip (uncategorised only show under "All")
  const filtered = emails.filter(e =>
    statusPass(e) && (themeFilter === 'all' || e.category === themeFilter)
  );

  const counts = {
    all:        emails.length,
    pending:    emails.filter(e => getStatus(e) === 'pending').length,
    replied:    emails.filter(e => getStatus(e) === 'replied').length,
    monitoring: emails.filter(e => getStatus(e) === 'monitoring').length,
  };

  // Theme counts respect the active status tab so chips reflect what you'd see.
  // Uncategorised emails (AI pass not done yet) are counted as "pending" and
  // fold into their theme as classification completes — so counts tick up.
  const themeCounts: Record<string, number> = {};
  let categorizing = 0;
  for (const e of emails.filter(statusPass)) {
    if (!e.category) { categorizing++; continue; }
    themeCounts[e.category] = (themeCounts[e.category] ?? 0) + 1;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filter tabs + action buttons — always in one visible row */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        {connected && advisorEmail && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>📧 {advisorEmail}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 2 }}>
            {connected ? (['all', 'pending', 'replied', 'monitoring'] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  padding: '7px 12px', fontSize: 13, fontWeight: 600,
                  border: 'none', background: 'none',
                  color: filter === tab ? '#F37338' : 'var(--text3)',
                  borderBottom: filter === tab ? '2px solid #F37338' : '2px solid transparent',
                  cursor: 'pointer', marginBottom: -1,
                  textTransform: 'capitalize',
                }}
              >
                {tab}{counts[tab] > 0 && (
                  <span style={{
                    background: filter === tab ? '#F37338' : 'var(--surface)',
                    color: filter === tab ? '#fff' : 'var(--text3)',
                    borderRadius: 99, fontSize: 11, padding: '1px 6px', marginLeft: 4,
                  }}>{counts[tab]}</span>
                )}
              </button>
            )) : <div />}
          </div>

          {/* Action buttons — always visible */}
          <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
            {connected && (
              <button
                onClick={() => loadEmails(true)}
                disabled={refreshing}
                style={{
                  padding: '7px 12px', fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--border)', borderRadius: 99,
                  background: 'none', color: 'var(--text2)', cursor: 'pointer',
                }}
              >{refreshing ? '…' : '⟳'}</button>
            )}
            <button
              onClick={() => setComposeOpen(true)}
              style={{
                padding: '7px 16px', fontSize: 13, fontWeight: 700,
                background: '#F37338', color: '#fff',
                border: 'none', borderRadius: 99, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(243,115,56,0.3)',
              }}
            >+ New Email</button>
          </div>
        </div>

        {/* Theme triage chips — filter institution emails by theme */}
        {connected && emails.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 0 4px' }}>
            <button
              onClick={() => setThemeFilter('all')}
              style={{
                padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                borderRadius: 99,
                border: `1px solid ${themeFilter === 'all' ? '#F37338' : 'var(--border)'}`,
                background: themeFilter === 'all' ? 'rgba(243,115,56,0.12)' : 'var(--surface)',
                color: themeFilter === 'all' ? '#F37338' : 'var(--text3)',
              }}
            >All ({emails.length})</button>
            {/* Show every theme group immediately; counts tick up as the AI pass
                classifies the remaining emails. Hide only an empty "Other". */}
            {themes.filter(t => t.id !== 'other' || (themeCounts[t.id] ?? 0) > 0).map(t => {
              const active = themeFilter === t.id;
              const n = themeCounts[t.id] ?? 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setThemeFilter(active ? 'all' : t.id)}
                  title={`${t.label} — ${n} email(s)`}
                  style={{
                    padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    borderRadius: 99,
                    border: `1px solid ${active ? t.color : 'var(--border)'}`,
                    background: active ? `${t.color}22` : 'var(--surface)',
                    color: active ? t.color : 'var(--text2)',
                    opacity: n === 0 ? 0.55 : 1,
                  }}
                >
                  {t.emoji} {t.label} <span style={{ opacity: 0.7 }}>({n})</span>
                </button>
              );
            })}
            {categorizing > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: 11, color: 'var(--text3)' }}>
                ⏳ categorising {categorizing}…
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Not connected */}
        {!loading && connected === false && (
          <div style={{ flex: 1 }}>
            <ConnectGmailPanel onConnect={() => loadEmails()} />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 14 }}>
            Loading emails…
          </div>
        )}

        {/* Error */}
        {!loading && error && error !== 'no_whitelist' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ color: 'var(--red)', fontSize: 14 }}>{error}</div>
            <button onClick={() => loadEmails()} style={{ padding: '8px 16px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 'var(--r-pill)', cursor: 'pointer', fontSize: 13 }}>Retry</button>
          </div>
        )}

        {/* No whitelist configured */}
        {!loading && connected && error === 'no_whitelist' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(243,115,56,0.1)', border: '1.5px solid rgba(243,115,56,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏢</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>No Institutions Configured</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 380, lineHeight: 1.6 }}>
                ARIA only shows emails from your approved institution whitelist. Add your insurance companies and fund houses to start monitoring their emails.
              </div>
            </div>
            <a href="/settings" style={{ padding: '10px 22px', background: '#F37338', color: '#fff', borderRadius: 99, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              ⚙️ Go to Settings → Email Hub
            </a>
          </div>
        )}

        {/* Connected — split pane */}
        {!loading && connected && !error && (
          <>
            {/* Left: email list */}
            <div style={{
              width: selectedEmail ? 320 : '100%',
              minWidth: selectedEmail ? 280 : undefined,
              borderRight: selectedEmail ? '1px solid var(--border)' : 'none',
              overflowY: 'auto',
              flexShrink: 0,
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
                  {themeFilter !== 'all'
                    ? `No ${themeFromList(themes, themeFilter).label} emails${filter !== 'all' ? ` in "${filter}"` : ''}.`
                    : filter === 'all' ? 'No work emails found. Add institutions to start monitoring.' : `No ${filter} emails.`}
                </div>
              ) : (
                filtered.map(email => {
                  const status = getStatus(email);
                  const isSelected = email.threadId === selectedId;
                  return (
                    <div
                      key={email.threadId}
                      onClick={() => loadThread(email)}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(243,115,56,0.06)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--orange)' : '3px solid transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: email.isRead ? 500 : 700, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {email.fromName}
                        </div>
                        {(() => { const t = themeFromList(themes, email.category); return (
                          <span title={t.label} style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}55` }}>
                            {t.emoji} {t.label}
                          </span>
                        ); })()}
                        <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{formatDate(email.date)}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: email.isRead ? 400 : 600, color: 'var(--text2)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {email.subject}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {email.snippet}
                        </div>
                        <div style={{ flexShrink: 0, marginLeft: 8 }}>
                          <StatusBadge status={status} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right: email detail */}
            {selectedEmail && (
              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                {threadLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 14 }}>
                    Loading thread…
                  </div>
                ) : (
                  <EmailDetailPanel
                    key={selectedEmail.threadId}
                    email={selectedEmail}
                    thread={thread}
                    aiSummary={aiSummary}
                    summaryLoading={summaryLoading}
                    onSend={handleSend}
                    onClose={handleClose}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Compose modal */}
      {composeOpen && (
        <ComposeEmailModal
          institutions={institutions}
          advisorEmail={advisorEmail}
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); loadEmails(true); }}
        />
      )}
    </div>
  );
}
