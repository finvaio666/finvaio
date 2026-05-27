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

interface FsmNavResult {
  code:          string;
  fundName?:     string;
  bidPrice?:     number;
  priceDate?:    number | null;
  percentChange?: number;
  error?:        string;
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

const LSK_CODES = 'aria_fsm_codes_v1'; // localStorage key

export default function NavUpdatePanel({ onClose, onSuccess }: Props) {
  const [funds,      setFunds]      = useState<Fund[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [navInputs,  setNavInputs]  = useState<Record<string, string>>({});   // fundName → new NAV string
  const [fsmCodes,   setFsmCodes]   = useState<Record<string, string>>({});   // fundName → FSMOne code
  const [showCodes,  setShowCodes]  = useState(false);  // toggle show/hide code fields
  const [fetching,   setFetching]   = useState(false);
  const [fetchMsg,   setFetchMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [result,     setResult]     = useState<{ updated: number; errors: number } | null>(null);
  const [error,      setError]      = useState('');

  // ── Load fund list ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/update-nav')
      .then(r => r.json())
      .then(json => { if (json.funds) setFunds(json.funds); })
      .catch(() => setError('Could not load fund data'))
      .finally(() => setLoading(false));
  }, []);

  // ── Load saved FSMOne codes from localStorage ───────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LSK_CODES);
      if (saved) setFsmCodes(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveFsmCodes = (updated: Record<string, string>) => {
    setFsmCodes(updated);
    try { localStorage.setItem(LSK_CODES, JSON.stringify(updated)); } catch { /* ignore */ }
  };

  const handleCodeChange = (fundName: string, code: string) => {
    saveFsmCodes({ ...fsmCodes, [fundName]: code.trim().toUpperCase() });
  };

  // ── Auto-fetch NAV from FSMOne ──────────────────────────────────────────────
  const handleAutoFetch = async () => {
    const codePairs = funds
      .map(f => ({ fundName: f.fundName, code: fsmCodes[f.fundName] }))
      .filter(p => p.code);

    if (!codePairs.length) {
      setFetchMsg({ type: 'err', text: 'Enter at least one FSMOne Code first, then click Auto-Fetch.' });
      setShowCodes(true);
      return;
    }

    setFetching(true);
    setFetchMsg(null);
    try {
      const codes = codePairs.map(p => p.code).join(',');
      const res   = await fetch(`/api/fetch-nav?codes=${encodeURIComponent(codes)}`);
      const json  = await res.json();

      if (!res.ok) throw new Error(json.error ?? 'Fetch failed');

      const results: FsmNavResult[] = json.results ?? [];

      // Build a code → fundName reverse map from our codePairs
      const codeToFundName: Record<string, string> = {};
      codePairs.forEach(p => { codeToFundName[p.code] = p.fundName; });

      // Pre-fill NAV inputs
      const newInputs = { ...navInputs };
      let filled = 0;
      let failed = 0;

      results.forEach(r => {
        if (r.error) { failed++; return; }
        const fundName = codeToFundName[r.code];
        if (fundName && r.bidPrice && r.bidPrice > 0) {
          newInputs[fundName] = String(r.bidPrice);
          filled++;
        }
      });

      setNavInputs(newInputs);

      if (filled > 0) {
        const dateStr = results.find(r => r.priceDate)?.priceDate
          ? new Date(results.find(r => r.priceDate)!.priceDate!).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
          : '';
        setFetchMsg({
          type: 'ok',
          text: `✅ Fetched ${filled} fund price${filled !== 1 ? 's' : ''} from FSMOne${dateStr ? ` (as of ${dateStr})` : ''}${failed > 0 ? ` · ${failed} failed` : ''}. Review & click Update.`,
        });
      } else {
        setFetchMsg({ type: 'err', text: `Could not fetch any prices. Check that FSMOne codes are correct.${failed > 0 ? ` (${failed} error${failed !== 1 ? 's' : ''})` : ''}` });
      }
    } catch (e: unknown) {
      setFetchMsg({ type: 'err', text: `Auto-fetch failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
    } finally {
      setFetching(false);
    }
  };

  // ── Submit manual NAV updates ───────────────────────────────────────────────
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
      setTimeout(() => { onSuccess(); }, 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const codesWithValue = Object.values(fsmCodes).filter(Boolean).length;

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
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 560,
        background: 'var(--surface)', zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.25)',
        animation: 'slideInRight 0.22s ease',
      }}>

        {/* ── Header ── */}
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
              Auto-fetch from FSMOne or enter prices manually.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* ── Auto-fetch bar ── */}
        <div style={{
          padding: '14px 28px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleAutoFetch}
              disabled={fetching || !!result}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: 'var(--r-pill)',
                background: fetching ? 'var(--surface2)' : 'var(--accent2)',
                color: fetching ? 'var(--text3)' : '#fff',
                border: 'none', cursor: fetching ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
              }}
            >
              {fetching ? (
                <>
                  <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #fff6', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  Fetching…
                </>
              ) : '🔄 Auto-fetch from FSMOne'}
            </button>

            <button
              onClick={() => setShowCodes(s => !s)}
              style={{
                padding: '8px 14px', borderRadius: 'var(--r-pill)',
                background: 'var(--surface)', border: `1.5px solid ${showCodes ? 'var(--accent2)' : 'var(--border)'}`,
                color: showCodes ? 'var(--accent2)' : 'var(--text3)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              🔑 {showCodes ? 'Hide' : 'Set'} FSMOne Codes {codesWithValue > 0 ? `(${codesWithValue})` : ''}
            </button>
          </div>

          {/* FSMOne code inputs */}
          {showCodes && !loading && (
            <div style={{
              padding: '12px 16px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.6 }}>
                💡 Enter each fund&apos;s FSMOne code once — it&apos;s saved in your browser.
                Find the code in the FSMOne fund URL: <code style={{ fontSize: 10, background: 'var(--surface2)', padding: '1px 4px', borderRadius: 3 }}>fsmone.com.my/funds/tools/factsheet/...?fund=<strong>MYXXX000</strong></code>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {funds.map(f => (
                  <div key={f.fundName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--text2)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.fundName}
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. MYRII005"
                      value={fsmCodes[f.fundName] ?? ''}
                      onChange={e => handleCodeChange(f.fundName, e.target.value)}
                      style={{
                        width: 120, padding: '5px 8px', borderRadius: 6,
                        border: `1.5px solid ${fsmCodes[f.fundName] ? 'var(--accent2)' : 'var(--border)'}`,
                        background: 'var(--surface)', color: 'var(--text)',
                        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                        outline: 'none', letterSpacing: '0.03em',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fetch result message */}
          {fetchMsg && (
            <div style={{
              padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: fetchMsg.type === 'ok' ? '#D1FAE5' : '#FEE2E2',
              border: `1px solid ${fetchMsg.type === 'ok' ? '#6EE7B7' : '#FCA5A5'}`,
              color: fetchMsg.type === 'ok' ? '#065F46' : '#991B1B',
            }}>
              {fetchMsg.text}
            </div>
          )}
        </div>

        {/* ── Body — fund list ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>Loading funds…</div>
          )}

          {!loading && funds.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>No active funds found.</div>
          )}

          {!loading && funds.length > 0 && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'var(--accent-dim)', borderRadius: 8,
              border: '1px solid var(--accent2)44',
              fontSize: 12, color: 'var(--text2)',
            }}>
              💡 Tip — ensure unit holdings are up to date before updating NAV prices so portfolio values calculate correctly.
            </div>
          )}

          {funds.map((f) => {
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
                  marginBottom: 12, padding: '14px 16px', borderRadius: 10,
                  border: `1px solid ${hasChange ? 'var(--accent2)' : 'var(--border)'}`,
                  background: hasChange ? 'var(--accent-dim)' : 'var(--bg2)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Fund name + meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: assetColor(f.assetClass) }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1 }}>{f.fundName}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                    background: 'var(--surface2)', color: 'var(--text3)', fontFamily: 'var(--font-mono)',
                  }}>{f.currency}</span>
                  {fsmCodes[f.fundName] && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: 'var(--accent-dim)', color: 'var(--accent2)',
                      border: '1px solid var(--accent2)44', fontFamily: 'var(--font-mono)',
                    }}>{fsmCodes[f.fundName]}</span>
                  )}
                </div>

                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, paddingLeft: 16, lineHeight: 1.6 }}>
                  {[f.assetClass, f.institution].filter(Boolean).join(' · ')}
                  {f.clients.length > 0 && (
                    <span style={{ marginLeft: 6 }}>· <span style={{ color: 'var(--blue)' }}>👥 {f.clients.join(', ')}</span></span>
                  )}
                </div>

                {/* NAV row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 16 }}>
                  {/* Current NAV */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>
                      Current NAV ({f.totalUnits > 0 ? `${fmtNum(f.totalUnits, 4)} units` : 'no units'})
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, color: f.currentNav > 0 ? 'var(--text)' : 'var(--text3)' }}>
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
                        width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: `1.5px solid ${hasChange ? 'var(--accent2)' : 'var(--border)'}`,
                        background: 'var(--surface)', color: 'var(--text)',
                        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                        outline: 'none', transition: 'border-color 0.15s',
                      }}
                    />
                  </div>
                </div>

                {/* Preview value change */}
                {hasChange && newValue !== null && (
                  <div style={{ marginTop: 10, paddingLeft: 16, display: 'flex', gap: 16, fontSize: 11 }}>
                    <div>
                      <span style={{ color: 'var(--text3)' }}>New total value: </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>
                        {f.currency} {fmtNum(newValue, 2)}
                      </span>
                    </div>
                    {valueDelta !== null && (
                      <div>
                        <span style={{ color: 'var(--text3)' }}>Change: </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: valueDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
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

        {/* ── Footer ── */}
        <div style={{ padding: '16px 28px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEE2E2', borderRadius: 8, border: '1px solid #FCA5A5', fontSize: 12, color: '#991B1B' }}>
              {error}
            </div>
          )}

          {result && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#D1FAE5', borderRadius: 8, border: '1px solid #6EE7B7', fontSize: 12, color: '#065F46', fontWeight: 600 }}>
              ✅ Updated {result.updated} holding{result.updated !== 1 ? 's' : ''} in ARIA
              {result.errors > 0 && ` (${result.errors} error${result.errors !== 1 ? 's' : ''})`}. Refreshing…
            </div>
          )}

          {changedFunds.length > 0 && !result && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text3)' }}>
              {changedFunds.length} fund{changedFunds.length !== 1 ? 's' : ''} will be updated
              · affects {changedFunds.reduce((s, f) => s + f.holdingCount, 0)} client holdings
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--r-pill)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >Cancel</button>

            <button
              onClick={handleSubmit}
              disabled={changedFunds.length === 0 || saving || !!result}
              style={{
                flex: 2, padding: '11px 0', borderRadius: 'var(--r-pill)', border: 'none',
                background: changedFunds.length > 0 && !saving && !result ? 'var(--accent2)' : 'var(--surface2)',
                color: changedFunds.length > 0 && !saving && !result ? '#fff' : 'var(--text3)',
                fontSize: 13, fontWeight: 700,
                cursor: changedFunds.length > 0 && !saving && !result ? 'pointer' : 'not-allowed',
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
