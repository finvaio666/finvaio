/**
 * Client Wealth Summary PDF — Bill Morrisons Financial Consulting
 * Uses jsPDF + jspdf-autotable (client-side, no server needed).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Brand colours ─────────────────────────────────────────────────────────────
const C = {
  navy:    [10,  20,  45]  as [number,number,number],
  navy2:   [18,  30,  60]  as [number,number,number],
  accent:  [96, 165, 250]  as [number,number,number],  // blue-400
  green:   [74, 222, 128]  as [number,number,number],  // green-400
  gold:    [245,158, 11]   as [number,number,number],  // amber-500
  red:     [248, 113, 113] as [number,number,number],  // red-400
  white:   [255, 255, 255] as [number,number,number],
  grey:    [148, 163, 184] as [number,number,number],
  lightbg: [241, 245, 249] as [number,number,number],
  border:  [226, 232, 240] as [number,number,number],
  text:    [30,  41,  59]  as [number,number,number],
  text2:   [71,  85, 105]  as [number,number,number],
};

const FMT = {
  myr: (n: number) =>
    n === 0 ? '—'
    : n >= 1_000_000 ? `RM ${(n/1_000_000).toFixed(2)}M`
    : n >= 1_000     ? `RM ${(n/1_000).toFixed(1)}K`
    : `RM ${Math.round(n).toLocaleString()}`,
  date: (s: string) =>
    s ? new Date(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
  pct: (n: number) => `${(n * 100).toFixed(1)}%`,
};

type ReportData = {
  client: {
    name: string; status: string; segment: string; risk: string;
    aum: number; income: number; goals: string[]; dob: string;
    onboarding: string; nextReview: string; email: string; phone: string;
  };
  portfolio: Array<{
    name: string; assetClass: string; institution: string; currency: string;
    valueOrig: number; valueMYR: number; purchaseOrig: number; purchaseMYR: number;
    fxRate: number; status: string; maturityDate: string;
  }>;
  insurance: Array<{
    policyName: string; insuranceType: string; benefits: string[];
    status: string; insurer: string; policyNumber: string;
    sumAssured: number; lifeCover: number; ciCover: number; paCover: number;
    tpdCover: number; medicalClass: string; annualPremium: number;
    commencementDate: string; maturityDate: string; beneficiary: string;
  }>;
  generatedAt: string;
};

// ── Helper: draw D1 triangle ─────────────────────────────────────────────────
function drawD1Triangle(doc: jsPDF, cx: number, cy: number, size: number, color: [number,number,number]) {
  const h = size * 0.866;
  doc.setFillColor(...color);
  doc.triangle(cx, cy - h * 0.67, cx - size / 2, cy + h * 0.33, cx + size / 2, cy + h * 0.33, 'F');
}

// ── Helper: section header bar ────────────────────────────────────────────────
function sectionHeader(doc: jsPDF, y: number, title: string, icon: string) {
  doc.setFillColor(...C.navy2);
  doc.roundedRect(14, y, 182, 9, 1.5, 1.5, 'F');
  doc.setFillColor(...C.accent);
  doc.roundedRect(14, y, 3, 9, 1, 1, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${icon}  ${title}`, 21, y + 6);
  return y + 13;
}

// ── Helper: stat pill ─────────────────────────────────────────────────────────
function statPill(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, color: [number,number,number]) {
  doc.setFillColor(...C.lightbg);
  doc.roundedRect(x, y, w, 16, 2, 2, 'F');
  doc.setFillColor(...color);
  doc.roundedRect(x, y, 3, 16, 1, 1, 'F');
  doc.setTextColor(...C.text2);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(label, x + 7, y + 6);
  doc.setTextColor(...C.text);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(value, x + 7, y + 13);
}

// ── Helper: effective MYR value for a holding ─────────────────────────────────
function effectiveMYR(h: ReportData['portfolio'][0]) {
  if (h.valueMYR > 0) return h.valueMYR;
  if (h.currency === 'MYR' && h.valueOrig > 0) return h.valueOrig;
  if (h.fxRate > 0 && h.valueOrig > 0) return h.valueOrig * h.fxRate;
  // fallback FX
  const FX: Record<string,number> = { MYR:1, USD:4.47, SGD:3.32, GBP:5.65, EUR:4.85, AUD:2.90, HKD:0.57 };
  return h.valueOrig * (FX[h.currency] ?? 1);
}

// ── Main export ───────────────────────────────────────────────────────────────
export function generateClientReport(data: ReportData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const today = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });

  /* ════════════════════════════════════════════════════════════════
     PAGE 1 — COVER
  ════════════════════════════════════════════════════════════════ */
  // Background
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, W, H, 'F');

  // Decorative gradient band (simulated with opacity rectangles)
  doc.setFillColor(96, 165, 250);
  doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
  doc.rect(0, 0, W, 120, 'F');
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  // D1 Triangle logo — large, centre-top
  drawD1Triangle(doc, W / 2, 60, 38, C.accent);
  // Inner white triangle (hollow look)
  drawD1Triangle(doc, W / 2, 56, 18, C.navy);

  // Company name
  doc.setTextColor(...C.white);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL MORRISONS', W / 2, 82, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.grey);
  doc.text('Financial Consulting', W / 2, 88, { align: 'center' });

  // Divider line
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.4);
  doc.line(60, 100, W - 60, 100);

  // Report title
  doc.setTextColor(...C.grey);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('WEALTH SUMMARY REPORT', W / 2, 112, { align: 'center', charSpace: 2 });

  // Client name — large
  doc.setTextColor(...C.white);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  const clientLines = doc.splitTextToSize(data.client.name, 160);
  doc.text(clientLines, W / 2, 128, { align: 'center' });

  // Status / segment pills (drawn as text badges)
  let badgeY = 138 + (clientLines.length - 1) * 8;
  const badges = [data.client.status, data.client.segment, data.client.risk].filter(Boolean);
  const totalBadgeW = badges.reduce((s, b) => s + doc.getTextWidth(b) + 12, 0) + (badges.length - 1) * 4;
  let bx = (W - totalBadgeW) / 2;
  badges.forEach(badge => {
    const bw = doc.getTextWidth(badge) + 12;
    doc.setFillColor(96, 165, 250);
    doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
    doc.roundedRect(bx, badgeY, bw, 6, 3, 3, 'F');
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, badgeY, bw, 6, 3, 3, 'D');
    doc.setTextColor(...C.accent);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(badge, bx + bw / 2, badgeY + 4.2, { align: 'center' });
    bx += bw + 4;
  });

  // Stats bar
  const statsY = badgeY + 20;
  const active = data.portfolio.filter(h => h.status?.includes('Active'));
  const totalAUM = active.reduce((s, h) => s + effectiveMYR(h), 0);
  const activePolicies = data.insurance.filter(p => p.status?.includes('Active'));
  const totalSA = activePolicies.reduce((s, p) => s + p.sumAssured, 0);
  const totalPremium = activePolicies.reduce((s, p) => s + p.annualPremium, 0);

  const stats = [
    { label: 'Total AUM', value: FMT.myr(totalAUM || data.client.aum) },
    { label: 'Holdings', value: `${active.length}` },
    { label: 'Sum Assured', value: FMT.myr(totalSA) },
    { label: 'Annual Premium', value: FMT.myr(totalPremium) },
  ];
  const sw = (W - 28 - 12) / 4;
  stats.forEach((s, i) => {
    const sx = 14 + i * (sw + 4);
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as any).GState({ opacity: 0.06 }));
    doc.roundedRect(sx, statsY, sw, 18, 2, 2, 'F');
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
    doc.setTextColor(...C.grey);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(s.label, sx + sw / 2, statsY + 6.5, { align: 'center' });
    doc.setTextColor(...C.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(s.value, sx + sw / 2, statsY + 13.5, { align: 'center' });
  });

  // Goals section
  if (data.client.goals?.length > 0) {
    const gy = statsY + 28;
    doc.setTextColor(...C.grey);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('FINANCIAL GOALS', W / 2, gy, { align: 'center', charSpace: 1 });
    const goalText = data.client.goals.join('  ·  ');
    doc.setTextColor(...C.accent);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(goalText, W / 2, gy + 7, { align: 'center' });
  }

  // Client details grid
  const detY = H - 90;
  doc.setDrawColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
  doc.line(14, detY, W - 14, detY);
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  const details = [
    { label: 'Date of Birth', value: FMT.date(data.client.dob) },
    { label: 'Onboarding Date', value: FMT.date(data.client.onboarding) },
    { label: 'Next Review', value: FMT.date(data.client.nextReview) },
    { label: 'Monthly Income', value: data.client.income > 0 ? FMT.myr(data.client.income) : '—' },
  ].filter(d => d.value !== '—');

  const dw = (W - 28) / Math.min(details.length, 4);
  details.slice(0, 4).forEach((d, i) => {
    const dx = 14 + i * dw;
    doc.setTextColor(...C.grey);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(d.label.toUpperCase(), dx, detY + 10);
    doc.setTextColor(...C.white);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(d.value, dx, detY + 17);
  });

  // Footer
  doc.setDrawColor(...C.accent);
  doc.setGState(new (doc as any).GState({ opacity: 0.3 }));
  doc.line(14, H - 30, W - 14, H - 30);
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
  doc.setTextColor(...C.grey);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated on ${today}  ·  CONFIDENTIAL — For client use only`, W / 2, H - 22, { align: 'center' });
  doc.text('Bill Morrisons Financial Consulting  ·  This report is for informational purposes only and does not constitute financial advice.', W / 2, H - 16, { align: 'center' });

  /* ════════════════════════════════════════════════════════════════
     PAGE 2 — PORTFOLIO
  ════════════════════════════════════════════════════════════════ */
  doc.addPage();

  // Page header
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, W, 22, 'F');
  drawD1Triangle(doc, 20, 13, 10, C.accent);
  doc.setTextColor(...C.white);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PORTFOLIO SUMMARY', 28, 13);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.grey);
  doc.text(data.client.name, W - 14, 13, { align: 'right' });

  let y = 32;

  // Asset allocation breakdown
  const byClass: Record<string, number> = {};
  active.forEach(h => {
    const cls = h.assetClass || 'Others';
    byClass[cls] = (byClass[cls] || 0) + effectiveMYR(h);
  });
  const totalPortfolio = Object.values(byClass).reduce((s, v) => s + v, 0);

  y = sectionHeader(doc, y, 'ASSET ALLOCATION', '📊');
  const classColors: Record<string, [number,number,number]> = {
    'EPF':         C.accent,
    'Unit Trust':  C.green,
    'Fixed Deposit': C.gold,
    'Stocks':      [167, 139, 250],
    'Bonds':       [251, 146, 60],
    'Others':      C.grey,
  };

  const entries = Object.entries(byClass).sort((a, b) => b[1] - a[1]);
  const pillW = (W - 28 - (entries.length - 1) * 4) / Math.min(entries.length, 5);
  entries.slice(0, 5).forEach(([ cls, val ], i) => {
    const px = 14 + i * (pillW + 4);
    const col = classColors[cls] ?? C.grey;
    statPill(doc, px, y, pillW, cls, FMT.myr(val), col);
  });
  y += 22;

  // Allocation bar
  if (totalPortfolio > 0) {
    let barX = 14;
    const barH = 6, barW = W - 28;
    entries.forEach(([cls, val]) => {
      const segW = (val / totalPortfolio) * barW;
      const col = classColors[cls] ?? C.grey;
      doc.setFillColor(...col);
      doc.rect(barX, y, segW, barH, 'F');
      barX += segW;
    });
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, barW, barH, 1, 1, 'D');
    // Legend
    y += 10;
    let lx = 14;
    entries.forEach(([cls, val]) => {
      const col = classColors[cls] ?? C.grey;
      const pct = totalPortfolio > 0 ? ((val / totalPortfolio) * 100).toFixed(1) : '0';
      doc.setFillColor(...col);
      doc.circle(lx + 2, y + 1, 1.5, 'F');
      doc.setTextColor(...C.text2);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`${cls} ${pct}%`, lx + 5, y + 2.5);
      lx += doc.getTextWidth(`${cls} ${pct}%`) + 12;
      if (lx > W - 40) { lx = 14; y += 6; }
    });
    y += 8;
  }

  // Holdings table
  y = sectionHeader(doc, y, 'HOLDINGS DETAIL', '📋');

  const holdingRows = active.map(h => {
    const myr = effectiveMYR(h);
    const pnl = h.currency === 'MYR'
      ? (h.purchaseOrig > 0 ? h.valueOrig - h.purchaseOrig : null)
      : (h.purchaseMYR > 0 ? myr - h.purchaseMYR : null);
    return [
      h.name,
      h.assetClass || '—',
      h.institution || '—',
      h.currency !== 'MYR' ? `${h.currency} ${h.valueOrig.toLocaleString()}` : FMT.myr(myr),
      h.currency !== 'MYR' ? FMT.myr(myr) : '—',
      pnl != null ? (pnl >= 0 ? `+${FMT.myr(pnl)}` : FMT.myr(pnl)) : '—',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Holding', 'Asset Class', 'Institution', 'Value', 'Value (MYR)', 'Gain / Loss']],
    body: holdingRows.length > 0 ? holdingRows : [['No active holdings', '', '', '', '', '']],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2.5, textColor: C.text, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: C.lightbg },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 28 },
      2: { cellWidth: 30 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 23, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const val = String(data.cell.raw ?? '');
        if (val.startsWith('+')) data.cell.styles.textColor = C.green;
        else if (val.startsWith('-')) data.cell.styles.textColor = C.red;
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Portfolio total row
  const afterTable = (doc as any).lastAutoTable.finalY + 3;
  doc.setFillColor(...C.navy2);
  doc.roundedRect(14, afterTable, 182, 8, 1, 1, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Portfolio (MYR)`, 18, afterTable + 5.5);
  doc.text(FMT.myr(totalPortfolio), W - 14, afterTable + 5.5, { align: 'right' });

  // Page footer
  addFooter(doc, 2, today);

  /* ════════════════════════════════════════════════════════════════
     PAGE 3 — INSURANCE
  ════════════════════════════════════════════════════════════════ */
  doc.addPage();

  // Page header
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, W, 22, 'F');
  drawD1Triangle(doc, 20, 13, 10, C.accent);
  doc.setTextColor(...C.white);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('INSURANCE SUMMARY', 28, 13);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.grey);
  doc.text(data.client.name, W - 14, 13, { align: 'right' });

  y = 32;

  // Insurance stat pills
  y = sectionHeader(doc, y, 'COVERAGE OVERVIEW', '🛡️');
  const insStats = [
    { label: 'Sum Assured',    value: FMT.myr(totalSA),      col: C.accent },
    { label: 'Annual Premium', value: FMT.myr(totalPremium), col: C.gold },
    { label: 'Active Policies', value: `${activePolicies.length}`, col: C.green },
    { label: 'Policies Total', value: `${data.insurance.length}`, col: C.grey },
  ];
  const isw = (W - 28 - 12) / 4;
  insStats.forEach((s, i) => {
    statPill(doc, 14 + i * (isw + 4), y, isw, s.label, s.value, s.col);
  });
  y += 22;

  // Coverage detail — CI, TPD, PA, Life, Medical
  const coverFields = [
    { key: 'lifeCover', emoji: '🛡️', label: 'Life Cover' },
    { key: 'ciCover',   emoji: '❤️', label: 'Critical Illness' },
    { key: 'paCover',   emoji: '🦺', label: 'Personal Accident' },
    { key: 'tpdCover',  emoji: '♿', label: 'TPD' },
  ];
  const income12 = (data.client.income || 0) * 12;

  y = sectionHeader(doc, y, 'INDIVIDUAL COVERAGE AMOUNTS', '💊');
  const cw = (W - 28 - 12) / 4;
  coverFields.forEach((cf, i) => {
    const total = activePolicies.reduce((s, p) => s + (((p as unknown) as Record<string,number>)[cf.key] || 0), 0);
    const rec   = cf.key === 'lifeCover' ? income12 * 10
                : cf.key === 'ciCover'   ? income12 * 5
                : cf.key === 'paCover'   ? income12 * 3
                : 0;
    const cx2 = 14 + i * (cw + 4);
    const adequate = total > 0 && (rec === 0 || total >= rec * 0.8);
    const col = total === 0 ? C.grey : adequate ? C.green : C.gold;
    statPill(doc, cx2, y, cw, `${cf.emoji} ${cf.label}`, total > 0 ? FMT.myr(total) : 'Not filled', col);
  });
  y += 22;

  // Medical class (from policies)
  const medClasses = activePolicies.map(p => p.medicalClass).filter(Boolean);
  if (medClasses.length > 0) {
    doc.setFillColor(...C.lightbg);
    doc.roundedRect(14, y, 182, 8, 1.5, 1.5, 'F');
    doc.setTextColor(...C.text2);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('🏥  Medical Coverage:', 18, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(medClasses.join('  ·  '), 55, y + 5.5);
    y += 12;
  }

  // Policies table
  y = sectionHeader(doc, y, 'POLICY DETAIL', '📋');

  const insRows = data.insurance.map(p => [
    p.policyName,
    p.insurer || '—',
    p.insuranceType || '—',
    p.benefits.map(b => b.replace(/[\u{1F000}-\u{1FFFF}]|[☀-➿]|[︀-️]/gu, '').trim()).join(', ') || '—',
    p.sumAssured > 0 ? Math.round(p.sumAssured).toLocaleString() : '—',
    p.annualPremium > 0 ? Math.round(p.annualPremium).toLocaleString() : '—',
    p.status || '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Policy Name', 'Insurer', 'Type', 'Benefits', 'SA (MYR)', 'Premium/yr', 'Status']],
    body: insRows.length > 0 ? insRows : [['No policies', '', '', '', '', '', '']],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, textColor: C.text, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: C.lightbg },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 28 },
      2: { cellWidth: 20 },
      3: { cellWidth: 38 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 15, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = String(data.cell.raw ?? '');
        if (val.includes('Active')) data.cell.styles.textColor = C.green;
        else if (val.includes('Lapsed')) data.cell.styles.textColor = C.red;
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Page footer
  addFooter(doc, 3, today);

  // ── Download ─────────────────────────────────────────────────────────────────
  const filename = `${data.client.name.replace(/\s+/g, '_')}_Wealth_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

function addFooter(doc: jsPDF, pageNum: number, today: string) {
  const W = 210, H = 297;
  doc.setFillColor(...C.navy);
  doc.rect(0, H - 10, W, 10, 'F');
  doc.setTextColor(...C.grey);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Bill Morrisons Financial Consulting  ·  CONFIDENTIAL', 14, H - 4);
  doc.text(`Page ${pageNum} of 3  ·  Generated ${today}`, W - 14, H - 4, { align: 'right' });
}
