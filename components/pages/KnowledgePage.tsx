'use client';

import { useRouter } from 'next/navigation';

const KB_ITEMS = [
  { tag: 'EPF / KWSP', title: 'EPF i-Saraan Guide', desc: 'Voluntary contribution scheme, eligibility, tax relief up to RM 4,000, how to advise clients.', date: 'Ask AI for full guide →', prompt: 'Explain EPF i-Saraan voluntary contribution scheme for a Malaysian financial consultant to advise clients on — include eligibility, contribution limits, tax relief, and how to apply' },
  { tag: 'Unit Trust', title: 'Malaysian Unit Trust Guide', desc: 'Public Mutual, Kenanga, Amanah Saham options for different risk profiles.', date: 'Ask AI for full guide →', prompt: 'Explain unit trust investment options available in Malaysia — Public Mutual, Kenanga, Amanah Saham. What should a Moderate risk profile client consider?' },
  { tag: 'Regulatory', title: 'BNM / SC Regulations 2026', desc: 'OPR outlook, PDPA compliance, SC licensing, what consultants need to know.', date: 'Ask AI for update →', prompt: 'What are the current BNM regulations a Malaysian financial consultant needs to know in 2026? Cover OPR, PDPA compliance, and SC licensing requirements.' },
  { tag: 'PDPA', title: 'Malaysia PDPA 2010', desc: 'Client data protection requirements, cloud storage compliance, what to include in your onboarding notice.', date: 'Ask AI for summary →', prompt: 'Explain Malaysia PDPA 2010 requirements for a financial consultant storing client data on cloud platforms like Notion. What do I need to tell clients?' },
  { tag: 'Market · Week of 18 May 2026', title: 'Weekly Market Digest', desc: 'BNM held OPR at 2.75%. KLCI near 1,739. MYR/USD stable at 4.42. EPF 2024 dividend 6.3%.', date: '18 May 2026', prompt: "Summarise this week's Bursa Malaysia market performance, KLCI movements, and key sector updates relevant to Malaysian retail investors" },
  { tag: 'Tax Planning', title: 'Income Tax Relief Guide 2026', desc: 'EPF RM 4,000 relief, insurance RM 3,000, SSPN RM 8,000, lifestyle relief strategies.', date: 'Ask AI for full breakdown →', prompt: 'What are the best strategies for a Malaysian financial consultant to help clients optimise their income tax relief in 2026? Cover EPF, insurance, SSPN, lifestyle reliefs.' },
];

export default function KnowledgePage() {
  const router = useRouter();

  function askAI(prompt: string) {
    sessionStorage.setItem('aiPreloadPrompt', prompt);
    router.push('/ai');
  }

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">
          <span className="section-dot" style={{ background: 'var(--blue)' }} />
          Knowledge Base — Bill Morrisons
        </div>
        <button className="section-action" onClick={() => askAI("Generate this week's Malaysian financial market digest — BNM OPR, Bursa, MYR performance, EPF updates, and one key insight for retail investors")}>
          Generate Market Digest
        </button>
      </div>
      <div className="kb-grid">
        {KB_ITEMS.map(item => (
          <div key={item.title} className="kb-card" onClick={() => askAI(item.prompt)}>
            <div className="kb-tag">{item.tag}</div>
            <div className="kb-title">{item.title}</div>
            <div className="kb-desc">{item.desc}</div>
            <div className="kb-date">{item.date}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
