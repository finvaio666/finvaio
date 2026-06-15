'use client';

import { useState, useMemo } from 'react';
import {
  estimateAll, getExclusions, PLAN_TYPES, type Exclusion, type Gender, type Insurer, type PremiumResult,
} from '@/lib/insuranceCalculator';
import { MEDICAL_BENEFITS, MEDICAL_PLAN_LABEL } from '@/lib/insuranceMedicalBenefits';

const fmt = (n: number) => 'RM ' + Math.round(n).toLocaleString();

const INSURER_COLOR: Record<Insurer, string> = {
  AIA: '#1F4E78', GE: '#1F6B3B', Allianz: '#6B2C8F', HLA: '#B8860B',
};

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, display: 'block' };
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
};

export default function PremiumCalculator() {
  const [planType, setPlanType] = useState('ilp200');
  const [clientName, setClientName] = useState('');
  const [age, setAge] = useState('30');
  const [gender, setGender] = useState<Gender>('M');
  const [smoker, setSmoker] = useState(false);
  const [lifeSA, setLifeSA] = useState('100000');
  const [ciSA, setCiSA] = useState('100000');
  const [waiver, setWaiver] = useState(true);
  const [medPlan] = useState('200');

  // numeric inputs are held as strings (so the field can be empty while typing) and parsed at use
  const ageN = parseInt(age, 10) || 0;
  const lifeN = parseInt(lifeSA, 10) || 0;
  const ciN = parseInt(ciSA, 10) || 0;

  const [results, setResults] = useState<PremiumResult[] | null>(null);
  const [picked, setPicked] = useState<Set<Insurer>>(new Set());
  const [showProposal, setShowProposal] = useState(false);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);

  function calculate() {
    setExclusions(getExclusions(lifeN, ciN));
    const r = estimateAll(ageN, gender, smoker, lifeN, ciN, waiver);
    setResults(r);
    setPicked(new Set(r.slice(0, 3).map((x) => x.insurer))); // default = cheapest 3
    setShowProposal(false);
  }

  function togglePick(ins: Insurer) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(ins)) next.delete(ins); else next.add(ins);
      return next;
    });
    setShowProposal(false);
  }

  const chosen = useMemo(
    () => (results ?? []).filter((r) => picked.has(r.insurer)),
    [results, picked],
  );
  const chosenInsurers = chosen.map((c) => c.insurer);

  async function downloadPdf() {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setTextColor(26, 26, 26);
    doc.text('Insurance Premium Proposal', 40, 46);
    doc.setFontSize(9); doc.setTextColor(110, 110, 110);
    doc.text('Prepared in ARIA  |  ' + new Date().toLocaleDateString('en-GB'), 40, 62);

    const prof = `${gender === 'M' ? 'Male' : 'Female'}  -  ${smoker ? 'Smoker' : 'Non-Smoker'}  -  Age ${ageN}`;
    const cover = `Life ${fmt(lifeN)}  -  Critical Illness ${fmt(ciN)}  -  Medical Room ${medPlan}  -  Waiver of premium ${waiver ? 'included' : 'excluded'}`;
    doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    if (clientName) doc.text('Client: ' + clientName, 40, 84);
    doc.text(prof, 40, clientName ? 98 : 84);
    doc.text(cover, 40, clientName ? 112 : 98);

    let y = (clientName ? 112 : 98) + 16;
    autoTable(doc, {
      startY: y,
      head: [['Insurer', 'Product', 'Monthly', 'Annual']],
      body: chosen.map((c) => [c.insurer, c.product, fmt(c.monthly), fmt(c.annual)]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [64, 64, 64] },
      theme: 'grid',
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
    doc.setFontSize(12); doc.setTextColor(26, 26, 26);
    doc.text('Medical Card - Benefit Comparison', 40, y); y += 8;

    const head = ['Benefit', ...chosenInsurers.map((i) => `${i}\n${MEDICAL_PLAN_LABEL[i]}`)];
    const body: string[][] = [];
    for (const sec of MEDICAL_BENEFITS) {
      body.push([sec.section, ...chosenInsurers.map(() => '')]);
      for (const row of sec.rows) body.push([row.benefit, ...chosenInsurers.map((i) => row[i])]);
    }
    autoTable(doc, {
      startY: y + 4,
      head: [head],
      body,
      styles: { fontSize: 7, cellPadding: 3, valign: 'top' },
      headStyles: { fillColor: [64, 64, 64], fontSize: 7 },
      columnStyles: { 0: { cellWidth: 110, fontStyle: 'bold' } },
      theme: 'grid',
      didParseCell: (d) => {
        const raw = d.row.raw as string[];
        if (d.section === 'body' && MEDICAL_BENEFITS.some((s) => s.section === raw[0])) {
          d.cell.styles.fillColor = [217, 225, 242];
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    doc.setFontSize(7); doc.setTextColor(130, 130, 130);
    const disc = doc.splitTextToSize(
      'Important: Premiums are estimates from a reverse-engineered attained-age model that reproduces each insurer\'s official illustrations to ~0.5% at quoted ages; they are not official quotations and must be confirmed against the insurer\'s system before issue. Medical fixed at Room 200; cost of insurance rises with age and medical inflation. HLA package bundles extra riders (TPD lump sum + payors). For advisory discussion only.',
      W - 80,
    );
    doc.text(disc, 40, y);
    doc.save(`Insurance_Proposal_${clientName || 'client'}.pdf`);
  }

  return (
    <div className="section" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>🧮 Premium Calculator</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
        Estimate &amp; compare ILP premiums across AIA, GE, Allianz and HLA, then build a client proposal. Figures are estimates — confirm against the insurer system before issue.
      </div>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Plan type</label>
          <select value={planType} onChange={(e) => setPlanType(e.target.value)} style={inp}>
            {PLAN_TYPES.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.enabled}>{p.label}{p.enabled ? '' : '  (coming soon)'}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>Client name (optional)</label>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Mr Tan" style={inp} />
        </div>
        <div>
          <label style={lbl}>Age (last birthday)</label>
          <input type="number" min={1} max={75} value={age} onChange={(e) => setAge(e.target.value)} style={inp} />
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
          <label style={lbl}>Life Sum Assured (RM)</label>
          <input type="number" min={0} step={10000} value={lifeSA} onChange={(e) => setLifeSA(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Critical Illness SA (RM)</label>
          <input type="number" min={0} step={10000} value={ciSA} onChange={(e) => setCiSA(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Medical plan</label>
          <select value={medPlan} disabled style={{ ...inp, opacity: 0.7 }}>
            <option value="200">Room RM200 (RM500 deductible)</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Waiver of premium rider</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[true, false].map((w) => (
              <button key={String(w)} onClick={() => setWaiver(w)} style={{
                flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${waiver === w ? 'var(--accent2)' : 'var(--border)'}`,
                background: waiver === w ? 'var(--accent2)' : 'var(--surface)', color: waiver === w ? '#fff' : 'var(--text3)',
              }}>{w ? 'Included' : 'Excluded'}</button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={calculate} style={{
        padding: '10px 24px', borderRadius: 'var(--r-pill)', border: 'none', background: '#F37338',
        color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>Calculate premiums</button>

      {/* Results */}
      {results && (
        <div style={{ marginTop: 24 }}>
          {exclusions.length > 0 && (
            <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, border: '1px solid #D9920033', background: '#D992001A', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠️</span>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                {exclusions.map((e) => (
                  <div key={e.insurer}><strong>{e.insurer} excluded.</strong> {e.reason}</div>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
            Tick the insurers to include in the proposal (cheapest 3 pre-selected):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {results.map((r, i) => {
              const on = picked.has(r.insurer); const c = INSURER_COLOR[r.insurer];
              return (
                <div key={r.insurer} onClick={() => togglePick(r.insurer)} style={{
                  cursor: 'pointer', border: `2px solid ${on ? c : 'var(--border)'}`, borderRadius: 12,
                  padding: 14, background: on ? `${c}0D` : 'var(--surface)', position: 'relative',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: c }}>{r.insurer}</span>
                    <span style={{ fontSize: 16 }}>{on ? '☑' : '☐'}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>{r.product}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{fmt(r.monthly)}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)' }}> /mo</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmt(r.annual)} / year</div>
                  {r.verified
                    ? <div style={{ position: 'absolute', top: 10, right: 38, fontSize: 9, fontWeight: 700, color: '#6B2C8F', background: '#6B2C8F1A', padding: '2px 6px', borderRadius: 6 }}>✓ VERIFIED</div>
                    : i === 0 && <div style={{ position: 'absolute', top: 10, right: 38, fontSize: 9, fontWeight: 700, color: '#1F6B3B', background: '#1F6B3B1A', padding: '2px 6px', borderRadius: 6 }}>LOWEST</div>}
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
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Proposal{clientName ? ` — ${clientName}` : ''}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{gender === 'M' ? 'Male' : 'Female'} · {smoker ? 'Smoker' : 'Non-Smoker'} · Age {ageN} · Life {fmt(lifeN)} · CI {fmt(ciN)} · Medical Room {medPlan} · Waiver {waiver ? 'incl.' : 'excl.'}</div>
            </div>
            <button onClick={downloadPdf} style={{
              padding: '9px 18px', borderRadius: 'var(--r-pill)', border: 'none', background: '#F37338',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>⬇ Download PDF</button>
          </div>

          {/* Premium summary */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {chosen.map((c) => (
              <div key={c.insurer} style={{ flex: '1 1 140px', border: `1px solid ${INSURER_COLOR[c.insurer]}55`, borderRadius: 10, padding: 12, background: 'var(--surface)' }}>
                <div style={{ fontWeight: 700, color: INSURER_COLOR[c.insurer], fontSize: 13 }}>{c.insurer}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{fmt(c.monthly)}<span style={{ fontSize: 10, color: 'var(--text3)' }}>/mo</span></div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmt(c.annual)}/yr</div>
              </div>
            ))}
          </div>

          {/* Medical benefits table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--surface2)', color: 'var(--text3)', position: 'sticky', left: 0 }}>Benefit</th>
                  {chosenInsurers.map((i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--surface2)', color: INSURER_COLOR[i], minWidth: 130 }}>
                      {i}<div style={{ fontSize: 9, fontWeight: 400, color: 'var(--text3)' }}>{MEDICAL_PLAN_LABEL[i]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MEDICAL_BENEFITS.flatMap((sec) => [
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
            Premiums are estimates (~0.5% at quoted ages) from a reverse-engineered model, not official quotations — confirm against the insurer system before issue. Medical fixed at Room 200. HLA package also bundles a TPD lump-sum rider + two payor riders. For advisory discussion only.
          </div>
        </div>
      )}
    </div>
  );
}
