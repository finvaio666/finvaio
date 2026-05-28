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
  // Income
  salary:           string;
  business:         string;
  rental:           string;
  investment:       string;
  otherIncome:      string;
  // Fixed
  housing:          string;
  carLoan:          string;
  insurancePremium: string;
  education:        string;
  internet:         string;
  subscriptions:    string;
  otherFixed:       string;
  // Variable
  food:             string;
  diningOut:        string;
  transport:        string;
  entertainment:    string;
  healthcare:       string;
  clothing:         string;
  selfDevelopment:  string;
  travel:           string;
  gifts:            string;
  otherVariable:    string;
  // EPF
  epfEmployee:      string;
  epfEmployer:      string;
  otherSavings:     string;
  // Notes
  notes:            string;
}

const EMPTY: FormValues = {
  salary:'', business:'', rental:'', investment:'', otherIncome:'',
  housing:'', carLoan:'', insurancePremium:'', education:'', internet:'', subscriptions:'', otherFixed:'',
  food:'', diningOut:'', transport:'', entertainment:'', healthcare:'', clothing:'', selfDevelopment:'', travel:'', gifts:'', otherVariable:'',
  epfEmployee:'', epfEmployer:'', otherSavings:'',
  notes:'',
};

const n = (v: string) => parseFloat(v) || 0;
const fmt = (v: number) => v > 0
  ? `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  : '—';

// ── Amount input ─────────────────────────────────────────────────────────────
function AmtInput({ label, value, onChange, hint }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 700,
        color: 'var(--text3)', marginBottom: 5,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
        {hint && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, fontWeight: 700, color: focused ? 'var(--accent2)' : 'var(--text3)',
          fontFamily: 'var(--font-mono)', transition: 'color 0.15s',
        }}>RM</span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', padding: '11px 14px 11px 42px',
            border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--r-sm)',
            fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 600,
            color: 'var(--text)',
            background: focused ? 'var(--surface)' : 'var(--bg2)',
            outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        />
      </div>
    </div>
  );
}

// ── Section card header ───────────────────────────────────────────────────────
function SectionHeader({ emoji, title, subtitle, total, dotColor }: {
  emoji: string; title: string; subtitle: string; total: number; dotColor: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      marginBottom: 18, paddingBottom: 14,
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--r-sm)',
        background: 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0,
      }}>{emoji}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>
      </div>
      {total > 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14,
          color: dotColor,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          padding: '4px 12px', borderRadius: 'var(--r-pill)',
        }}>
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

  const [info,      setInfo]      = useState<TokenInfo | null>(null);
  const [form,      setForm]      = useState<FormValues>(EMPTY);
  const [step,      setStep]      = useState<'loading' | 'form' | 'submitting' | 'done' | 'error'>('loading');
  const [errMsg,    setErrMsg]    = useState('');
  const [submitted, setSubmitted] = useState<{ income: number; expenses: number; surplus: number } | null>(null);

  // Decode token on mount (client-side display only; server verifies on submit)
  useEffect(() => {
    if (!token) { setStep('error'); setErrMsg('No token in URL.'); return; }
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
      setInfo({ valid: true, clientName: payload.clientName, month: payload.month, advisorName: '' });
      setStep('form');
    } catch {
      setInfo({ valid: false, error: 'This link is invalid or has been tampered with.' });
      setStep('error');
    }
  }, [token]);

  const set = (key: keyof FormValues) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  // Live totals
  const totals = useMemo(() => {
    const income   = n(form.salary) + n(form.business) + n(form.rental) + n(form.investment) + n(form.otherIncome);
    const fixed    = n(form.housing) + n(form.carLoan) + n(form.insurancePremium) + n(form.education) + n(form.internet) + n(form.subscriptions) + n(form.otherFixed);
    const variable = n(form.food) + n(form.diningOut) + n(form.transport) + n(form.entertainment) + n(form.healthcare) + n(form.clothing) + n(form.selfDevelopment) + n(form.travel) + n(form.gifts) + n(form.otherVariable);
    // Employer EPF is funded by the company — does NOT reduce the client's cash flow
    const epf      = n(form.epfEmployee) + n(form.otherSavings);
    const surplus  = income - fixed - variable - epf;
    const savingsRate = income > 0 ? Math.round(((surplus + epf) / income) * 100) : 0;
    return { income, fixed, variable, epf, surplus, savingsRate };
  }, [form]);

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

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Loading your form…</div>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', padding: 24,
      }}>
        <div style={{
          maxWidth: 400, textAlign: 'center',
          background: 'var(--surface)', borderRadius: 'var(--r)',
          padding: '40px 32px', boxShadow: 'var(--shadow)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--r)',
            background: 'var(--red-dim)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 28, margin: '0 auto 20px',
          }}>🔗</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>Link Problem</h2>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
            {info?.error ?? errMsg ?? 'This link is no longer valid.'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
            Please contact your financial advisor for assistance.
          </p>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (step === 'done' && submitted) {
    const surplus = submitted.surplus;
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{
          maxWidth: 440, width: '100%',
          background: 'var(--surface)', borderRadius: 'var(--r)',
          padding: '40px 32px', boxShadow: 'var(--shadow)', textAlign: 'center',
        }}>
          {/* Top accent bar */}
          <div style={{ height: 4, background: 'var(--green)', borderRadius: 999, margin: '-40px -32px 32px', borderTopLeftRadius: 'var(--r)', borderTopRightRadius: 'var(--r)' }} />

          <div style={{
            width: 64, height: 64, borderRadius: 'var(--r)',
            background: 'var(--green-dim)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 28, margin: '0 auto 20px',
          }}>✅</div>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>Submitted!</h2>
          <p style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 28 }}>
            Thank you, <strong style={{ color: 'var(--text)' }}>{info?.clientName}</strong>. Your cash flow for{' '}
            <strong style={{ color: 'var(--accent2)' }}>{monthLabel}</strong> has been received.
          </p>

          {/* Summary rows */}
          <div style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', padding: '16px 20px', textAlign: 'left', marginBottom: 24,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 14, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Your Summary
            </div>
            {[
              { label: 'Monthly Income',  val: submitted.income,   color: 'var(--green)' },
              { label: 'Total Expenses',  val: submitted.expenses, color: 'var(--red)' },
              { label: surplus >= 0 ? 'Monthly Surplus' : 'Monthly Deficit',
                val: Math.abs(surplus),
                color: surplus >= 0 ? 'var(--accent2)' : 'var(--gold)' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: 'var(--text2)' }}>{row.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: row.color }}>
                  RM {row.val.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
            Your advisor will review your cash flow and may follow up during your next session.
          </p>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans)' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '20px 24px 18px',
        textAlign: 'center',
      }}>
        {/* Orange top-bar */}
        <div style={{ height: 4, background: 'var(--accent)', borderRadius: 999, margin: '-20px -24px 20px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'var(--accent-dim)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 15,
          }}>💰</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Bill Morrisons Financial Consulting
          </span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, marginBottom: 4, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Monthly Cash Flow
        </h1>
        {info?.clientName && (
          <div style={{ fontSize: 14, color: 'var(--text3)' }}>
            Hi <strong style={{ color: 'var(--accent2)' }}>{info.clientName}</strong>{monthLabel ? ` · ${monthLabel}` : ''}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 16px 96px' }}>

        {/* ── Live summary bar ── */}
        {(totals.income > 0 || totals.fixed > 0 || totals.variable > 0) && (
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r)',
            padding: '16px 20px', marginBottom: 20,
            boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Live Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Income',   val: totals.income,                          color: 'var(--green)' },
                { label: 'Expenses', val: totals.fixed + totals.variable,         color: 'var(--red)' },
                { label: totals.surplus >= 0 ? 'Surplus' : 'Deficit',
                  val: Math.abs(totals.surplus),
                  color: totals.surplus >= 0 ? 'var(--accent2)' : 'var(--gold)' },
              ].map(s => (
                <div key={s.label} style={{
                  textAlign: 'center', background: 'var(--bg2)',
                  borderRadius: 'var(--r-sm)', padding: '10px 8px',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: s.color }}>
                    {fmt(s.val)}
                  </div>
                </div>
              ))}
            </div>
            {totals.income > 0 && (
              <>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--surface2)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    background: totals.surplus >= 0 ? 'var(--accent)' : 'var(--gold)',
                    width: `${Math.min(Math.max((totals.surplus / totals.income) * 100, 0), 100)}%`,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, textAlign: 'center' }}>
                  Savings rate:{' '}
                  <strong style={{ color: totals.savingsRate >= 30 ? 'var(--green)' : 'var(--gold)' }}>
                    {totals.savingsRate}%
                  </strong>
                  {totals.savingsRate >= 30 ? ' ✅' : ' ⚠️ target: 30%+'}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Section 1: Income ── */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--r)',
          padding: '22px 22px 10px', marginBottom: 16,
          boxShadow: 'var(--shadow-sm)',
          borderTop: '3px solid var(--green)',
        }}>
          <SectionHeader emoji="💼" title="Monthly Income" subtitle="Enter your regular income sources" total={totals.income} dotColor="var(--green)" />
          <AmtInput label="Salary / Employment" value={form.salary}     onChange={set('salary')}     hint="gross monthly" />
          <AmtInput label="Business Income"     value={form.business}   onChange={set('business')}   hint="if self-employed" />
          <AmtInput label="Rental Income"       value={form.rental}     onChange={set('rental')} />
          <AmtInput label="Investment Returns"  value={form.investment} onChange={set('investment')} hint="dividends, interest" />
          <AmtInput label="Other Income"        value={form.otherIncome} onChange={set('otherIncome')} hint="freelance, etc." />
        </div>

        {/* ── Section 2: Fixed Expenses ── */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--r)',
          padding: '22px 22px 10px', marginBottom: 16,
          boxShadow: 'var(--shadow-sm)',
          borderTop: '3px solid var(--red)',
        }}>
          <SectionHeader emoji="🏠" title="Fixed Expenses" subtitle="Regular monthly commitments" total={totals.fixed} dotColor="var(--red)" />
          <AmtInput label="Housing (Mortgage / Rent)" value={form.housing}          onChange={set('housing')} />
          <AmtInput label="Car Loan"                  value={form.carLoan}          onChange={set('carLoan')}          hint="monthly instalment" />
          <AmtInput label="Insurance Premiums"        value={form.insurancePremium} onChange={set('insurancePremium')} hint="life, medical, etc." />
          <AmtInput label="Education"                 value={form.education}        onChange={set('education')}        hint="school fees, tuition" />
          <AmtInput label="Internet & Phone Bills"    value={form.internet}         onChange={set('internet')}         hint="broadband, mobile plan" />
          <AmtInput label="Subscriptions"             value={form.subscriptions}    onChange={set('subscriptions')}    hint="Netflix, Spotify, etc." />
          <AmtInput label="Other Fixed Commitments"   value={form.otherFixed}       onChange={set('otherFixed')}       hint="personal loan, etc." />
        </div>

        {/* ── Section 3: Variable Expenses ── */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--r)',
          padding: '22px 22px 10px', marginBottom: 16,
          boxShadow: 'var(--shadow-sm)',
          borderTop: '3px solid var(--gold)',
        }}>
          <SectionHeader emoji="🛒" title="Variable Expenses" subtitle="Day-to-day spending" total={totals.variable} dotColor="var(--gold)" />
          <AmtInput label="Food & Groceries"              value={form.food}            onChange={set('food')}            hint="wet market, supermarket" />
          <AmtInput label="Dining Out / Food Delivery"    value={form.diningOut}       onChange={set('diningOut')}       hint="restaurants, GrabFood, etc." />
          <AmtInput label="Transport"                     value={form.transport}       onChange={set('transport')}       hint="petrol, toll, Grab" />
          <AmtInput label="Entertainment"                 value={form.entertainment}   onChange={set('entertainment')}   hint="movies, events, hobbies" />
          <AmtInput label="Healthcare"                    value={form.healthcare}      onChange={set('healthcare')}      hint="clinic, pharmacy" />
          <AmtInput label="Clothing & Personal Care"      value={form.clothing}        onChange={set('clothing')}        hint="grooming, skincare, apparel" />
          <AmtInput label="Education / Books / Courses"   value={form.selfDevelopment} onChange={set('selfDevelopment')} hint="online courses, books" />
          <AmtInput label="Travel & Holidays"             value={form.travel}          onChange={set('travel')}          hint="flights, hotels, trips" />
          <AmtInput label="Gifts & Donations"             value={form.gifts}           onChange={set('gifts')}           hint="zakat, charity, gifts" />
          <AmtInput label="Other Variable"                value={form.otherVariable}   onChange={set('otherVariable')} />
        </div>

        {/* ── Section 4: EPF & Savings ── */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--r)',
          padding: '22px 22px 10px', marginBottom: 16,
          boxShadow: 'var(--shadow-sm)',
          borderTop: '3px solid var(--blue)',
        }}>
          <SectionHeader emoji="🏦" title="EPF & Savings" subtitle="Mandatory deductions & savings" total={totals.epf} dotColor="var(--blue)" />
          <AmtInput label="EPF (Employee Contribution)" value={form.epfEmployee} onChange={set('epfEmployee')} hint="11% of salary" />
          <AmtInput label="EPF (Employer Contribution)" value={form.epfEmployer} onChange={set('epfEmployer')} hint="13% of salary" />
          <AmtInput label="Other Savings"               value={form.otherSavings} onChange={set('otherSavings')} hint="SOCSO, PRS, ASB, etc." />
        </div>

        {/* ── Notes ── */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--r)',
          padding: '22px 22px 18px', marginBottom: 24,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <label style={{
            display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)',
            marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            📝 Additional Notes <span style={{ fontWeight: 400, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </label>
          <textarea
            placeholder="Any changes, one-off expenses, or notes for your advisor…"
            value={form.notes}
            onChange={e => set('notes')(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '11px 14px',
              borderRadius: 'var(--r-sm)',
              border: '1.5px solid var(--border)',
              resize: 'vertical', fontSize: 14,
              color: 'var(--text2)', background: 'var(--bg2)',
              boxSizing: 'border-box', fontFamily: 'var(--font-sans)',
              outline: 'none', transition: 'border-color 0.15s, background 0.15s',
              lineHeight: 1.6,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--surface)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)'; }}
          />
        </div>

        {/* ── Submit button ── */}
        <button
          onClick={handleSubmit}
          disabled={step === 'submitting'}
          style={{
            width: '100%', padding: '16px', borderRadius: 'var(--r-pill)', border: 'none',
            background: step === 'submitting' ? 'var(--surface2)' : 'var(--accent2)',
            color: step === 'submitting' ? 'var(--text3)' : '#fff',
            fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-sans)',
            cursor: step === 'submitting' ? 'not-allowed' : 'pointer',
            boxShadow: step === 'submitting' ? 'none' : '0 4px 16px rgba(207,69,0,0.3)',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {step === 'submitting' ? (
            <>
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--text3)', borderTopColor: 'var(--accent)', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              Submitting…
            </>
          ) : '✅ Submit Cash Flow'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', marginTop: 16, lineHeight: 1.6 }}>
          Your information is shared only with your financial advisor.<br />
          This form was sent by <strong style={{ color: 'var(--text2)' }}>Bill Morrisons Financial Consulting</strong>.
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
