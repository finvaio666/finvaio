'use client';

import { useState, useId } from 'react';

/**
 * FCN worst-case calculator, shown inside a note's expanded row on the client
 * portfolio page. It turns the note's own terms into what the client gets back
 * at maturity if the worst stock ends at a given level - the conversation the
 * FA must have before (and while) a client holds the note.
 *
 * Model (same as the KB entry "FCN worst case"):
 *   - Performance is the WORST underlying vs its entry price.
 *   - The KI barrier is observed at maturity (how most of the firm's notes
 *     work). At or above KI: principal back in cash. Below KI: the client
 *     receives the worst stock, bought at the strike price, so the value is
 *     principal x (final / strike).
 *   - Coupons assume the note runs to maturity without knocking out and every
 *     coupon is paid.
 * It is an illustration, not a valuation: no FX on delivered shares, no fees,
 * no accrued interest, no early knock-out.
 */

export interface FcnTerms {
  principal: number;     // in the note currency
  currency: string;
  couponRatePa?: number; // % p.a.
  issueDate?: string;
  maturity?: string;
  institution?: string;
  underlyings: { name: string; entry: number; strike: number; ki: number; today?: number }[];
}

const tick = (name: string) => name.match(/\(([^)]+)\)/)?.[1] ?? name;
const money = (ccy: string, n: number) => `${ccy} ${Math.round(n).toLocaleString('en-MY')}`;
const signed = (ccy: string, n: number) => `${n >= 0 ? '+' : '−'}${money(ccy, Math.abs(n))}`;

function years(from?: string, to?: string): number {
  if (!from || !to) return 0;
  const d = (new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 86400000);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** Stock-linked notes only: a range-accrual (CRAN) or FX-linked note has a different payoff. */
export function fitsWorstCase(noteType: string, underlyings: { name: string }[]): boolean {
  return noteType !== 'CRAN' && !underlyings.some(u => /exchange rate|=X\)/i.test(u.name));
}

