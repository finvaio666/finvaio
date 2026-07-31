'use client';

// Shared FINVA-styled building blocks for the Premium Calculator pages.
// Mirrors the app's design system: .section cards, uppercase section titles with a
// colour dot, pill toggles, Signal Orange accent and DM Mono for figures.

import type { CSSProperties, ReactNode } from 'react';

export const lbl: CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 4,
};

export const inp: CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg)',
  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
};

export const money: CSSProperties = { fontFamily: 'var(--font-mono)' };

/** RM with thousands separators, no decimals. */
export const fmtRM = (n: number) => 'RM ' + Math.round(n).toLocaleString();

/** Compact RM for large lifetime figures (RM 1.45M / RM 767K). */
export const fmtRMShort = (n: number) =>
  n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000 ? `RM ${Math.round(n / 1_000)}K`
      : `RM ${Math.round(n).toLocaleString()}`;

/** Standard FINVA card with an uppercase header, colour dot and optional action slot. */
export function Section({ title, dot = 'var(--accent2)', action, children, bodyPad = 20, style }: {
  title: string;
  dot?: string;
  action?: ReactNode;
  children: ReactNode;
  bodyPad?: number;
  style?: CSSProperties;
}) {
  return (
    <div className="section" style={style}>
      <div className="section-header">
        <div className="section-title">
          <span className="section-dot" style={{ background: dot }} />
          {title}
        </div>
        {action}
      </div>
      <div style={{ padding: bodyPad }}>{children}</div>
    </div>
  );
}

export function Grid({ min = 200, gap = 14, children }: { min?: number; gap?: number; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap }}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children, span }: {
  label: string; hint?: string; children: ReactNode; span?: boolean;
}) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
      <label style={lbl}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

/** Pill segmented control — the app's active-state look (accent fill, white text). */
export function Segmented<T extends string | boolean>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 'var(--r-pill)', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
              border: `1px solid ${on ? '#F37338' : 'var(--border)'}`,
              background: on ? '#F37338' : 'var(--surface)',
              color: on ? '#fff' : 'var(--text3)',
              transition: 'all 0.15s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Primary (orange) / secondary (outline) action button. */
export function Btn({ children, onClick, variant = 'primary', disabled, style }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: primary ? '10px 22px' : '8px 16px',
        fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
        borderRadius: 'var(--r-pill)', cursor: disabled ? 'not-allowed' : 'pointer',
        border: primary ? 'none' : '1px solid rgba(207,69,0,0.3)',
        background: disabled ? 'var(--border)' : primary ? '#F37338' : 'transparent',
        color: disabled ? 'var(--text3)' : primary ? '#fff' : 'var(--accent2)',
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Small status pill (LOWEST / STEPPED / VERIFIED …). */
export function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
      borderRadius: 'var(--r-pill)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.04em', background: `${color}1A`, color,
      border: `1px solid ${color}33`, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

/** Amber advisory strip used for exclusions and model caveats. */
export function Notice({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'blue' }) {
  const c = tone === 'gold' ? { bg: 'var(--gold-dim)', bd: 'rgba(247,158,27,0.35)', fg: '#92400E', icon: '⚠️' }
    : { bg: 'var(--blue-dim)', bd: 'rgba(56,96,190,0.3)', fg: 'var(--blue)', icon: 'ℹ️' };
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px',
      borderRadius: 16, background: c.bg, border: `1px solid ${c.bd}`, marginBottom: 14,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1.3 }}>{c.icon}</span>
      <div style={{ fontSize: 12, color: c.fg, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

/** Fine-print disclaimer block. */
export function FinePrint({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.6, marginTop: 14,
      paddingTop: 12, borderTop: '1px solid var(--border)',
    }}>
      {children}
    </div>
  );
}
