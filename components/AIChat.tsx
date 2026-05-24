'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatProps {
  initialMessage?: string;
  height?: string;
  quickPrompts?: { label: string; prompt: string }[];
  placeholder?: string;
  /** Pass { text, seq } — increment seq each time you want a new message sent (even same text) */
  promptTrigger?: { text: string; seq: number } | null;
  /** When set, the AI route fetches live Notion data for this client and injects it into the system prompt */
  clientName?: string;
}

export default function AIChat({
  initialMessage = "👋 Hi! I have live access to your Notion workspace. Click a quick prompt or ask me anything about your clients.",
  height = "340px",
  quickPrompts = [],
  placeholder = "Ask about any client...",
  promptTrigger = null,
  clientName,
}: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: initialMessage },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastSeq = useRef<number>(-1);

  useEffect(() => {
    if (!promptTrigger) return;
    if (promptTrigger.seq === lastSeq.current) return;   // already processed
    lastSeq.current = promptTrigger.seq;
    const t = promptTrigger.text;
    sendMessage(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptTrigger?.seq]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendMessage(prompt: string, displayText?: string) {
    const userDisplay = displayText || prompt;
    const newHistory = [...history, { role: 'user', content: prompt }];
    setHistory(newHistory);
    setMessages(prev => [...prev, { role: 'user', content: userDisplay }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory, clientName: clientName ?? null }),
      });
      const data = await res.json();
      let reply = data.content;
      if (!reply) {
        // Show a clean error message — strip raw JSON/stack traces
        const raw = data.error ?? 'Unable to get a response.';
        if (raw.includes('503') || raw.includes('high demand') || raw.includes('overloaded')) {
          reply = '⚠️ AI models are currently overloaded. Please try again in a moment.';
        } else if (raw.includes('quota') || raw.includes('RESOURCE_EXHAUSTED')) {
          reply = '⚠️ API quota exceeded. Please try again later or check your Gemini API limits.';
        } else if (raw.includes('API_KEY') || raw.includes('API key')) {
          reply = '⚠️ Gemini API key is missing or invalid. Check GEMINI_API_KEY in .env.local.';
        } else {
          // Truncate long technical errors to avoid dumping raw JSON in the chat
          reply = raw.length > 200 ? '⚠️ ' + raw.slice(0, 200) + '…' : '⚠️ ' + raw;
        }
      }
      setHistory(prev => [...prev, { role: 'assistant', content: reply }]);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Connection error. Please check your API key in .env.local.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    sendMessage(text);
  }

  return (
    <div className="ai-panel" style={{ minHeight: height }}>
      <div className="section-header">
        <div className="section-title">
          <span className="section-dot" style={{ background: 'var(--gold)' }} />
          AI Assistant
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>Gemini 2.5 Flash · Notion connected</div>
      </div>

      {quickPrompts.length > 0 && (
        <div className="quick-prompts">
          {quickPrompts.map((qp) => (
            <button
              key={qp.label}
              className="qp"
              onClick={() => sendMessage(qp.prompt, qp.label)}
              disabled={loading}
            >
              {qp.label}
            </button>
          ))}
        </div>
      )}

      <div className="ai-messages" ref={messagesRef} style={{ maxHeight: height }}>
        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ${msg.role}`}>
            {msg.role === 'assistant' ? (
              <ReactMarkdown
                components={{
                  p:      ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                  ul:     ({ children }) => <ul style={{ paddingLeft: 18, margin: '4px 0 8px 0' }}>{children}</ul>,
                  ol:     ({ children }) => <ol style={{ paddingLeft: 18, margin: '4px 0 8px 0' }}>{children}</ol>,
                  li:     ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--text)' }}>{children}</strong>,
                  h1:     ({ children }) => <p style={{ fontWeight: 700, fontSize: '1.05em', margin: '8px 0 4px 0', color: 'var(--text)' }}>{children}</p>,
                  h2:     ({ children }) => <p style={{ fontWeight: 700, fontSize: '1.02em', margin: '8px 0 4px 0', color: 'var(--text)' }}>{children}</p>,
                  h3:     ({ children }) => <p style={{ fontWeight: 600, margin: '6px 0 2px 0', color: 'var(--text)' }}>{children}</p>,
                  code:   ({ children }) => <code style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 4, padding: '1px 5px', fontFamily: 'var(--font-mono)', fontSize: '0.9em' }}>{children}</code>,
                  hr:     () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />,
                }}
              >
                {msg.content}
              </ReactMarkdown>
            ) : (
              msg.content
            )}
          </div>
        ))}
        {loading && (
          <div className="ai-msg loading">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        )}
      </div>

      <div className="ai-input-area">
        <input
          className="ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={placeholder}
          disabled={loading}
        />
        <button className="ai-send" onClick={handleSend} disabled={loading || !input.trim()}>
          ➤
        </button>
      </div>
    </div>
  );
}
