'use client';

import { useEffect, useState } from 'react';
import AIChat from '@/components/AIChat';

interface ClientData {
  id: string; name: string; aum: number; segment: string; risk: string; status: string;
}

const PROMPT_LIBRARY = [
  { label: 'Pre-meeting briefing',    prompt: 'Generate a concise pre-meeting briefing for [CLIENT]. Cover: quick client snapshot, portfolio performance, top 3 things to discuss, key questions to ask, red flags or opportunities.' },
  { label: 'Retirement projection',   prompt: 'Run a full retirement projection for [CLIENT] based on their Notion profile — include current savings, EPF, investment portfolio, target income, and expected surplus or gap.' },
  { label: 'EPF analysis',            prompt: 'EPF statement analysis for [CLIENT] — extract balances, projected retirement amount at 60 with 5.5% dividend, and flag any concerns.' },
  { label: 'Weekly market digest',    prompt: 'Malaysian market digest this week — BNM OPR, Bursa KLCI, MYR vs USD/SGD, EPF updates, one key investor insight — bullet points suitable for team WhatsApp.' },
  { label: 'Portfolio rebalancing',   prompt: 'Portfolio rebalancing recommendation for [CLIENT] — review their current asset allocation in Notion and suggest adjustments based on their risk profile and goals.' },
  { label: 'Insurance gap analysis',  prompt: 'Insurance gap analysis for [CLIENT] — compare their existing coverage to income replacement needs, highlight any critical gaps in life, CI, or medical cover.' },
  { label: 'Follow-up email draft',   prompt: 'Draft a professional post-meeting follow-up email for [CLIENT] — include warm opening, topics discussed, agreed action items, and next review date.' },
  { label: 'WhatsApp check-in',       prompt: 'Draft a short, warm WhatsApp message to check in with [CLIENT] and remind them of their next portfolio review.' },
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

  function firePrompt(text: string) {
    const newSeq = seq + 1;
    setSeq(newSeq);
    setPromptTrigger({ text, seq: newSeq });
  }

  const QUICK_PROMPTS = [
    { label: '📋 Client briefing',    prompt: clientPrompt('Generate a concise pre-meeting briefing for [CLIENT]. Cover: quick client snapshot, portfolio performance, top 3 things to discuss, key questions to ask, red flags or opportunities.', selectedClient?.name ?? '') },
    { label: '📊 Retirement check',   prompt: clientPrompt('Full retirement projection for [CLIENT] — pull their portfolio, EPF, income, and goals from Notion and calculate expected surplus or gap.', selectedClient?.name ?? '') },
    { label: '✉️ Follow-up email',    prompt: clientPrompt('Draft a professional post-meeting follow-up email for [CLIENT] — warm opening, portfolio review topics, agreed actions, and next review date.', selectedClient?.name ?? '') },
    { label: '📰 Market digest',      prompt: 'Generate this week\'s Malaysian financial market digest for Bill Morrisons team — BNM OPR, Bursa KLCI, MYR vs USD/SGD, EPF updates, one key investor insight.' },
    { label: '💡 Strategy ideas',     prompt: clientPrompt('What are 5 ways [CLIENT] can improve their financial position based on their current portfolio and risk profile?', selectedClient?.name ?? '') },
    { label: '💬 WhatsApp draft',     prompt: clientPrompt('Draft a WhatsApp message to [CLIENT] reminding them of their upcoming portfolio review — warm and professional.', selectedClient?.name ?? '') },
  ];

  return (
    <div className="two-col" style={{ alignItems: 'start' }}>
      <div className="section" style={{ minHeight: 600 }}>
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--gold)' }} />
            AI Assistant — Full Mode
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Claude · Notion MCP connected</div>
        </div>
        <AIChat
          initialMessage="🤖 Full AI mode — I have your complete client context. Select a client on the right, then click a prompt or type anything."
          height="420px"
          quickPrompts={QUICK_PROMPTS}
          placeholder={selectedClient ? `Ask anything about ${selectedClient.name}…` : 'Ask anything about Bill Morrisons clients…'}
          promptTrigger={promptTrigger}
          clientName={selectedClient?.name}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Client Quick Select ── */}
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--accent)' }} />
              Client Quick Select
            </div>
            {selectedClient && (
              <button
                onClick={() => { setSelectedClient(null); setClientSearch(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}
              >✕ clear</button>
            )}
          </div>

          {/* Search input */}
          <div style={{ padding: '8px 12px 4px' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                placeholder="Search client name…"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px 7px 32px',
                  borderRadius: 'var(--r-pill)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg2)', color: 'var(--text)',
                  fontSize: 12, fontFamily: 'var(--font-sans)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {clientSearch && (
                <button
                  onClick={() => setClientSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 13, lineHeight: 1, padding: 2 }}
                >✕</button>
              )}
            </div>

            {/* Result count */}
            {clients.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5, paddingLeft: 2 }}>
                {(() => {
                  const q = clientSearch.toLowerCase();
                  const matched = q ? clients.filter(c => c.name.toLowerCase().includes(q)) : clients;
                  return selectedClient
                    ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓ {selectedClient.name} selected</span>
                    : <span>{matched.length} client{matched.length !== 1 ? 's' : ''}{q ? ` matching "${clientSearch}"` : ''}</span>;
                })()}
              </div>
            )}
          </div>

          {/* Client list */}
          <div style={{ padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
            {clients.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 4px' }}>Loading clients…</div>
            )}
            {(() => {
              const q = clientSearch.toLowerCase();
              const filtered = q ? clients.filter(c => c.name.toLowerCase().includes(q)) : clients;

              if (filtered.length === 0) {
                return (
                  <div style={{ fontSize: 12, color: 'var(--text3)', padding: '12px 4px', textAlign: 'center' }}>
                    No clients match &ldquo;{clientSearch}&rdquo;
                  </div>
                );
              }

              return filtered.map(c => {
                const isSelected = selectedClient?.id === c.id;
                // Highlight matched characters in name
                const nameDisplay = (() => {
                  if (!q) return <span>{c.name}</span>;
                  const idx = c.name.toLowerCase().indexOf(q);
                  if (idx === -1) return <span>{c.name}</span>;
                  return (
                    <span>
                      {c.name.slice(0, idx)}
                      <mark style={{ background: 'rgba(74,222,128,0.25)', color: 'var(--accent)', borderRadius: 2, padding: '0 1px' }}>
                        {c.name.slice(idx, idx + q.length)}
                      </mark>
                      {c.name.slice(idx + q.length)}
                    </span>
                  );
                })();

                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedClient(c);
                      setClientSearch('');
                      firePrompt(`Give me a full profile summary of ${c.name} — their portfolio, risk profile, goals, and top 3 action items for our next meeting.`);
                    }}
                    onMouseOver={e => !isSelected && (e.currentTarget.style.background = 'var(--accent-dim)')}
                    onMouseOut={e => !isSelected && (e.currentTarget.style.background = isSelected ? 'var(--accent-dim)' : 'var(--surface2)')}
                    style={{
                      padding: '9px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                      background: isSelected ? 'var(--accent-dim)' : 'var(--surface2)',
                      border: isSelected ? '1px solid rgba(74,222,128,0.4)' : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--text)' }}>
                      {nameDisplay}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {c.segment && <span>{c.segment}</span>}
                      {c.risk    && <span>· {c.risk}</span>}
                      {c.aum > 0 && <span style={{ fontFamily: 'var(--font-mono)' }}>· RM {(c.aum / 1000).toFixed(0)}K AUM</span>}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* ── Prompt Library ── */}
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--purple)' }} />
              Prompt Library
            </div>
          </div>
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {selectedClient && (
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, padding: '4px 4px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                ✓ Prompts will reference {selectedClient.name}
              </div>
            )}
            {PROMPT_LIBRARY.map(p => (
              <button
                key={p.label}
                className="qp"
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--r-sm)' }}
                onClick={() => firePrompt(clientPrompt(p.prompt, selectedClient?.name ?? ''))}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
