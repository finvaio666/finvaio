'use client';

import { useEffect, useState } from 'react';
import AIChat from '@/components/AIChat';

const QUICK_PROMPTS = [
  { label: '📋 Client briefing', prompt: "Generate a concise pre-meeting briefing for Ahmad Rizal bin Abdullah. Cover: quick client snapshot, portfolio performance, top 3 things to discuss, key questions to ask, red flags or opportunities." },
  { label: '📊 Retirement projection', prompt: "Full retirement projection for Ahmad Rizal — age 41, retirement age 60, EPF RM 115,000, monthly EPF RM 2,640, unit trust RM 85,000, monthly investment RM 1,000, other savings RM 50,000, target income RM 8,000/month, inflation 3.5%, EPF dividend 5.5%, investment return 8%" },
  { label: '✉️ Follow-up email', prompt: "Draft a professional post-meeting follow-up email and short WhatsApp message for Ahmad Rizal. Include warm opening, topics discussed (portfolio review, FD maturity, insurance gap), agreed actions, and next meeting August 16 2026." },
  { label: '📰 Market digest', prompt: "Generate this week's Malaysian financial market digest for Bill Morrisons team — BNM OPR, Bursa KLCI, MYR vs USD/SGD, EPF updates, one key investor insight" },
  { label: '💡 Strategy ideas', prompt: "What are 5 ways Ahmad Rizal can increase his retirement fund given his current profile — age 41, RM 250,000 AUM, RM 4,680 monthly surplus?" },
  { label: '💬 WhatsApp draft', prompt: "Draft a WhatsApp message to Ahmad Rizal reminding him to send his EPF statement — keep it warm and professional" },
];

const PROMPT_LIBRARY = [
  { label: 'Pre-meeting briefing', prompt: "Pre-meeting briefing for Ahmad Rizal — pull all his data and give me a concise 1-page briefing covering portfolio, cash flow, red flags, and 4 key questions to ask" },
  { label: 'Retirement projection', prompt: "Full retirement projection for Ahmad Rizal — age 41, retirement age 60, EPF RM 115,000, monthly EPF RM 2,640, unit trust RM 85,000, monthly investment RM 1,000, other savings RM 50,000, target income RM 8,000/month, inflation 3.5%, EPF dividend 5.5%, investment return 8%" },
  { label: 'EPF analysis', prompt: "EPF statement analysis template — extract balances, contributions, projected retirement amount at 60 with 5.5% dividend, and flag any concerns" },
  { label: 'Weekly market digest', prompt: "Malaysian market digest this week — BNM OPR, Bursa KLCI, MYR vs USD/SGD, EPF updates, one key investor insight — bullet points suitable for team WhatsApp" },
  { label: 'Portfolio rebalancing', prompt: "Portfolio rebalancing recommendation for Ahmad Rizal — Moderate risk profile, current: EPF 46%, Unit Trust 34%, FD 20%. FD matures Nov 2026. What should he do with RM 50,000 and his RM 4,680 monthly surplus?" },
];

export default function AIPage() {
  const [preloadPrompt, setPreloadPrompt] = useState<string | null>(null);
  const [externalPrompt, setExternalPrompt] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('aiPreloadPrompt');
    if (stored) {
      setPreloadPrompt(stored);
      sessionStorage.removeItem('aiPreloadPrompt');
    }
  }, []);

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
          initialMessage="🤖 Full AI mode — I have your complete client context. Ask me anything about Bill Morrisons clients, generate documents, run projections, or draft communications."
          height="420px"
          quickPrompts={QUICK_PROMPTS}
          placeholder="Ask anything about Bill Morrisons..."
          preloadPrompt={preloadPrompt || externalPrompt}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--accent)' }} />
              Client Quick Select
            </div>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 'var(--r-sm)', cursor: 'pointer', transition: 'background 0.15s' }}
              onClick={() => setExternalPrompt("Give me a full profile summary of Ahmad Rizal bin Abdullah — his portfolio, cash flow, goals, and top 3 action items for our next meeting")}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
              onMouseOut={e => (e.currentTarget.style.background = 'var(--surface2)')}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Ahmad Rizal bin Abdullah</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Affluent · Moderate · RM 250K AUM</div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--purple)' }} />
              Prompt Library
            </div>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {PROMPT_LIBRARY.map(p => (
              <button
                key={p.label}
                className="qp"
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--r-sm)' }}
                onClick={() => setExternalPrompt(p.prompt)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
