'use client';

import { useEffect, useRef, useState } from 'react';
import AIChat from '@/components/AIChat';

interface ClientData {
  id: string; name: string; aum: number; segment: string; risk: string; status: string;
}

const PROMPT_LIBRARY = [
  { label: '📋 Pre-meeting briefing',   prompt: 'Generate a concise pre-meeting briefing for [CLIENT]. Cover: quick client snapshot, portfolio performance, top 3 things to discuss, key questions to ask, red flags or opportunities.' },
  { label: '📊 Retirement projection',  prompt: 'Run a full retirement projection for [CLIENT] based on their Notion profile — include current savings, EPF, investment portfolio, target income, and expected surplus or gap.' },
  { label: '📂 EPF analysis',           prompt: 'EPF statement analysis for [CLIENT] — extract balances, projected retirement amount at 60 with 5.5% dividend, and flag any concerns.' },
  { label: '📰 Weekly market digest',   prompt: 'Malaysian market digest this week — BNM OPR, Bursa KLCI, MYR vs USD/SGD, EPF updates, one key investor insight — bullet points suitable for team WhatsApp.' },
  { label: '⚖️ Portfolio rebalancing',  prompt: 'Portfolio rebalancing recommendation for [CLIENT] — review their current asset allocation in Notion and suggest adjustments based on their risk profile and goals.' },
  { label: '🛡️ Insurance gap analysis', prompt: 'Insurance gap analysis for [CLIENT] — compare their existing coverage to income replacement needs, highlight any critical gaps in life, CI, or medical cover.' },
  { label: '✉️ Follow-up email',        prompt: 'Draft a professional post-meeting follow-up email for [CLIENT] — include warm opening, topics discussed, agreed action items, and next review date.' },
  { label: '💬 WhatsApp check-in',      prompt: 'Draft a short, warm WhatsApp message to check in with [CLIENT] and remind them of their next portfolio review.' },
];

function clientPrompt(template: string, name: string) {
  return name ? template.replace(/\[CLIENT\]/g, name) : template.replace(/\[CLIENT\]/g, 'the client');
}

