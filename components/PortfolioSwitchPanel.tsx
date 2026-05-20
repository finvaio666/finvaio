'use client';

import { useState, useEffect } from 'react';

interface Holding {
  id: string;
  clientId: string;
  name: string;
  clientName: string;
  assetClass: string;
  institution: string;
  status: string;
  currency: string;
  valueOrig: number;
  value: number;
  purchaseOrig: number;
  fxRate: number;
}

interface NewFundForm {
  _key: number;
  name: string;
  assetClass: string;
  institution: string;
  currency: string;
  valueOrig: string;
  purchaseOrig: string;
  fxRate: string;
}

const ASSET_CLASSES = ['Unit Trust', 'EPF', 'PRS', 'Fixed Deposit', 'Stocks', 'Bonds', 'Money Market', 'Others'];
const CURRENCIES    = ['MYR', 'USD', 'SGD', 'GBP', 'EUR', 'AUD', 'HKD'];

const fmtNum = (n: number) =>
  n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `RM ${(n / 1_000).toFixed(1)}K`
  : `RM ${Math.round(n).toLocaleString()}`;

let _keyCounter = 0;
const nextKey = () => ++_keyCounter;

interface Props {
  holdings: Holding[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function PortfolioSwitchPanel({ holdings, onClose, onSuccess }: Props) {
  const [selectedClient, setSelectedClient] = useState('');
  const [redeemedMap,    setRedeemedMap]    = useState<Record<string, { action: 'full' | 'partial'; remainingMyr: string; remainingOrig: string }>>({});
  const [newFunds,       setNewFunds]       = useState<NewFundForm[]>([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState('');
  const [done,           setDone]           = useState(false);

  // sorted unique client list
  const clientNames = Array.from(new Set(
    holdings.filter(h => h.status?.toLowerCase().includes('active')).map(h => h.clientName).filter(Boolean)
  )).sort();

  // active holdings for selected client
  const clientHoldings = holdings.filter(
    h => h.clientName === selectedClient && h.status?.toLowerCase().includes('active')
  );

  // clientId from holdings (first match)
  const clientId = clientHoldings[0]?.clientId ?? '';

  // reset when client changes
  useEffect(() => {
    setRedeemedMap({});
    setNewFunds([]);
    setError('');
  }, [selectedClient]);

  const toggleRedeem = (id: string) => {
    setRedeemedMap(prev => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { action: 'full', remainingMyr: '', remainingOrig: '' } };
    });
  };

  const setAction = (id: string, action: 'full' | 'partial') => {
    setRedeemedMap(prev => ({ ...prev, [id]: { ...prev[id], action } }));
  };

  const setRemaining = (id: string, field: 'remainingMyr' | 'remainingOrig', val: string) => {
    setRedeemedMap(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  const addNewFund = () => {
    setNewFunds(prev => [...prev, {
      _key: nextKey(),
      name: '', assetClass: 'Unit Trust', institution: '', currency: 'MYR',
      valueOrig: '', purchaseOrig: '', fxRate: '1',
    }]);
  };

  const updateNewFund = (key: number, field: keyof Omit<NewFundForm, '_key'>, val: string) => {
    setNewFunds(prev => prev.map(f =>
      f._key === key
        ? { ...f, [field]: val, ...(field === 'currency' && val === 'MYR' ? { fxRate: '1' } : {}) }
        : f
    ));
  };

  const removeNewFund = (key: number) => setNewFunds(prev => prev.filter(f => f._key !== key));

  const hasChanges = Object.keys(redeemedMap).length > 0 || newFunds.length > 0;

  const validate = () => {
    if (!selectedClient) return 'Please select a client.';
    for (const [id, r] of Object.entries(redeemedMap)) {
      const h = clientHoldings.find(h => h.id === id);
      if (r.action === 'partial') {
        const remaining = Number(r.remainingMyr);
        if (!r.remainingMyr || isNaN(remaining) || remaining <= 0) {
          return `Enter remaining value (MYR) for "${h?.name}".`;
        }
        if (remaining >= (h?.value ?? 0)) {
          return `Remaining value for "${h?.name}" must be less than current value.`;
        }
      }
    }
    for (const f of newFunds) {
      if (!f.name.trim()) return 'New fund name is required.';
      if (!f.valueOrig || isNaN(Number(f.valueOrig)) || Number(f.valueOrig) <= 0)
        return `Enter a valid value for "${f.name || 'new fund'}".`;
    }
    return '';
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSubmitting(true);

    const redeemed = Object.entries(redeemedMap).map(([id, r]) => {
      const h = clientHoldings.find(h => h.id === id)!;
      if (r.action === 'full') return { id, action: 'full' as const };
      const remainMyr  = Number(r.remainingMyr);
      const remainOrig = r.remainingOrig ? Number(r.remainingOrig) : (h.fxRate > 0 ? remainMyr / h.fxRate : remainMyr);
      return { id, action: 'partial' as const, newValueOrig: remainOrig, newValueMyr: remainMyr };
    });

    const newFundsPayload = newFunds.map(f => {
      const fxRate      = Number(f.fxRate) || 1;
      const valueOrig   = Number(f.valueOrig);
      const purchaseOrig = Number(f.purchaseOrig) || valueOrig;
      return {
        clientId,
        name:        f.name.trim(),
        assetClass:  f.assetClass,
        institution: f.institution.trim(),
        currency:    f.currency,
        valueOrig,
        purchaseOrig,
        fxRate,
        valueMyr:    valueOrig   * fxRate,
        purchaseMyr: purchaseOrig * fxRate,
      };
    });

    try {
      const res  = await fetch('/api/portfolio-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redeemed, newFunds: newFundsPayload }),
      });
      const json = await res.json();
      if (!json.ok && res.status !== 207) {
        setError('Some actions failed. Please try again.');
      } else {
        setDone(true);
        setTimeout(() => { onSuccess(); onClose(); }, 1600);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const input: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
    outline: 'none', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block',
  };

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 100, backdropFilter: 'blur(2px)',
      }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(520px, 100vw)',
        background: 'var(--bg)', borderLeft: '1px solid var(--border)',
        zIndex: 101, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
        animation: 'slideInRight 0.22s ease',
      }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔄</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Switch / Redeem</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>Update holdings after a fund switch or redemption</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', padding: '4px 8px', borderRadius: 8 }}>✕</button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Done state */}
          {done && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--green)' }}>Switch recorded!</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>Portfolio is refreshing…</div>
            </div>
          )}

          {!done && (
            <>
              {/* ── Select Client ── */}
              <div>
                <label style={label}>Select Client</label>
                <div style={{ position: 'relative' }}>
                  <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ ...input, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}>
                    <option value=''>— choose client —</option>
                    {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10, color: 'var(--text3)' }}>▼</span>
                </div>
              </div>

              {/* ── FROM section ── */}
              {selectedClient && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From — Current Holdings</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>· tick to redeem or reduce</span>
                  </div>

                  {clientHoldings.length === 0 && (
                    <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: 10, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>No active holdings found</div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {clientHoldings.map(h => {
                      const sel = !!redeemedMap[h.id];
                      const r   = redeemedMap[h.id];
                      return (
                        <div key={h.id} style={{
                          borderRadius: 10, border: `1px solid ${sel ? 'var(--accent2)' : 'var(--border)'}`,
                          background: sel ? 'var(--accent-dim)' : 'var(--surface)',
                          overflow: 'hidden', transition: 'all 0.15s',
                        }}>
                          {/* Holding row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }} onClick={() => toggleRedeem(h.id)}>
                            {/* Checkbox */}
                            <div style={{
                              width: 20, height: 20, borderRadius: 6, border: `2px solid ${sel ? 'var(--accent2)' : 'var(--border)'}`,
                              background: sel ? 'var(--accent2)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, transition: 'all 0.12s',
                            }}>
                              {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{h.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                                {[h.assetClass, h.institution].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                                {fmtNum(h.value)}
                              </div>
                              {h.currency !== 'MYR' && (
                                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                                  {h.currency} {h.valueOrig.toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action options — shown when selected */}
                          {sel && (
                            <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--accent2)33' }}>
                              {/* Full / Partial toggle */}
                              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                {(['full', 'partial'] as const).map(a => (
                                  <button key={a} onClick={() => setAction(h.id, a)} style={{
                                    flex: 1, padding: '7px 0', borderRadius: 8,
                                    border: `1px solid ${r.action === a ? 'var(--accent2)' : 'var(--border)'}`,
                                    background: r.action === a ? 'var(--accent2)' : 'var(--surface2)',
                                    color: r.action === a ? '#fff' : 'var(--text3)',
                                    fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.12s',
                                  }}>
                                    {a === 'full' ? '🔴 Full Redeem' : '🟡 Partial Switch'}
                                  </button>
                                ))}
                              </div>

                              {/* Partial inputs */}
                              {r.action === 'partial' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                  <div>
                                    <label style={{ ...label, marginBottom: 4 }}>Remaining Value (MYR) *</label>
                                    <input type='number' min={0} placeholder='e.g. 30000' value={r.remainingMyr}
                                      onChange={e => setRemaining(h.id, 'remainingMyr', e.target.value)}
                                      style={input} />
                                  </div>
                                  {h.currency !== 'MYR' && (
                                    <div>
                                      <label style={{ ...label, marginBottom: 4 }}>Remaining ({h.currency})</label>
                                      <input type='number' min={0} placeholder={`original ccy`} value={r.remainingOrig}
                                        onChange={e => setRemaining(h.id, 'remainingOrig', e.target.value)}
                                        style={input} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── TO section ── */}
              {selectedClient && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To — New Fund(s)</span>
                    <button onClick={addNewFund} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                      borderRadius: 'var(--r-pill)', border: '1px solid var(--accent2)',
                      background: 'var(--accent-dim)', color: 'var(--accent2)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>
                      + Add Fund
                    </button>
                  </div>

                  {newFunds.length === 0 && (
                    <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: 10, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
                      Click "+ Add Fund" to enter the fund(s) being switched into
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {newFunds.map((f, idx) => (
                      <div key={f._key} style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', flex: 1 }}>New Fund {idx + 1}</span>
                          <button onClick={() => removeNewFund(f._key)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text3)', padding: '2px 6px' }}>✕</button>
                        </div>

                        {/* Row 1: Name + Asset Class */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <label style={label}>Fund / Holding Name *</label>
                            <input type='text' placeholder='e.g. Maybank Growth Fund' value={f.name}
                              onChange={e => updateNewFund(f._key, 'name', e.target.value)}
                              style={input} />
                          </div>
                          <div>
                            <label style={label}>Asset Class</label>
                            <select value={f.assetClass} onChange={e => updateNewFund(f._key, 'assetClass', e.target.value)} style={{ ...input, appearance: 'none', cursor: 'pointer' }}>
                              {ASSET_CLASSES.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Row 2: Institution */}
                        <div style={{ marginBottom: 10 }}>
                          <label style={label}>Institution</label>
                          <input type='text' placeholder='e.g. Maybank Asset Management' value={f.institution}
                            onChange={e => updateNewFund(f._key, 'institution', e.target.value)}
                            style={input} />
                        </div>

                        {/* Row 3: Currency + Value + Purchase */}
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <label style={label}>Currency</label>
                            <select value={f.currency} onChange={e => updateNewFund(f._key, 'currency', e.target.value)} style={{ ...input, appearance: 'none', cursor: 'pointer', paddingRight: 8 }}>
                              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={label}>Current Value *</label>
                            <input type='number' min={0} placeholder='0.00' value={f.valueOrig}
                              onChange={e => updateNewFund(f._key, 'valueOrig', e.target.value)}
                              style={input} />
                          </div>
                          <div>
                            <label style={label}>Purchase Price</label>
                            <input type='number' min={0} placeholder='leave blank if same' value={f.purchaseOrig}
                              onChange={e => updateNewFund(f._key, 'purchaseOrig', e.target.value)}
                              style={input} />
                          </div>
                        </div>

                        {/* Row 4: FX Rate (only for non-MYR) + MYR preview */}
                        {f.currency !== 'MYR' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <label style={label}>FX Rate to MYR</label>
                              <input type='number' min={0} step='0.0001' placeholder='e.g. 4.7' value={f.fxRate}
                                onChange={e => updateNewFund(f._key, 'fxRate', e.target.value)}
                                style={input} />
                            </div>
                            <div>
                              <label style={label}>Value (MYR equiv.)</label>
                              <div style={{ ...input, background: 'var(--surface2)', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
                                {f.valueOrig && f.fxRate
                                  ? `RM ${Math.round(Number(f.valueOrig) * Number(f.fxRate)).toLocaleString()}`
                                  : '—'}
                              </div>
                            </div>
                          </div>
                        )}
                        {f.currency === 'MYR' && f.valueOrig && (
                          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                            → RM {Number(f.valueOrig).toLocaleString()} will be added to portfolio
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-dim, #FEE2E2)', border: '1px solid var(--red)44', color: 'var(--red)', fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '11px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={handleSubmit} disabled={!hasChanges || submitting || !selectedClient} style={{
              flex: 2, padding: '11px', borderRadius: 10, border: 'none',
              background: hasChanges && selectedClient ? 'var(--accent2)' : 'var(--surface2)',
              color: hasChanges && selectedClient ? '#fff' : 'var(--text3)',
              fontSize: 13, fontWeight: 700, cursor: hasChanges && selectedClient ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {submitting
                ? <><span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #fff4', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Saving…</>
                : '🔄 Confirm Switch'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
