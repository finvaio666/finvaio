'use client';

import { useState } from 'react';
import { Overlay, Field, Footer, fieldInput } from '@/components/PortfolioFormModal';
import { NW_ASSETS, NW_LIABILITIES, type NWItem } from '@/lib/networthForm';

export interface ExistingAssetItem {
  name:  string;
  value: number;
}

function buildInitial(items?: ExistingAssetItem[]) {
  const f: Record<string, number | undefined> = {};
  if (!items) return f;
  for (const it of [...NW_ASSETS, ...NW_LIABILITIES]) {
    const match = items.find(x => x.name === it.label);
    if (match && match.value) f[it.key] = match.value;
  }
  return f;
}

function ItemGrid({ items, f, set }: { items: NWItem[]; f: Record<string, number | undefined>; set: (k: string) => (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {items.map(it => (
        <Field key={it.key} label={it.label}>
          <input style={fieldInput} type="number" value={f[it.key] ?? ''} onChange={e => set(it.key)(e.target.value)} placeholder="0" />
        </Field>
      ))}
    </div>
  );
}

function sectionTotal(items: NWItem[], f: Record<string, number | undefined>) {
  return items.reduce((s, it) => s + (Number(f[it.key]) || 0), 0);
}

export default function NetWorthFormModal({ clientName, items, onClose, onSaved }: {
  clientName: string;
  items?:     ExistingAssetItem[]; // existing items, pre-filled by label
  onClose:    () => void;
  onSaved:    () => void;
}) {
  const [f, setF] = useState<Record<string, number | undefined>>(() => buildInitial(items));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string) => (v: string) => setF(s => ({ ...s, [k]: v === '' ? undefined : Number(v) }));

  const totalAssets      = sectionTotal(NW_ASSETS, f);
  const totalLiabilities = sectionTotal(NW_LIABILITIES, f);
  const netWorth          = totalAssets - totalLiabilities;

  async function save() {
    setSaving(true); setErr('');
    const res = await fetch('/api/networth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, items: f }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(d.error ?? 'Save failed'); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose} title="Update Assets & Liabilities">
      <SectionTitle label="Assets" total={totalAssets} color="var(--green)" />
      <ItemGrid items={NW_ASSETS} f={f} set={set} />

      <SectionTitle label="Liabilities" total={totalLiabilities} color="var(--red)" />
      <ItemGrid items={NW_LIABILITIES} f={f} set={set} />

      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
        <span style={{ color: 'var(--text)' }}>Net Worth</span>
        <span style={{ color: netWorth >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>{Math.round(netWorth).toLocaleString()}</span>
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
