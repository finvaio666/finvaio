'use client';

import { useState } from 'react';

// ─── Financial helpers ────────────────────────────────────────────────────────
function fvLumpSum(pv: number, annualRate: number, years: number) {
  return pv * Math.pow(1 + annualRate, years);
}

function fvMonthly(pmt: number, annualRate: number, years: number) {
  if (annualRate === 0) return pmt * years * 12;
  const r = annualRate / 12;
  const n = years * 12;
  return pmt * (Math.pow(1 + r, n) - 1) / r;
}

function pmtNeeded(fvTarget: number, annualRate: number, years: number) {
  if (years <= 0) return 0;
  if (annualRate === 0) return fvTarget / (years * 12);
  const r = annualRate / 12;
  const n = years * 12;
  return fvTarget * r / (Math.pow(1 + r, n) - 1);
}

function fmt(n: number) {
  return `RM ${Math.round(n).toLocaleString()}`;
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `RM ${(n / 1_000).toFixed(1)}K`;
  return fmt(n);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, prefix = 'RM', suffix = '', step = 1000, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        {prefix && <span style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text3)', borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{prefix}</span>}
        <input
          type="number" value={value} min={min} step={step}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '8px 10px', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13 }}
        />
        {suffix && <span style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text3)', borderLeft: '1px solid var(--border)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight = false, positive = true }: {
  label: string; value: string; highlight?: boolean; positive?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: highlight ? (positive ? 'var(--accent-dim)' : 'var(--red-dim)') : 'transparent' }}>
      <span style={{ fontSize: 12, color: highlight ? (positive ? 'var(--accent2)' : 'var(--red)') : 'var(--text2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: highlight ? (positive ? 'var(--accent)' : 'var(--red)') : 'var(--text)' }}>{value}</span>
    </div>
  );
}

