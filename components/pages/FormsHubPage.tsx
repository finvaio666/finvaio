'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Overlay, Field, fieldInput as inp } from '@/components/PortfolioFormModal';
import { useClients } from '@/components/useClients';
import { CLIENT_DATA_KEYS, FieldMapping } from '@/lib/formsLibrary';

interface HubForm {
  id: string; name: string; provider: string; category: string; tags: string[]; formType: string;
}

const keyLabel: Record<string, string> = Object.fromEntries(CLIENT_DATA_KEYS.map(k => [k.key, k.label]));

export default function FormsHubPage() {
  const [forms, setForms]     = useState<HubForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState('');
  const [provider, setProvider] = useState('');
  const [fillForm, setFillForm] = useState<HubForm | null>(null);

  useEffect(() => {
    fetch('/api/forms')
      .then(r => r.json())
      .then(d => { if (d.forms) setForms(d.forms); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const providers = useMemo(() => [...new Set(forms.map(f => f.provider).filter(Boolean))].sort(), [forms]);

  const visible = forms.filter(f => {
    if (provider && f.provider !== provider) return false;
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
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '10px 20px', flexWrap: 'wrap' }}>
          <input
            style={{ ...inp, maxWidth: 280 }}
            placeholder="Search forms, provider, tags…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select style={{ ...inp, maxWidth: 200 }} value={provider} onChange={e => setProvider(e.target.value)}>
            <option value="">All providers</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
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
                  </div>
                  {f.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {f.tags.map(t => (
                        <span key={t} style={{ fontSize: 11, background: 'var(--surface2)', color: 'var(--text3)', padding: '2px 8px', borderRadius: 999 }}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                    <button className="section-action" onClick={() => setFillForm(f)}>Fill &amp; Download</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {fillForm && <FillModal form={fillForm} onClose={() => setFillForm(null)} />}
    </div>
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

  const fields = mapping?.type === 'fillable' ? mapping.fields : [];

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
            This form has no mapped fillable fields yet. Ask an admin to map it in Forms Library.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '45vh', overflowY: 'auto', paddingRight: 4 }}>
            {fields.map(f => (
              <div key={f.pdfField}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 }}>
                  {f.pdfField}
                  {f.dataKey !== '__manual' && (
                    <span style={{ fontWeight: 400, marginLeft: 6 }}>← {keyLabel[f.dataKey] ?? f.dataKey}</span>
                  )}
                </label>
                <input style={inp} value={values[f.pdfField] ?? ''} onChange={e => setField(f.pdfField, e.target.value)} />
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
