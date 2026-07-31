'use client';

import { useState, useMemo } from 'react';
import {
  estimateAll, getExclusions, PLAN_TYPES, type Exclusion, type Gender, type Insurer, type PremiumResult,
} from '@/lib/insuranceCalculator';
import { MEDICAL_BENEFITS, MEDICAL_PLAN_LABEL } from '@/lib/insuranceMedicalBenefits';
import {
  Section, Grid, Field, Segmented, Btn, Pill, Notice, FinePrint,
  inp, money, fmtRM,
} from '@/components/calculatorUI';

const INSURER_COLOR: Record<Insurer, string> = {
  AIA: '#3860BE', GE: '#16A34A', Allianz: '#7C3AED', HLA: '#F79E1B',
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
    doc.text('Prepared in FINVA  |  ' + new Date().toLocaleDateString('en-GB'), 40, 62);

    const prof = `${gender === 'M' ? 'Male' : 'Female'}  -  ${smoker ? 'Smoker' : 'Non-Smoker'}  -  Age ${ageN}`;
    const cover = `Life ${fmtRM(lifeN)}  -  Critical Illness ${fmtRM(ciN)}  -  Medical Room ${medPlan}  -  Waiver of premium ${waiver ? 'included' : 'excluded'}`;
    doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    if (clientName) doc.text('Client: ' + clientName, 40, 84);
    doc.text(prof, 40, clientName ? 98 : 84);
    doc.text(cover, 40, clientName ? 112 : 98);

    let y = (clientName ? 112 : 98) + 16;
    autoTable(doc, {
      startY: y,
      head: [['Insurer', 'Product', 'Monthly', 'Annual']],
      body: chosen.map((c) => [c.insurer, c.product, fmtRM(c.monthly), fmtRM(c.annual)]),
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
    <>
      <Section title="Client & Coverage" dot="var(--accent2)">
        <Grid min={190}>
          <Field label="Plan type" span>
            <select value={planType} onChange={(e) => setPlanType(e.target.value)} style={inp}>
              {PLAN_TYPES.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.enabled}>
                  {p.label}{p.enabled ? '' : '  (coming soon)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Client name (optional)">
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Mr Tan" style={inp} />
          </Field>
          <Field label="Age (last birthday)">
            <input type="number" min={1} max={75} value={age} onChange={(e) => setAge(e.target.value)} style={inp} />
          </Field>
          <Field label="Gender">
            <Segmented<Gender>
              value={gender}
              onChange={setGender}
              options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]}
            />
          </Field>
          <Field label="Smoker">
            <Segmented<boolean>
              value={smoker}
              onChange={setSmoker}
              options={[{ value: false, label: 'Non-Smoker' }, { value: true, label: 'Smoker' }]}
            />
          </Field>
          <Field label="Life Sum Assured (RM)">
            <input type="number" min={0} step={10000} value={lifeSA} onChange={(e) => setLifeSA(e.target.value)} style={inp} />
          </Field>
          <Field label="Critical Illness SA (RM)">
            <input type="number" min={0} step={10000} value={ciSA} onChange={(e) => setCiSA(e.target.value)} style={inp} />
          </Field>
          <Field label="Medical plan">
            <select value={medPlan} disabled style={{ ...inp, opacity: 0.65 }}>
              <option value="200">Room RM200 (RM500 deductible)</option>
            </select>
          </Field>
          <Field label="Waiver of premium rider">
            <Segmented<boolean>
              value={waiver}
              onChange={setWaiver}
              options={[{ value: true, label: 'Included' }, { value: false, label: 'Excluded' }]}
            />
          </Field>
        </Grid>
        <div style={{ marginTop: 18 }}>
          <Btn onClick={calculate}>Calculate premiums</Btn>
        </div>
      </Section>

      {results && (
        <Section
          title="Estimated Premiums"
          dot="var(--green)"
          action={<span style={{ fontSize: 12, color: 'var(--text3)' }}>{chosen.length} selected</span>}
        >
          {exclusions.length > 0 && (
            <Notice>
              {exclusions.map((e) => (
                <div key={e.insurer}><strong>{e.insurer} excluded.</strong> {e.reason}</div>
              ))}
            </Notice>
          )}

          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
            Tick the insurers to include in the proposal — the cheapest three are pre-selected.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {results.map((r, i) => {
              const on = picked.has(r.insurer);
              const c = INSURER_COLOR[r.insurer];
              return (
                <div
                  key={r.insurer}
                  onClick={() => togglePick(r.insurer)}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    background: 'var(--surface)', borderRadius: 24, padding: '18px 16px 16px',
                    cursor: 'pointer',
                    border: `1.5px solid ${on ? c : 'var(--border)'}`,
                    boxShadow: on ? 'var(--shadow-sm)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: c, letterSpacing: '-0.01em' }}>{r.insurer}</span>
                    <span style={{ fontSize: 15, color: on ? c : 'var(--text3)' }}>{on ? '☑' : '☐'}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2, marginBottom: 10 }}>{r.product}</div>

                  <div style={{ ...money, fontSize: 26, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {fmtRM(r.monthly)}
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}> /mo</span>
                  </div>
                  <div style={{ ...money, fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{fmtRM(r.annual)} / year</div>

                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
                    {r.verified && <Pill color="#7C3AED">✓ VERIFIED</Pill>}
                    {!r.verified && i === 0 && <Pill color="#16A34A">LOWEST</Pill>}
                  </div>

                  <div style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>{r.caveat}</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 18 }}>
            <Btn onClick={() => setShowProposal(true)} disabled={chosen.length === 0}>
              Generate proposal ({chosen.length} insurer{chosen.length === 1 ? '' : 's'})
            </Btn>
          </div>
        </Section>
      )}

      {showProposal && chosen.length > 0 && (
        <Section
          title={`Proposal${clientName ? ` — ${clientName}` : ''}`}
          dot="var(--blue)"
          action={<Btn variant="ghost" onClick={downloadPdf}>⬇ Download PDF</Btn>}
        >
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
            {gender === 'M' ? 'Male' : 'Female'} · {smoker ? 'Smoker' : 'Non-Smoker'} · Age {ageN} · Life{' '}
            <span style={money}>{fmtRM(lifeN)}</span> · CI <span style={money}>{fmtRM(ciN)}</span> · Medical Room {medPlan} · Waiver {waiver ? 'incl.' : 'excl.'}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {chosen.map((c) => (
              <div key={c.insurer} style={{
                flex: '1 1 150px', borderRadius: 20, padding: 14,
                background: 'var(--bg2)', border: `1px solid ${INSURER_COLOR[c.insurer]}40`,
              }}>
                <div style={{ fontWeight: 700, color: INSURER_COLOR[c.insurer], fontSize: 12.5 }}>{c.insurer}</div>
                <div style={{ ...money, fontSize: 19, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.02em', marginTop: 4 }}>
                  {fmtRM(c.monthly)}
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>/mo</span>
                </div>
                <div style={{ ...money, fontSize: 11, color: 'var(--text3)' }}>{fmtRM(c.annual)}/yr</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{
                    textAlign: 'left', padding: '10px 12px', background: 'var(--bg2)', color: 'var(--text3)',
                    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    position: 'sticky', left: 0, minWidth: 150,
                  }}>Benefit</th>
                  {chosenInsurers.map((i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '10px 12px', background: 'var(--bg2)', minWidth: 140 }}>
                      <div style={{ color: INSURER_COLOR[i], fontSize: 12, fontWeight: 700 }}>{i}</div>
                      <div style={{ fontSize: 9.5, fontWeight: 400, color: 'var(--text3)' }}>{MEDICAL_PLAN_LABEL[i]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MEDICAL_BENEFITS.flatMap((sec) => [
                  <tr key={sec.section}>
                    <td colSpan={chosenInsurers.length + 1} style={{
                      padding: '8px 12px', background: 'var(--surface2)', fontWeight: 700,
                      color: 'var(--text)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{sec.section}</td>
                  </tr>,
                  ...sec.rows.map((row) => (
                    <tr key={sec.section + row.benefit} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text2)' }}>{row.benefit}</td>
                      {chosenInsurers.map((i) => (
                        <td key={i} style={{ padding: '8px 12px', color: 'var(--text3)', lineHeight: 1.5 }}>{row[i]}</td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>

          <FinePrint>
            Premiums are estimates (~0.5% at quoted ages) from a reverse-engineered model, not official quotations —
            confirm against the insurer system before issue. Medical fixed at Room 200. HLA package also bundles a
            TPD lump-sum rider + two payor riders. For advisory discussion only.
          </FinePrint>
        </Section>
      )}
    </>
  );
}
