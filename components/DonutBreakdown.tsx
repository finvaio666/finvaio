'use client';

import { useState } from 'react';

/**
 * Part-to-whole donut — used for AUM by platform group, by platform, and by
 * asset class.
 *
 * A donut is a stacked bar bent into a ring: its segments are sequentially
 * adjacent, so the categorical palette is judged on the adjacent pairlist and
 * holds to eight slices (worst adjacent CVD ΔE 9.1, normal-vision 19.6 against
 * the white card). Past that the tail folds into "Other" rather than inventing
 * a hue nothing can distinguish.
 */

// Categorical slots in fixed order — never reordered or cycled, so a category
// keeps its colour when a filter changes how many are on screen.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];
const OTHER  = '#9CA3AF';   // tail fold — carries no identity, so it stays gray
const MAX_SERIES = SERIES.length;

export interface BreakdownItem { name: string; value: number }

const fmtFull = (n: number) => `RM ${Math.round(n).toLocaleString('en-MY')}`;
const fmtK = (n: number) =>
  n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
  : n >= 1000    ? `RM ${(n / 1000).toFixed(1)}K`
  : `RM ${Math.round(n).toLocaleString('en-MY')}`;

// Ring geometry. A 2px-equivalent gap in the surface colour separates segments,
// the same spacer a stacked bar uses — never a stroke around each arc.
const R = 42, STROKE = 17, C = 2 * Math.PI * R, GAP = 1.6;

export default function DonutBreakdown({
  items, title, emptyHint,
}: { items: BreakdownItem[]; title: string; emptyHint?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const sorted = [...items].filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  const shown  = sorted.slice(0, MAX_SERIES);
  const tail   = sorted.slice(MAX_SERIES);
  const rows = tail.length
    ? [...shown, { name: 'Other', value: tail.reduce((s, i) => s + i.value, 0) }]
    : shown;

  const total = rows.reduce((s, i) => s + i.value, 0);

  if (total <= 0) {
    return (
      <div className="section" style={{ padding: '24px 28px', flex: '1 1 340px', minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>{emptyHint ?? 'No holdings to break down yet.'}</div>
      </div>
    );
  }

  const colorFor = (i: number) => (rows[i].name === 'Other' && tail.length ? OTHER : SERIES[i % SERIES.length]);

  // Walk the ring, tracking the offset each arc starts at.
  let cursor = 0;
  const arcs = rows.map((r, i) => {
    const frac = r.value / total;
    const len  = frac * C;
    // Don't let the gap eat a sliver segment entirely.
    const dash = Math.max(len - GAP, 0.6);
    const arc  = { name: r.name, dash, offset: -cursor, color: colorFor(i) };
    cursor += len;
    return arc;
  });

  const focused = hovered ? rows.find(r => r.name === hovered) : null;
  const centreValue = focused ? fmtK(focused.value) : fmtK(total);
  const centreLabel = focused
    ? `${((focused.value / total) * 100).toFixed(1)}% · ${focused.name}`
    : 'Total';

  return (
    <div className="section" style={{ padding: '24px 28px', flex: '1 1 340px', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 18 }}>
        {title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        {/* Ring */}
        <div style={{ position: 'relative', width: 168, height: 168, flexShrink: 0 }}>
          <svg viewBox="0 0 100 100" width="168" height="168" style={{ transform: 'rotate(-90deg)' }} role="img" aria-label={title}>
            {arcs.map(a => (
              <circle
                key={a.name}
                cx="50" cy="50" r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={hovered === a.name ? STROKE + 3 : STROKE}
                strokeDasharray={`${a.dash} ${C - a.dash}`}
                strokeDashoffset={a.offset}
                opacity={hovered && hovered !== a.name ? 0.3 : 1}
                style={{ transition: 'opacity 0.18s, stroke-width 0.18s', cursor: 'default' }}
                onMouseEnter={() => setHovered(a.name)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </svg>
          {/* Centre readout — doubles as the hover tooltip */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: '0 18px',
          }}>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)', lineHeight: 1.1 }}>
              {centreValue}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginTop: 3, textAlign: 'center', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {centreLabel}
            </div>
          </div>
        </div>

        {/* Legend — identity comes from the swatch, never from coloured text.
            Exact values here are also the relief the contrast check requires
            for the lighter hues. */}
        <div style={{ flex: '1 1 190px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.map((r, i) => {
            const pct = (r.value / total) * 100;
            const dim = hovered !== null && hovered !== r.name;
            return (
              <div
                key={r.name}
                onMouseEnter={() => setHovered(r.name)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', borderRadius: 8,
                  background: hovered === r.name ? 'var(--surface2)' : 'transparent',
                  opacity: dim ? 0.45 : 1,
                  transition: 'opacity 0.18s, background 0.18s',
                  minWidth: 0,
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 999, background: colorFor(i), flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                  {fmtFull(r.value)}
                </span>
                <span style={{ width: 46, textAlign: 'right', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
