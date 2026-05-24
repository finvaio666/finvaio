'use client';

import { LogoAIcon, LogoAFull, LogoBIcon, LogoBFull } from '@/components/LogoVariants';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DarkBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0F0F0E', borderRadius: 12, padding: '24px 32px', display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

function LightBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#F5F5F0', borderRadius: 12, padding: '24px 32px', display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

export default function LogoPreviewPage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>ARIA Logo Concepts</div>
        <div style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.6 }}>
          Two concepts rendered at real sizes — sidebar, login, and PDF header contexts.<br />
          Choose whichever feels right and let Sky know.
        </div>
      </div>

      {/* ── Side-by-side overview ── */}
      <Section title="Overview — Concept A vs B">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* A */}
          <div style={{ background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)', letterSpacing: '0.08em' }}>CONCEPT A — "THE SIGNAL"</div>
            <LogoAFull iconSize={48} />
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
              Five rising bars forming an A-peak silhouette. Centre bar in orange = growth highlight. Instantly reads as <em>financial data + intelligence</em>.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Modern', 'Data-driven', 'Dynamic'].map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--accent-dim)', color: 'var(--accent2)', fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
          {/* B */}
          <div style={{ background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)', letterSpacing: '0.08em' }}>CONCEPT B — "THE MONOGRAM"</div>
            <LogoBFull iconSize={48} />
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
              Hexagon outline with a bold A struck in orange inside. Hexagon = structure, precision, data cell. Reads as <em>premium wealth management</em>.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Premium', 'Structured', 'Distinctive'].map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Sidebar size ── */}
      <Section title="Sidebar context (actual sidebar size)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <DarkBox>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#fff' }}>
              <LogoAFull iconSize={28} />
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: '0.04em' }}>Bill Morrisons Financial Consulting</div>
            </div>
          </DarkBox>
          <DarkBox>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#fff' }}>
              <LogoBFull iconSize={28} />
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: '0.04em' }}>Bill Morrisons Financial Consulting</div>
            </div>
          </DarkBox>
        </div>
      </Section>

      {/* ── Login / splash ── */}
      <Section title="Login screen (large centred)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <DarkBox>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', color: '#fff' }}>
              <LogoAIcon size={72} />
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em' }}>ARIA</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Advisor Resource &amp; Intelligence Assistant</div>
            </div>
          </DarkBox>
          <DarkBox>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', color: '#fff' }}>
              <LogoBIcon size={72} />
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '0.12em' }}>ARIA</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Advisor Resource &amp; Intelligence Assistant</div>
            </div>
          </DarkBox>
        </div>
      </Section>

      {/* ── Icon only (favicon / avatar) ── */}
      <Section title="Icon only — favicon &amp; small use (16 / 24 / 32 / 48px)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <DarkBox>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', color: '#fff' }}>
              {[16, 24, 32, 48].map(s => <LogoAIcon key={s} size={s} />)}
            </div>
          </DarkBox>
          <DarkBox>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', color: '#fff' }}>
              {[16, 24, 32, 48].map(s => <LogoBIcon key={s} size={s} />)}
            </div>
          </DarkBox>
        </div>
      </Section>

      {/* ── Light background (PDF / print) ── */}
      <Section title="Light background — PDF headers &amp; print">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <LightBox>
            <div style={{ color: '#111' }}>
              <LogoAFull iconSize={40} />
            </div>
          </LightBox>
          <LightBox>
            <div style={{ color: '#111' }}>
              <LogoBFull iconSize={40} />
            </div>
          </LightBox>
        </div>
      </Section>

      {/* Footer note */}
      <div style={{ padding: '20px 24px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text3)', lineHeight: 1.7 }}>
        💡 <strong style={{ color: 'var(--text)' }}>How to choose:</strong> Which logo still looks clear at the 16px icon size above?
        That&apos;s your most important test — it&apos;s the favicon and sidebar icon size.
        Once you decide, reply with <strong>A</strong> or <strong>B</strong> and I&apos;ll apply it across the whole app.
      </div>
    </div>
  );
}
