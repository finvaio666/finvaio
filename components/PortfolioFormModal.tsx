'use client';

import { useState } from 'react';
import ClientSearchCombobox, { type ComboboxClient } from '@/components/ClientSearchCombobox';

export interface HoldingDraft {
  id?: string;
  clientId?: string;
  clientName?: string;
  holdingName?: string;
  assetClass?: string;
  institution?: string;
  status?: string;
  currency?: string;
  valueOrig?: number;
  purchaseOrig?: number;
  fxRate?: number;
  units?: number;
  maturityDate?: string;
}

const ASSET_CLASSES = ['EPF', 'Unit Trust', 'Fixed Deposit', 'Stocks', 'Bonds', 'Structured Product', 'PRS', 'ETF', 'Cash', 'Other'];
const CURRENCIES = ['MYR', 'USD', 'SGD', 'GBP', 'EUR', 'AUD', 'JPY'];
const STATUSES = ['Active', 'Matured', 'Redeemed'];

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-sans)' };

export default function PortfolioFormModal({ clients, initial, onClose, onSaved }: {
  clients: ComboboxClient[];
  initial: HoldingDraft | null;          // null = add new
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<HoldingDraft>(initial ?? { currency: 'MYR', status: 'Active', fxRate: 1 });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!initial?.id;
  const set = (k: keyof HoldingDraft) => (v: string | number) => setF(s => ({ ...s, [k]: v }));
  const numSet = (k: keyof HoldingDraft) => (v: string) => setF(s => ({ ...s, [k]: v === '' ? undefined : Number(v) }));

  async function save() {
    if (!f.holdingName?.trim()) { setErr('Holding name is required.'); return; }
    if (!isEdit && !f.clientId) { setErr('Please select a client.'); return; }
    setSaving(true); setErr('');
    const fx = f.fxRate || 1;
    const body = {
      ...f,
      valueMyr: (f.currency && f.currency !== 'MYR') ? (f.valueOrig ?? 0) * fx : (f.valueOrig ?? 0),
      purchaseMyr: (f.currency && f.currency !== 'MYR') ? (f.purchaseOrig ?? 0) * fx : (f.purchaseOrig ?? 0),
    };
    const res = await fetch('/api/portfolio', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(d.error ?? 'Save failed'); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose} title={isEdit ? 'Edit Holding' : 'Add Holding'}>
      {!isEdit && (
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Client *</label>
          <ClientSearchCombobox clients={clients} value={f.clientId ?? ''} onChange={c => setF(s => ({ ...s, clientId: c?.id, clientName: c?.name }))} />
        </div>
      )}
      <Grid>
        <Field label="Holding Name *"><input style={inp} value={f.holdingName ?? ''} onChange={e => set('holdingName')(e.target.value)} placeholder="e.g. Principal Asia Pacific Dynamic" /></Field>
        <Field label="Asset Class"><Select value={f.assetClass ?? ''} opts={ASSET_CLASSES} onChange={set('assetClass')} /></Field>
        <Field label="Institution"><input style={inp} value={f.institution ?? ''} onChange={e => set('institution')(e.target.value)} placeholder="e.g. iFAST / KWSP" /></Field>
        <Field label="Status"><Select value={f.status ?? 'Active'} opts={STATUSES} onChange={set('status')} /></Field>
        <Field label="Currency"><Select value={f.currency ?? 'MYR'} opts={CURRENCIES} onChange={set('currency')} /></Field>
        <Field label="FX Rate to MYR"><input style={inp} type="number" value={f.fxRate ?? ''} onChange={e => numSet('fxRate')(e.target.value)} placeholder="1" /></Field>
        <Field label={`Current Value (${f.currency || 'MYR'})`}><input style={inp} type="number" value={f.valueOrig ?? ''} onChange={e => numSet('valueOrig')(e.target.value)} placeholder="0" /></Field>
        <Field label={`Purchase Cost (${f.currency || 'MYR'})`}><input style={inp} type="number" value={f.purchaseOrig ?? ''} onChange={e => numSet('purchaseOrig')(e.target.value)} placeholder="0" /></Field>
        <Field label="Units"><input style={inp} type="number" value={f.units ?? ''} onChange={e => numSet('units')(e.target.value)} placeholder="0" /></Field>
        <Field label="Maturity Date"><input style={inp} type="date" value={f.maturityDate ?? ''} onChange={e => set('maturityDate')(e.target.value)} /></Field>
      </Grid>
      <Footer err={err} saving={saving} onClose={onClose} onSave={save} />
    </Overlay>
  );
}

// ── tiny shared UI (also used by InsuranceFormModal) ──────────────────────────
export function Overlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text3)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
export function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>;
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={lbl}>{label}</label>{children}</div>;
}
export function Select({ value, opts, onChange }: { value: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inp}>
      <option value="">—</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
export function Footer({ err, saving, onClose, onSave }: { err: string; saving: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
      {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--text3)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={onSave} disabled={saving} style={{ padding: '9px 22px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
export const fieldInput = inp;
