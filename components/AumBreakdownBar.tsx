'use client';

import { useState } from 'react';

/**
 * Part-to-whole breakdown of AUM — by platform group on the Investment page,
 * by platform inside a group page.
 *
 * Form: horizontal 100% stacked bar. A donut was the obvious reach here, but
 * it's an all-pairs form: any slice gets compared to any other, and the
 * categorical palette only clears the normal-vision floor for three slices
 * (a 4th puts yellow next to orange at ΔE 13.7, under the 15 floor). A stacked
 * bar is an adjacent-pairs form and stays legible to six, which is what this
 * needs as more custodians are onboarded.
 */

// Categorical slots in fixed order — never reordered or cycled, so a group
// keeps its colour when a filter changes how many are on screen. Validated
// against the white card surface: adjacent CVD ΔE 9.1, normal-vision ΔE 19.6.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const OTHER  = '#9CA3AF';   // tail fold — carries no identity, so it stays gray
const MAX_SERIES = SERIES.length;

export interface BreakdownItem { name: string; value: number }

const fmtFull = (n: number) => `RM ${Math.round(n).toLocaleString('en-MY')}`;
const fmtK = (n: number) =>
  n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
  : n >= 1000    ? `RM ${(n / 1000).toFixed(1)}K`
  : `RM ${Math.round(n).toLocaleString('en-MY')}`;

export default function AumBreakdownBar({
  items, title, emptyHint,
}: { items: BreakdownItem[]; title: string; emptyHint?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Largest first, then fold anything past the palette into "Other" rather than
  // inventing a hue that nothing can distinguish.
  const sorted = [...items].filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  const shown  = sorted.slice(0, MAX_SERIES);
  const tail   = sorted.slice(MAX_SERIES);
  const rows = tail.length
    ? [...shown, { name: 'Other', value: tail.reduce((s, i) => s + i.value, 0) }]
    : shown;

  const total = rows.reduce((s, i) => s + i.value, 0);

  if (total <= 0) {
    return (
      <div className="section" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{emptyHint ?? 'No holdings to break down yet.'}</div>
      </div>
    );
  }

  const colorFor = (i: number) => (rows[i].name === 'Other' && tail.length ? OTHER : SERIES[i % SERIES.length]);

  return (
    <div className="section" style={{ padding: '18px 20px', marginBottom: 16 }}>
      {/* Header — title carries the total, so the bar itself needs no axis */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmtK(total)}</div>
      </div>

      {/* Stacked bar — 2px surface gaps do the separating, no strokes */}
      <div
        style={{ display: 'flex', gap: 2, height: 18, marginBottom: 16, borderRadius: 4, overflow: 'hidden', background: 'var(--surface)' }}
        onMouseLeave={() => setHovered(null)}
      >
        {rows.map((r, i) => {
          const pct = (r.value / total) * 100;
          return (
            <div
              key={r.name}
              onMouseEnter={() => setHovered(r.name)}
              title={`${r.name} · ${fmtFull(r.value)} · ${pct.toFixed(1)}%`}
              style={{
                width: `${pct}%`,
                background: colorFor(i),
                opacity: hovered && hovered !== r.name ? 0.35 : 1,
                transition: 'opacity 0.15s',
                cursor: 'default',
              }}
            />
          );
        })}
      </div>

      {/* Legend — identity comes from the swatch, never from coloured text.
          Exact values live here, which is also the relief the contrast check
          requires for the lighter hues. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r, i) => {
          const pct = (r.value / total) * 100;
          const dim = hovered !== null && hovered !== r.name;
          return (
            <div
              key={r.name}
              onMouseEnter={() => setHovered(r.name)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 6px', borderRadius: 6,
                background: hovered === r.name ? 'var(--surface2)' : 'transparent',
                opacity: dim ? 0.5 : 1,
                transition: 'opacity 0.15s, background 0.15s',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorFor(i), flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                {fmtFull(r.value)}
              </span>
              <span style={{ width: 52, textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
