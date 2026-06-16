import PremiumCalculator from '@/components/PremiumCalculator';

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>Insurance Premium Calculator</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Compare AIA · Great Eastern · Allianz · HLA premiums instantly</div>
        </div>
        <PremiumCalculator />
      </div>
    </div>
  );
}
