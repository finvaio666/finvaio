'use client';

// ── Concept A — "The Compass" ─────────────────────────────────────────────────
// Circle with a diamond needle pointing north (orange = growth direction)
// Represents: guidance, direction, trusted advisor
export function LogoAIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="ARIA Compass logo">
      {/* Outer ring */}
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
      {/* Cardinal tick marks */}
      <line x1="16" y1="3"  x2="16" y2="5.5"  stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="29" y1="16" x2="26.5" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
      <line x1="3"  y1="16" x2="5.5"  y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
      <line x1="16" y1="29" x2="16"   y2="26.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
      {/* North needle — orange, pointing up */}
      <path d="M16,16 L19,14 L16,4 L13,14 Z" fill="var(--accent2)"/>
      {/* South needle — dim */}
      <path d="M16,16 L19,18 L16,26 L13,18 Z" fill="currentColor" opacity="0.2"/>
      {/* Centre pivot */}
      <circle cx="16" cy="16" r="2" fill="currentColor"/>
    </svg>
  );
}

export function LogoAFull({ iconSize = 36 }: { iconSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoAIcon size={iconSize} />
      <div>
        <div style={{ fontWeight: 800, fontSize: iconSize * 0.58, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}>ARIA</div>
        {iconSize >= 28 && <div style={{ fontSize: iconSize * 0.21, color: 'var(--text3)', letterSpacing: '0.05em', marginTop: 2, fontWeight: 500 }}>ADVISOR INTELLIGENCE</div>}
      </div>
    </div>
  );
}

// ── Concept B — "The Hexagon Monogram" ───────────────────────────────────────
// Hexagon outline with a bold A in orange inside
// Represents: structure, precision, premium wealth management
export function LogoBIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="ARIA Hexagon logo">
      {/* Hexagon — pointy-top */}
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.85"/>
      {/* Letter A — two legs + crossbar */}
      <polyline points="9,25 16,9 23,25"
        fill="none" stroke="var(--accent2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="11.8" y1="19.5" x2="20.2" y2="19.5"
        stroke="var(--accent2)" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  );
}

export function LogoBFull({ iconSize = 32 }: { iconSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoBIcon size={iconSize} />
      <div>
        <div style={{ fontWeight: 800, fontSize: iconSize * 0.58, letterSpacing: '0.1em', color: 'var(--text)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}>ARIA</div>
        {iconSize >= 28 && <div style={{ fontSize: iconSize * 0.21, color: 'var(--text3)', letterSpacing: '0.05em', marginTop: 2, fontWeight: 500 }}>ADVISOR INTELLIGENCE</div>}
      </div>
    </div>
  );
}

// ── Concept C — "The Sparkline" ───────────────────────────────────────────────
// Ascending trend line with 4 data points + subtle area fill
// Represents: portfolio growth, data intelligence, upward trajectory
export function LogoCIcon({ size = 32 }: { size?: number }) {
  const w = size;
  const h = size;
  return (
    <svg width={w} height={h} viewBox="0 0 36 32" fill="none" aria-label="ARIA Sparkline logo">
      {/* Area under the line */}
      <path d="M4,26 L12,18 L22,12 L32,4 L32,28 L4,28 Z" fill="var(--accent2)" opacity="0.1"/>
      {/* Trend line */}
      <polyline points="4,26 12,18 22,12 32,4"
        stroke="var(--accent2)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Data point dots */}
      <circle cx="4"  cy="26" r="2.5" fill="currentColor" opacity="0.4"/>
      <circle cx="12" cy="18" r="2.5" fill="currentColor" opacity="0.55"/>
      <circle cx="22" cy="12" r="2.5" fill="currentColor" opacity="0.7"/>
      {/* Highlight — last point (orange) */}
      <circle cx="32" cy="4"  r="3.5" fill="var(--accent2)"/>
    </svg>
  );
}

export function LogoCFull({ iconSize = 36 }: { iconSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoCIcon size={iconSize} />
      <div>
        <div style={{ fontWeight: 800, fontSize: iconSize * 0.58, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}>ARIA</div>
        {iconSize >= 28 && <div style={{ fontSize: iconSize * 0.21, color: 'var(--text3)', letterSpacing: '0.05em', marginTop: 2, fontWeight: 500 }}>ADVISOR INTELLIGENCE</div>}
      </div>
    </div>
  );
}

// ── Concept D — "The Node" ────────────────────────────────────────────────────
// Three connected circles forming a triangle network
// Represents: advisor–AI–client connection, data relationships
export function LogoDIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="ARIA Node logo">
      {/* Connection lines */}
      <line x1="16" y1="7"  x2="5"  y2="25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      <line x1="16" y1="7"  x2="27" y2="25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      <line x1="5"  y1="25" x2="27" y2="25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      {/* Outer nodes */}
      <circle cx="5"  cy="25" r="3.5" fill="currentColor" opacity="0.5"/>
      <circle cx="27" cy="25" r="3.5" fill="currentColor" opacity="0.5"/>
      {/* Top node — accent, the "intelligence" hub */}
      <circle cx="16" cy="7"  r="5"   fill="var(--accent2)"/>
      <circle cx="16" cy="7"  r="2.5" fill="currentColor" opacity="0.3"/>
    </svg>
  );
}

export function LogoDFull({ iconSize = 32 }: { iconSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoDIcon size={iconSize} />
      <div>
        <div style={{ fontWeight: 800, fontSize: iconSize * 0.58, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1, fontFamily: 'var(--font-sans)' }}>ARIA</div>
        {iconSize >= 28 && <div style={{ fontSize: iconSize * 0.21, color: 'var(--text3)', letterSpacing: '0.05em', marginTop: 2, fontWeight: 500 }}>ADVISOR INTELLIGENCE</div>}
      </div>
    </div>
  );
}
