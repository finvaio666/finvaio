'use client';

import { useState, useMemo } from 'react';
import {
  estimateAll, LSA_PRODUCT, type Gender, type LsaInsurer, type LsaResult,
} from '@/lib/lsaCalculator';
import { LSA_BENEFITS, LSA_PLAN_LABEL } from '@/lib/lsaBenefits';

const fmt = (n: number) => 'RM ' + Math.round(n).toLocaleString();

const INSURER_COLOR: Record<LsaInsurer, string> = {
  AIA: '#1F4E78', GE: '#1F6B3B', Allianz: '#6B2C8F', HLA: '#B8860B', Prudential: '#C8102E',
};

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, display: 'block' };
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
};

export default function LsaCalculator() {
  const [clientName, setClientName] = useState('');
  const [age, setAge] = useState('35');
  const [gender, setGender] = useState<Gender>('M');
  const [smoker, setSmoker] = useState(false);
  const [sumAssured, setSumAssured] = useState('1000000');

  const ageN = parseInt(age, 10) || 0;
  const saN = parseInt(sumAssured, 10) || 0;

  const [results, setResults] = useState<LsaResult[] | null>(null);
  const [picked, setPicked] = useState<Set<LsaInsurer>>(new Set());
  const [showProposal, setShowProposal] = useState(false);

  function calculate() {
    const r = estimateAll(gender, smoker, ageN, saN);
    setResults(r);
    // default = cheapest 3 that actually have a quote
    setPicked(new Set(r.filter((x) => x.monthly != null).slice(0, 3).map((x) => x.insurer)));
    setShowProposal(false);
  }

  function togglePick(ins: LsaInsurer, hasQuote: boolean) {
    if (!hasQuote) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(ins)) next.delete(ins); else next.add(ins);
      return next;
    });
    setShowProposal(false);
  }

  const chosen = useMemo(
    () => (results ?? []).filter((r) => picked.has(r.insurer) && r.monthly != null),
    [results, picked],
  );
  const chosenInsurers = chosen.map((c) => c.insurer);
  const firstQuoted = (results ?? []).find((r) => r.monthly != null)?.insurer;

  // lowest / highest lifetime outlay to age 80 among quoted insurers — surfaces
  // how GE's low stepped headline balloons into a high lifetime cost.
  const outlayRange = useMemo(() => {
    const vals = (results ?? []).map((r) => r.outlay80).filter((v): v is number => v != null);
    return vals.length ? { lo: Math.min(...vals), hi: Math.max(...vals) } : null;
  }, [results]);

  async function downloadPdf() {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setTextColor(26, 26, 26);
    doc.text('Large Sum Assured — Legacy Proposal', 40, 46);
    doc.setFontSize(9); doc.setTextColor(110, 110, 110);
    doc.text('Prepared in FINVA  |  ' + new Date().toLocaleDateString('en-GB'), 40, 62);

    const prof = `${gender === 'M' ? 'Male' : 'Female'}  -  ${smoker ? 'Smoker' : 'Non-Smoker'}  -  Age ${ageN}  -  Sum Assured ${fmt(saN)}`;
    doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    if (clientName) doc.text('Client: ' + clientName, 40, 84);
    doc.text(prof, 40, clientName ? 98 : 84);

    let y = (clientName ? 98 : 84) + 18;
    autoTable(doc, {
      startY: y,
      head: [['Insurer', 'Product', 'Monthly', 'Annual', 'Total to 80', 'Death benefit basis']],
      body: chosen.map((c) => [c.insurer, c.product, fmt(c.monthly as number), fmt(c.annual as number), c.outlay80 != null ? fmt(c.outlay80) : '-', c.deathBasis]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [31, 62, 100] },
      columnStyles: { 5: { cellWidth: 130 } },
      theme: 'grid',
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
    doc.setFontSize(12); doc.setTextColor(26, 26, 26);
    doc.text('Benefit & Feature Comparison', 40, y); y += 8;

    const head = ['Feature', ...chosenInsurers.map((i) => `${i}\n${LSA_PLAN_LABEL[i]}`)];
    const body: string[][] = [];
    for (const sec of LSA_BENEFITS) {
      body.push([sec.section, ...chosenInsurers.map(() => '')]);
      for (const row of sec.rows) body.push([row.benefit, ...chosenInsurers.map((i) => row[i])]);
    }
    autoTable(doc, {
      startY: y + 4,
      head: [head],
      body,
      styles: { fontSize: 7, cellPadding: 3, valign: 'top' },
      headStyles: { fillColor: [31, 62, 100], fontSize: 7 },
      columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' } },
      theme: 'grid',
      didParseCell: (d) => {
        const raw = d.row.raw as string[];
        if (d.section === 'body' && LSA_BENEFITS.some((s) => s.section === raw[0])) {
          d.cell.styles.fillColor = [217, 225, 242];
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    doc.setFontSize(7); doc.setTextColor(130, 130, 130);
    const disc = doc.splitTextToSize(
      'Important: Premiums are estimates interpolated from each insurer\'s official RM1,000,000 illustrations (ages 20-60) and scaled by sum assured using a per-insurer volume-discount curve calibrated on RM1m-3m quotes (Allianz, HLA, Prudential; AIA and GE scale linearly pending high-SA quotes); they are not official quotations and must be confirmed against the insurer system before issue. GE uses a STEPPED premium (low now, rising steeply with age) and has no male rates. Death-benefit basis and free riders differ materially between insurers - read the comparison above. For advisory discussion only.',
      W - 80,
    );
    doc.text(disc, 40, y);
    doc.save(`LSA_Proposal_${clientName || 'client'}.pdf`);
  }

  return (
    <div className="section" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>🏛️ Large Sum Assured Calculator</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
        Compare RM1,000,000-class wealth / legacy ILP premiums across AIA, Allianz, Great Eastern, HLA and Prudential, then build a client proposal. Figures are estimates — confirm against the insurer system before issue.
      </div>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div>
          <label style={lbl}>Client name (optional)</label>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Mr Tan" style={inp} />
        </div>
        <div>
          <label style={lbl}>Age (entry, 20–60)</label>
          <input type="number" min={20} max={60} value={age} onChange={(e) => setAge(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Gender</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['M', 'F'] as Gender[]).map((g) => (
              <button key={g} onClick={() => setGender(g)} style={{
                flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${gender === g ? 'var(--accent2)' : 'var(--border)'}`,
                background: gender === g ? 'var(--accent2)' : 'var(--surface)', color: gender === g ? '#fff' : 'var(--text3)',
              }}>{g === 'M' ? 'Male' : 'Female'}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>Smoker</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[false, true].map((s) => (
              <button key={String(s)} onClick={() => setSmoker(s)} style={{
                flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${smoker === s ? 'var(--accent2)' : 'var(--border)'}`,
                background: smoker === s ? 'var(--accent2)' : 'var(--surface)', color: smoker === s ? '#fff' : 'var(--text3)',
              }}>{s ? 'Smoker' : 'Non-Smoker'}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>Sum Assured (RM)</label>
          <input type="number" min={100000} step={100000} value={sumAssured} onChange={(e) => setSumAssured(e.target.value)} style={inp} />
        </div>
      </div>

      <button onClick={calculate} style={{
        padding: '10px 24px', borderRadius: 'var(--r-pill)', border: 'none', background: '#F37338',
        color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>Calculate premiums</button>

      {/* Results */}
      {results && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
            Tick the insurers to include in the proposal (cheapest 3 with a quote pre-selected).{' '}
            <span style={{ color: 'var(--text)' }}>&ldquo;Total to age 80&rdquo;</span> is the full premium outlay over the life of the policy — the honest cost, where a low <em>stepped</em> monthly (e.g. GE) can end up the most expensive.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {results.map((r) => {
              const hasQuote = r.monthly != null;
              const on = picked.has(r.insurer); const c = INSURER_COLOR[r.insurer];
              const isLowest = hasQuote && r.insurer === firstQuoted;
              return (
                <div key={r.insurer} onClick={() => togglePick(r.insurer, hasQuote)} style={{
                  cursor: hasQuote ? 'pointer' : 'not-allowed', opacity: hasQuote ? 1 : 0.6,
                  border: `2px solid ${on ? c : 'var(--border)'}`, borderRadius: 12,
                  padding: 14, background: on ? `${c}0D` : 'var(--surface)', position: 'relative',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: c }}>{r.insurer}</span>
                    {hasQuote && <span style={{ fontSize: 16 }}>{on ? '☑' : '☐'}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>{r.product}</div>
                  {hasQuote ? (
                    <>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{fmt(r.monthly as number)}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)' }}> /mo</span></div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmt(r.annual as number)} / year</div>
                      {r.outlay80 != null && (() => {
                        const isLo = outlayRange && r.outlay80 === outlayRange.lo;
                        const isHi = outlayRange && r.outlay80 === outlayRange.hi;
                        const col = isHi ? '#B45309' : isLo ? '#1F6B3B' : 'var(--text3)';
                        return (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)', fontSize: 11 }}>
                            <span style={{ color: 'var(--text3)' }}>Total to age 80: </span>
                            <span style={{ fontWeight: 700, color: col }}>{fmt(r.outlay80)}</span>
                            {isHi && <span style={{ color: col, fontWeight: 600 }}> · most</span>}
                            {isLo && <span style={{ color: col, fontWeight: 600 }}> · least</span>}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)', padding: '8px 0' }}>{r.note ?? 'No quote'}</div>
                  )}
                  {r.structure === 'stepped' && hasQuote && (
                    <div style={{ position: 'absolute', top: 10, right: 38, fontSize: 9, fontWeight: 700, color: '#B45309', background: '#B453091A', padding: '2px 6px', borderRadius: 6 }}>STEPPED</div>
                  )}
                  {isLowest && r.structure !== 'stepped' && (
                    <div style={{ position: 'absolute', top: 10, right: 38, fontSize: 9, fontWeight: 700, color: '#1F6B3B', background: '#1F6B3B1A', padding: '2px 6px', borderRadius: 6 }}>LOWEST</div>
                  )}
                  <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 8, lineHeight: 1.4 }}>{r.caveat}</div>
                </div>
              );
            })}
          </div>

          <button onClick={() => setShowProposal(true)} disabled={chosen.length === 0} style={{
            marginTop: 18, padding: '10px 24px', borderRadius: 'var(--r-pill)', border: 'none',
            background: chosen.length ? 'var(--accent2)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: chosen.length ? 'pointer' : 'not-allowed',
          }}>📄 Generate proposal ({chosen.length} insurer{chosen.length === 1 ? '' : 's'})</button>
        </div>
      )}

      {/* Proposal */}
      {showProposal && chosen.length > 0 && (
        <div style={{ marginTop: 24, border: '1px solid var(--border)', borderRadius: 12, padding: 20, background: 'var(--bg2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Legacy Proposal{clientName ? ` — ${clientName}` : ''}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{gender === 'M' ? 'Male' : 'Female'} · {smoker ? 'Smoker' : 'Non-Smoker'} · Age {ageN} · Sum Assured {fmt(saN)}</div>
            </div>
            <button onClick={downloadPdf} style={{
              padding: '9px 18px', borderRadius: 'var(--r-pill)', border: 'none', background: '#F37338',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>⬇ Download PDF</button>
          </div>

          {/* Premium summary */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {chosen.map((c) => (
              <div key={c.insurer} style={{ flex: '1 1 150px', border: `1px solid ${INSURER_COLOR[c.insurer]}55`, borderRadius: 10, padding: 12, background: 'var(--surface)' }}>
                <div style={{ fontWeight: 700, color: INSURER_COLOR[c.insurer], fontSize: 13 }}>{c.insurer}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{fmt(c.monthly as number)}<span style={{ fontSize: 10, color: 'var(--text3)' }}>/mo</span></div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmt(c.annual as number)}/yr</div>
                {c.outlay80 != null && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Total to 80: <strong style={{ color: 'var(--text)' }}>{fmt(c.outlay80)}</strong></div>}
              </div>
            ))}
          </div>

          {/* Benefit comparison table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--surface2)', color: 'var(--text3)', position: 'sticky', left: 0 }}>Feature</th>
                  {chosenInsurers.map((i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--surface2)', color: INSURER_COLOR[i], minWidth: 150 }}>
                      {i}<div style={{ fontSize: 9, fontWeight: 400, color: 'var(--text3)' }}>{LSA_PLAN_LABEL[i]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LSA_BENEFITS.flatMap((sec) => [
                  <tr key={sec.section}>
                    <td colSpan={chosenInsurers.length + 1} style={{ padding: '6px 8px', background: 'var(--surface2)', fontWeight: 700, color: 'var(--text)', fontSize: 11 }}>{sec.section}</td>
                  </tr>,
                  ...sec.rows.map((row) => (
                    <tr key={sec.section + row.benefit} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 600, color: 'var(--text)' }}>{row.benefit}</td>
                      {chosenInsurers.map((i) => (
                        <td key={i} style={{ padding: '5px 8px', color: 'var(--text3)' }}>{row[i]}</td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 12, lineHeight: 1.5 }}>
            Premiums are estimates interpolated from each insurer&apos;s RM1,000,000 illustrations and scaled by sum assured using a per-insurer volume-discount curve calibrated on RM1m–3m quotes (Allianz, HLA, Prudential; AIA &amp; GE scale linearly pending high-SA quotes) — not official quotations; confirm against the insurer system before issue. GE uses a stepped premium (rises steeply with age) and has no male rates. Death-benefit basis and free riders differ materially — see comparison. For advisory discussion only.
          </div>
        </div>
      )}
    </div>
  );
}
