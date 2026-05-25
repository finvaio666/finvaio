'use client';

import { useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────────────── */
type ProductType = 'insurance' | 'fund';

interface InsuranceForm {
  name: string; insurer: string; type: string;
  minAge: string; maxAge: string;
  minSumAssured: string; maxSumAssured: string;
  estMonthlyPremium: string; keyFeatures: string; epfApproved: boolean;
}

interface FundForm {
  name: string; fundHouse: string; assetClass: string; region: string;
  riskLevel: string; return3Y: string; minInvestment: string;
  salesCharge: string; epfApproved: boolean; description: string;
}

const BLANK_INS: InsuranceForm = {
  name: '', insurer: '', type: 'Life',
  minAge: '', maxAge: '', minSumAssured: '', maxSumAssured: '',
  estMonthlyPremium: '', keyFeatures: '', epfApproved: false,
};

const BLANK_FUND: FundForm = {
  name: '', fundHouse: '', assetClass: 'Equity', region: 'Malaysia',
  riskLevel: 'Moderate', return3Y: '', minInvestment: '',
  salesCharge: '', epfApproved: false, description: '',
};

const INS_TYPES   = ['Life', 'Critical Illness', 'Medical', 'Investment-Linked', 'Takaful', 'Personal Accident', 'Others'];
const ASSET_CLS   = ['Equity', 'Bond', 'Mixed', 'Money Market', 'Real Estate', 'Others'];
const REGIONS     = ['Malaysia', 'Asia Pacific', 'Global', 'Regional', 'Others'];
const RISK_LEVELS = ['Conservative', 'Moderate', 'Aggressive'];

/* ── Sub-components ──────────────────────────────────────────────────────── */
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{hint}</span>}
    </div>
  );
}

