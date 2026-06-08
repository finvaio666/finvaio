'use client';

import { useState } from 'react';
import ClientSearchCombobox, { type ComboboxClient } from '@/components/ClientSearchCombobox';
import { Overlay, Grid, Field, Select, Footer, fieldInput as inp } from '@/components/PortfolioFormModal';

export interface PolicyDraft {
  id?: string;
  clientId?: string;
  clientName?: string;
  policyName?: string;
  policyOwner?: string;
  lifeAssured?: string;
  insuranceType?: string;
  benefits?: string[];
  status?: string;
  insurer?: string;
  policyNumber?: string;
  sumAssured?: number;
  lifeCover?: number;
  ciCover?: number;
  paCover?: number;
  tpdCover?: number;
  annualPremium?: number;
  commencementDate?: string;
  maturityDate?: string;
  medicalCard?: string;
  medicalClass?: string;
  beneficiary?: string;
  notes?: string;
}

const TYPES = ['ILP', 'Term Life', 'Whole Life', 'Endowment', 'Medical', 'Critical Illness', 'Personal Accident', 'Annuity', 'Other'];
const STATUSES = ['Active', 'Lapsed', 'Matured', 'Surrendered'];
const COMMON_BENEFITS = ['🛡️ Life Cover', '♿ TPD', '❤️ Critical Illness (CI)', '🦺 Personal Accident', '🏥 Medical', '⏸️ Waiver of Premium', '🎗️ Early CI'];

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 };

export default function InsuranceFormModal({ clients, initial, onClose, onSaved }: {
  clients: ComboboxClient[];
  initial: PolicyDraft | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<PolicyDraft>(initial ?? { status: 'Active', benefits: [] });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!initial?.id;
  const set = (k: keyof PolicyDraft) => (v: string) => setF(s => ({ ...s, [k]: v }));
  const numSet = (k: keyof PolicyDraft) => (v: string) => setF(s => ({ ...s, [k]: v === '' ? undefined : Number(v) }));
  const toggleBenefit = (b: string) => setF(s => {
    const cur = s.benefits ?? [];
    return { ...s, benefits: cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b] };
  });

  async function save() {
    if (!f.policyName?.trim()) { setErr('Policy name is required.'); return; }
    if (!isEdit && !f.clientId) { setErr('Please select a client.'); return; }
    setSaving(true); setErr('');
    const res = await fetch('/api/insurance', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(d.error ?? 'Save failed'); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose} title={isEdit ? 'Edit Policy' : 'Add Policy'}>
      {!isEdit && (
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Client (Policy Owner) *</label>
          <ClientSearchCombobox clients={clients} value={f.clientId ?? ''} onChange={c => setF(s => ({ ...s, clientId: c?.id, clientName: c?.name, policyOwner: s.policyOwner || c?.name }))} />
        </div>
      )}
      <Grid>
        <Field label="Policy Name *"><input style={inp} value={f.policyName ?? ''} onChange={e => set('policyName')(e.target.value)} placeholder="e.g. PowerLink" /></Field>
        <Field label="Insurer"><input style={inp} value={f.insurer ?? ''} onChange={e => set('insurer')(e.target.value)} placeholder="e.g. Allianz" /></Field>
        <Field label="Policy Owner"><input style={inp} value={f.policyOwner ?? ''} onChange={e => set('policyOwner')(e.target.value)} placeholder="who owns/pays" /></Field>
        <Field label="Life Assured"><input style={inp} value={f.lifeAssured ?? ''} onChange={e => set('lifeAssured')(e.target.value)} placeholder="who is insured" /></Field>
        <Field label="Type"><Select value={f.insuranceType ?? ''} opts={TYPES} onChange={set('insuranceType')} /></Field>
        <Field label="Status"><Select value={f.status ?? 'Active'} opts={STATUSES} onChange={set('status')} /></Field>
        <Field label="Policy Number"><input style={inp} value={f.policyNumber ?? ''} onChange={e => set('policyNumber')(e.target.value)} /></Field>
        <Field label="Annual Premium (MYR)"><input style={inp} type="number" value={f.annualPremium ?? ''} onChange={e => numSet('annualPremium')(e.target.value)} /></Field>
        <Field label="Life / TPD Cover (MYR)"><input style={inp} type="number" value={f.lifeCover ?? ''} onChange={e => { numSet('lifeCover')(e.target.value); numSet('sumAssured')(e.target.value); }} /></Field>
        <Field label="CI Cover (MYR)"><input style={inp} type="number" value={f.ciCover ?? ''} onChange={e => numSet('ciCover')(e.target.value)} /></Field>
        <Field label="PA Cover (MYR)"><input style={inp} type="number" value={f.paCover ?? ''} onChange={e => numSet('paCover')(e.target.value)} /></Field>
        <Field label="TPD Cover (MYR)"><input style={inp} type="number" value={f.tpdCover ?? ''} onChange={e => numSet('tpdCover')(e.target.value)} /></Field>
        <Field label="Commencement Date"><input style={inp} type="date" value={f.commencementDate ?? ''} onChange={e => set('commencementDate')(e.target.value)} /></Field>
        <Field label="Maturity Date"><input style={inp} type="date" value={f.maturityDate ?? ''} onChange={e => set('maturityDate')(e.target.value)} /></Field>
        <Field label="Medical Card (R&B / Annual Limit)"><input style={inp} value={f.medicalCard ?? ''} onChange={e => set('medicalCard')(e.target.value)} placeholder="e.g. 250/day · 2M" /></Field>
        <Field label="Beneficiary"><input style={inp} value={f.beneficiary ?? ''} onChange={e => set('beneficiary')(e.target.value)} /></Field>
      </Grid>

      <div style={{ marginTop: 14 }}>
        <label style={lbl}>Benefits</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COMMON_BENEFITS.map(b => {
            const on = (f.benefits ?? []).includes(b);
            return (
              <button key={b} type="button" onClick={() => toggleBenefit(b)} style={{
                padding: '5px 11px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer',
                border: `1px solid ${on ? '#F37338' : 'var(--border)'}`,
                background: on ? 'rgba(243,115,56,0.12)' : 'var(--surface)',
                color: on ? '#F37338' : 'var(--text3)',
              }}>{on ? '✓ ' : ''}{b}</button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={lbl}>Notes</label>
        <textarea value={f.notes ?? ''} onChange={e => set('notes')(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </div>

      <Footer err={err} saving={saving} onClose={onClose} onSave={save} />
    </Overlay>
  );
}
