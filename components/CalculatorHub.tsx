'use client';

import { useState } from 'react';
import PremiumCalculator from '@/components/PremiumCalculator';
import LsaCalculator from '@/components/LsaCalculator';

type Category = 'protection' | 'lsa';

const CATS: { id: Category; label: string; sub: string; icon: string; insurers: string; tone: string }[] = [
  {
    id: 'protection',
    label: 'Protection & Medical',
    sub: 'Life · Critical Illness · Medical card',
    icon: '🛡️',
    insurers: 'AIA · Great Eastern · Allianz · HLA',
    tone: 'var(--accent2)',
  },
  {
    id: 'lsa',
    label: 'Large Sum Assured',
    sub: 'Wealth / legacy · RM1m+ death benefit',
    icon: '🏛️',
    insurers: 'AIA · Allianz · Great Eastern · HLA · Prudential',
    tone: 'var(--blue)',
  },
];

export default function CalculatorHub() {
  const [cat, setCat] = useState<Category>('protection');

  return (
    <div>
      {/* Category selector — FINVA template-card look */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 20 }}>
        {CATS.map((c) => {
          const on = cat === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '16px 18px',
                borderRadius: 'var(--r)', fontFamily: 'var(--font-sans)',
                background: on ? 'var(--surface)' : 'var(--bg2)',
                border: `1.5px solid ${on ? c.tone : 'var(--border)'}`,
                boxShadow: on ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 'var(--r-sm)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
                  background: on ? 'var(--accent-dim)' : 'var(--surface2)',
                }}>{c.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                    color: on ? 'var(--text)' : 'var(--text2)',
                  }}>{c.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{c.sub}</div>
                </div>
                {on && (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: c.tone, flexShrink: 0,
                  }} />
                )}
              </div>
              <div style={{
                fontSize: 10.5, color: 'var(--text3)', marginTop: 10, paddingTop: 10,
                borderTop: '1px solid var(--border)', letterSpacing: '0.02em',
              }}>
                {c.insurers}
              </div>
            </button>
          );
        })}
      </div>

      {cat === 'protection' ? <PremiumCalculator /> : <LsaCalculator />}
    </div>
  );
}