const inputSx: React.CSSProperties = {
  padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const selectSx: React.CSSProperties = { ...inputSx, cursor: 'pointer' };

/* ── Main Modal ───────────────────────────────────────────────────────────── */
interface Props { onClose: () => void; onSaved: () => void; }

export default function AddProductModal({ onClose, onSaved }: Props) {
  const [mode, setMode]               = useState<'ai' | 'manual'>('ai');
  const [productType, setProductType] = useState<ProductType>('insurance');
  const [pasteText, setPasteText]     = useState('');
  const [extracting, setExtracting]   = useState(false);
  const [extractErr, setExtractErr]   = useState('');
  const [saving, setSaving]           = useState(false);
  const [saveErr, setSaveErr]         = useState('');

  const [insForm, setInsForm]   = useState<InsuranceForm>(BLANK_INS);
  const [fundForm, setFundForm] = useState<FundForm>(BLANK_FUND);
  const [formReady, setFormReady] = useState(false); // true after AI fills or user switches to manual

  /* ── AI Extract ─────────────────────────────────────────────────────── */
  async function handleExtract() {
    if (!pasteText.trim()) return;
    setExtracting(true); setExtractErr('');
    try {
      const res  = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract', text: pasteText }),
      });
      const data = await res.json();
      if (!res.ok) { setExtractErr(data.error ?? 'Extraction failed.'); return; }

      const p = data.data;
      if (p.productType === 'fund') {
        setProductType('fund');
        setFundForm({
          name:         p.name         ?? '',
          fundHouse:    p.fundHouse     ?? '',
          assetClass:   p.assetClass    ?? 'Equity',
          region:       p.region        ?? 'Malaysia',
          riskLevel:    p.riskLevel     ?? 'Moderate',
          return3Y:     p.return3Y      != null ? String(p.return3Y) : '',
          minInvestment: p.minInvestment != null ? String(p.minInvestment) : '',
          salesCharge:  p.salesCharge   != null ? String(p.salesCharge) : '',
          epfApproved:  Boolean(p.epfApproved),
          description:  p.description   ?? '',
        });
      } else {
        setProductType('insurance');
        setInsForm({
          name:              p.name               ?? '',
          insurer:           p.insurer             ?? '',
          type:              p.type                ?? 'Life',
          minAge:            p.minAge              != null ? String(p.minAge) : '',
          maxAge:            p.maxAge              != null ? String(p.maxAge) : '',
          minSumAssured:     p.minSumAssured       != null ? String(p.minSumAssured) : '',
          maxSumAssured:     p.maxSumAssured       != null ? String(p.maxSumAssured) : '',
          estMonthlyPremium: p.estMonthlyPremium   ?? '',
          keyFeatures:       p.keyFeatures         ?? '',
          epfApproved:       Boolean(p.epfApproved),
        });
      }
      setFormReady(true);
    } catch {
      setExtractErr('Connection error. Please try again.');
    } finally {
      setExtracting(false);
    }
  }

  /* ── Save ────────────────────────────────────────────────────────────── */
  async function handleSave() {
    setSaving(true); setSaveErr('');
    const product = productType === 'insurance'
      ? { ...insForm, minAge: insForm.minAge ? Number(insForm.minAge) : null, maxAge: insForm.maxAge ? Number(insForm.maxAge) : null, minSumAssured: insForm.minSumAssured ? Number(insForm.minSumAssured) : null, maxSumAssured: insForm.maxSumAssured ? Number(insForm.maxSumAssured) : null }
      : { ...fundForm, return3Y: fundForm.return3Y ? Number(fundForm.return3Y) : null, minInvestment: fundForm.minInvestment ? Number(fundForm.minInvestment) : null, salesCharge: fundForm.salesCharge ? Number(fundForm.salesCharge) : null };

    try {
      const res  = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', productType, product }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveErr(data.error ?? 'Save failed.'); return; }
      onSaved();
    } catch {
      setSaveErr('Connection error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px', border: 'none', borderRadius: 'var(--r-sm)',
    background: active ? 'var(--text)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--text3)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
    transition: 'all 0.15s',
  });

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--r)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          width: '100%', maxWidth: 620, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Add Product</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                Paste product text for AI extraction, or fill in manually
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text3)', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
          </div>

          {/* Mode tabs */}
          <div style={{ padding: '12px 24px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', padding: 4, borderRadius: 'var(--r-sm)' }}>
              <button style={tabStyle(mode === 'ai')}     onClick={() => setMode('ai')}>
                🤖 AI Extract
              </button>
              <button style={tabStyle(mode === 'manual')} onClick={() => { setMode('manual'); setFormReady(true); }}>
                ✏️ Manual Entry
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

            {/* ── AI EXTRACT MODE ── */}
            {mode === 'ai' && !formReady && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                  Open the insurance brochure or fund factsheet PDF, <strong>select all text</strong> (Ctrl+A), copy, then paste below.
                  ARIA will extract the product details automatically.
                </div>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Paste product description, fund factsheet, or insurance brochure text here…"
                  rows={10}
                  style={{ ...inputSx, resize: 'vertical', lineHeight: 1.5 }}
                />
                {extractErr && (
                  <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(235,0,27,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
                    ⚠️ {extractErr}
                  </div>
                )}
                <button
                  onClick={handleExtract}
                  disabled={extracting || !pasteText.trim()}
                  style={{
                    padding: '12px', borderRadius: 'var(--r-sm)', border: 'none',
                    background: extracting || !pasteText.trim() ? 'var(--surface2)' : 'var(--accent2)',
                    color: extracting || !pasteText.trim() ? 'var(--text3)' : '#fff',
                    fontSize: 14, fontWeight: 700, cursor: extracting || !pasteText.trim() ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {extracting ? (
                    <>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                      Extracting with AI…
                    </>
                  ) : '✨ Extract Product Data'}
                </button>
              </div>
            )}

            {/* ── FORM (both modes after extract / manual) ── */}
            {formReady && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Product type selector */}
                <Field label="Product Type">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['insurance', 'fund'] as ProductType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setProductType(t)}
                        style={{
                          flex: 1, padding: '9px', borderRadius: 'var(--r-sm)',
                          border: '1.5px solid', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                          background: productType === t ? 'var(--accent2)' : 'var(--bg)',
                          color:      productType === t ? '#fff' : 'var(--text3)',
                          borderColor: productType === t ? 'var(--accent2)' : 'var(--border)',
                        }}
                      >
                        {t === 'insurance' ? '🛡️ Insurance Plan' : '📈 Investment Fund'}
                      </button>
                    ))}
                  </div>
                </Field>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

                {/* ── Insurance fields ── */}
                {productType === 'insurance' && (
                  <>
                    <Field label="Plan Name *">
                      <input style={inputSx} value={insForm.name} onChange={e => setInsForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AIA A-Life Lady Care" />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field label="Insurer *">
                        <input style={inputSx} value={insForm.insurer} onChange={e => setInsForm(f => ({ ...f, insurer: e.target.value }))} placeholder="e.g. AIA" />
                      </Field>
                      <Field label="Type *">
                        <select style={selectSx} value={insForm.type} onChange={e => setInsForm(f => ({ ...f, type: e.target.value }))}>
                          {INS_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </Field>
                      <Field label="Min Age">
                        <input style={inputSx} type="number" value={insForm.minAge} onChange={e => setInsForm(f => ({ ...f, minAge: e.target.value }))} placeholder="18" />
                      </Field>
                      <Field label="Max Age">
                        <input style={inputSx} type="number" value={insForm.maxAge} onChange={e => setInsForm(f => ({ ...f, maxAge: e.target.value }))} placeholder="65" />
                      </Field>
                      <Field label="Min Sum Assured (RM)">
                        <input style={inputSx} type="number" value={insForm.minSumAssured} onChange={e => setInsForm(f => ({ ...f, minSumAssured: e.target.value }))} placeholder="50000" />
                      </Field>
                      <Field label="Max Sum Assured (RM)">
                        <input style={inputSx} type="number" value={insForm.maxSumAssured} onChange={e => setInsForm(f => ({ ...f, maxSumAssured: e.target.value }))} placeholder="5000000" />
                      </Field>
                    </div>
                    <Field label="Est. Monthly Premium" hint='e.g. "RM 150–400"'>
                      <input style={inputSx} value={insForm.estMonthlyPremium} onChange={e => setInsForm(f => ({ ...f, estMonthlyPremium: e.target.value }))} placeholder="RM 150–400" />
                    </Field>
                    <Field label="Key Features" hint="Separate each point with ·">
                      <textarea style={{ ...inputSx, resize: 'vertical' }} rows={3} value={insForm.keyFeatures} onChange={e => setInsForm(f => ({ ...f, keyFeatures: e.target.value }))} placeholder="Covers 100 critical illnesses · Waiver of premium on CI · Renewable to age 100" />
                    </Field>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={insForm.epfApproved} onChange={e => setInsForm(f => ({ ...f, epfApproved: e.target.checked }))} />
                      EPF Approved
                    </label>
                  </>
                )}

                {/* ── Fund fields ── */}
                {productType === 'fund' && (
                  <>
                    <Field label="Fund Name *">
                      <input style={inputSx} value={fundForm.name} onChange={e => setFundForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AHAM Select Income Fund" />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field label="Fund House *">
                        <input style={inputSx} value={fundForm.fundHouse} onChange={e => setFundForm(f => ({ ...f, fundHouse: e.target.value }))} placeholder="e.g. AHAM Capital" />
                      </Field>
                      <Field label="Asset Class *">
                        <select style={selectSx} value={fundForm.assetClass} onChange={e => setFundForm(f => ({ ...f, assetClass: e.target.value }))}>
                          {ASSET_CLS.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </Field>
                      <Field label="Region">
                        <select style={selectSx} value={fundForm.region} onChange={e => setFundForm(f => ({ ...f, region: e.target.value }))}>
                          {REGIONS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </Field>
                      <Field label="Risk Level *">
                        <select style={selectSx} value={fundForm.riskLevel} onChange={e => setFundForm(f => ({ ...f, riskLevel: e.target.value }))}>
                          {RISK_LEVELS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </Field>
                      <Field label="3Y Annualised Return (%)">
                        <input style={inputSx} type="number" step="0.1" value={fundForm.return3Y} onChange={e => setFundForm(f => ({ ...f, return3Y: e.target.value }))} placeholder="8.5" />
                      </Field>
                      <Field label="Min Investment (RM)">
                        <input style={inputSx} type="number" value={fundForm.minInvestment} onChange={e => setFundForm(f => ({ ...f, minInvestment: e.target.value }))} placeholder="1000" />
                      </Field>
                      <Field label="Sales Charge (%)">
                        <input style={inputSx} type="number" step="0.1" value={fundForm.salesCharge} onChange={e => setFundForm(f => ({ ...f, salesCharge: e.target.value }))} placeholder="3.0" />
                      </Field>
                    </div>
                    <Field label="Description">
                      <textarea style={{ ...inputSx, resize: 'vertical' }} rows={3} value={fundForm.description} onChange={e => setFundForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the fund's strategy and who it suits…" />
                    </Field>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={fundForm.epfApproved} onChange={e => setFundForm(f => ({ ...f, epfApproved: e.target.checked }))} />
                      EPF Approved
                    </label>
                  </>
                )}

                {saveErr && (
                  <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(235,0,27,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
                    ⚠️ {saveErr}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {formReady && (
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
              {mode === 'ai' && (
                <button onClick={() => setFormReady(false)} style={{ padding: '10px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  ← Re-extract
                </button>
              )}
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 2, padding: '10px', borderRadius: 'var(--r-sm)', border: 'none',
                  background: saving ? 'var(--surface2)' : 'var(--text)',
                  color: saving ? 'var(--text3)' : 'var(--bg)',
                  fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {saving ? (
                  <>
                    <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--text)', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    Saving…
                  </>
                ) : '💾 Save to Catalogue'}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
