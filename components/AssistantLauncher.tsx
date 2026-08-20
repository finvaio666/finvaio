'use client';

/**
 * AssistantLauncher — the global "Ask FINVA" bubble.
 *
 * Mounted in DashboardLayout, so the assistant is one click away from every
 * page instead of being buried in the sidebar. Desktop only: phones already
 * reach the same assistant from the bottom nav's Chat tab.
 *
 * Two details that make it usable in the flow of work:
 *  - On a client page (/clients/<id>) it scopes itself to that client, so
 *    "what's their exposure?" just works without re-picking anybody.
 *  - The conversation is kept in sessionStorage, because every page mounts its
 *    own DashboardLayout — without this, navigating would wipe the thread.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

interface Message { role: 'user' | 'assistant'; content: string }
interface PendingTask { task: string; client: string; due: string }

const STORAGE_KEY = 'finva-launcher-thread';

const QUICK_PROMPTS = [
  "What's urgent right now?",
  'Draft my morning plan',
  'Who should I follow up with?',
];

export default function AssistantLauncher() {
  const pathname = usePathname();
  const [open, setOpen]         = useState(false);
  // Restored lazily rather than in an effect: the panel is closed on first
  // paint, so the server ([]) and client (restored) renders agree.
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Message[]) : [];
    } catch { return []; }
  });
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [pending, setPending]   = useState<PendingTask[] | null>(null);
  const [saving, setSaving]     = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Scope to the client whose page we're on, if any.
  const clientId = pathname.startsWith('/clients/') ? pathname.slice('/clients/'.length).split('/')[0] : '';

  // Persist the thread so it survives navigation (each page mounts its own layout).
  useEffect(() => {
    if (messages.length === 0) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20))); } catch { /* quota — ignore */ }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Esc closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(async (text: string) => {
    const query = text.trim();
    if (!query || loading) return;
    const next = [...messages, { role: 'user' as const, content: query }];
    setMessages(next);
    setInput('');
    setPending(null);
    setLoading(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          clientId: clientId || null,
          clientName: null,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.pendingTasks)) {
        setPending(data.pendingTasks);
      } else {
        setMessages(m => [...m, { role: 'assistant', content: data.content || data.error || 'No response.' }]);
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Could not reach the assistant. Please try again.' }]);
    }
    setLoading(false);
  }, [messages, loading, clientId]);

  async function confirmTasks() {
    if (!pending?.length) return;
    setSaving(true);
    let created = 0;
    for (const t of pending) {
      if (!t.task.trim()) continue;
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: t.task.trim(), client: t.client.trim(), due: t.due || undefined }),
      });
      if (res.ok) created++;
    }
    setSaving(false);
    setPending(null);
    setMessages(m => [...m, { role: 'assistant', content: `✅ Added ${created} task${created === 1 ? '' : 's'} to your list.` }]);
  }

  function clearThread() {
    setMessages([]);
    setPending(null);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  return (
    <>
      {/* ── Bubble ── */}
      <button
        className="assistant-fab"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close Ask FINVA' : 'Open Ask FINVA'}
        title="Ask FINVA"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="22" height="22"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="Ask FINVA">
          <div className="assistant-panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <div className="assistant-panel-dot">💬</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Ask FINVA</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {clientId ? 'Focused on this client' : 'Your co-pilot · live data'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {messages.length > 0 && (
                <button onClick={clearThread} className="assistant-icon-btn" title="Clear conversation">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              )}
              <button onClick={() => setOpen(false)} className="assistant-icon-btn" title="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <div className="assistant-panel-body" ref={scrollRef}>
            {messages.length === 0 && !loading && (
              <div style={{ padding: '6px 2px' }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.55 }}>
                  Ask about a client, a fund, your day, or the product catalogue — I read your live data.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {QUICK_PROMPTS.map(q => (
                    <button key={q} onClick={() => send(q)} className="assistant-quick">{q}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`assistant-msg ${m.role}`}>
                {m.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      p:      ({ children }) => <p style={{ margin: '0 0 7px 0' }}>{children}</p>,
                      ul:     ({ children }) => <ul style={{ paddingLeft: 17, margin: '3px 0 7px 0' }}>{children}</ul>,
                      ol:     ({ children }) => <ol style={{ paddingLeft: 17, margin: '3px 0 7px 0' }}>{children}</ol>,
                      li:     ({ children }) => <li style={{ marginBottom: 3 }}>{children}</li>,
                      strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--text)' }}>{children}</strong>,
                      h1:     ({ children }) => <p style={{ fontWeight: 700, margin: '7px 0 3px 0', color: 'var(--text)' }}>{children}</p>,
                      h2:     ({ children }) => <p style={{ fontWeight: 700, margin: '7px 0 3px 0', color: 'var(--text)' }}>{children}</p>,
                      h3:     ({ children }) => <p style={{ fontWeight: 600, margin: '6px 0 2px 0', color: 'var(--text)' }}>{children}</p>,
                    }}
                  >{m.content}</ReactMarkdown>
                ) : m.content}
              </div>
            ))}

            {/* Task proposals — confirm before creating */}
            {pending && (
              <div className="assistant-pending">
                {pending.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>I couldn&apos;t find a task in that. Try &ldquo;remind me to call Karen on Friday&rdquo;.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Add {pending.length} task{pending.length === 1 ? '' : 's'}?</div>
                    {pending.map((t, i) => (
                      <div key={i} style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 5 }}>
                        • {t.task}{t.client ? ` — ${t.client}` : ''}{t.due ? ` (due ${t.due})` : ''}
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button onClick={confirmTasks} disabled={saving} className="assistant-send" style={{ padding: '6px 14px', fontSize: 12 }}>
                        {saving ? 'Adding…' : 'Add'}
                      </button>
                      <button onClick={() => setPending(null)} className="assistant-quick" style={{ padding: '6px 14px', fontSize: 12, flex: '0 0 auto' }}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {loading && <div className="assistant-msg assistant" style={{ color: 'var(--text3)' }}>Thinking…</div>}
          </div>

          <div className="assistant-panel-foot">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(input); }}
              placeholder="Ask anything…"
              disabled={loading}
              className="assistant-input"
            />
            <button onClick={() => send(input)} disabled={loading || !input.trim()} className="assistant-send">➤</button>
          </div>
        </div>
      )}
    </>
  );
}
