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
      <div className="section" style={{ padding: '26px 30px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>{emptyHint ?? 'No holdings to break down yet.'}</div>
      </div>
    );
  }

  const colorFor = (i: number) => (rows[i].name === 'Other' && tail.length ? OTHER : SERIES[i % SERIES.length]);

  return (
    <div className="section" style={{ padding: '24px 30px 26px' }}>
      {/* Header — the total lives here, so the bar needs no axis */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)', lineHeight: 1 }}>{fmtK(total)}</div>
      </div>

      {/* Stacked bar. Pill-shaped to sit with the app's rounded language; the
          2px surface gaps do the separating, never a stroke. Segments carry an
          inline % only when the text genuinely fits, so nothing is ever clipped
          — the legend below is what guarantees every value is readable. */}
      <div
        style={{ display: 'flex', gap: 2, height: 30, marginBottom: 22, borderRadius: 999, overflow: 'hidden', background: 'var(--surface)' }}
        onMouseLeave={() => setHovered(null)}
      >
        {rows.map((r, i) => {
          const pct = (r.value / total) * 100;
          const label = `${pct.toFixed(1)}%`;
          // ~7px per char at 12px + breathing room; only label a segment wide
          // enough to hold it comfortably.
          const fits = pct >= (label.length * 7 + 24) / 10;
          return (
            <div
              key={r.name}
              onMouseEnter={() => setHovered(r.name)}
              title={`${r.name} · ${fmtFull(r.value)} · ${label}`}
              style={{
                width: `${pct}%`,
                background: colorFor(i),
                opacity: hovered && hovered !== r.name ? 0.3 : 1,
                transition: 'opacity 0.18s',
                cursor: 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 0,
              }}
            >
              {fits && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend as mini stat tiles — a wide full-width row stranded the name at
          one edge and its value at the other. A wrapping grid keeps each name
          next to its own numbers and scales to six platforms.
          Identity comes from the swatch; text keeps its own tokens. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {rows.map((r, i) => {
          const pct = (r.value / total) * 100;
          const dim = hovered !== null && hovered !== r.name;
          return (
            <div
              key={r.name}
              onMouseEnter={() => setHovered(r.name)}
              onMouseLeave={() => setHovered(null)}
              style={{
                // Grow to fill the row but stop before a two-platform card
                // stretches each tile across half its width. The cap sits above
                // a phone's content width so tiles still fill edge-to-edge there.
                flex: '1 1 170px', maxWidth: 300,
                padding: '12px 14px',
                borderRadius: 'var(--r-sm)',
                background: 'var(--surface2)',
                boxShadow: hovered === r.name ? 'var(--shadow-sm)' : 'none',
                opacity: dim ? 0.45 : 1,
                transition: 'opacity 0.18s, transform 0.18s, box-shadow 0.18s',
                transform: hovered === r.name ? 'translateY(-2px)' : 'none',
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: colorFor(i), flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)', lineHeight: 1.1 }}>
                {pct.toFixed(1)}%
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtFull(r.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
