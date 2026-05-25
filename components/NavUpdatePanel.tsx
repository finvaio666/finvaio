'use client';

import { useState, useEffect } from 'react';

interface Fund {
  fundName:     string;
  assetClass:   string;
  institution:  string;
  currency:     string;
  totalUnits:   number;
  currentNav:   number;
  clients:      string[];
  holdingCount: number;
}

interface Props {
  onClose:   () => void;
  onSuccess: () => void;
}

const ASSET_COLORS: Record<string, string> = {
  'EPF': '#4ADE80', 'Unit Trust': '#60A5FA', 'PRS': '#818CF8',
  'Fixed Deposit': '#F59E0B', 'Stocks': '#A78BFA', 'Bonds': '#F87171',
  'Money Market': '#34D399',
};
const assetColor = (a: string) => ASSET_COLORS[a] ?? '#9CB8A0';

function fmtNum(n: number, dp = 2) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export default function NavUpdatePanel({ onClose, onSuccess }: Props) {
  const [funds,    setFunds]    = useState<Fund[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [navInputs, setNavInputs] = useState<Record<string, string>>({});   // fundName → new NAV string
  const [saving,   setSaving]   = useState(false);
  const [result,   setResult]   = useState<{ updated: number; errors: number } | null>(null);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch('/api/update-nav')
      .then(r => r.json())
      .then(json => {
        if (json.funds) setFunds(json.funds);
      })
      .catch(() => setError('Could not load fund data'))
      .finally(() => setLoading(false));
  }, []);

  const handleNavChange = (fundName: string, val: string) => {
    setNavInputs(prev => ({ ...prev, [fundName]: val }));
  };

  const changedFunds = funds.filter(f => {
    const v = navInputs[f.fundName];
    if (!v) return false;
    const n = parseFloat(v);
    return !isNaN(n) && n > 0 && n !== f.currentNav;
  });

  const handleSubmit = async () => {
    if (!changedFunds.length) return;
    setSaving(true);
    setError('');
    try {
      const updates = changedFunds.map(f => ({
        fundName: f.fundName,
        newNav:   parseFloat(navInputs[f.fundName]),
      }));
      const res  = await fetch('/api/update-nav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Update failed');
      setResult({ updated: json.updated, errors: json.errors?.length ?? 0 });
      // auto-close after 2.5 s
      setTimeout(() => { onSuccess(); }, 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 540,
        background: 'var(--surface)', zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.25)',
        animation: 'slideInRight 0.22s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 28px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          background: 'var(--bg2)',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              📊 Update Fund NAV
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Enter new NAV/price per unit. Only changed rows will be saved.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text3)',
              fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>
              Loading funds…
            </div>
          )}

          {!loading && funds.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>
              No active funds found.
            </div>
          )}

          {/* Hint */}
          {!loading && funds.length > 0 && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'var(--accent-dim)', borderRadius: 8,
              border: '1px solid var(--accent2)44',
              fontSize: 12, color: 'var(--text2)',
            }}>
              💡 Tip — make sure unit holdings are up to date before updating NAV prices, so portfolio values are calculated correctly.
            </div>
          )}

          {/* Fund list */}
          {funds.map((f, i) => {
            const rawInput  = navInputs[f.fundName] ?? '';
            const newNav    = parseFloat(rawInput);
            const hasChange = rawInput !== '' && !isNaN(newNav) && newNav > 0 && newNav !== f.currentNav;
            const newValue  = hasChange && f.totalUnits > 0 ? f.totalUnits * newNav : null;
            const valueDelta = newValue !== null && f.currentNav > 0
              ? newValue - f.totalUnits * f.currentNav : null;

            return (
              <div
                key={f.fundName}
                style={{
                  marginBottom: 12, padding: '14px 16px',
                  borderRadius: 10,
                  border: `1px solid ${hasChange ? 'var(--accent2)' : 'var(--border)'}`,
                  background: hasChange ? 'var(--accent-dim)' : 'var(--bg2)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Fund name + meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: assetColor(f.assetClass),
                  }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1 }}>
                    {f.fundName}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 6px',
                    borderRadius: 4, background: 'var(--surface2)',
                    color: 'var(--text3)', fontFamily: 'var(--font-mono)',
                  }}>{f.currency}</span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, paddingLeft: 16, lineHeight: 1.6 }}>
                  {[f.assetClass, f.institution].filter(Boolean).join(' · ')}
                  {f.clients.length > 0 && (
                    <span style={{ marginLeft: 6 }}>
                      · <span style={{ color: 'var(--blue)' }}>👥 {f.clients.join(', ')}</span>
                    </span>
                  )}
                </div>

                {/* NAV row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 16 }}>
                  {/* Current NAV */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>
                      Current NAV ({f.totalUnits > 0 ? `${fmtNum(f.totalUnits, 4)} units` : 'no units'})
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14,
                      color: f.currentNav > 0 ? 'var(--text)' : 'var(--text3)',
                    }}>
                      {f.currentNav > 0 ? fmtNum(f.currentNav, 4) : '—'}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div style={{ color: 'var(--text3)', fontSize: 16, flexShrink: 0 }}>→</div>

                  {/* New NAV input */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>New NAV / Price</div>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="e.g. 1.2500"
                      value={rawInput}
                      onChange={e => handleNavChange(f.fundName, e.target.value)}
                      style={{
                        width: '100%', padding: '7px 10px',
                        borderRadius: 6,
                        border: `1.5px solid ${hasChange ? 'var(--accent2)' : 'var(--border)'}`,
                        background: 'var(--surface)', color: 'var(--text)',
                        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                        outline: 'none',
                        transition: 'border-color 0.15s',
                      }}
                    />
                  </div>
                </div>

                {/* Preview value change */}
                {hasChange && newValue !== null && (
                  <div style={{
                    marginTop: 10, paddingLeft: 16,
                    display: 'flex', gap: 16, fontSize: 11,
                  }}>
                    <div>
                      <span style={{ color: 'var(--text3)' }}>New total value: </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>
                        {f.currency} {fmtNum(newValue, 2)}
                      </span>
                    </div>
                    {valueDelta !== null && (
                      <div>
                        <span style={{ color: 'var(--text3)' }}>Change: </span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontWeight: 700,
                          color: valueDelta >= 0 ? 'var(--green)' : 'var(--red)',
                        }}>
                          {valueDelta >= 0 ? '+' : ''}{fmtNum(valueDelta, 2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px 24px', borderTop: '1px solid var(--border)',
          background: 'var(--bg2)',
        }}>
          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 12, padding: '10px 14px',
              background: '#FEE2E2', borderRadius: 8, border: '1px solid #FCA5A5',
              fontSize: 12, color: '#991B1B',
            }}>{error}</div>
          )}

          {/* Success */}
          {result && (
            <div style={{
              marginBottom: 12, padding: '10px 14px',
              background: '#D1FAE5', borderRadius: 8, border: '1px solid #6EE7B7',
              fontSize: 12, color: '#065F46', fontWeight: 600,
            }}>
              ✅ Updated {result.updated} holding{result.updated !== 1 ? 's' : ''} in ARIA
              {result.errors > 0 && ` (${result.errors} error${result.errors !== 1 ? 's' : ''})`}
              . Refreshing…
            </div>
          )}

          {/* Summary of changes */}
          {changedFunds.length > 0 && !result && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text3)' }}>
              {changedFunds.length} fund{changedFunds.length !== 1 ? 's' : ''} will be updated
              · affects {changedFunds.reduce((s, f) => s + f.holdingCount, 0)} client holdings
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 'var(--r-pill)',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >Cancel</button>

            <button
              onClick={handleSubmit}
              disabled={changedFunds.length === 0 || saving || !!result}
              style={{
                flex: 2, padding: '11px 0', borderRadius: 'var(--r-pill)',
                border: 'none',
                background: changedFunds.length > 0 && !saving && !result
                  ? 'var(--accent2)' : 'var(--surface2)',
                color: changedFunds.length > 0 && !saving && !result ? '#fff' : 'var(--text3)',
                fontSize: 13, fontWeight: 700, cursor: changedFunds.length > 0 && !saving && !result ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
            >
              {saving ? 'Saving…' : result ? 'Done ✓' : `Update ${changedFunds.length > 0 ? changedFunds.length : ''} Fund${changedFunds.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
