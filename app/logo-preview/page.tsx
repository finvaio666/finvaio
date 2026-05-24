'use client';

import {
  LogoAIcon, LogoAFull,
  LogoBIcon, LogoBFull,
  LogoCIcon, LogoCFull,
  LogoDIcon, LogoDFull,
} from '@/components/LogoVariants';

const CONCEPTS = [
  {
    id: 'A',
    name: 'The Compass',
    tagline: 'Guidance · Direction · Trust',
    description: 'A compass needle pointing north inside a clean ring. The orange needle signals growth direction — feels like a trusted advisor who always points you the right way.',
    tags: ['Professional', 'Timeless', 'Trustworthy'],
    tagColor: 'var(--blue)',
    tagBg: 'var(--blue-dim)',
    Icon: LogoAIcon,
    Full: LogoAFull,
  },
  {
    id: 'B',
    name: 'The Hexagon',
    tagline: 'Structure · Precision · Premium',
    description: 'A hexagon outline (structure, data cell) with a bold A in orange inside. Reads instantly as a monogram. Very distinctive — feels like a private bank or HNW wealth manager.',
    tags: ['Premium', 'Distinctive', 'Structured'],
    tagColor: '#5B21B6',
    tagBg: '#EDE9FE',
    Icon: LogoBIcon,
    Full: LogoBFull,
  },
  {
    id: 'C',
    name: 'The Sparkline',
    tagline: 'Growth · Intelligence · Forward',
    description: 'An ascending trend line with a glowing data point at the peak. Immediately reads as "portfolio growth" and "financial intelligence". Clean, modern, fintech-native.',
    tags: ['Modern', 'Growth-focused', 'Data-native'],
    tagColor: 'var(--green)',
    tagBg: 'var(--green-dim)',
    Icon: LogoCIcon,
    Full: LogoCFull,
  },
  {
    id: 'D',
    name: 'The Node',
    tagline: 'Connection · Network · Intelligence',
    description: 'Three nodes connected in a triangle — the orange top node represents AI intelligence at the centre, linked to the advisor and client below. Reflects exactly what ARIA does.',
    tags: ['Tech-forward', 'Connected', 'Meaningful'],
    tagColor: 'var(--gold)',
    tagBg: 'var(--gold-dim)',
    Icon: LogoDIcon,
    Full: LogoDFull,
  },
];

function DarkBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#0F0F0E', borderRadius: 10, padding: '20px 24px', ...style }}>
      {children}
    </div>
  );
}

function LightBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#F4F4EF', borderRadius: 10, padding: '20px 24px' }}>
      {children}
    </div>
  );
}

export default function LogoPreviewPage() {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '40px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>ARIA Logo — 4 Concepts</div>
        <div style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.7 }}>
          Each concept shown at sidebar size, login size, icon scale test (16 → 48 px), and light background.<br/>
          Reply <strong style={{ color: 'var(--text)' }}>A, B, C,</strong> or <strong style={{ color: 'var(--text)' }}>D</strong> to apply across the whole app.
        </div>
      </div>

      {/* ── 4-up overview cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 48 }}>
        {CONCEPTS.map(c => (
          <div key={c.id} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: c.tagColor }}>
              {c.id} — {c.name.toUpperCase()}
            </div>
            <DarkBox style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ color: '#fff' }}>
                <c.Full iconSize={44} />
              </div>
            </DarkBox>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.65 }}>{c.description}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {c.tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: c.tagBg, color: c.tagColor, fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sidebar context ── */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
          Sidebar context (actual app size)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          {CONCEPTS.map(c => (
            <DarkBox key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: '#fff' }}><c.Full iconSize={26} /></div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 4, letterSpacing: '0.04em' }}>Bill Morrisons FC</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: c.tagColor, marginTop: 4 }}>{c.id}</div>
            </DarkBox>
          ))}
        </div>
      </div>

      {/* ── Login splash ── */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
          Login screen (large, centred)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          {CONCEPTS.map(c => (
            <DarkBox key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#fff' }}>
              <c.Icon size={56} />
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>ARIA</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Advisor Intelligence</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: c.tagColor, marginTop: 4 }}>{c.id}</div>
            </DarkBox>
          ))}
        </div>
      </div>

      {/* ── Icon scale test ── */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
          Icon scale test — 16 / 24 / 32 / 48 px (favicon → app icon)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          {CONCEPTS.map(c => (
            <DarkBox key={c.id} style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', color: '#fff' }}>
              {[16, 24, 32, 48].map(s => <c.Icon key={s} size={s} />)}
              <div style={{ width: '100%', fontSize: 10, fontWeight: 700, color: c.tagColor, marginTop: 4 }}>{c.id} — {c.name}</div>
            </DarkBox>
          ))}
        </div>
      </div>

      {/* ── Light / PDF ── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
          Light background — PDF reports &amp; print
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          {CONCEPTS.map(c => (
            <LightBox key={c.id}>
              <div style={{ color: '#111', marginBottom: 8 }}><c.Full iconSize={34} /></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: c.tagColor }}>{c.id} — {c.name}</div>
            </LightBox>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '20px 24px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text3)', lineHeight: 1.8 }}>
        💡 <strong style={{ color: 'var(--text)' }}>Tip — the scale test is the deciding factor.</strong> A logo that looks sharp at 16px (favicon) and clear at 24px (sidebar icon) will work everywhere. If it&apos;s muddy at small size, it&apos;ll frustrate you every time you open the app.<br/>
        Once you pick <strong style={{ color: 'var(--text)' }}>A, B, C,</strong> or <strong style={{ color: 'var(--text)' }}>D</strong> — I&apos;ll apply it to the sidebar, login page, PDF exports, and favicon.
      </div>
    </div>
  );
}
