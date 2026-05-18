'use client';

import { useRouter } from 'next/navigation';

const TEMPLATES = [
  {
    icon: '📋',
    name: 'KYC Onboarding Form',
    desc: '7-section client intake form — personal details, income, goals, risk profile, assets, insurance, investment experience. PDPA-compliant.',
    action: 'Generate fresh form →',
    prompt: 'Generate a fresh KYC onboarding form for a new Malaysian financial consulting client at Bill Morrisons. Include all 7 sections.',
  },
  {
    icon: '📝',
    name: 'Meeting Notes Template',
    desc: 'Structured agenda, discussion summary, key decisions, and action items for both client and consultant.',
    action: 'Generate for today →',
    prompt: 'Generate a meeting notes template for a Bill Morrisons client meeting today. Include agenda, discussion summary, key decisions, action items for client and consultant, and next review date.',
  },
  {
    icon: '📊',
    name: 'Financial Plan Template',
    desc: '7-section professional plan — gap analysis, EPF optimisation, unit trust allocation, tax planning, 30/60/90 day action plan.',
    action: 'Generate plan →',
    prompt: 'Generate a complete financial plan template for a Bill Morrisons client. Include executive summary, client profile, current financial position, gap analysis, EPF and unit trust recommendations, 30/60/90 day action plan, and review schedule.',
  },
  {
    icon: '✉️',
    name: 'Post-Meeting Follow-Up',
    desc: 'Professional email + short WhatsApp version. Warm Malaysian tone with action items, decisions, and next meeting date.',
    action: 'Generate for Ahmad Rizal →',
    prompt: 'Generate a professional post-meeting follow-up email and WhatsApp message for Ahmad Rizal bin Abdullah at Bill Morrisons. Meeting date today. Discussed portfolio review, FD maturity plan, insurance gap. Action items: client to send EPF statement, Bill Morrisons to prepare insurance recommendations. Next meeting August 16 2026.',
  },
];

export default function TemplatesPage() {
  const router = useRouter();

  function useTemplate(prompt: string) {
    sessionStorage.setItem('aiPreloadPrompt', prompt);
    router.push('/ai');
  }

  return (
    <>
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--gold)' }} />
            Template Library — Bill Morrisons
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>4 templates ready</div>
        </div>
        <div className="template-grid">
          {TEMPLATES.map(t => (
            <div key={t.name} className="template-card" onClick={() => useTemplate(t.prompt)}>
              <div className="template-icon">{t.icon}</div>
              <div className="template-name">{t.name}</div>
              <div className="template-desc">{t.desc}</div>
              <div className="template-action">{t.action}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', textAlign: 'center' }}>
        Click any template above → AI generates it instantly on the AI Assistant page
      </div>
    </>
  );
}