export default function AIPage() {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientData | null>(null);
  const [promptTrigger, setPromptTrigger] = useState<{ text: string; seq: number } | null>(null);
  const [seq, setSeq] = useState(0);
  const [clientSearch, setClientSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('aiPreloadPrompt');
    if (stored) {
      sessionStorage.removeItem('aiPreloadPrompt');
      firePrompt(stored);
    }
    fetch('/api/notion?type=clients', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (j.data) setClients(j.data.filter((c: ClientData) => c.status !== 'Inactive')); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current && !searchRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function firePrompt(text: string) {
    const newSeq = seq + 1;
    setSeq(newSeq);
    setPromptTrigger({ text, seq: newSeq });
  }

  function selectClient(c: ClientData) {
    setSelectedClient(c);
    setClientSearch('');
    setDropdownOpen(false);
    firePrompt(`Give me a full profile summary of ${c.name} — their portfolio, risk profile, goals, and top 3 action items for our next meeting.`);
  }

  const filteredClients = clientSearch.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  const QUICK_PROMPTS = [
    { label: '📋 Client briefing',   prompt: clientPrompt('Generate a concise pre-meeting briefing for [CLIENT]. Cover: quick client snapshot, portfolio performance, top 3 things to discuss, key questions to ask, red flags or opportunities.', selectedClient?.name ?? '') },
    { label: '📊 Retirement check',  prompt: clientPrompt('Full retirement projection for [CLIENT] — pull their portfolio, EPF, income, and goals from Notion and calculate expected surplus or gap.', selectedClient?.name ?? '') },
    { label: '✉️ Follow-up email',   prompt: clientPrompt('Draft a professional post-meeting follow-up email for [CLIENT] — warm opening, portfolio review topics, agreed actions, and next review date.', selectedClient?.name ?? '') },
    { label: '📰 Market digest',     prompt: "Generate this week's Malaysian financial market digest for Bill Morrisons team — BNM OPR, Bursa KLCI, MYR vs USD/SGD, EPF updates, one key investor insight." },
    { label: '💡 Strategy ideas',    prompt: clientPrompt('What are 5 ways [CLIENT] can improve their financial position based on their current portfolio and risk profile?', selectedClient?.name ?? '') },
    { label: '💬 WhatsApp draft',    prompt: clientPrompt('Draft a WhatsApp message to [CLIENT] reminding them of their upcoming portfolio review — warm and professional.', selectedClient?.name ?? '') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Client Selector Bar ─────────────────────────────────────────────── */}
      <div className="section" style={{ overflow: 'visible' }}>
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

          {/* Label */}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text3)', flexShrink: 0 }}>
            CLIENT
          </span>

          {/* Selected chip or search box */}
          {selectedClient ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--accent-dim)', border: '1.5px solid rgba(207,69,0,0.35)',
                borderRadius: 'var(--r-pill)', padding: '6px 14px',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--accent2)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {selectedClient.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent2)' }}>
                  {selectedClient.name}
                </span>
                {selectedClient.segment && (
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>· {selectedClient.segment}</span>
                )}
                {selectedClient.aum > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                    · RM {(selectedClient.aum / 1000).toFixed(0)}K
                  </span>
                )}
              </div>
              <button
                onClick={() => { setSelectedClient(null); setClientSearch(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
                title="Clear selection"
              >×</button>
            </div>
          ) : (
            /* Search input with dropdown */
            <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 360 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
              <input
                ref={searchRef}
                type="text"
                placeholder={clients.length > 0 ? `Search ${clients.length} clients…` : 'Loading clients…'}
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                style={{
                  width: '100%', padding: '8px 12px 8px 36px',
                  borderRadius: 'var(--r-pill)',
                  border: '1.5px solid var(--border)',
                  background: 'var(--bg2)', color: 'var(--text)',
                  fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocusCapture={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              {clientSearch && (
                <button onClick={() => { setClientSearch(''); setDropdownOpen(false); }}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</button>
              )}

              {/* Dropdown */}
              {dropdownOpen && filteredClients.length > 0 && (
                <div
                  ref={dropdownRef}
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow)',
                    maxHeight: 280, overflowY: 'auto', zIndex: 200,
                  }}
                >
                  {filteredClients.map(c => {
                    const q = clientSearch.toLowerCase();
                    const idx = q ? c.name.toLowerCase().indexOf(q) : -1;
                    const nameDisplay = idx >= 0 ? (
                      <span>
                        {c.name.slice(0, idx)}
                        <mark style={{ background: 'rgba(243,115,56,0.2)', color: 'var(--accent2)', borderRadius: 2, padding: '0 1px' }}>
                          {c.name.slice(idx, idx + q.length)}
                        </mark>
                        {c.name.slice(idx + q.length)}
                      </span>
                    ) : <span>{c.name}</span>;

                    return (
                      <div
                        key={c.id}
                        onMouseDown={() => selectClient(c)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                        onMouseOver={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{nameDisplay}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 6 }}>
                          {c.segment && <span>{c.segment}</span>}
                          {c.risk && <span>· {c.risk}</span>}
                          {c.aum > 0 && <span style={{ fontFamily: 'var(--font-mono)' }}>· RM {(c.aum / 1000).toFixed(0)}K</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {dropdownOpen && clientSearch && filteredClients.length === 0 && (
                <div ref={dropdownRef} style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)', padding: '12px 14px',
                  fontSize: 12, color: 'var(--text3)', zIndex: 200,
                }}>
                  No clients match &ldquo;{clientSearch}&rdquo;
                </div>
              )}
            </div>
          )}

          {/* Hint text */}
          {!selectedClient && (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              Select a client to load their data into the AI context
            </span>
          )}
        </div>
      </div>

      {/* ── AI Chat ─────────────────────────────────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--gold)' }} />
            AI Assistant
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Gemini 2.5 Flash · Notion connected</div>
        </div>
        <AIChat
          initialMessage="🤖 Select a client above, then click a prompt or type your question. I'll pull their live data from Notion automatically."
          height="460px"
          quickPrompts={QUICK_PROMPTS}
          placeholder={selectedClient ? `Ask anything about ${selectedClient.name}…` : 'Select a client above, or ask a general question…'}
          promptTrigger={promptTrigger}
          clientName={selectedClient?.name}
        />
      </div>

      {/* ── Prompt Library ──────────────────────────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--purple)' }} />
            Prompt Library
          </div>
          {selectedClient && (
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
              ✓ Referencing {selectedClient.name}
            </span>
          )}
        </div>
        <div style={{ padding: '12px 20px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PROMPT_LIBRARY.map(p => (
            <button
              key={p.label}
              className="qp"
              style={{ padding: '8px 16px', borderRadius: 'var(--r-sm)' }}
              onClick={() => firePrompt(clientPrompt(p.prompt, selectedClient?.name ?? ''))}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
