'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Overlay, Grid, Field, Select, Footer, fieldInput as inp } from '@/components/PortfolioFormModal';
import { useClients } from '@/components/useClients';
import { CLIENT_DATA_KEYS, FORM_CATEGORIES, FieldMapping } from '@/lib/formsLibrary';

interface HubForm {
  id: string; name: string; provider: string; category: string; tags: string[]; formType: string;
  hasFill?: boolean;
  // Present only when fetched via the admin listing (Admin / Sky Siew).
  active?: boolean;
  fieldMapping?: FieldMapping | null;
}

/** A form has an auto-fill flow when it has a fillable or overlay mapping with fields. */
function computeHasFill(m?: FieldMapping | null): boolean {
  return !!m && (m.type === 'fillable' || m.type === 'overlay') && (m.fields?.length ?? 0) > 0;
}

const keyLabel: Record<string, string> = Object.fromEntries(CLIENT_DATA_KEYS.map(k => [k.key, k.label]));

/** Trigger a browser download of a form's blank PDF (same-origin, cookies sent). */
function downloadBlank(id: string) {
  const a = document.createElement('a');
  a.href = `/api/forms/${id}/download`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function FormsHubPage() {
  const [role, setRole] = useState<{ isAdmin: boolean; isAdminOrSky: boolean } | null>(null);
  const [forms, setForms]     = useState<HubForm[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState('');
  const [provider, setProvider] = useState('');
  const [category, setCategory] = useState('');
  const [fillForm, setFillForm] = useState<HubForm | null>(null);
  const [showMatch, setShowMatch] = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [mappingForm, setMappingForm] = useState<HubForm | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      setRole({ isAdmin: d.role === 'Admin', isAdminOrSky: d.role === 'Admin' || d.name === 'Sky Siew' });
    }).catch(() => setRole({ isAdmin: false, isAdminOrSky: false }));
  }, []);

  const load = useCallback(() => {
    if (!role) return;
    setLoading(true);
    const url = role.isAdminOrSky ? '/api/admin/forms-library' : '/api/forms';
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.forms) {
          setForms(role.isAdminOrSky
            ? d.forms.map((f: HubForm) => ({ ...f, hasFill: computeHasFill(f.fieldMapping) }))
            : d.forms);
        }
        if (d.storageReady !== undefined) setStorageReady(d.storageReady);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [role]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(f: HubForm) {
    await fetch(`/api/admin/forms-library/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !f.active }),
    });
    load();
  }

  async function deleteForm(f: HubForm) {
    if (!confirm(`Remove "${f.name}" from the Forms library?`)) return;
    await fetch(`/api/admin/forms-library/${f.id}`, { method: 'DELETE' });
    load();
  }

  const providers = useMemo(() => [...new Set(forms.map(f => f.provider).filter(Boolean))].sort(), [forms]);
  const providerCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of forms) if (f.provider) m[f.provider] = (m[f.provider] || 0) + 1;
    return m;
  }, [forms]);
  const categories = useMemo(
    () => [...new Set(forms.filter(f => !provider || f.provider === provider).map(f => f.category).filter(Boolean))].sort(),
    [forms, provider],
  );

  const visible = forms.filter(f => {
    if (provider && f.provider !== provider) return false;
    if (category && f.category !== category) return false;
    if (!q) return true;
    const hay = `${f.name} ${f.provider} ${f.category} ${f.tags.join(' ')}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-dot" style={{ background: 'var(--gold)' }} />
            Forms
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="section-action" onClick={() => setShowMatch(true)}>Match from letter</button>
            {role?.isAdminOrSky && (
              <button className="section-action" onClick={() => setShowAdd(true)} disabled={!storageReady}>+ Add Form</button>
            )}
          </div>
        </div>

        {role?.isAdminOrSky && !storageReady && (
          <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text3)' }}>
            File storage is not configured. Set the storage environment variables before uploading forms.
          </div>
        )}

        {/* Step 1 — pick a company (provider) first. */}
        {!provider ? (
          <div style={{ padding: '12px 20px' }}>
            {loading ? (
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
            ) : providers.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>No forms available yet.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 10 }}>Select a company to view its forms:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {providers.map(p => (
                    <button
                      key={p}
                      onClick={() => { setProvider(p); setCategory(''); setQ(''); }}
                      style={{ textAlign: 'left', border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{p}</span>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>{providerCounts[p]} form{providerCounts[p] > 1 ? 's' : ''}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
        <div style={{ display: 'flex', gap: 10, padding: '10px 20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="section-action" onClick={() => { setProvider(''); setCategory(''); setQ(''); }}>← All companies</button>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{provider}</span>
          <input
            style={{ ...inp, maxWidth: 260, marginLeft: 'auto' }}
            placeholder="Search forms, tags…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select style={{ ...inp, maxWidth: 220 }} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ padding: '12px 20px' }}>
          {loading ? (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>No forms found.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {visible.map(f => (
                <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {[f.provider, f.category].filter(Boolean).join(' · ')}
                    {role?.isAdminOrSky && f.active === false && (
                      <span style={{ marginLeft: 8, color: 'var(--red)' }}>Inactive</span>
                    )}
                  </div>
                  {f.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {f.tags.map(t => (
                        <span key={t} style={{ fontSize: 11, background: 'var(--surface2)', color: 'var(--text3)', padding: '2px 8px', borderRadius: 999 }}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="section-action" onClick={() => downloadBlank(f.id)}>Download</button>
                    {(f.hasFill ?? f.formType === 'Fillable PDF') && (
                      <button className="section-action" onClick={() => setFillForm(f)}>Fill &amp; Download</button>
                    )}
                    {role?.isAdminOrSky && f.formType === 'Fillable PDF' && (
                      <button className="section-action" onClick={() => setMappingForm(f)}>Map fields</button>
                    )}
                    {role?.isAdmin && (
                      <>
                        <button className="section-action" onClick={() => toggleActive(f)}>{f.active ? 'Disable' : 'Enable'}</button>
                        <button className="section-action" onClick={() => deleteForm(f)}>Remove</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {fillForm && <FillModal form={fillForm} onClose={() => setFillForm(null)} />}
      {showMatch && (
        <MatchModal
          providers={providers}
          onClose={() => setShowMatch(false)}
          onFill={(f) => { setShowMatch(false); setFillForm(f); }}
        />
      )}
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

function MatchModal({ providers, onClose, onFill }: {
  providers: string[];
  onClose: () => void;
  onFill: (f: HubForm) => void;
}) {
  const [letterText, setLetterText] = useState('');
  const [provider, setProvider] = useState('');
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<HubForm[] | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const [err, setErr] = useState('');

  async function run() {
    if (letterText.trim().length < 10) { setErr('Paste the letter text first.'); return; }
    setMatching(true); setErr(''); setMatches(null);
    try {
      const res = await fetch('/api/forms/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterText, provider: provider || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? 'Match failed'); setMatching(false); return; }
      setMatches(d.matches ?? []);
      setUsedAI(!!d.usedAI);
    } catch {
      setErr('Match failed');
    }
    setMatching(false);
  }

  return (
    <Overlay onClose={onClose} title="Find forms from a deferment / requirements letter">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Provider (optional — narrows the search)">
          <select style={inp} value={provider} onChange={e => setProvider(e.target.value)}>
            <option value="">All providers</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Paste the letter text">
          <textarea
            style={{ ...inp, minHeight: 140, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Paste the insurer's deferment / requirements letter here…"
            value={letterText}
            onChange={e => setLetterText(e.target.value)}
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--text3)', cursor: 'pointer' }}>Close</button>
            <button onClick={run} disabled={matching} style={{ padding: '9px 22px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer', opacity: matching ? 0.5 : 1 }}>
              {matching ? 'Finding…' : 'Find forms'}
            </button>
          </div>
        </div>

        {matches !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {matches.length === 0
                ? 'No matching forms found. Try removing the provider filter or search manually.'
                : `${matches.length} matching form${matches.length > 1 ? 's' : ''}${usedAI ? ' (AI-matched)' : ''}:`}
            </div>
            {matches.map(f => (
              <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{[f.provider, f.category].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="section-action" onClick={() => downloadBlank(f.id)}>Download</button>
                {(f.hasFill ?? f.formType === 'Fillable PDF') && (
                  <button className="section-action" onClick={() => onFill(f)}>Fill &amp; Download</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Overlay>
  );
}

interface PickOpt { id: string; label: string; }

function FillModal({ form, onClose }: { form: HubForm; onClose: () => void }) {
  const { clients, loading: clientsLoading } = useClients();
  const [clientId, setClientId] = useState('');
  const [mapping, setMapping]   = useState<FieldMapping | null>(null);
  const [values, setValues]     = useState<Record<string, string>>({});
  const [policies, setPolicies] = useState<PickOpt[]>([]);
  const [accounts, setAccounts] = useState<PickOpt[]>([]);
  const [policyId, setPolicyId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loadingMap, setLoadingMap] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState('');

  // Load the form's field mapping once.
  useEffect(() => {
    fetch(`/api/forms/${form.id}`)
      .then(r => r.json())
      .then(d => setMapping(d.form?.fieldMapping ?? null))
      .catch(() => setErr('Failed to load form'))
      .finally(() => setLoadingMap(false));
  }, [form.id]);

  // Resolve prefill values whenever the client / policy / account changes.
  const loadPrefill = useCallback((cid: string, pid: string, aid: string) => {
    if (!cid) return;
    const params = new URLSearchParams({ clientId: cid });
    if (pid) params.set('policyId', pid);
    if (aid) params.set('accountId', aid);
    fetch(`/api/forms/${form.id}/prefill?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (d.values) setValues(v => ({ ...v, ...d.values }));
        if (d.policies) setPolicies(d.policies);
        if (d.accounts) setAccounts(d.accounts);
      })
      .catch(() => {});
  }, [form.id]);

  function onClientChange(cid: string) {
    setClientId(cid);
    setPolicyId(''); setAccountId('');
    setValues({});
    loadPrefill(cid, '', '');
  }

  function setField(pdfField: string, val: string) {
    setValues(v => ({ ...v, [pdfField]: val }));
  }

  async function generate() {
    setGenerating(true); setErr('');
    try {
      const res = await fetch(`/api/forms/${form.id}/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldValues: values }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Failed to generate PDF');
        setGenerating(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setErr('Failed to generate PDF');
      setGenerating(false);
    }
  }

  // Normalize both mapping types to { key, label } — key aligns with the prefill
  // response and the fill payload (pdfField for fillable, index for overlay).
  const fields: { key: string; label: string }[] =
    mapping?.type === 'fillable'
      ? mapping.fields.map(f => ({
          key: 'pdfField' in f ? f.pdfField : '',
          label: ('pdfField' in f ? f.pdfField : '') + (f.dataKey !== '__manual' ? `  ←  ${keyLabel[f.dataKey] ?? f.dataKey}` : ''),
        }))
      : mapping?.type === 'overlay'
      ? mapping.fields.map((f, i) => ({
          key: String(i),
          label: ('label' in f && f.label) ? f.label : (keyLabel[f.dataKey] ?? f.dataKey),
        }))
      : [];

  return (
    <Overlay onClose={onClose} title={`Fill — ${form.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Client">
          <select style={inp} value={clientId} onChange={e => onClientChange(e.target.value)} disabled={clientsLoading}>
            <option value="">{clientsLoading ? 'Loading clients…' : '— Select client —'}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {policies.length > 1 && (
          <Field label="Policy (for policy fields)">
            <select style={inp} value={policyId} onChange={e => { setPolicyId(e.target.value); loadPrefill(clientId, e.target.value, accountId); }}>
              <option value="">— Select policy —</option>
              {policies.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
        )}
        {accounts.length > 1 && (
          <Field label="Account (for account fields)">
            <select style={inp} value={accountId} onChange={e => { setAccountId(e.target.value); loadPrefill(clientId, policyId, e.target.value); }}>
              <option value="">— Select account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Field>
        )}

        {loadingMap ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading form fields…</div>
        ) : fields.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            This form has no mapped fillable fields yet. Ask an admin to map it (Map fields, on the Forms page).
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '45vh', overflowY: 'auto', paddingRight: 4 }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 }}>
                  {f.label}
                </label>
                <input style={inp} value={values[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--text3)', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={generate}
            disabled={generating || !clientId || fields.length === 0}
            style={{ padding: '9px 22px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer', opacity: (generating || !clientId || fields.length === 0) ? 0.5 : 1 }}
          >
            {generating ? 'Generating…' : 'Generate & Download'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Admin: add / map forms (merged in from the former Forms Library page) ──────

function AddFormModal({ onClose, onSaved, onMap }: {
  onClose: () => void;
  onSaved: () => void;
  onMap: (f: HubForm) => void;
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
      onMap({
        id: d.id, name, provider, category,
        tags: tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        formType: 'Fillable PDF', fieldMapping: d.fieldMapping, active: true,
      });
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

const fieldMapLbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 };

function FieldMappingModal({ form, onClose, onSaved }: {
  form: HubForm;
  onClose: () => void;
  onSaved: () => void;
}) {
  // This modal only maps AcroForm (fillable) forms → narrow to fields with pdfField.
  const [fields, setFields] = useState<{ pdfField: string; dataKey: string }[]>(
    (form.fieldMapping?.fields ?? []).filter((f): f is { pdfField: string; dataKey: string } => 'pdfField' in f),
  );
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
                <label style={fieldMapLbl}>PDF Field</label>
                <div style={{ fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all' }}>{f.pdfField}</div>
              </div>
              <div>
                <label style={fieldMapLbl}>Maps to</label>
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
