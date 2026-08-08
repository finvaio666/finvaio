'use client';

import { useState, useMemo } from 'react';
import { estimateAll, type Gender, type LsaInsurer, type LsaResult } from '@/lib/lsaCalculator';
import { LSA_BENEFITS, LSA_PLAN_LABEL } from '@/lib/lsaBenefits';
import {
  Section, Grid, Field, Segmented, Btn, Pill, Notice, FinePrint,
  inp, money, fmtRM, fmtRMShort,
} from '@/components/calculatorUI';

const INSURER_COLOR: Record<LsaInsurer, string> = {
  AIA: '#3860BE', GE: '#16A34A', Allianz: '#7C3AED', HLA: '#F79E1B', Prudential: '#EB001B',
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

    const prof = `${gender === 'M' ? 'Male' : 'Female'}  -  ${smoker ? 'Smoker' : 'Non-Smoker'}  -  Age ${ageN}  -  Sum Assured ${fmtRM(saN)}`;
    doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    if (clientName) doc.text('Client: ' + clientName, 40, 84);
    doc.text(prof, 40, clientName ? 98 : 84);

    let y = (clientName ? 98 : 84) + 18;
    autoTable(doc, {
      startY: y,
      head: [['Insurer', 'Product', 'Monthly', 'Annual', 'Total to 80', 'Death benefit basis']],
      body: chosen.map((c) => [c.insurer, c.product, fmtRM(c.monthly as number), fmtRM(c.annual as number), c.outlay80 != null ? fmtRM(c.outlay80) : '-', c.deathBasis]),
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
      'Important: Premiums are estimates interpolated (log-linear on age) from each insurer\'s official RM1,000,000 illustrations (ages 20-60) and scaled by sum assured using a per-insurer volume-discount curve calibrated on RM1m-3m quotes (Allianz, HLA, Prudential; AIA and GE scale linearly pending high-SA quotes); they are not official quotations and must be confirmed against the insurer system before issue. GE uses a STEPPED premium - low now, rising steeply with age - so compare the total outlay to age 80, not the monthly figure; GE male smoker ages 56-60 are not yet quoted. Death-benefit basis and free riders differ materially between insurers - read the comparison above. For advisory discussion only.',
      W - 80,
    );
    doc.text(disc, 40, y);
    doc.save(`LSA_Proposal_${clientName || 'client'}.pdf`);
  }

  return (
    <>
      <Section title="Client & Coverage" dot="var(--accent2)">
        <Grid min={190}>
          <Field label="Client name (optional)">
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Mr Tan" style={inp} />
          </Field>
          <Field label="Age last birthday (20–60)" hint="Key the client's actual age — a Prudential/GE sheet showing ANB X means age X−1 here.">
            <input type="number" min={20} max={60} value={age} onChange={(e) => setAge(e.target.value)} style={inp} />
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
          <Field label="Sum Assured (RM)">
            <input type="number" min={100000} step={100000} value={sumAssured} onChange={(e) => setSumAssured(e.target.value)} style={inp} />
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
          <Notice>
            <strong>Total to age 80</strong> is the full premium outlay over the life of the policy — the honest cost.
            A low <em>stepped</em> monthly premium (GE) can still end up the most expensive.
          </Notice>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14 }}>
            {results.map((r) => {
              const hasQuote = r.monthly != null;
              const on = picked.has(r.insurer);
              const c = INSURER_COLOR[r.insurer];
              const isLowest = hasQuote && r.insurer === firstQuoted && r.structure !== 'stepped';
              const isLoOutlay = outlayRange && r.outlay80 != null && r.outlay80 === outlayRange.lo;
              const isHiOutlay = outlayRange && r.outlay80 != null && r.outlay80 === outlayRange.hi;
              return (
                <div
                  key={r.insurer}
                  onClick={() => togglePick(r.insurer, hasQuote)}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    background: 'var(--surface)', borderRadius: 24, padding: '18px 16px 16px',
                    cursor: hasQuote ? 'pointer' : 'not-allowed',
                    opacity: hasQuote ? 1 : 0.55,
                    border: `1.5px solid ${on ? c : 'var(--border)'}`,
                    boxShadow: on ? 'var(--shadow-sm)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: c, letterSpacing: '-0.01em' }}>{r.insurer}</span>
                    {hasQuote && (
                      <span style={{ fontSize: 15, color: on ? c : 'var(--text3)' }}>{on ? '☑' : '☐'}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2, marginBottom: 10 }}>{r.product}</div>

                  {hasQuote ? (
                    <>
                      <div style={{ ...money, fontSize: 26, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                        {fmtRM(r.monthly as number)}
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}> /mo</span>
                      </div>
                      <div style={{ ...money, fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                        {fmtRM(r.annual as number)} / year
                      </div>

                      {r.outlay80 != null && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            Total to age 80
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <span style={{
                              ...money, fontSize: 15, fontWeight: 600,
                              color: isHiOutlay ? '#92400E' : isLoOutlay ? 'var(--green)' : 'var(--text2)',
                            }}>
                              {fmtRMShort(r.outlay80)}
                            </span>
                            {isLoOutlay && <Pill color="#16A34A">LEAST</Pill>}
                            {isHiOutlay && <Pill color="#92400E">MOST</Pill>}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', padding: '14px 0' }}>
                      {r.note ?? 'No quote'}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
                    {hasQuote && r.structure === 'stepped' && <Pill color="#92400E">STEPPED</Pill>}
                    {isLowest && <Pill color="#16A34A">LOWEST</Pill>}
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
          title={`Legacy Proposal${clientName ? ` — ${clientName}` : ''}`}
          dot="var(--blue)"
          action={<Btn variant="ghost" onClick={downloadPdf}>⬇ Download PDF</Btn>}
        >
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
            {gender === 'M' ? 'Male' : 'Female'} · {smoker ? 'Smoker' : 'Non-Smoker'} · Age {ageN} · Sum Assured{' '}
            <span style={money}>{fmtRM(saN)}</span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {chosen.map((c) => (
              <div key={c.insurer} style={{
                flex: '1 1 155px', borderRadius: 20, padding: 14,
                background: 'var(--bg2)', border: `1px solid ${INSURER_COLOR[c.insurer]}40`,
              }}>
                <div style={{ fontWeight: 700, color: INSURER_COLOR[c.insurer], fontSize: 12.5 }}>{c.insurer}</div>
                <div style={{ ...money, fontSize: 19, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.02em', marginTop: 4 }}>
                  {fmtRM(c.monthly as number)}
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>/mo</span>
                </div>
                <div style={{ ...money, fontSize: 11, color: 'var(--text3)' }}>{fmtRM(c.annual as number)}/yr</div>
                {c.outlay80 != null && (
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 6 }}>
                    Total to 80: <strong style={{ ...money, color: 'var(--text2)' }}>{fmtRMShort(c.outlay80)}</strong>
                  </div>
                )}
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
                  }}>Feature</th>
                  {chosenInsurers.map((i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '10px 12px', background: 'var(--bg2)', minWidth: 155 }}>
                      <div style={{ color: INSURER_COLOR[i], fontSize: 12, fontWeight: 700 }}>{i}</div>
                      <div style={{ fontSize: 9.5, fontWeight: 400, color: 'var(--text3)' }}>{LSA_PLAN_LABEL[i]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LSA_BENEFITS.flatMap((sec) => [
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
            Premiums are estimates interpolated from each insurer&apos;s RM1,000,000 illustrations and scaled by sum assured
            using a per-insurer volume-discount curve calibrated on RM1m–3m quotes (Allianz, HLA, Prudential; AIA &amp; GE
            scale linearly pending high-SA quotes) — not official quotations; confirm against the insurer system before issue.
            GE uses a stepped premium — its low year-1 figure escalates and can end up the highest lifetime cost. Death-benefit
            basis and free riders differ materially — see comparison.
            For advisory discussion only.
          </FinePrint>
        </Section>
      )}
    </>
  );
}
