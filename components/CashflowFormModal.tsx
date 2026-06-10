'use client';

import { useState } from 'react';
import { Overlay, Field, Footer, fieldInput } from '@/components/PortfolioFormModal';

export interface CashflowBreakdown {
  fixed:    Record<string, number>;
  variable: Record<string, number>;
  income:   Record<string, number>;
  epf:      Record<string, number>;
  advisorNotes?: string;
}

export interface CashflowDraft {
  month: string; // YYYY-MM
  // Income
  salary?: number; business?: number; rental?: number; investment?: number; otherIncome?: number;
  // Fixed
  housing?: number; carLoan?: number; insurancePremium?: number; education?: number; internet?: number; subscriptions?: number; otherFixed?: number;
  // Variable
  food?: number; diningOut?: number; transport?: number; entertainment?: number; healthcare?: number; clothing?: number; selfDevelopment?: number; travel?: number; gifts?: number; otherVariable?: number;
  // EPF / savings
  epfEmployee?: number; epfEmployer?: number; otherSavings?: number;
  notes?: string;
}

const INCOME_FIELDS:   [keyof CashflowDraft, string][] = [
  ['salary', 'Salary / Employment'], ['business', 'Business Income'], ['rental', 'Rental Income'],
  ['investment', 'Investment Returns'], ['otherIncome', 'Other Income'],
];
const FIXED_FIELDS:    [keyof CashflowDraft, string][] = [
  ['housing', 'Housing (Mortgage / Rent)'], ['carLoan', 'Car Loan'], ['insurancePremium', 'Insurance Premiums'],
  ['education', 'Education'], ['internet', 'Internet & Phone'], ['subscriptions', 'Subscriptions'], ['otherFixed', 'Other Fixed'],
];
const VARIABLE_FIELDS: [keyof CashflowDraft, string][] = [
  ['food', 'Food & Groceries'], ['diningOut', 'Dining Out / Delivery'], ['transport', 'Transport'],
  ['entertainment', 'Entertainment'], ['healthcare', 'Healthcare'], ['clothing', 'Clothing & Personal Care'],
  ['selfDevelopment', 'Self Development'], ['travel', 'Travel & Holidays'], ['gifts', 'Gifts & Donations'], ['otherVariable', 'Other Variable'],
];
const EPF_FIELDS:      [keyof CashflowDraft, string][] = [
  ['epfEmployee', 'EPF (Employee)'], ['epfEmployer', 'EPF (Employer)'], ['otherSavings', 'Other Savings'],
];

function sectionTotal(f: CashflowDraft, fields: [keyof CashflowDraft, string][]) {
  return fields.reduce((s, [k]) => s + (Number(f[k]) || 0), 0);
}

function FieldGrid({ f, fields, set }: { f: CashflowDraft; fields: [keyof CashflowDraft, string][]; set: (k: keyof CashflowDraft) => (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
      {fields.map(([k, label]) => (
        <Field key={k} label={label}>
          <input style={fieldInput} type="number" value={f[k] as number ?? ''} onChange={e => set(k)(e.target.value)} placeholder="0" />
        </Field>
      ))}
    </div>
  );
}

export default function CashflowFormModal({ clientName, initial, onClose, onSaved }: {
  clientName: string;
  initial?:   CashflowDraft | null; // pre-fill for editing an existing month
  onClose:    () => void;
  onSaved:    () => void;
}) {
  const [f, setF] = useState<CashflowDraft>(initial ?? { month: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!initial;

  const set = (k: keyof CashflowDraft) => (v: string | number) => setF(s => ({
    ...s, [k]: k === 'month' || k === 'notes' ? v : (v === '' ? undefined : Number(v)),
  }));

  const totalIncome   = sectionTotal(f, INCOME_FIELDS);
  const totalFixed    = sectionTotal(f, FIXED_FIELDS);
  const totalVariable = sectionTotal(f, VARIABLE_FIELDS);
  const totalEPF      = (f.epfEmployee ?? 0) + (f.otherSavings ?? 0);
  const surplus       = totalIncome - totalFixed - totalVariable - totalEPF;

  async function save() {
    if (!f.month) { setErr('Month is required.'); return; }
    setSaving(true); setErr('');
    const res = await fetch('/api/cashflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, clientName, month: `${f.month}-01` }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(d.error ?? 'Save failed'); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose} title={isEdit ? 'Edit Monthly Cashflow' : 'Add Monthly Cashflow'}>
      <div style={{ marginBottom: 14 }}>
        <Field label="Month *">
          <input style={{ ...fieldInput, maxWidth: 200 }} type="month" value={f.month ?? ''} disabled={isEdit}
            onChange={e => set('month')(e.target.value)} />
        </Field>
      </div>

      <SectionTitle label="Income" total={totalIncome} color="var(--green)" />
      <FieldGrid f={f} fields={INCOME_FIELDS} set={set} />

      <SectionTitle label="Fixed Expenses" total={totalFixed} color="var(--red)" />
      <FieldGrid f={f} fields={FIXED_FIELDS} set={set} />

      <SectionTitle label="Variable Expenses" total={totalVariable} color="var(--gold)" />
      <FieldGrid f={f} fields={VARIABLE_FIELDS} set={set} />

      <SectionTitle label="EPF & Savings" total={totalEPF} color="var(--blue)" />
      <FieldGrid f={f} fields={EPF_FIELDS} set={set} />

      <div style={{ marginTop: 14, marginBottom: 4 }}>
        <Field label="Notes"><textarea style={{ ...fieldInput, minHeight: 60, resize: 'vertical' }} value={f.notes ?? ''} onChange={e => set('notes')(e.target.value)} placeholder="Optional notes" /></Field>
      </div>

      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
        <span style={{ color: 'var(--text)' }}>Surplus</span>
        <span style={{ color: surplus >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>{surplus >= 0 ? '+' : ''}{Math.round(surplus).toLocaleString()}</span>
      </div>

      <Footer err={err} saving={saving} onClose={onClose} onSave={save} />
    </Overlay>
  );
}

function SectionTitle({ label, total, color }: { label: string; total: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 8px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {total > 0 && <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{Math.round(total).toLocaleString()}</div>}
    </div>
  );
}
