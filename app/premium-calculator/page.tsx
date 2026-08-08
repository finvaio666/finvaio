import { cookies } from 'next/headers';
import DashboardLayout from '@/components/DashboardLayout';
import CalculatorHub from '@/components/CalculatorHub';

// This route is public (see middleware PUBLIC_PATHS). Signed-in advisers get the full
// FINVA chrome (sidebar + topbar); anonymous visitors keep the clean branded shell.
export default async function Page() {
  const signedIn = (await cookies()).has('aria-session');

  if (signedIn) {
    return (
      <DashboardLayout>
        <CalculatorHub />
      </DashboardLayout>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 16px 64px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/finva-logo.svg" width={52} height={52} alt="FINVA" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1.1 }}>
            Premium Calculator
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text3)', marginTop: 8, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            Financial Intelligence Navigator &amp; Virtual Advisor
          </div>
        </div>

        <CalculatorHub />

        <div style={{ textAlign: 'center', marginTop: 28, fontSize: 11, color: 'var(--text3)' }}>
          FINVA · Bill Morrisons Group
        </div>
      </div>
    </div>
  );
}
