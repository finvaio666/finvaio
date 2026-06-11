'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { Overlay, Grid, Field, Select, Footer, fieldInput as inp } from '@/components/PortfolioFormModal';
import { CLIENT_DATA_KEYS, FORM_CATEGORIES, FormRecord } from '@/lib/formsLibrary';

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 };

function FormsLibraryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [allowed, setAllowed]   = useState<boolean | null>(null);
  const [forms, setForms]       = useState<FormRecord[]>([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [mappingForm, setMappingForm] = useState<FormRecord | null>(null);
  const [notice, setNotice]     = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.role === 'Admin' || d.name === 'Sky Siew') setAllowed(true);
      else { setAllowed(false); router.replace('/'); }
    }).catch(() => { setAllowed(false); router.replace('/'); });
  }, [router]);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/forms-library')
      .then(r => r.json())
      .then(d => {
        if (d.forms) setForms(d.forms);
        if (d.driveConnected !== undefined) setDriveConnected(d.driveConnected);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  const connectedParam = searchParams.get('connected');
  const errorParam = searchParams.get('error');
  useEffect(() => {
    if (connectedParam) setNotice('Google Drive connected.');
    if (errorParam) setNotice(`Error: ${errorParam}`);
  }, [connectedParam, errorParam]);

  async function connectDrive() {
    const res = await fetch('/api/admin/drive-auth');
    const d = await res.json();
    if (d.url) window.location.href = d.url;
    else setNotice(d.error ?? 'Failed to start Drive connection');
  }

  async function toggleActive(f: FormRecord) {
    await fetch(`/api/admin/forms-library/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !f.active }),
    });
    load();
  }

  async function deleteForm(f: FormRecord) {
    if (!confirm(`Remove "${f.name}" from the Forms Library?`)) return;
    await fetch(`/api/admin/forms-library/${f.id}`, { method: 'DELETE' });
    load();
  }

  if (allowed !== true) {
    return <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>Loading…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--gold)' }} />
            Forms Library — Admin
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!driveConnected && (
              <button className="section-action" onClick={connectDrive}>Connect Google Drive</button>
            )}
            <button className="section-action" onClick={() => setShowAdd(true)} disabled={!driveConnected}>+ Add Form</button>
          </div>
        </div>

        {notice && <div style={{ padding: '8px 20px', fontSize: 12.5, color: 'var(--text3)' }}>{notice}</div>}

        {!driveConnected && (
          <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text3)' }}>
            Connect Google Drive to start uploading provider forms (PDFs are stored in a folder called &quot;ARIA Forms Library&quot; in your Drive).
          </div>
        )}

        <div style={{ padding: '12px 20px' }}>
          {loading ? (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
          ) : forms.length === 0 ? (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>No forms yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '8px 6px' }}>Form</th>
                  <th style={{ padding: '8px 6px' }}>Provider</th>
                  <th style={{ padding: '8px 6px' }}>Category</th>
                  <th style={{ padding: '8px 6px' }}>Type</th>
                  <th style={{ padding: '8px 6px' }}>Active</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {forms.map(f => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                      <a href={f.pdfUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text)' }}>{f.name}</a>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{f.provider}</td>
                    <td style={{ padding: '8px 6px' }}>{f.category}</td>
                    <td style={{ padding: '8px 6px' }}>{f.formType}</td>
                    <td style={{ padding: '8px 6px' }}>{f.active ? '✅' : '—'}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {f.formType === 'Fillable PDF' && (
                        <button className="section-action" style={{ marginRight: 8 }} onClick={() => setMappingForm(f)}>Map fields</button>
                      )}
                      <button className="section-action" style={{ marginRight: 8 }} onClick={() => toggleActive(f)}>{f.active ? 'Disable' : 'Enable'}</button>
                      <button className="section-action" onClick={() => deleteForm(f)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && (
        <AddFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
          onMap={(f) => { setShowAdd(false); load(); setMappingForm(f); }}
        />
      )}

      {mappingForm && (
        <FieldMappingModal
          form={mappingForm}
          onClose={() => setMappingForm(null)}
          onSaved={() => { setMappingForm(null); load(); }}
        />
      )}
    </div>
  );
}

function AddFormModal({ onClose, onSaved, onMap }: {
  onClose: () => void;
  onSaved: () => void;
  onMap: (f: FormRecord) => void;
}) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [formType, setFormType] = useState('Fillable PDF');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim() || !provider.trim() || !file) { setErr('Form name, provider and PDF file are required.'); return; }
    setSaving(true); setErr('');
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('provider', provider.trim());
    fd.append('category', category);
    fd.append('tags', tags);
    fd.append('formType', formType);
    fd.append('file', file);

    const res = await fetch('/api/admin/forms-library', { method: 'POST', body: fd });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(d.error ?? 'Upload failed'); return; }

    if (formType === 'Fillable PDF' && d.id) {
      onMap({ id: d.id, name, provider, category, tags: tags.split(',').map(t => t.trim()).filter(Boolean), formType: 'Fillable PDF', pdfUrl: d.pdfUrl, fieldMapping: d.fieldMapping, active: true });
    } else {
      onSaved();
    }
  }

  return (
    <Overlay onClose={onClose} title="Add Form">
      <Grid>
        <Field label="Form Name *"><input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Beneficiary Change Form" /></Field>
        <Field label="Provider *"><input style={inp} value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. AIA" /></Field>
        <Field label="Category"><Select value={category} opts={FORM_CATEGORIES} onChange={setCategory} /></Field>
        <Field label="Tags (comma separated)"><input style={inp} value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. fund switch, EPF" /></Field>
        <Field label="Form Type">
          <select value={formType} onChange={e => setFormType(e.target.value)} style={inp}>
            <option value="Fillable PDF">Fillable PDF</option>
            <option value="Scanned PDF">Scanned PDF</option>
          </select>
        </Field>
        <Field label="PDF File *"><input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} style={inp} /></Field>
      </Grid>
      <Footer err={err} saving={saving} onClose={onClose} onSave={save} />
    </Overlay>
  );
}

function FieldMappingModal({ form, onClose, onSaved }: {
  form: FormRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState(form.fieldMapping?.fields ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function setMapping(pdfField: string, dataKey: string) {
    setFields(fs => fs.map(f => f.pdfField === pdfField ? { ...f, dataKey } : f));
  }

  async function save() {
    setSaving(true); setErr('');
    const res = await fetch(`/api/admin/forms-library/${form.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldMapping: { type: 'fillable', fields } }),
    });
    setSaving(false);
    if (!res.ok) { setErr('Save failed'); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose} title={`Map Fields — ${form.name}`}>
      {fields.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          No fillable fields were detected in this PDF. It may need to be treated as a Scanned PDF instead.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '50vh', overflowY: 'auto' }}>
          {fields.map(f => (
            <div key={f.pdfField} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
              <div>
                <label style={lbl}>PDF Field</label>
                <div style={{ fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all' }}>{f.pdfField}</div>
              </div>
              <div>
                <label style={lbl}>Maps to</label>
                <select value={f.dataKey} onChange={e => setMapping(f.pdfField, e.target.value)} style={inp}>
                  {CLIENT_DATA_KEYS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
      <Footer err={err} saving={saving} onClose={onClose} onSave={save} />
    </Overlay>
  );
}

export default function FormsLibraryPage() {
  return (
    <Suspense fallback={<div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>Loading…</div>}>
      <FormsLibraryInner />
    </Suspense>
  );
}
