'use client';

// ── Logo A — "The Signal" ─────────────────────────────────────────────────────
// 5 symmetric bars forming an A-peak silhouette; centre bar in brand orange
export function LogoAIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 30 / 36)} viewBox="0 0 36 30" fill="none" aria-label="ARIA logo A">
      {/* Bar 1 — short left */}
      <rect x="1.5"  y="18" width="5" height="12" rx="1.5" fill="currentColor" opacity="0.45"/>
      {/* Bar 2 — medium left */}
      <rect x="8.5"  y="12" width="5" height="18" rx="1.5" fill="currentColor" opacity="0.7"/>
      {/* Bar 3 — tallest centre (accent) */}
      <rect x="15.5" y="2"  width="5" height="28" rx="1.5" fill="var(--accent2)"/>
      {/* Bar 4 — medium right */}
      <rect x="22.5" y="12" width="5" height="18" rx="1.5" fill="currentColor" opacity="0.7"/>
      {/* Bar 5 — short right */}
      <rect x="29.5" y="18" width="5" height="12" rx="1.5" fill="currentColor" opacity="0.45"/>
    </svg>
  );
}

export function LogoAFull({ iconSize = 36 }: { iconSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoAIcon size={iconSize} />
      <div>
        <div style={{
          fontWeight: 800, fontSize: iconSize * 0.6,
          letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1,
          fontFamily: 'var(--font-sans)',
        }}>ARIA</div>
        {iconSize >= 32 && (
          <div style={{ fontSize: iconSize * 0.22, color: 'var(--text3)', letterSpacing: '0.04em', marginTop: 2, fontWeight: 500 }}>
            ADVISOR INTELLIGENCE
          </div>
        )}
      </div>
    </div>
  );
}

// ── Logo B — "The Hexagon Monogram" ───────────────────────────────────────────
// Hexagon outline (navy) with a bold A in brand orange inside
export function LogoBIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="ARIA logo B">
      {/* Hexagon — pointy-top */}
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Letter A inside — two legs + crossbar */}
      <polyline
        points="9,25 16,9 23,25"
        fill="none"
        stroke="var(--accent2)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="11.8" y1="19.5"
        x2="20.2" y2="19.5"
        stroke="var(--accent2)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoBFull({ iconSize = 32 }: { iconSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoBIcon size={iconSize} />
      <div>
        <div style={{
          fontWeight: 800, fontSize: iconSize * 0.6,
          letterSpacing: '0.12em', color: 'var(--text)', lineHeight: 1,
          fontFamily: 'var(--font-sans)',
        }}>ARIA</div>
        {iconSize >= 32 && (
          <div style={{ fontSize: iconSize * 0.22, color: 'var(--text3)', letterSpacing: '0.04em', marginTop: 2, fontWeight: 500 }}>
            ADVISOR INTELLIGENCE
          </div>
        )}
      </div>
    </div>
  );
}