export default function FcnWorstCase({ terms }: { terms: FcnTerms }) {
  const unds = terms.underlyings.filter(u => u.entry > 0 && u.strike > 0);

  // The underlying that is worst today decides the strike/KI levels used below.
  const withPerf = unds.map(u => ({ u, perf: typeof u.today === 'number' ? u.today / u.entry : null }));
  const worstNow = withPerf.filter(x => x.perf !== null).sort((a, b) => a.perf! - b.perf!)[0] ?? null;
  const ref = worstNow?.u ?? unds[0];

  const [level, setLevel] = useState<number>(() => Math.round(((worstNow?.perf ?? 1) * 100)));
  const sliderId = useId();
  if (!ref || !(terms.principal > 0)) return null;

  const strikePct = (ref.strike / ref.entry) * 100;
  const kiPct = ref.ki > 0 ? (ref.ki / ref.entry) * 100 : strikePct;
  const tenor = years(terms.issueDate, terms.maturity);
  const coupons = terms.couponRatePa ? terms.principal * (terms.couponRatePa / 100) * tenor : 0;
  const ccy = terms.currency || '';

  /** What the client ends with if the worst stock finishes at `pct`% of entry. */
  const outcome = (pct: number) => {
    const delivered = pct < kiPct;
    const value = delivered ? terms.principal * (pct / strikePct) : terms.principal;
    const net = value - terms.principal + coupons;
    return { delivered, value, net, netPct: (net / terms.principal) * 100 };
  };

  const scenarios = [...new Set([100, Math.round(strikePct), 50, 30, 0])].sort((a, b) => b - a);
  const now = worstNow ? outcome(worstNow.perf! * 100) : null;
  const live = outcome(level);
  const cell: React.CSSProperties = { padding: '5px 8px', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', textAlign: 'right' };
  const tone = (n: number) => (n >= 0 ? 'var(--green)' : 'var(--red)');

  return (
    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #F79E1B55', background: '#F79E1B0D' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Worst-case calculator</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
        Principal {money(ccy, terms.principal)} · strike {strikePct.toFixed(0)}% · KI {kiPct.toFixed(0)}% (at maturity)
        {terms.couponRatePa ? ` · coupon ${terms.couponRatePa}% p.a. ≈ ${money(ccy, coupons)} over ${tenor.toFixed(1)} yrs if not knocked out` : ''}
      </div>

      {now && worstNow && (
        <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text)' }}>
          Today the worst stock is <b>{tick(worstNow.u.name)}</b> at{' '}
          <b style={{ fontFamily: 'var(--font-mono)' }}>{(worstNow.perf! * 100).toFixed(1)}%</b> of entry.{' '}
          If the note matured at this level the client would{' '}
          {now.delivered
            ? <>receive <b>{tick(worstNow.u.name)} shares worth about {money(ccy, now.value)}</b> instead of cash</>
            : <>get the <b>principal back in cash</b></>}
          {' '}— net <b style={{ color: tone(now.net) }}>{signed(ccy, now.net)} ({now.netPct >= 0 ? '+' : ''}{now.netPct.toFixed(1)}%)</b> including coupons.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap', fontSize: 12 }}>
        <label htmlFor={sliderId} style={{ color: 'var(--text2)' }}>Worst stock at maturity</label>
        <input id={sliderId} type="range" min={0} max={130} step={1} value={level} onChange={e => setLevel(Number(e.target.value))} style={{ flex: 1, minWidth: 140, accentColor: '#F37338' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, minWidth: 44, textAlign: 'right' }}>{level}%</span>
        <span style={{ color: 'var(--text2)' }}>
          → {live.delivered ? `shares worth ${money(ccy, live.value)}` : 'cash back'}, net{' '}
          <b style={{ color: tone(live.net) }}>{signed(ccy, live.net)} ({live.netPct >= 0 ? '+' : ''}{live.netPct.toFixed(1)}%)</b>
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
        <thead>
          <tr style={{ color: 'var(--text3)' }}>
            <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 8px' }}>Worst stock at maturity</th>
            <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 8px' }}>Client gets</th>
            <th style={{ textAlign: 'right', fontWeight: 600, padding: '4px 8px' }}>Value</th>
            <th style={{ textAlign: 'right', fontWeight: 600, padding: '4px 8px' }}>Net incl. coupons</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map(p => {
            const o = outcome(p);
            return (
              <tr key={p}>
                <td style={{ ...cell, textAlign: 'left', fontFamily: 'var(--font-sans)' }}>{p}% of entry{p === Math.round(strikePct) ? ' (strike)' : ''}{p === 0 ? ' — company collapses' : ''}</td>
                <td style={{ ...cell, textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text2)' }}>{o.delivered ? 'Shares of the worst stock' : 'Cash back'}</td>
                <td style={cell}>{money(ccy, o.value)}</td>
                <td style={{ ...cell, fontWeight: 700, color: tone(o.net) }}>{signed(ccy, o.net)} ({o.netPct >= 0 ? '+' : ''}{o.netPct.toFixed(0)}%)</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...cell, textAlign: 'left', fontFamily: 'var(--font-sans)' }}>Any level — issuer fails{terms.institution ? ` (${terms.institution})` : ''}</td>
            <td style={{ ...cell, textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text2)' }}>A claim in the issuer&apos;s insolvency</td>
            <td style={cell}>possibly 0</td>
            <td style={{ ...cell, fontWeight: 700, color: 'var(--red)' }}>up to −100%</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
        Illustration for the FA, not a valuation: assumes the note is not knocked out early, every coupon is paid, and KI is observed at maturity;
        excludes fees, accrued interest and currency moves on delivered shares. Delivered shares can keep falling after maturity.
        Confirm the exact terms against the term sheet before showing the client.
      </div>
    </div>
  );
}
