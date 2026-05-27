'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────────────────────
interface TokenInfo {
  valid: boolean;
  clientName?: string;
  month?: string;
  advisorName?: string;
  error?: string;
}

interface FormValues {
  salary:            string;
  business:          string;
  rental:            string;
  investment:        string;
  otherIncome:       string;
  housing:           string;
  carLoan:           string;
  insurancePremium:  string;
  education:         string;
  otherFixed:        string;
  food:              string;
  transport:         string;
  lifestyle:         string;
  healthcare:        string;
  otherVariable:     string;
  epfEmployee:       string;
  epfEmployer:       string;
  otherSavings:      string;
  notes:             string;
}

const EMPTY: FormValues = {
  salary:'', business:'', rental:'', investment:'', otherIncome:'',
  housing:'', carLoan:'', insurancePremium:'', education:'', otherFixed:'',
  food:'', transport:'', lifestyle:'', healthcare:'', otherVariable:'',
  epfEmployee:'', epfEmployer:'', otherSavings:'', notes:'',
};

const n = (v: string) => parseFloat(v) || 0;
const fmt = (v: number) => v > 0 ? `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';

// ── Input component ──────────────────────────────────────────────────────────
function AmtInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
        {label}
        {hint && <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>{hint}</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 700, color: '#6B7280' }}>RM</span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', padding: '11px 14px 11px 36px',
            border: '1.5px solid #E5E7EB', borderRadius: 10,
            fontSize: 15, fontFamily: 'monospace', fontWeight: 600, color: '#111827',
            background: '#FAFAFA', outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.background = '#fff'; }}
          onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.background = '#FAFAFA'; }}
        />
      </div>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ emoji, title, subtitle, total, color }: { emoji: string; title: string; subtitle: string; total: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${color}22` }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{emoji}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{subtitle}</div>
      </div>
      {total > 0 && (
        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color, background: `${color}18`, padding: '4px 10px', borderRadius: 8 }}>
          RM {total.toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CashflowFormPage() {
  const params = useParams();
  const token  = params?.token as string;

  const [info,     setInfo]     = useState<TokenInfo | null>(null);
  const [form,     setForm]     = useState<FormValues>(EMPTY);
  const [step,     setStep]     = useState<'loading' | 'form' | 'submitting' | 'done' | 'error'>('loading');
  const [errMsg,   setErrMsg]   = useState('');
  const [submitted, setSubmitted] = useState<{ income: number; expenses: number; surplus: number } | null>(null);

  // Verify token on mount
  useEffect(() => {
    if (!token) { setStep('error'); setErrMsg('No token in URL.'); return; }
    // Token is verified server-side on submit — here we just decode client-side for display
    try {
      const parts = token.split('.');
      if (parts.length < 2) throw new Error('Invalid format');
      const payload = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload.clientName || !payload.advisorId || !payload.exp) throw new Error('Missing fields');
      if (Date.now() > payload.exp) {
        setInfo({ valid: false, error: 'This link has expired. Please ask your financial advisor for a new link.' });
        setStep('error');
        return;
      }
      const monthDate = new Date(payload.month + 'T00:00:00');
      setInfo({
        valid:       true,
        clientName:  payload.clientName,
        month:       payload.month,
        advisorName: '', // will be shown as generic
      });
      // Pre-fill EPF estimate if salary entered later
      setStep('form');
    } catch {
      setInfo({ valid: false, error: 'This link is invalid or has been tampered with.' });
      setStep('error');
    }
  }, [token]);

  const set = (key: keyof FormValues) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  // ── Live calculations ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const income   = n(form.salary) + n(form.business) + n(form.rental) + n(form.investment) + n(form.otherIncome);
    const fixed    = n(form.housing) + n(form.carLoan) + n(form.insurancePremium) + n(form.education) + n(form.otherFixed);
    const variable = n(form.food) + n(form.transport) + n(form.lifestyle) + n(form.healthcare) + n(form.otherVariable);
    const epf      = n(form.epfEmployee) + n(form.epfEmployer) + n(form.otherSavings);
    const surplus  = income - fixed - variable - epf;
    const savingsRate = income > 0 ? Math.round(((surplus + epf) / income) * 100) : 0;
    return { income, fixed, variable, epf, surplus, savingsRate };
  }, [form]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (totals.income === 0) {
      alert('Please enter at least your monthly income before submitting.');
      return;
    }
    setStep('submitting');
    try {
      const res = await fetch('/api/cashflow/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          ...Object.fromEntries(
            Object.entries(form).map(([k, v]) => [k, parseFloat(v) || 0])
          ),
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submission failed');
      setSubmitted({
        income:   data.summary?.income   ?? totals.income,
        expenses: data.summary?.expenses ?? totals.fixed + totals.variable,
        surplus:  data.summary?.surplus  ?? totals.surplus,
      });
      setStep('done');
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStep('error');
    }
  };

  const monthLabel = info?.month
    ? new Date(info.month + 'T00:00:00').toLocaleString('en-MY', { month: 'long', year: 'numeric' })
    : '';

  // ── Render states ────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
        <div style={{ textAlign: 'center', color: '#6B7280' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>Loading your form…</div>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FEF2F2', padding: 24 }}>
        <div style={{ maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Link Problem</h2>
          <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>{info?.error ?? errMsg ?? 'This link is no longer valid.'}</p>
          <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 16 }}>Please contact your financial advisor for assistance.</p>
        </div>
      </div>
    );
  }

  if (step === 'done' && submitted) {
    const surplus = submitted.surplus;
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 20, padding: 36, boxShadow: '0 8px 40px rgba(0,0,0,0.12)', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Submitted!</h2>
          <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, marginBottom: 24 }}>
            Thank you, <strong>{info?.clientName}</strong>. Your cash flow for <strong>{monthLabel}</strong> has been received by your financial advisor.
          </p>

          {/* Summary */}
          <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '16px 20px', textAlign: 'left', marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginBottom: 12, letterSpacing: '0.06em' }}>YOUR SUMMARY</div>
            {[
              { label: 'Monthly Income', val: submitted.income, color: '#10B981' },
              { label: 'Total Expenses', val: submitted.expenses, color: '#EF4444' },
              { label: surplus >= 0 ? 'Monthly Surplus' : 'Monthly Deficit', val: Math.abs(surplus), color: surplus >= 0 ? '#6366F1' : '#F59E0B' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#374151' }}>{row.label}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: row.color }}>
                  RM {row.val.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 }}>
            Your advisor will review your cash flow and may follow up with you during your next review session.
          </p>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', padding: '24px 20px 20px', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', opacity: 0.75, marginBottom: 4, textTransform: 'uppercase' }}>
          Bill Morrisons Financial Consulting
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, marginBottom: 4 }}>Monthly Cash Flow</h1>
        <div style={{ fontSize: 14, opacity: 0.85 }}>
          {info?.clientName ? `Hi ${info.clientName}` : 'Hi there'} 👋 · <strong>{monthLabel}</strong>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 80px' }}>

        {/* Live summary bar */}
        {(totals.income > 0 || totals.fixed > 0 || totals.variable > 0) && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 20,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em', marginBottom: 10 }}>LIVE SUMMARY</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Income', val: totals.income, color: '#10B981' },
                { label: 'Expenses', val: totals.fixed + totals.variable, color: '#EF4444' },
                { label: totals.surplus >= 0 ? 'Surplus' : 'Deficit', val: Math.abs(totals.surplus), color: totals.surplus >= 0 ? '#6366F1' : '#F59E0B' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: s.color }}>
                    {fmt(s.val)}
                  </div>
                </div>
              ))}
            </div>
            {totals.income > 0 && (
              <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: '#F3F4F6', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 999, transition: 'width 0.3s ease',
                  background: totals.surplus >= 0 ? '#6366F1' : '#F59E0B',
                  width: `${Math.min(Math.max((totals.surplus / totals.income) * 100, 0), 100)}%`,
                }} />
              </div>
            )}
            {totals.income > 0 && (
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, textAlign: 'center' }}>
                Savings rate: <strong style={{ color: totals.savingsRate >= 30 ? '#10B981' : '#F59E0B' }}>{totals.savingsRate}%</strong>
                {totals.savingsRate >= 30 ? ' ✅' : ' ⚠️ target: 30%+'}
              </div>
            )}
          </div>
        )}

        {/* ── Section 1: Income ── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 8px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <SectionHeader emoji="💼" title="Monthly Income" subtitle="Enter your regular income sources" total={totals.income} color="#10B981" />
          <AmtInput label="Salary / Employment" value={form.salary} onChange={set('salary')} hint="gross monthly" />
          <AmtInput label="Business Income" value={form.business} onChange={set('business')} hint="if self-employed" />
          <AmtInput label="Rental Income" value={form.rental} onChange={set('rental')} />
          <AmtInput label="Investment Returns" value={form.investment} onChange={set('investment')} hint="dividends, interest" />
          <AmtInput label="Other Income" value={form.otherIncome} onChange={set('otherIncome')} hint="freelance, etc." />
        </div>

        {/* ── Section 2: Fixed Expenses ── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 8px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <SectionHeader emoji="🏠" title="Fixed Expenses" subtitle="Regular monthly commitments" total={totals.fixed} color="#EF4444" />
          <AmtInput label="Housing (Mortgage / Rent)" value={form.housing} onChange={set('housing')} />
          <AmtInput label="Car Loan" value={form.carLoan} onChange={set('carLoan')} hint="monthly instalment" />
          <AmtInput label="Insurance Premiums" value={form.insurancePremium} onChange={set('insurancePremium')} hint="life, medical, etc." />
          <AmtInput label="Education" value={form.education} onChange={set('education')} hint="school fees, tuition" />
          <AmtInput label="Other Fixed Commitments" value={form.otherFixed} onChange={set('otherFixed')} hint="personal loan, etc." />
        </div>

        {/* ── Section 3: Variable Expenses ── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 8px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <SectionHeader emoji="🛒" title="Variable Expenses" subtitle="Day-to-day spending" total={totals.variable} color="#F59E0B" />
          <AmtInput label="Food & Groceries" value={form.food} onChange={set('food')} />
          <AmtInput label="Transport" value={form.transport} onChange={set('transport')} hint="petrol, toll, Grab" />
          <AmtInput label="Lifestyle & Entertainment" value={form.lifestyle} onChange={set('lifestyle')} hint="dining out, subscriptions" />
          <AmtInput label="Healthcare" value={form.healthcare} onChange={set('healthcare')} hint="clinic, pharmacy" />
          <AmtInput label="Other Variable" value={form.otherVariable} onChange={set('otherVariable')} />
        </div>

        {/* ── Section 4: EPF & Savings ── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 8px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <SectionHeader emoji="🏦" title="EPF & Savings" subtitle="Mandatory deductions & savings" total={totals.epf} color="#6366F1" />
          <AmtInput label="EPF (Employee Contribution)" value={form.epfEmployee} onChange={set('epfEmployee')} hint="11% of salary" />
          <AmtInput label="EPF (Employer Contribution)" value={form.epfEmployer} onChange={set('epfEmployer')} hint="13% of salary" />
          <AmtInput label="Other Savings" value={form.otherSavings} onChange={set('otherSavings')} hint="SOCSO, PRS, ASB, etc." />
        </div>

        {/* ── Notes ── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            📝 Additional Notes <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optional)</span>
          </label>
          <textarea
            placeholder="Any changes, one-off expenses, or notes for your advisor…"
            value={form.notes}
            onChange={e => set('notes')(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1.5px solid #E5E7EB', resize: 'vertical',
              fontSize: 14, color: '#374151', background: '#FAFAFA', boxSizing: 'border-box',
              fontFamily: 'inherit', outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.background = '#fff'; }}
            onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.background = '#FAFAFA'; }}
          />
        </div>

        {/* ── Submit button ── */}
        <button
          onClick={handleSubmit}
          disabled={step === 'submitting'}
          style={{
            width: '100%', padding: '16px', borderRadius: 14, border: 'none',
            background: step === 'submitting' ? '#A5B4FC' : 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
            color: '#fff', fontSize: 16, fontWeight: 800, cursor: step === 'submitting' ? 'not-allowed' : 'pointer',
            boxShadow: step === 'submitting' ? 'none' : '0 4px 16px rgba(99,102,241,0.35)',
            transition: 'all 0.15s',
          }}
        >
          {step === 'submitting' ? '⏳ Submitting…' : '✅ Submit Cash Flow'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginTop: 14, lineHeight: 1.6 }}>
          Your information is shared only with your financial advisor.<br />
          This form was sent by <strong>Bill Morrisons Financial Consulting</strong>.
        </p>
      </div>
    </div>
  );
}
