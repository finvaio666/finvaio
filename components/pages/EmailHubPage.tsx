'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EmailSummary, EmailThread } from '@/lib/gmail';
import type { SummaryResult } from '@/lib/emailClassifier';
import type { Institution } from '@/app/api/email/institutions/route';
import ComposeEmailModal from '@/components/pages/ComposeEmailModal';

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
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.body || msg.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '(No content)'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>{email.snippet}</div>
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

      {/* Footer actions */}
      {!replyMode && !sent && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          {/* Instruction hint */}
          <input
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="Optional: tell AI what to focus on…"
            style={{
              flex: 1, padding: '8px 12px', fontSize: 12,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-sans)',
            }}
          />
          <button
            onClick={loadDraft}
            style={{
              background: 'rgba(243,115,56,0.12)', color: 'var(--orange)',
              border: 'none', borderRadius: 'var(--r-pill)',
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >🤖 AI Draft</button>
          <button
            onClick={() => openReply(false)}
            style={{
              background: 'var(--orange)', color: '#fff',
              border: 'none', borderRadius: 'var(--r-pill)',
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >✉ Reply</button>
        </div>
      )}
    </div>
  );
}

// ── Main Email Hub page ───────────────────────────────────────────────────────

type FilterTab = 'all' | 'pending' | 'replied' | 'monitoring';

export default function EmailHubPage() {
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
  const [composeOpen,     setComposeOpen]     = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  // Check for connection success/error in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') {
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
      const res  = await fetch('/api/email/list');
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
      setEmails(data.emails ?? []);
      setInstitutions(data.institutions ?? []);
      setAdvisorEmail(data.advisorEmail ?? '');
      if (data.noWhitelist) setError('no_whitelist');
    } catch {
      setError('Failed to load emails.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadEmails(); }, [loadEmails]);

  async function loadThread(email: EmailSummary) {
    setSelectedId(email.threadId);
    setThread(null);
    setAiSummary(null);
    setThreadLoading(true);
    setSummaryLoading(true);

    try {
      const res  = await fetch(`/api/email/thread?id=${encodeURIComponent(email.threadId)}`);
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
      body: JSON.stringify({ messageId: email.id }),
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

  // Filter tabs
  const filtered = emails.filter(e => {
    const s = getStatus(e);
    if (filter === 'all')        return true;
    if (filter === 'pending')    return s === 'pending';
    if (filter === 'replied')    return s === 'replied';
    if (filter === 'monitoring') return s === 'monitoring';
    return true;
  });

  const counts = {
    all:        emails.length,
    pending:    emails.filter(e => getStatus(e) === 'pending').length,
    replied:    emails.filter(e => getStatus(e) === 'replied').length,
    monitoring: emails.filter(e => getStatus(e) === 'monitoring').length,
  };

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
                  {filter === 'all' ? 'No work emails found. Add institutions to start monitoring.' : `No ${filter} emails.`}
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