// ─── Retirement Calculator ────────────────────────────────────────────────────
function RetirementCalculator() {
  const [f, setF] = useState({
    clientName: 'Ahmad Rizal',
    currentAge: 41,
    retirementAge: 60,
    currentEPF: 115000,
    currentInvestments: 85000,
    monthlyEPF: 2640,
    monthlyInvestment: 1000,
    epfDividend: 5.5,
    investmentReturn: 8.0,
    inflationRate: 3.5,
    targetMonthlyIncome: 8000,
    retirementDuration: 20,
  });

  const set = (k: keyof typeof f) => (v: number | string) => setF(prev => ({ ...prev, [k]: v }));

  const years = Math.max(f.retirementAge - f.currentAge, 0);
  const epfRate = f.epfDividend / 100;
  const invRate = f.investmentReturn / 100;
  const inflRate = f.inflationRate / 100;

  const epfAtRetirement = fvLumpSum(f.currentEPF, epfRate, years) + fvMonthly(f.monthlyEPF, epfRate, years);
  const invAtRetirement = fvLumpSum(f.currentInvestments, invRate, years) + fvMonthly(f.monthlyInvestment, invRate, years);
  const totalFund = epfAtRetirement + invAtRetirement;

  const inflatedMonthlyIncome = f.targetMonthlyIncome * Math.pow(1 + inflRate, years);
  const annualIncomeNeeded = inflatedMonthlyIncome * 12;
  const requiredFund = annualIncomeNeeded * f.retirementDuration;

  const gap = totalFund - requiredFund;
  const isOnTrack = gap >= 0;

  const additionalMonthlyNeeded = isOnTrack ? 0 : pmtNeeded(-gap, invRate, years);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Client Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Name</label>
          <input value={f.clientName} onChange={e => setF(p => ({ ...p, clientName: e.target.value }))}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Current Age" value={f.currentAge} onChange={set('currentAge')} prefix="" suffix="yrs" step={1} min={18} />
          <Field label="Retirement Age" value={f.retirementAge} onChange={set('retirementAge')} prefix="" suffix="yrs" step={1} min={50} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Current Savings</div>
        <Field label="Current EPF Balance" value={f.currentEPF} onChange={set('currentEPF')} />
        <Field label="Current Investments" value={f.currentInvestments} onChange={set('currentInvestments')} />

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Monthly Contributions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="EPF (employee+employer)" value={f.monthlyEPF} onChange={set('monthlyEPF')} />
          <Field label="Investments" value={f.monthlyInvestment} onChange={set('monthlyInvestment')} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Assumptions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="EPF Dividend %" value={f.epfDividend} onChange={set('epfDividend')} prefix="" suffix="%" step={0.1} />
          <Field label="Inv. Return %" value={f.investmentReturn} onChange={set('investmentReturn')} prefix="" suffix="%" step={0.1} />
          <Field label="Inflation %" value={f.inflationRate} onChange={set('inflationRate')} prefix="" suffix="%" step={0.1} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Retirement Goal</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Target Monthly Income" value={f.targetMonthlyIncome} onChange={set('targetMonthlyIncome')} />
          <Field label="Retirement Duration" value={f.retirementDuration} onChange={set('retirementDuration')} prefix="" suffix="yrs" step={1} min={10} />
        </div>
      </div>

      {/* Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: isOnTrack ? 'var(--accent-dim)' : 'var(--red-dim)', border: `1px solid ${isOnTrack ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 'var(--r)', padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: isOnTrack ? 'var(--accent)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {isOnTrack ? '✅ On Track' : '⚠️ Retirement Gap'}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: isOnTrack ? 'var(--accent)' : 'var(--red)', lineHeight: 1 }}>
            {isOnTrack ? `+${fmtK(gap)}` : fmtK(Math.abs(gap))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
            {isOnTrack ? 'Projected surplus at retirement' : 'Shortfall to plug'}
          </div>
        </div>

        <div className="section" style={{ margin: 0 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--accent)' }} />
              Projection for {f.clientName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{years} years to retire</div>
          </div>
          <ResultRow label="EPF at retirement" value={fmtK(epfAtRetirement)} />
          <ResultRow label="Investments at retirement" value={fmtK(invAtRetirement)} />
          <ResultRow label="Total projected fund" value={fmtK(totalFund)} highlight positive={isOnTrack} />
          <ResultRow label={`Monthly income needed (inflation-adj.)`} value={fmt(inflatedMonthlyIncome)} />
          <ResultRow label={`Required fund (${f.retirementDuration} yrs)`} value={fmtK(requiredFund)} />
          <ResultRow label={isOnTrack ? 'Surplus' : 'Retirement gap'} value={isOnTrack ? `+${fmtK(gap)}` : fmtK(Math.abs(gap))} highlight positive={isOnTrack} />
          {!isOnTrack && <ResultRow label="Additional monthly savings needed" value={fmt(additionalMonthlyNeeded)} highlight positive={false} />}
        </div>

        <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
          💡 <strong style={{ color: 'var(--text2)' }}>Assumptions:</strong> EPF dividend {f.epfDividend}% p.a. · Investment return {f.investmentReturn}% p.a. · Inflation {f.inflationRate}% p.a. · Retirement lasts {f.retirementDuration} years
        </div>
      </div>
    </div>
  );
}

// ─── Education Calculator ─────────────────────────────────────────────────────
function EducationCalculator() {
  const [f, setF] = useState({
    clientName: '',
    childName: '',
    childAge: 5,
    universityAge: 18,
    currentEducationCost: 120000,
    educationInflation: 5.0,
    currentSavings: 0,
    monthlySavings: 500,
    savingsReturn: 5.0,
  });

  const set = (k: keyof typeof f) => (v: number | string) => setF(prev => ({ ...prev, [k]: v }));

  const years = Math.max(f.universityAge - f.childAge, 0);
  const eduInflRate = f.educationInflation / 100;
  const retRate = f.savingsReturn / 100;

  const futureCost = fvLumpSum(f.currentEducationCost, eduInflRate, years);
  const projectedSavings = fvLumpSum(f.currentSavings, retRate, years) + fvMonthly(f.monthlySavings, retRate, years);
  const gap = futureCost - projectedSavings;
  const isOnTrack = gap <= 0;
  const additionalMonthlyNeeded = isOnTrack ? 0 : pmtNeeded(gap, retRate, years);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Client & Child Details</div>
        {[
          { label: 'Client Name', key: 'clientName' as const, isText: true },
          { label: 'Child Name', key: 'childName' as const, isText: true },
        ].map(({ label, key }) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
            <input value={f[key] as string} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))}
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Child's Current Age" value={f.childAge} onChange={set('childAge')} prefix="" suffix="yrs" step={1} min={0} />
          <Field label="University Age" value={f.universityAge} onChange={set('universityAge')} prefix="" suffix="yrs" step={1} min={16} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Education Cost</div>
        <Field label="Current Education Cost (today's value)" value={f.currentEducationCost} onChange={set('currentEducationCost')} />
        <Field label="Education Inflation Rate" value={f.educationInflation} onChange={set('educationInflation')} prefix="" suffix="%" step={0.5} />

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Education Savings</div>
        <Field label="Current Education Savings" value={f.currentSavings} onChange={set('currentSavings')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Monthly Savings" value={f.monthlySavings} onChange={set('monthlySavings')} />
          <Field label="Expected Return" value={f.savingsReturn} onChange={set('savingsReturn')} prefix="" suffix="%" step={0.5} />
        </div>

        <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          💡 Local university: ~RM 80K–150K · Private local: ~RM 150K–300K · Overseas: ~RM 400K–800K
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: isOnTrack ? 'var(--accent-dim)' : 'var(--red-dim)', border: `1px solid ${isOnTrack ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 'var(--r)', padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: isOnTrack ? 'var(--accent)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {isOnTrack ? '✅ Fully Funded' : '⚠️ Education Gap'}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: isOnTrack ? 'var(--accent)' : 'var(--red)', lineHeight: 1 }}>
            {isOnTrack ? `+${fmtK(Math.abs(gap))}` : fmtK(gap)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
            {f.childName ? `${f.childName}'s education fund` : 'Education fund'} {isOnTrack ? 'surplus' : 'shortfall'}
          </div>
        </div>

        <div className="section" style={{ margin: 0 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--blue)' }} />
              {f.childName ? `${f.childName}'s Education Plan` : 'Education Projection'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{years} years away</div>
          </div>
          <ResultRow label="Inflation-adjusted education cost" value={fmtK(futureCost)} />
          <ResultRow label="Projected savings at university age" value={fmtK(projectedSavings)} />
          <ResultRow label={isOnTrack ? 'Surplus' : 'Funding gap'} value={isOnTrack ? `+${fmtK(Math.abs(gap))}` : fmtK(gap)} highlight positive={isOnTrack} />
          {!isOnTrack && <ResultRow label="Additional monthly savings needed" value={fmt(additionalMonthlyNeeded)} highlight positive={false} />}
          {!isOnTrack && <ResultRow label="Total monthly savings needed" value={fmt(f.monthlySavings + additionalMonthlyNeeded)} />}
        </div>
      </div>
    </div>
  );
}

// ─── Emergency Fund Calculator ────────────────────────────────────────────────
function EmergencyFundCalculator() {
  const [f, setF] = useState({
    clientName: '',
    monthlyExpenses: 6000,
    targetMonths: 6,
    currentEmergencyFund: 0,
    monthlyContribution: 500,
    buildUpMonths: 24,
  });

  const set = (k: keyof typeof f) => (v: number | string) => setF(prev => ({ ...prev, [k]: v }));

  const target = f.monthlyExpenses * f.targetMonths;
  const gap = Math.max(target - f.currentEmergencyFund, 0);
  const isOnTrack = gap === 0;
  const monthsToTarget = f.monthlyContribution > 0 ? Math.ceil(gap / f.monthlyContribution) : Infinity;
  const monthlyNeeded = f.buildUpMonths > 0 ? Math.ceil(gap / f.buildUpMonths) : 0;
  const coverageMonths = f.monthlyExpenses > 0 ? (f.currentEmergencyFund / f.monthlyExpenses).toFixed(1) : '0';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Client Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Name</label>
          <input value={f.clientName} onChange={e => setF(p => ({ ...p, clientName: e.target.value }))}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Expenses & Target</div>
        <Field label="Monthly Expenses" value={f.monthlyExpenses} onChange={set('monthlyExpenses')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Target Coverage" value={f.targetMonths} onChange={set('targetMonths')} prefix="" suffix="months" step={1} min={3} />
          <Field label="Build-up Period" value={f.buildUpMonths} onChange={set('buildUpMonths')} prefix="" suffix="months" step={1} min={1} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Current Position</div>
        <Field label="Current Emergency Fund" value={f.currentEmergencyFund} onChange={set('currentEmergencyFund')} />
        <Field label="Monthly Contribution" value={f.monthlyContribution} onChange={set('monthlyContribution')} />

        <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          💡 BNM recommends <strong style={{ color: 'var(--text2)' }}>6 months</strong> for salaried employees · <strong style={{ color: 'var(--text2)' }}>12 months</strong> for self-employed
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: isOnTrack ? 'var(--accent-dim)' : f.currentEmergencyFund >= f.monthlyExpenses * 3 ? 'var(--gold-dim)' : 'var(--red-dim)', border: `1px solid ${isOnTrack ? 'rgba(74,222,128,0.3)' : f.currentEmergencyFund >= f.monthlyExpenses * 3 ? 'rgba(245,158,11,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 'var(--r)', padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: isOnTrack ? 'var(--accent)' : f.currentEmergencyFund >= f.monthlyExpenses * 3 ? 'var(--gold)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {isOnTrack ? '✅ Target Achieved' : f.currentEmergencyFund >= f.monthlyExpenses * 3 ? '🟡 Partial Coverage' : '⚠️ Underfunded'}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--text)', lineHeight: 1 }}>{coverageMonths} months</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>current coverage · target {f.targetMonths} months</div>
        </div>

        <div className="section" style={{ margin: 0 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--gold)' }} />
              {f.clientName || 'Client'} — Emergency Fund
            </div>
          </div>
          <ResultRow label="Target emergency fund" value={fmt(target)} />
          <ResultRow label="Current fund" value={fmt(f.currentEmergencyFund)} />
          <ResultRow label="Gap to target" value={isOnTrack ? 'Fully funded ✅' : fmt(gap)} highlight positive={isOnTrack} />
          {!isOnTrack && <ResultRow label={`Monthly needed (${f.buildUpMonths} months)`} value={fmt(monthlyNeeded)} highlight positive={false} />}
          {!isOnTrack && f.monthlyContribution > 0 && <ResultRow label="Months to target at current rate" value={isFinite(monthsToTarget) ? `${monthsToTarget} months` : '—'} />}
        </div>

        {/* Coverage bar */}
        <div className="section" style={{ margin: 0 }}>
          <div style={{ padding: '16px 20px' }}>
            <div className="chart-title" style={{ marginBottom: 12 }}>Coverage Progress</div>
            {[
              { label: 'Minimum (3M)', months: 3 },
              { label: `Target (${f.targetMonths}M)`, months: f.targetMonths },
              { label: `Self-employed (12M)`, months: 12 },
            ].map(b => {
              const pct = Math.min((f.currentEmergencyFund / (f.monthlyExpenses * b.months)) * 100, 100);
              return (
                <div key={b.label} className="bar-row" style={{ marginBottom: 8 }}>
                  <div className="bar-label">{b.label}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? '#4ADE80' : pct >= 50 ? '#F59E0B' : '#F87171' }} />
                  </div>
                  <div className="bar-val">{Math.round(pct)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Planning Page ───────────────────────────────────────────────────────
const TABS = [
  { id: 'retirement', label: '📊 Retirement Planning' },
  { id: 'education', label: '🎓 Education Planning' },
  { id: 'emergency', label: '🛡️ Emergency Fund' },
];

export default function PlanningPage() {
  const [activeTab, setActiveTab] = useState('retirement');

  return (
    <>
      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: '8px 16px', borderRadius: 'var(--r-sm)', border: `1px solid ${activeTab === tab.id ? 'rgba(74,222,128,0.4)' : 'var(--border)'}`, background: activeTab === tab.id ? 'var(--accent-dim)' : 'var(--surface)', color: activeTab === tab.id ? 'var(--accent)' : 'var(--text2)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Calculator */}
      <div className="section" style={{ padding: 24 }}>
        <div className="section-header" style={{ marginBottom: 20 }}>
          <div className="section-title">
            <span className="section-dot" style={{ background: activeTab === 'retirement' ? 'var(--accent)' : activeTab === 'education' ? 'var(--blue)' : 'var(--gold)' }} />
            {TABS.find(t => t.id === activeTab)?.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Live calculation</div>
        </div>

        {activeTab === 'retirement' && <RetirementCalculator />}
        {activeTab === 'education' && <EducationCalculator />}
        {activeTab === 'emergency' && <EmergencyFundCalculator />}
      </div>
    </>
  );
}
