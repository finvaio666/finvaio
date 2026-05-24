'use client';

import { useState, useEffect } from 'react';

// ─── Client data ──────────────────────────────────────────────────────────────
interface ClientData {
  id: string; name: string; income: number; aum: number; dob: string;
}

function ageFromDob(dob: string): number {
  if (!dob) return 0;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(age, 0);
}

// ─── Financial helpers ────────────────────────────────────────────────────────
function fvLumpSum(pv: number, annualRate: number, years: number) {
  return pv * Math.pow(1 + annualRate, years);
}

function fvMonthly(pmt: number, annualRate: number, years: number) {
  if (annualRate === 0) return pmt * years * 12;
  const r = annualRate / 12;
  const n = years * 12;
  return pmt * (Math.pow(1 + r, n) - 1) / r;
}

function pmtNeeded(fvTarget: number, annualRate: number, years: number) {
  if (years <= 0) return 0;
  if (annualRate === 0) return fvTarget / (years * 12);
  const r = annualRate / 12;
  const n = years * 12;
  return fvTarget * r / (Math.pow(1 + r, n) - 1);
}

function fmt(n: number) {
  return `RM ${Math.round(n).toLocaleString()}`;
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `RM ${(n / 1_000).toFixed(1)}K`;
  return fmt(n);
}

// ─── PDF builder ─────────────────────────────────────────────────────────────
interface PDFRow { label: string; value: string; highlight?: 'positive' | 'negative' }
interface PDFSection { title: string; rows: PDFRow[] }
interface PDFReport {
  reportType: string;
  clientName: string;
  subtitle: string;
  sections: PDFSection[];
  summary: { status: 'positive' | 'negative' | 'warning'; headline: string; detail: string };
  assumptions: string;
}

async function downloadPDF(report: PDFReport) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W  = 210;
  const M  = 18;
  const CW = W - M * 2;
  let y    = 0;

  // ── Mastercard-inspired palette ──
  // Canvas surfaces
  const CREAM  = [243, 240, 238] as const;   // #F3F0EE — canvas cream
  const LIFTED = [252, 251, 250] as const;   // #FCFBFA — lifted cream (card/row bg)
  const WHITE  = [255, 255, 255] as const;   // #FFFFFF — pure white accents
  const BONE   = [244, 244, 244] as const;   // #F4F4F4 — alt row

  // Text
  const INK    = [20, 20, 19] as const;      // #141413 — ink black (headlines, CTAs)
  const CHAR   = [38, 38, 39] as const;      // #262627 — charcoal body
  const SLATE  = [105, 105, 105] as const;   // #696969 — muted / secondary
  const DUST   = [209, 205, 199] as const;   // #D1CDC7 — disabled / eyebrow

  // Accent
  const ORANGE = [207, 69, 0] as const;      // #CF4500 — Signal Orange (eyebrow dot)
  const ORANGE2= [243, 115, 56] as const;    // #F37338 — Light Signal Orange (bars, accents)

  // Status
  const PGBG   = [240, 253, 244] as const;
  const PGT    = [21, 128, 61] as const;
  const RGBG   = [254, 242, 242] as const;
  const RGT    = [185, 28, 28] as const;
  const WGBG   = [255, 251, 235] as const;
  const WGT    = [180, 83, 9] as const;

  const dateStr = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── HEADER — cream background, Ink Black typography ──
  doc.setFillColor(...CREAM); doc.rect(0, 0, W, 52, 'F');
  // Signal Orange left stripe
  doc.setFillColor(...ORANGE); doc.rect(0, 0, 4, 52, 'F');
  // bottom border line
  doc.setDrawColor(...DUST); doc.setLineWidth(0.4);
  doc.line(0, 52, W, 52);
  doc.setLineWidth(0.2);

  // Eyebrow — "BILL MORRISONS FINANCIAL CONSULTING · MALAYSIA"
  doc.setFillColor(...ORANGE); doc.circle(M + 5, 12, 1.2, 'F');
  doc.setTextColor(...SLATE); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.setCharSpace(0.6);
  doc.text('BILL MORRISONS FINANCIAL CONSULTING  ·  MALAYSIA', M + 9, 12.8);
  doc.setCharSpace(0);

  // Brand name
  doc.setTextColor(...INK); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('Sky Siew', M + 4, 28);

  // Report type pill — ink black bg, cream text (right side)
  const rLabel = report.reportType.toUpperCase();
  const rLabelW = doc.getTextWidth(rLabel) + 14;
  const rX = W - M - rLabelW;
  doc.setFillColor(...INK);
  doc.roundedRect(rX, 18, rLabelW, 9, 2, 2, 'F');
  doc.setTextColor(...CREAM); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.setCharSpace(0.3);
  doc.text(rLabel, rX + rLabelW / 2, 24, { align: 'center' });
  doc.setCharSpace(0);

  // Date
  doc.setTextColor(...SLATE); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${dateStr}`, W - M, 32, { align: 'right' });

  y = 60;

  // ── CLIENT BAR — lifted cream ──
  doc.setFillColor(...LIFTED); doc.rect(M, y, CW, 18, 'F');
  doc.setDrawColor(...DUST); doc.setLineWidth(0.3);
  doc.rect(M, y, CW, 18, 'S');
  doc.setLineWidth(0.2);
  // left accent dot
  doc.setFillColor(...ORANGE2); doc.rect(M, y, 3, 18, 'F');

  doc.setTextColor(...SLATE); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.setCharSpace(0.5);
  doc.text('PREPARED FOR', M + 8, y + 7);
  doc.setCharSpace(0);
  doc.setTextColor(...INK); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(report.clientName || 'Client', M + 8, y + 14.5);
  doc.setTextColor(...SLATE); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  doc.text(report.subtitle, W - M - 4, y + 14.5, { align: 'right' });

  y += 26;

  // ── SECTIONS ──
  const addSection = (section: PDFSection) => {
    if (y > 250) { doc.addPage(); y = 20; }

    // Section header — cream bg, orange accent bar, INK text
    doc.setFillColor(...CREAM); doc.rect(M, y, CW, 10, 'F');
    doc.setFillColor(...ORANGE2); doc.rect(M, y, 3, 10, 'F');
    doc.setTextColor(...CHAR); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.setCharSpace(0.5);
    doc.text(section.title.toUpperCase(), M + 8, y + 7);
    doc.setCharSpace(0);
    y += 10;

    section.rows.forEach((row, i) => {
      const rowH = 8.5;
      if (row.highlight === 'positive') {
        doc.setFillColor(...PGBG);
      } else if (row.highlight === 'negative') {
        doc.setFillColor(...RGBG);
      } else if (i % 2 === 0) {
        doc.setFillColor(...LIFTED);
      } else {
        doc.setFillColor(...BONE);
      }
      doc.rect(M, y, CW, rowH, 'F');

      doc.setDrawColor(...DUST); doc.setLineWidth(0.2);
      doc.line(M, y + rowH, M + CW, y + rowH);

      if (row.highlight === 'positive') {
        doc.setTextColor(...PGT);
      } else if (row.highlight === 'negative') {
        doc.setTextColor(...RGT);
      } else {
        doc.setTextColor(...CHAR);
      }
      doc.setFontSize(8.5); doc.setFont('helvetica', row.highlight ? 'bold' : 'normal');
      doc.text(row.label, M + 6, y + 5.8);
      doc.setFont('helvetica', row.highlight ? 'bold' : 'normal');
      doc.text(row.value, W - M - 5, y + 5.8, { align: 'right' });

      y += rowH;
    });

    y += 8;
  };

  report.sections.forEach(s => { addSection(s); });

  // ── SUMMARY BOX ──
  if (y > 235) { doc.addPage(); y = 20; }

  const { status, headline, detail } = report.summary;
  const sbg: [number, number, number] = [...(status === 'positive' ? PGBG : status === 'negative' ? RGBG : WGBG)] as [number, number, number];
  const sfc: [number, number, number] = [...(status === 'positive' ? PGT  : status === 'negative' ? RGT  : WGT )] as [number, number, number];
  const sbl: [number, number, number] = status === 'positive' ? [134, 239, 172] : status === 'negative' ? [252, 165, 165] : [253, 211, 77];

  doc.setFillColor(...sbg); doc.rect(M, y, CW, 24, 'F');
  doc.setDrawColor(...sbl); doc.setLineWidth(0.5); doc.rect(M, y, CW, 24, 'S'); doc.setLineWidth(0.2);
  doc.setFillColor(...sfc); doc.rect(M, y, 4, 24, 'F');

  doc.setTextColor(...sfc); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text(headline, M + 9, y + 9.5);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CHAR);
  doc.text(detail, M + 9, y + 18);

  y += 32;

  // ── ASSUMPTIONS ──
  if (report.assumptions) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFillColor(...CREAM); doc.rect(M, y, CW, 15, 'F');
    doc.setDrawColor(...DUST); doc.setLineWidth(0.3);
    doc.rect(M, y, CW, 15, 'S');
    doc.setLineWidth(0.2);
    doc.setFillColor(...ORANGE); doc.rect(M, y, 3, 15, 'F');

    doc.setTextColor(...SLATE); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.setCharSpace(0.5);
    doc.text('ASSUMPTIONS', M + 8, y + 7);
    doc.setCharSpace(0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(...CHAR);
    doc.text(report.assumptions, M + 8, y + 12.5);
  }

  // ── FOOTER — Ink Black band ──
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFillColor(...INK); doc.rect(0, 282, W, 15, 'F');
    doc.setTextColor(...DUST); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('This report is prepared by Bill Morrisons Financial Consulting for advisory purposes only. Not financial advice.', M, 288);
    doc.setTextColor(...CREAM); doc.setFontSize(7);
    doc.text(`Page ${p} of ${pageCount}`, W - M, 288, { align: 'right' });
  }

  const safeName = (report.clientName || 'client').replace(/\s+/g, '-').toLowerCase();
  const safeType = report.reportType.replace(/\s+/g, '-').toLowerCase();
  doc.save(`${safeType}-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, prefix = 'RM', suffix = '', step = 1000, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        {prefix && <span style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text3)', borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{prefix}</span>}
        <input
          type="number" value={value} min={min} step={step}
          onChange={e => onChange(Number(e.target.value))}
          onFocus={e => e.target.select()}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '8px 10px', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13 }}
        />
        {suffix && <span style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text3)', borderLeft: '1px solid var(--border)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight = false, positive = true }: {
  label: string; value: string; highlight?: boolean; positive?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: highlight ? (positive ? 'var(--accent-dim)' : 'var(--red-dim)') : 'transparent' }}>
      <span style={{ fontSize: 12, color: highlight ? (positive ? 'var(--accent2)' : 'var(--red)') : 'var(--text2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: highlight ? (positive ? 'var(--accent)' : 'var(--red)') : 'var(--text)' }}>{value}</span>
    </div>
  );
}

function DownloadButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 'var(--r-sm)', border: '1px solid rgba(74,222,128,0.35)', background: loading ? 'var(--surface2)' : 'var(--accent-dim)', color: loading ? 'var(--text3)' : 'var(--accent)', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
      {loading ? (
        <><span style={{ display: 'inline-block', width: 12, height: 12, border: '1.5px solid var(--text3)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Generating…</>
      ) : (
        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download PDF</>
      )}
    </button>
  );
}

// ─── Retirement Calculator ────────────────────────────────────────────────────
const RETIREMENT_DEFAULTS = {
  clientName: '', currentAge: 35, retirementAge: 60,
  currentEPF: 0, currentInvestments: 0,
  monthlyEPF: 0, monthlyInvestment: 0,
  epfDividend: 5.5, investmentReturn: 8.0, inflationRate: 3.5,
  targetMonthlyIncome: 5000, retirementDuration: 20,
};

function RetirementCalculator({ preloadClient }: { preloadClient?: ClientData | null }) {
  const [f, setF] = useState({ ...RETIREMENT_DEFAULTS });
  const [pdfLoading, setPdfLoading] = useState(false);

  // Pre-fill when a client is selected
  useEffect(() => {
    if (!preloadClient) return;
    const age = ageFromDob(preloadClient.dob);
    setF(prev => ({
      ...prev,
      clientName:          preloadClient.name,
      currentAge:          age || prev.currentAge,
      currentInvestments:  preloadClient.aum  > 0 ? preloadClient.aum  : prev.currentInvestments,
      targetMonthlyIncome: preloadClient.income > 0 ? Math.round(preloadClient.income * 0.7) : prev.targetMonthlyIncome,
      monthlyEPF:          preloadClient.income > 0 ? Math.round(preloadClient.income * 0.23) : prev.monthlyEPF,
    }));
  }, [preloadClient]);

  const set = (k: keyof typeof f) => (v: number | string) => setF(prev => ({ ...prev, [k]: v }));

  const years = Math.max(f.retirementAge - f.currentAge, 0);
  const epfRate = f.epfDividend / 100;
  const invRate = f.investmentReturn / 100;
  const inflRate = f.inflationRate / 100;

  const epfAtRetirement = fvLumpSum(f.currentEPF, epfRate, years) + fvMonthly(f.monthlyEPF, epfRate, years);
  const invAtRetirement = fvLumpSum(f.currentInvestments, invRate, years) + fvMonthly(f.monthlyInvestment, invRate, years);
  const totalFund = epfAtRetirement + invAtRetirement;

  const inflatedMonthlyIncome = f.targetMonthlyIncome * Math.pow(1 + inflRate, years);
  const annualIncomeNeeded = inflatedMonthlyIncome * 12;
  const requiredFund = annualIncomeNeeded * f.retirementDuration;

  const gap = totalFund - requiredFund;
  const isOnTrack = gap >= 0;
  const additionalMonthlyNeeded = isOnTrack ? 0 : pmtNeeded(-gap, invRate, years);

  const handleDownload = async () => {
    setPdfLoading(true);
    try {
      const resultRows: PDFRow[] = [
        { label: 'EPF at retirement', value: fmtK(epfAtRetirement) },
        { label: 'Investments at retirement', value: fmtK(invAtRetirement) },
        { label: 'Total projected fund', value: fmtK(totalFund), highlight: isOnTrack ? 'positive' : undefined },
        { label: `Monthly income needed (inflation-adjusted)`, value: fmt(inflatedMonthlyIncome) },
        { label: `Required fund (${f.retirementDuration} years)`, value: fmtK(requiredFund) },
        { label: isOnTrack ? 'Projected surplus' : 'Retirement gap', value: isOnTrack ? `+${fmtK(gap)}` : fmtK(Math.abs(gap)), highlight: isOnTrack ? 'positive' : 'negative' },
        ...(!isOnTrack ? [{ label: 'Additional monthly savings needed', value: fmt(additionalMonthlyNeeded), highlight: 'negative' as const }] : []),
      ];

      await downloadPDF({
        reportType: 'Retirement Planning Report',
        clientName: f.clientName,
        subtitle: `Age ${f.currentAge} → Retire at ${f.retirementAge}  ·  ${years} years`,
        sections: [
          {
            title: 'Current Savings Position',
            rows: [
              { label: 'Current EPF (Account 1+2)', value: fmt(f.currentEPF) },
              { label: 'Current investments', value: fmt(f.currentInvestments) },
              { label: 'Monthly EPF contribution', value: fmt(f.monthlyEPF) },
              { label: 'Monthly investment contribution', value: fmt(f.monthlyInvestment) },
            ],
          },
          {
            title: 'Planning Assumptions',
            rows: [
              { label: 'EPF dividend rate', value: `${f.epfDividend}% p.a.` },
              { label: 'Investment expected return', value: `${f.investmentReturn}% p.a.` },
              { label: 'Inflation rate', value: `${f.inflationRate}% p.a.` },
              { label: 'Target monthly income (today\'s value)', value: fmt(f.targetMonthlyIncome) },
              { label: 'Retirement duration', value: `${f.retirementDuration} years` },
            ],
          },
          { title: 'Projection Results', rows: resultRows },
        ],
        summary: isOnTrack
          ? { status: 'positive', headline: `✅ ON TRACK — Projected surplus: +${fmtK(gap)}`, detail: `${f.clientName} is projected to have sufficient funds for retirement at age ${f.retirementAge}.` }
          : { status: 'negative', headline: `⚠️ RETIREMENT GAP — Shortfall: ${fmtK(Math.abs(gap))}`, detail: `Additional monthly savings of ${fmt(additionalMonthlyNeeded)} required to close the gap by retirement.` },
        assumptions: `EPF ${f.epfDividend}% p.a.  ·  Investment ${f.investmentReturn}% p.a.  ·  Inflation ${f.inflationRate}% p.a.  ·  Retirement lasts ${f.retirementDuration} years`,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Client Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Name</label>
          <input value={f.clientName} onChange={e => setF(p => ({ ...p, clientName: e.target.value }))}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Current Age" value={f.currentAge} onChange={set('currentAge')} prefix="" suffix="yrs" step={1} min={18} />
          <Field label="Retirement Age" value={f.retirementAge} onChange={set('retirementAge')} prefix="" suffix="yrs" step={1} min={50} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Current Savings</div>
        <Field label="Current EPF Balance" value={f.currentEPF} onChange={set('currentEPF')} />
        <Field label="Current Investments" value={f.currentInvestments} onChange={set('currentInvestments')} />

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Monthly Contributions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="EPF (employee+employer)" value={f.monthlyEPF} onChange={set('monthlyEPF')} />
          <Field label="Investments" value={f.monthlyInvestment} onChange={set('monthlyInvestment')} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Assumptions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="EPF Dividend %" value={f.epfDividend} onChange={set('epfDividend')} prefix="" suffix="%" step={0.1} />
          <Field label="Inv. Return %" value={f.investmentReturn} onChange={set('investmentReturn')} prefix="" suffix="%" step={0.1} />
          <Field label="Inflation %" value={f.inflationRate} onChange={set('inflationRate')} prefix="" suffix="%" step={0.1} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Retirement Goal</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Target Monthly Income" value={f.targetMonthlyIncome} onChange={set('targetMonthlyIncome')} />
          <Field label="Retirement Duration" value={f.retirementDuration} onChange={set('retirementDuration')} prefix="" suffix="yrs" step={1} min={10} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: isOnTrack ? 'var(--accent-dim)' : 'var(--red-dim)', border: `1px solid ${isOnTrack ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 'var(--r)', padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: isOnTrack ? 'var(--accent)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {isOnTrack ? '✅ On Track' : '⚠️ Retirement Gap'}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: isOnTrack ? 'var(--accent)' : 'var(--red)', lineHeight: 1 }}>
            {isOnTrack ? `+${fmtK(gap)}` : fmtK(Math.abs(gap))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
            {isOnTrack ? 'Projected surplus at retirement' : 'Shortfall to plug'}
          </div>
        </div>

        <div className="section" style={{ margin: 0 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--accent)' }} />
              Projection for {f.clientName}
            </div>
            <DownloadButton onClick={handleDownload} loading={pdfLoading} />
          </div>
          <ResultRow label="EPF at retirement" value={fmtK(epfAtRetirement)} />
          <ResultRow label="Investments at retirement" value={fmtK(invAtRetirement)} />
          <ResultRow label="Total projected fund" value={fmtK(totalFund)} highlight positive={isOnTrack} />
          <ResultRow label="Monthly income needed (inflation-adj.)" value={fmt(inflatedMonthlyIncome)} />
          <ResultRow label={`Required fund (${f.retirementDuration} yrs)`} value={fmtK(requiredFund)} />
          <ResultRow label={isOnTrack ? 'Surplus' : 'Retirement gap'} value={isOnTrack ? `+${fmtK(gap)}` : fmtK(Math.abs(gap))} highlight positive={isOnTrack} />
          {!isOnTrack && <ResultRow label="Additional monthly savings needed" value={fmt(additionalMonthlyNeeded)} highlight positive={false} />}
        </div>

        <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
          💡 <strong style={{ color: 'var(--text2)' }}>Assumptions:</strong> EPF dividend {f.epfDividend}% p.a. · Investment return {f.investmentReturn}% p.a. · Inflation {f.inflationRate}% p.a. · Retirement lasts {f.retirementDuration} years
        </div>
      </div>
    </div>
  );
}

// ─── Education Calculator ─────────────────────────────────────────────────────
function EducationCalculator({ preloadClient }: { preloadClient?: ClientData | null }) {
  const [f, setF] = useState({
    clientName: '', childName: '', childAge: 5, universityAge: 18,
    currentEducationCost: 120000, educationInflation: 5.0,
    currentSavings: 0, monthlySavings: 500, savingsReturn: 5.0,
  });
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!preloadClient) return;
    setF(prev => ({ ...prev, clientName: preloadClient.name }));
  }, [preloadClient]);

  const set = (k: keyof typeof f) => (v: number | string) => setF(prev => ({ ...prev, [k]: v }));

  const years = Math.max(f.universityAge - f.childAge, 0);
  const eduInflRate = f.educationInflation / 100;
  const retRate = f.savingsReturn / 100;

  const futureCost = fvLumpSum(f.currentEducationCost, eduInflRate, years);
  const projectedSavings = fvLumpSum(f.currentSavings, retRate, years) + fvMonthly(f.monthlySavings, retRate, years);
  const gap = futureCost - projectedSavings;
  const isOnTrack = gap <= 0;
  const additionalMonthlyNeeded = isOnTrack ? 0 : pmtNeeded(gap, retRate, years);

  const handleDownload = async () => {
    setPdfLoading(true);
    try {
      await downloadPDF({
        reportType: 'Education Planning Report',
        clientName: f.clientName || 'Client',
        subtitle: f.childName ? `For ${f.childName}  ·  University in ${years} years` : `University in ${years} years`,
        sections: [
          {
            title: 'Child & Education Details',
            rows: [
              { label: "Child's name", value: f.childName || '—' },
              { label: "Child's current age", value: `${f.childAge} years old` },
              { label: 'Target university age', value: `${f.universityAge} years old` },
              { label: 'Years until university', value: `${years} years` },
              { label: 'Current education cost (today\'s value)', value: fmt(f.currentEducationCost) },
              { label: 'Education inflation rate', value: `${f.educationInflation}% p.a.` },
            ],
          },
          {
            title: 'Education Savings Plan',
            rows: [
              { label: 'Current education savings', value: fmt(f.currentSavings) },
              { label: 'Monthly savings contribution', value: fmt(f.monthlySavings) },
              { label: 'Expected return on savings', value: `${f.savingsReturn}% p.a.` },
            ],
          },
          {
            title: 'Projection Results',
            rows: [
              { label: 'Inflation-adjusted education cost', value: fmtK(futureCost) },
              { label: 'Projected savings at university age', value: fmtK(projectedSavings) },
              { label: isOnTrack ? 'Funding surplus' : 'Funding gap', value: isOnTrack ? `+${fmtK(Math.abs(gap))}` : fmtK(gap), highlight: isOnTrack ? 'positive' : 'negative' },
              ...(!isOnTrack ? [
                { label: 'Additional monthly savings needed', value: fmt(additionalMonthlyNeeded), highlight: 'negative' as const },
                { label: 'Total monthly savings needed', value: fmt(f.monthlySavings + additionalMonthlyNeeded) },
              ] : []),
            ],
          },
        ],
        summary: isOnTrack
          ? { status: 'positive', headline: `✅ FULLY FUNDED — Surplus: +${fmtK(Math.abs(gap))}`, detail: `${f.childName || 'Child'}\'s education fund is on track with projected savings exceeding the cost.` }
          : { status: 'negative', headline: `⚠️ EDUCATION GAP — Shortfall: ${fmtK(gap)}`, detail: `Increase monthly savings by ${fmt(additionalMonthlyNeeded)} to fully fund ${f.childName || 'child'}\'s education.` },
        assumptions: `Education inflation ${f.educationInflation}% p.a.  ·  Savings return ${f.savingsReturn}% p.a.  ·  Reference: Local private ~RM 150K–300K, Overseas ~RM 400K–800K`,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Client & Child Details</div>
        {[
          { label: 'Client Name', key: 'clientName' as const },
          { label: 'Child Name', key: 'childName' as const },
        ].map(({ label, key }) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
            <input value={f[key] as string} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))}
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Child's Current Age" value={f.childAge} onChange={set('childAge')} prefix="" suffix="yrs" step={1} min={0} />
          <Field label="University Age" value={f.universityAge} onChange={set('universityAge')} prefix="" suffix="yrs" step={1} min={16} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Education Cost</div>
        <Field label="Current Education Cost (today's value)" value={f.currentEducationCost} onChange={set('currentEducationCost')} />
        <Field label="Education Inflation Rate" value={f.educationInflation} onChange={set('educationInflation')} prefix="" suffix="%" step={0.5} />

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Education Savings</div>
        <Field label="Current Education Savings" value={f.currentSavings} onChange={set('currentSavings')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Monthly Savings" value={f.monthlySavings} onChange={set('monthlySavings')} />
          <Field label="Expected Return" value={f.savingsReturn} onChange={set('savingsReturn')} prefix="" suffix="%" step={0.5} />
        </div>

        <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          💡 Local university: ~RM 80K–150K · Private local: ~RM 150K–300K · Overseas: ~RM 400K–800K
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: isOnTrack ? 'var(--accent-dim)' : 'var(--red-dim)', border: `1px solid ${isOnTrack ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 'var(--r)', padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: isOnTrack ? 'var(--accent)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {isOnTrack ? '✅ Fully Funded' : '⚠️ Education Gap'}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: isOnTrack ? 'var(--accent)' : 'var(--red)', lineHeight: 1 }}>
            {isOnTrack ? `+${fmtK(Math.abs(gap))}` : fmtK(gap)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
            {f.childName ? `${f.childName}'s education fund` : 'Education fund'} {isOnTrack ? 'surplus' : 'shortfall'}
          </div>
        </div>

        <div className="section" style={{ margin: 0 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--blue)' }} />
              {f.childName ? `${f.childName}'s Education Plan` : 'Education Projection'}
            </div>
            <DownloadButton onClick={handleDownload} loading={pdfLoading} />
          </div>
          <ResultRow label="Inflation-adjusted education cost" value={fmtK(futureCost)} />
          <ResultRow label="Projected savings at university age" value={fmtK(projectedSavings)} />
          <ResultRow label={isOnTrack ? 'Surplus' : 'Funding gap'} value={isOnTrack ? `+${fmtK(Math.abs(gap))}` : fmtK(gap)} highlight positive={isOnTrack} />
          {!isOnTrack && <ResultRow label="Additional monthly savings needed" value={fmt(additionalMonthlyNeeded)} highlight positive={false} />}
          {!isOnTrack && <ResultRow label="Total monthly savings needed" value={fmt(f.monthlySavings + additionalMonthlyNeeded)} />}
        </div>
      </div>
    </div>
  );
}

// ─── Emergency Fund Calculator ────────────────────────────────────────────────
function EmergencyFundCalculator({ preloadClient }: { preloadClient?: ClientData | null }) {
  const [f, setF] = useState({
    clientName: '', monthlyExpenses: 5000, targetMonths: 6,
    currentEmergencyFund: 0, monthlyContribution: 500, buildUpMonths: 24,
  });
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!preloadClient) return;
    setF(prev => ({
      ...prev,
      clientName:      preloadClient.name,
      monthlyExpenses: preloadClient.income > 0 ? Math.round(preloadClient.income * 0.7) : prev.monthlyExpenses,
    }));
  }, [preloadClient]);

  const set = (k: keyof typeof f) => (v: number | string) => setF(prev => ({ ...prev, [k]: v }));

  const target = f.monthlyExpenses * f.targetMonths;
  const gap = Math.max(target - f.currentEmergencyFund, 0);
  const isOnTrack = gap === 0;
  const monthsToTarget = f.monthlyContribution > 0 ? Math.ceil(gap / f.monthlyContribution) : Infinity;
  const monthlyNeeded = f.buildUpMonths > 0 ? Math.ceil(gap / f.buildUpMonths) : 0;
  const coverageMonths = f.monthlyExpenses > 0 ? (f.currentEmergencyFund / f.monthlyExpenses).toFixed(1) : '0';
  const coverageNum = f.monthlyExpenses > 0 ? f.currentEmergencyFund / f.monthlyExpenses : 0;
  const status = isOnTrack ? 'positive' : coverageNum >= 3 ? 'warning' : 'negative';

  const handleDownload = async () => {
    setPdfLoading(true);
    try {
      await downloadPDF({
        reportType: 'Emergency Fund Report',
        clientName: f.clientName || 'Client',
        subtitle: `${coverageMonths} months coverage  ·  Target: ${f.targetMonths} months`,
        sections: [
          {
            title: 'Monthly Expenses & Target',
            rows: [
              { label: 'Monthly expenses', value: fmt(f.monthlyExpenses) },
              { label: 'Target coverage period', value: `${f.targetMonths} months` },
              { label: 'Emergency fund target', value: fmt(target) },
              { label: 'Build-up period', value: `${f.buildUpMonths} months` },
            ],
          },
          {
            title: 'Current Position',
            rows: [
              { label: 'Current emergency fund', value: fmt(f.currentEmergencyFund) },
              { label: 'Current coverage', value: `${coverageMonths} months` },
              { label: 'Gap to target', value: isOnTrack ? 'Fully funded ✅' : fmt(gap), highlight: isOnTrack ? 'positive' : 'negative' },
              { label: 'Monthly contribution', value: fmt(f.monthlyContribution) },
            ],
          },
          {
            title: 'Action Plan',
            rows: [
              ...(isOnTrack ? [{ label: 'Status', value: 'Target achieved — maintain the fund ✅', highlight: 'positive' as const }] : [
                { label: `Monthly needed (${f.buildUpMonths}-month build-up)`, value: fmt(monthlyNeeded), highlight: 'negative' as const },
                { label: 'Months to target at current rate', value: isFinite(monthsToTarget) ? `${monthsToTarget} months` : 'N/A' },
                { label: 'Coverage benchmark: Minimum (3 months)', value: coverageNum >= 3 ? '✅ Met' : '❌ Not met' },
                { label: 'Coverage benchmark: Target (6 months)', value: coverageNum >= 6 ? '✅ Met' : '❌ Not met' },
              ]),
            ],
          },
        ],
        summary: isOnTrack
          ? { status: 'positive', headline: '✅ TARGET ACHIEVED — Emergency fund fully funded', detail: `${f.clientName || 'Client'} has ${coverageMonths} months of expenses covered.` }
          : status === 'warning'
          ? { status: 'warning', headline: `🟡 PARTIAL COVERAGE — ${coverageMonths} of ${f.targetMonths} months covered`, detail: `Shortfall of ${fmt(gap)}. Monthly top-up of ${fmt(monthlyNeeded)} needed over ${f.buildUpMonths} months.` }
          : { status: 'negative', headline: `⚠️ UNDERFUNDED — ${coverageMonths} months coverage only`, detail: `Shortfall of ${fmt(gap)}. Prioritise building this fund before increasing investment exposure.` },
        assumptions: `BNM recommends 6 months for salaried employees  ·  12 months for self-employed  ·  Keep in high-liquidity accounts (savings/money market)`,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Client Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Name</label>
          <input value={f.clientName} onChange={e => setF(p => ({ ...p, clientName: e.target.value }))}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Expenses & Target</div>
        <Field label="Monthly Expenses" value={f.monthlyExpenses} onChange={set('monthlyExpenses')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Target Coverage" value={f.targetMonths} onChange={set('targetMonths')} prefix="" suffix="months" step={1} min={3} />
          <Field label="Build-up Period" value={f.buildUpMonths} onChange={set('buildUpMonths')} prefix="" suffix="months" step={1} min={1} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Current Position</div>
        <Field label="Current Emergency Fund" value={f.currentEmergencyFund} onChange={set('currentEmergencyFund')} />
        <Field label="Monthly Contribution" value={f.monthlyContribution} onChange={set('monthlyContribution')} />

        <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          💡 BNM recommends <strong style={{ color: 'var(--text2)' }}>6 months</strong> for salaried employees · <strong style={{ color: 'var(--text2)' }}>12 months</strong> for self-employed
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: isOnTrack ? 'var(--accent-dim)' : coverageNum >= 3 ? 'var(--gold-dim)' : 'var(--red-dim)', border: `1px solid ${isOnTrack ? 'rgba(74,222,128,0.3)' : coverageNum >= 3 ? 'rgba(245,158,11,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 'var(--r)', padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: isOnTrack ? 'var(--accent)' : coverageNum >= 3 ? 'var(--gold)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {isOnTrack ? '✅ Target Achieved' : coverageNum >= 3 ? '🟡 Partial Coverage' : '⚠️ Underfunded'}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--text)', lineHeight: 1 }}>{coverageMonths} months</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>current coverage · target {f.targetMonths} months</div>
        </div>

        <div className="section" style={{ margin: 0 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--gold)' }} />
              {f.clientName || 'Client'} — Emergency Fund
            </div>
            <DownloadButton onClick={handleDownload} loading={pdfLoading} />
          </div>
          <ResultRow label="Target emergency fund" value={fmt(target)} />
          <ResultRow label="Current fund" value={fmt(f.currentEmergencyFund)} />
          <ResultRow label="Gap to target" value={isOnTrack ? 'Fully funded ✅' : fmt(gap)} highlight positive={isOnTrack} />
          {!isOnTrack && <ResultRow label={`Monthly needed (${f.buildUpMonths} months)`} value={fmt(monthlyNeeded)} highlight positive={false} />}
          {!isOnTrack && f.monthlyContribution > 0 && <ResultRow label="Months to target at current rate" value={isFinite(monthsToTarget) ? `${monthsToTarget} months` : '—'} />}
        </div>

        <div className="section" style={{ margin: 0 }}>
          <div style={{ padding: '16px 20px' }}>
            <div className="chart-title" style={{ marginBottom: 12 }}>Coverage Progress</div>
            {[
              { label: 'Minimum (3M)', months: 3 },
              { label: `Target (${f.targetMonths}M)`, months: f.targetMonths },
              { label: 'Self-employed (12M)', months: 12 },
            ].map(b => {
              const pct = Math.min((f.currentEmergencyFund / (f.monthlyExpenses * b.months)) * 100, 100);
              return (
                <div key={b.label} className="bar-row" style={{ marginBottom: 8 }}>
                  <div className="bar-label">{b.label}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? '#4ADE80' : pct >= 50 ? '#F59E0B' : '#F87171' }} />
                  </div>
                  <div className="bar-val">{Math.round(pct)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Insurance Planning Calculator ───────────────────────────────────────────
function InsurancePlanningCalculator({ preloadClient }: { preloadClient?: ClientData | null }) {
  const [f, setF] = useState({
    clientName:          '',
    currentAge:          35,
    monthlyIncome:       8000,
    dependents:          2,
    yearsToSupport:      20,
    outstandingDebt:     300000,
    finalExpenses:       30000,
    existingLife:        0,
    existingCI:          0,
    existingTPD:         0,
    existingPA:          0,
    annualPremiumBudget: 0,
  });
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!preloadClient) return;
    const age = ageFromDob(preloadClient.dob);
    setF(prev => ({
      ...prev,
      clientName:          preloadClient.name,
      currentAge:          age || prev.currentAge,
      monthlyIncome:       preloadClient.income > 0 ? preloadClient.income : prev.monthlyIncome,
      annualPremiumBudget: preloadClient.income > 0 ? Math.round(preloadClient.income * 0.10 * 12) : prev.annualPremiumBudget,
    }));
  }, [preloadClient]);

  const set = (k: keyof typeof f) => (v: number | string) => setF(prev => ({ ...prev, [k]: v }));

  const annualIncome      = f.monthlyIncome * 12;
  const incomeReplacement = annualIncome * f.yearsToSupport;
  const recommendedLife   = incomeReplacement + f.outstandingDebt + f.finalExpenses;
  const recommendedCI     = Math.max(annualIncome * 5, 200000);
  const recommendedTPD    = recommendedLife;
  const recommendedPA     = annualIncome * 2;
  const lifeGap  = Math.max(recommendedLife - f.existingLife, 0);
  const ciGap    = Math.max(recommendedCI   - f.existingCI,   0);
  const tpdGap   = Math.max(recommendedTPD  - f.existingTPD,  0);
  const paGap    = Math.max(recommendedPA   - f.existingPA,   0);

  const suggestedBudget = Math.round(annualIncome * 0.10);
  const scores = [
    Math.min(f.existingLife / recommendedLife, 1),
    Math.min(f.existingCI   / recommendedCI,   1),
    Math.min(f.existingTPD  / recommendedTPD,  1),
  ];
  const overallScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
  const scoreColor   = overallScore >= 80 ? 'var(--green)' : overallScore >= 50 ? 'var(--gold)' : 'var(--red)';
  const scoreBg      = overallScore >= 80 ? 'var(--green-dim)' : overallScore >= 50 ? 'var(--gold-dim)' : 'var(--red-dim)';
  const scoreLabel   = overallScore >= 80 ? '✅ Well Protected' : overallScore >= 50 ? '🟡 Partially Protected' : '⚠️ Underprotected';
  const summaryStatus: 'positive' | 'warning' | 'negative' = overallScore >= 80 ? 'positive' : overallScore >= 50 ? 'warning' : 'negative';

  const coverageRow = (label: string, existing: number, recommended: number, gap: number) => {
    const pct    = Math.min(Math.round((existing / recommended) * 100), 100);
    const isMet  = gap === 0;
    return (
      <div key={label}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: isMet ? 'var(--green)' : 'var(--red)' }}>
            {isMet ? '✅ Met' : `Gap: ${fmtK(gap)}`}
          </span>
        </div>
        <div style={{ padding: '0 16px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <div className="bar-track" style={{ flex: 1 }}>
              <div className="bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? '#4ADE80' : pct >= 50 ? '#F59E0B' : '#F87171' }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)', width: 36, textAlign: 'right' }}>{pct}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            <span>Have: {fmtK(existing)}</span>
            <span>Need: {fmtK(recommended)}</span>
          </div>
        </div>
      </div>
    );
  };

  const handleDownload = async () => {
    setPdfLoading(true);
    try {
      await downloadPDF({
        reportType: 'Insurance Planning Report',
        clientName: f.clientName || 'Client',
        subtitle:   `Age ${f.currentAge}  ·  ${f.dependents} dependent(s)  ·  Protection Score: ${overallScore}%`,
        sections: [
          {
            title: 'Client Profile',
            rows: [
              { label: 'Current age',           value: `${f.currentAge} years old` },
              { label: 'Monthly income',         value: fmt(f.monthlyIncome) },
              { label: 'Annual income',          value: fmt(annualIncome) },
              { label: 'Dependents',             value: `${f.dependents} person(s)` },
              { label: 'Years to support dependents', value: `${f.yearsToSupport} years` },
              { label: 'Outstanding debts',      value: fmt(f.outstandingDebt) },
              { label: 'Final expense estimate', value: fmt(f.finalExpenses) },
            ],
          },
          {
            title: 'Life / Death Benefit Analysis',
            rows: [
              { label: 'Income replacement need',   value: fmtK(incomeReplacement) },
              { label: 'Outstanding debts',         value: fmtK(f.outstandingDebt) },
              { label: 'Final expenses',            value: fmtK(f.finalExpenses) },
              { label: 'Total life cover needed',   value: fmtK(recommendedLife) },
              { label: 'Existing life cover',       value: fmtK(f.existingLife) },
              { label: lifeGap === 0 ? 'Status' : 'Life cover gap', value: lifeGap === 0 ? 'Fully covered ✅' : fmtK(lifeGap), highlight: lifeGap === 0 ? 'positive' : 'negative' },
            ],
          },
          {
            title: 'Critical Illness & TPD Analysis',
            rows: [
              { label: 'CI cover needed (5× annual income, min RM 200K)', value: fmtK(recommendedCI) },
              { label: 'Existing CI cover',  value: fmtK(f.existingCI) },
              { label: ciGap === 0 ? 'CI status' : 'CI cover gap', value: ciGap === 0 ? 'Fully covered ✅' : fmtK(ciGap), highlight: ciGap === 0 ? 'positive' : 'negative' },
              { label: 'TPD cover needed',   value: fmtK(recommendedTPD) },
              { label: 'Existing TPD cover', value: fmtK(f.existingTPD) },
              { label: tpdGap === 0 ? 'TPD status' : 'TPD cover gap', value: tpdGap === 0 ? 'Fully covered ✅' : fmtK(tpdGap), highlight: tpdGap === 0 ? 'positive' : 'negative' },
            ],
          },
          {
            title: 'Personal Accident & Budget',
            rows: [
              { label: 'PA cover needed (2× annual income)', value: fmtK(recommendedPA) },
              { label: 'Existing PA cover',  value: fmtK(f.existingPA) },
              { label: paGap === 0 ? 'PA status' : 'PA cover gap', value: paGap === 0 ? 'Fully covered ✅' : fmtK(paGap), highlight: paGap === 0 ? 'positive' : 'negative' },
              { label: 'Suggested annual premium budget (10% income)', value: fmtK(suggestedBudget) },
              { label: 'Current annual premium budget', value: f.annualPremiumBudget > 0 ? fmtK(f.annualPremiumBudget) : 'Not specified' },
            ],
          },
        ],
        summary: {
          status:   summaryStatus,
          headline: `${scoreLabel} — Overall Protection Score: ${overallScore}%`,
          detail:   lifeGap > 0
            ? `Priority: Close life cover gap of ${fmtK(lifeGap)}. ${ciGap > 0 ? `CI gap: ${fmtK(ciGap)}.` : ''} Review existing policies and top up accordingly.`
            : `Life and TPD adequately covered. ${ciGap > 0 ? `Consider topping up CI cover by ${fmtK(ciGap)}.` : 'CI coverage is sufficient.'} Review annually.`,
        },
        assumptions: `Life need = income replacement (${f.yearsToSupport} yrs) + debts + final expenses  ·  CI = max(5× annual income, RM 200K)  ·  TPD = same as Life  ·  PA = 2× annual income  ·  Premium budget = 10% annual income`,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* ── Left: Inputs ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Client Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Name</label>
          <input value={f.clientName} onChange={e => setF(p => ({ ...p, clientName: e.target.value }))}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Current Age"   value={f.currentAge}  onChange={set('currentAge')}  prefix="" suffix="yrs" step={1} min={18} />
          <Field label="Dependents"    value={f.dependents}  onChange={set('dependents')}  prefix="" suffix="pax" step={1} min={0} />
        </div>
        <Field label="Monthly Income" value={f.monthlyIncome} onChange={set('monthlyIncome')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Years to Support Dependents" value={f.yearsToSupport}  onChange={set('yearsToSupport')}  prefix="" suffix="yrs" step={1} min={1} />
          <Field label="Final Expenses"              value={f.finalExpenses}   onChange={set('finalExpenses')}   step={5000} />
        </div>
        <Field label="Outstanding Debts (Mortgage + Loans)" value={f.outstandingDebt} onChange={set('outstandingDebt')} step={10000} />

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Existing Coverage</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Life Cover"  value={f.existingLife} onChange={set('existingLife')} step={50000} />
          <Field label="CI Cover"    value={f.existingCI}   onChange={set('existingCI')}   step={50000} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="TPD Cover"   value={f.existingTPD}  onChange={set('existingTPD')}  step={50000} />
          <Field label="PA Cover"    value={f.existingPA}   onChange={set('existingPA')}   step={10000} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Premium Budget</div>
        <Field label="Annual Premium Budget" value={f.annualPremiumBudget} onChange={set('annualPremiumBudget')} step={500} />
        <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          💡 Suggested budget: <strong style={{ color: 'var(--text2)' }}>{fmtK(suggestedBudget)}/yr</strong> (10% of annual income) · Life need = income replacement + debts + final expenses
        </div>
      </div>

      {/* ── Right: Results ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Overall score card */}
        <div style={{ background: scoreBg, border: `1px solid ${scoreColor}40`, borderRadius: 'var(--r)', padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: scoreColor, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {scoreLabel}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 48, color: scoreColor, lineHeight: 1, fontWeight: 500 }}>
            {overallScore}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>Overall protection score</div>
        </div>

        {/* Coverage breakdown */}
        <div className="section" style={{ margin: 0 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--purple)' }} />
              Coverage Gap Analysis
            </div>
            <DownloadButton onClick={handleDownload} loading={pdfLoading} />
          </div>
          {coverageRow('💀 Life / Death Benefit', f.existingLife, recommendedLife, lifeGap)}
          {coverageRow('🏥 Critical Illness (CI)', f.existingCI, recommendedCI, ciGap)}
          {coverageRow('♿ Total Permanent Disability (TPD)', f.existingTPD, recommendedTPD, tpdGap)}
          {coverageRow('🚑 Personal Accident (PA)', f.existingPA, recommendedPA, paGap)}

          {/* Budget check */}
          <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>💰 Premium Budget (10% rule)</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: f.annualPremiumBudget >= suggestedBudget ? 'var(--green)' : f.annualPremiumBudget > 0 ? 'var(--gold)' : 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              {f.annualPremiumBudget > 0
                ? f.annualPremiumBudget >= suggestedBudget ? `✅ ${fmtK(f.annualPremiumBudget)}/yr` : `🟡 ${fmtK(f.annualPremiumBudget)} vs ${fmtK(suggestedBudget)}`
                : `Suggested: ${fmtK(suggestedBudget)}/yr`}
            </span>
          </div>
        </div>

        {/* Recommended coverage summary */}
        <div className="section" style={{ margin: 0 }}>
          <div className="section-header">
            <div className="section-title">
              <span className="section-dot" style={{ background: 'var(--blue)' }} />
              Recommended Coverage
            </div>
          </div>
          {[
            { label: 'Life / Death Benefit', val: recommendedLife, color: 'var(--red)' },
            { label: 'Critical Illness',     val: recommendedCI,   color: 'var(--purple)' },
            { label: 'TPD',                  val: recommendedTPD,  color: 'var(--blue)' },
            { label: 'Personal Accident',    val: recommendedPA,   color: 'var(--gold)' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: r.color }}>{fmtK(r.val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Planning Page ───────────────────────────────────────────────────────
const TABS = [
  { id: 'retirement', label: '📊 Retirement Planning' },
  { id: 'education',  label: '🎓 Education Planning'  },
  { id: 'emergency',  label: '🛡️ Emergency Fund'      },
  { id: 'insurance',  label: '🔒 Insurance Planning'  },
];

export default function PlanningPage() {
  const [activeTab,      setActiveTab]      = useState('retirement');
  const [clients,        setClients]        = useState<ClientData[]>([]);
  const [mode,           setMode]           = useState<'existing' | 'prospect'>('prospect');
  const [selectedId,     setSelectedId]     = useState('');
  const [preloadClient,  setPreloadClient]  = useState<ClientData | null>(null);

  useEffect(() => {
    fetch('/api/notion?type=clients', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (j.data) setClients(j.data); });
  }, []);

  // When client selection changes, update preload
  useEffect(() => {
    if (mode === 'existing' && selectedId) {
      const c = clients.find(c => c.id === selectedId) ?? null;
      setPreloadClient(c);
    } else {
      setPreloadClient(null);
    }
  }, [mode, selectedId, clients]);

  const accentColor = activeTab === 'retirement' ? 'var(--accent)' : activeTab === 'education' ? 'var(--blue)' : activeTab === 'insurance' ? 'var(--purple)' : 'var(--gold)';

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Client selector bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', flexWrap: 'wrap' }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: 3, gap: 2 }}>
          {([['existing', '👤 Existing Client'], ['prospect', '✏️ Fresh Prospect']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '6px 14px', borderRadius: 'var(--r-pill)', border: 'none', cursor: 'pointer',
              background: mode === m ? 'var(--text)' : 'transparent',
              color: mode === m ? 'var(--bg)' : 'var(--text3)',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>{label}</button>
          ))}
        </div>

        {/* Client dropdown — shown in existing mode */}
        {mode === 'existing' && (
          <>
            <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{
                width: '100%', padding: '8px 32px 8px 14px', borderRadius: 'var(--r-pill)',
                border: `1px solid ${selectedId ? 'var(--accent2)' : 'var(--border)'}`,
                background: 'var(--bg)', color: selectedId ? 'var(--text)' : 'var(--text3)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none', appearance: 'none',
                fontFamily: 'var(--font-sans)',
              }}>
                <option value=''>— select client —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10, color: 'var(--text3)' }}>▼</span>
            </div>

            {/* Client summary chips */}
            {preloadClient && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {preloadClient.dob && ageFromDob(preloadClient.dob) > 0 && (
                  <span style={{ padding: '4px 10px', borderRadius: 'var(--r-pill)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 11, fontWeight: 600 }}>
                    Age {ageFromDob(preloadClient.dob)}
                  </span>
                )}
                {preloadClient.income > 0 && (
                  <span style={{ padding: '4px 10px', borderRadius: 'var(--r-pill)', background: 'var(--blue-dim, #EFF6FF)', color: 'var(--blue)', fontSize: 11, fontWeight: 600 }}>
                    RM {preloadClient.income.toLocaleString()}/mth
                  </span>
                )}
                {preloadClient.aum > 0 && (
                  <span style={{ padding: '4px 10px', borderRadius: 'var(--r-pill)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 11, fontWeight: 600 }}>
                    AUM RM {(preloadClient.aum / 1000).toFixed(0)}K
                  </span>
                )}
              </div>
            )}

            {selectedId && (
              <button onClick={() => setSelectedId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', padding: '4px 8px', borderRadius: 8 }}>✕ Clear</button>
            )}
          </>
        )}

        {mode === 'prospect' && (
          <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Enter details manually below — data is not saved to Notion</span>
        )}
      </div>

      {/* ── Calculator tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: '8px 16px', borderRadius: 'var(--r-sm)', border: `1px solid ${activeTab === tab.id ? 'rgba(74,222,128,0.4)' : 'var(--border)'}`, background: activeTab === tab.id ? 'var(--accent-dim)' : 'var(--surface)', color: activeTab === tab.id ? 'var(--accent)' : 'var(--text2)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="section" style={{ padding: 24 }}>
        <div className="section-header" style={{ marginBottom: 20 }}>
          <div className="section-title">
            <span className="section-dot" style={{ background: accentColor }} />
            {TABS.find(t => t.id === activeTab)?.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {preloadClient ? `Pre-filled from ${preloadClient.name} · edit any field freely` : 'Live calculation'}
          </div>
        </div>

        {activeTab === 'retirement' && <RetirementCalculator      preloadClient={preloadClient} />}
        {activeTab === 'education'  && <EducationCalculator       preloadClient={preloadClient} />}
        {activeTab === 'emergency'  && <EmergencyFundCalculator   preloadClient={preloadClient} />}
        {activeTab === 'insurance'  && <InsurancePlanningCalculator preloadClient={preloadClient} />}
      </div>
    </>
  );
}
