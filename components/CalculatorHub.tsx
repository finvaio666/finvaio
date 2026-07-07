'use client';

import { useState } from 'react';
import PremiumCalculator from '@/components/PremiumCalculator';
import LsaCalculator from '@/components/LsaCalculator';

type Category = 'protection' | 'lsa';

const CATS: { id: Category; label: string; sub: string }[] = [
  { id: 'protection', label: 'Protection & Medical', sub: 'Life · Critical Illness · Medical card' },
  { id: 'lsa', label: 'Large Sum Assured', sub: 'Wealth / legacy · RM1m+ death benefit' },
];

const HEADER: Record<Category, { title: string; sub: string }> = {
  protection: { title: 'Insurance Premium Calculator', sub: 'Compare AIA · Great Eastern · Allianz · HLA premiums instantly' },
  lsa: { title: 'Large Sum Assured Calculator', sub: 'Compare AIA · Allianz · Great Eastern · HLA · Prudential wealth-ILP premiums' },
};

export default function CalculatorHub() {
  const [cat, setCat] = useState<Category>('protection');
  const h = HEADER[cat];

  return (
    <div>
      <div style={{ marginBottom: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{h.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>{h.sub}</div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {CATS.map((c) => {
          const on = cat === c.id;
          return (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              padding: '10px 18px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', minWidth: 210,
              border: `1.5px solid ${on ? 'var(--accent2)' : 'var(--border)'}`,
              background: on ? 'var(--accent2)' : 'var(--surface)',
              color: on ? '#fff' : 'var(--text)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</div>
              <div style={{ fontSize: 10, color: on ? 'rgba(255,255,255,0.85)' : 'var(--text3)', marginTop: 2 }}>{c.sub}</div>
            </button>
          );
        })}
      </div>

      {cat === 'protection' ? <PremiumCalculator /> : <LsaCalculator />}
    </div>
  );
}
