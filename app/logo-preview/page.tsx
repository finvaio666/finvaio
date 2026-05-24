'use client';

import {
  LogoD1Icon, LogoD1Full,
  LogoD2Icon, LogoD2Full,
  LogoD3Icon, LogoD3Full,
  LogoD4Icon, LogoD4Full,
} from '@/components/LogoVariants';

const NODES = [
  {
    id: 'D1',
    name: 'Triangle',
    tagline: 'AI hub · Advisor · Client',
    description: 'The original — orange intelligence hub at top, two nodes below forming a stable triangle. Clear hierarchy: ARIA at the centre of every relationship.',
    tags: ['Balanced', 'Clear hierarchy', 'Stable'],
    tagColor: '#F97316',
    tagBg: 'rgba(249,115,22,0.12)',
    Icon: LogoD1Icon,
    Full: LogoD1Full,
  },
  {
    id: 'D2',
    name: 'Orbital',
    tagline: 'Core intelligence · Orbiting data',
    description: 'Central orange core with a dashed orbit ring and a satellite node. Suggests AI at the centre of everything — data, clients, and insights revolving around it.',
    tags: ['Dynamic', 'AI-focused', 'Unique'],
    tagColor: '#6366F1',
    tagBg: 'rgba(99,102,241,0.12)',
    Icon: LogoD2Icon,
    Full: LogoD2Full,
  },
  {
    id: 'D3',
    name: 'Diamond',
    tagline: 'Four directions · Full coverage',
    description: 'Four nodes in a diamond shape, orange at the top. The diamond reads as both premium value and 360° intelligence. Most structured and formal of the four.',
    tags: ['Premium', 'Formal', 'Structured'],
    tagColor: '#0EA5E9',
    tagBg: 'rgba(14,165,233,0.12)',
    Icon: LogoD3Icon,
    Full: LogoD3Full,
  },
  {
    id: 'D4',
    name: 'Hub & Spokes',
    tagline: 'One hub · Many relationships',
    description: 'Central orange hub with four spokes radiating to peripheral nodes at 45°. Represents the advisor as the intelligence centre connecting multiple clients — scales visually with your practice.',
    tags: ['Scalable', 'Network', 'Expansive'],
    tagColor: '#10B981',
    tagBg: 'rgba(16,185,129,0.12)',
    Icon: LogoD4Icon,
    Full: LogoD4Full,
  },
];

function DarkBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#0F0F0E', borderRadius: 10, padding: '18px 22px', ...style }}>
      {children}
    </div>
  );
}

function LightBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#F4F4EF', borderRadius: 10, padding: '18px 22px' }}>
      {children}
    </div>
  );
}

export default function LogoPreviewPage() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--accent2)', fontWeight: 600, marginBottom: 6 }}>← Node concept variations</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>ARIA Logo — Node Family (D1 · D2 · D3 · D4)</div>
        <div style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.7 }}>
          All four share the same DNA — connected nodes representing advisor, AI, and client.<br />
          Reply <strong style={{ color: 'var(--text)' }}>D1, D2, D3,</strong> or <strong style={{ color: 'var(--text)' }}>D4</strong> to apply the chosen one across the whole app.
        </div>
      </div>

      {/* ── Overview cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, margin: '32px 0 40px' }}>
        {NODES.map(n => (
          <div key={n.id} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: n.tagColor }}>
              {n.id} — {n.name.toUpperCase()}
            </div>
            <DarkBox style={{ display: 'flex', justifyContent: 'center', padding: '28px 22px' }}>
              <div style={{ color: '#fff' }}>
                <n.Full iconSize={46} />
              </div>
            </DarkBox>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>{n.description}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {n.tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: n.tagBg, color: n.tagColor, fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sidebar size ── */}
      <SectionLabel>Sidebar context (actual app size)</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
        {NODES.map(n => (
          <DarkBox key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ color: '#fff' }}><n.Full iconSize={26} /></div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 4, letterSpacing: '0.04em' }}>Bill Morrisons FC</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: n.tagColor, marginTop: 4 }}>{n.id} — {n.name}</div>
          </DarkBox>
        ))}
      </div>

      {/* ── Login splash ── */}
      <SectionLabel>Login screen (large centred)</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
        {NODES.map(n => (
          <DarkBox key={n.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#fff' }}>
            <n.Icon size={60} />
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>ARIA</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Advisor Intelligence</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: n.tagColor }}>{n.id}</div>
          </DarkBox>
        ))}
      </div>

      {/* ── Scale test ── */}
      <SectionLabel>Scale test — 16 / 24 / 32 / 48 px (favicon → app icon)</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
        {NODES.map(n => (
          <DarkBox key={n.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', color: '#fff' }}>
            {[16, 24, 32, 48].map(s => <n.Icon key={s} size={s} />)}
            <div style={{ width: '100%', fontSize: 10, fontWeight: 700, color: n.tagColor, marginTop: 2 }}>{n.id} — {n.name}</div>
          </DarkBox>
        ))}
      </div>

      {/* ── Light / PDF ── */}
      <SectionLabel>Light background — PDF reports &amp; print</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 48 }}>
        {NODES.map(n => (
          <LightBox key={n.id}>
            <div style={{ color: '#111', marginBottom: 8 }}><n.Full iconSize={34} /></div>
            <div style={{ fontSize: 10, fontWeight: 700, color: n.tagColor }}>{n.id} — {n.name}</div>
          </LightBox>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '20px 24px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text3)', lineHeight: 1.8 }}>
        💡 <strong style={{ color: 'var(--text)' }}>Key test:</strong> Check the 16px column — that&apos;s your favicon size.
        The icon needs to still feel like &quot;nodes connected&quot; even at that size, not just a blur of dots.<br />
        Once you pick <strong style={{ color: 'var(--text)' }}>D1, D2, D3,</strong> or <strong style={{ color: 'var(--text)' }}>D4</strong> — I&apos;ll apply it to the sidebar, login page, PDF exports, and favicon.
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  );
}
