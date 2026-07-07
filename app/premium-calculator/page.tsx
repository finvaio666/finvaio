import CalculatorHub from '@/components/CalculatorHub';

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <CalculatorHub />
      </div>
    </div>
  );
}
