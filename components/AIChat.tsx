'use client';

import { useState, useRef, useEffect } from 'react';

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
  initialMessage = "👋 Hi Bill! I have live access to your Notion workspace. Click a quick prompt or ask me anything about your clients.",
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
            {msg.content}
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
