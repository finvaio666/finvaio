/**
 * Client Wealth Summary PDF — Bill Morrisons Financial Consulting
 * Uses jsPDF + jspdf-autotable (client-side, no server needed).
 *
 * Theme: Red · Black · White  (matches brand logo)
 *
 * IMPORTANT: jsPDF built-in Helvetica ONLY supports Latin-1 (0x00–0xFF).
 * Never pass emoji or Unicode > 0xFF to doc.text(). Use safeText() on all
 * user-data strings.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Brand colours (Red · Black · White) ──────────────────────────────────────
const C = {
  black:   [12,  12,  12]  as [number,number,number],   // cover bg / page headers
  dark:    [28,  28,  28]  as [number,number,number],   // section header bars
  red:     [196, 28,  44]  as [number,number,number],   // primary accent
  crimson: [150, 18,  30]  as [number,number,number],   // darker red (total bar)
  white:   [255, 255, 255] as [number,number,number],
  offwhite:[248, 248, 248] as [number,number,number],   // table alt rows / pill bg
  grey:    [140, 140, 140] as [number,number,number],   // muted text on dark bg
  border:  [220, 220, 220] as [number,number,number],
  text:    [20,  20,  20]  as [number,number,number],   // near-black body text
  text2:   [90,  90,  90]  as [number,number,number],   // medium grey
  green:   [22,  163, 74]  as [number,number,number],   // gains / active
  gold:    [180, 100,  6]  as [number,number,number],   // premiums / warnings
  redloss: [220, 38,  38]  as [number,number,number],   // losses
  lightbg: [248, 248, 248] as [number,number,number],
};

// ── Strip non-Latin-1 (emoji, CJK…) from any string before doc.text() ────────
function safeText(s: string): string {
  return s.replace(/[^\x00-\xFF]/g, '').replace(/\s+/g, ' ').trim();
}

function safeBenefits(benefits: string[]): string {
  return benefits.map(b => safeText(b)).filter(Boolean).join(', ') || '—';
}

const FMT = {
  myr: (n: number) =>
    n === 0 ? '—'
    : n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000     ? `RM ${(n / 1_000).toFixed(1)}K`
    : `RM ${Math.round(n).toLocaleString()}`,
  date: (s: string) =>
    s ? new Date(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
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

// ── Fetch logo from /logo.png and return base64 data URL ──────────────────────
async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Logo dimensions (aspect ratio 4 : 1, adjust if needed) ───────────────────
const LOGO = { COVER_W: 78, COVER_H: 20, HEADER_W: 46, HEADER_H: 12 };

// ── Section header bar ────────────────────────────────────────────────────────
function sectionHeader(doc: jsPDF, y: number, title: string) {
  doc.setFillColor(...C.dark);
  doc.roundedRect(14, y, 182, 9, 1.5, 1.5, 'F');
  doc.setFillColor(...C.red);
  doc.roundedRect(14, y, 3, 9, 1, 1, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 21, y + 6);
  return y + 13;
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function statPill(
  doc: jsPDF, x: number, y: number, w: number,
  label: string, value: string, color: [number,number,number]
) {
  doc.setFillColor(...C.offwhite);
  doc.roundedRect(x, y, w, 16, 2, 2, 'F');
  doc.setFillColor(...color);
  doc.roundedRect(x, y, 3, 16, 1, 1, 'F');
  doc.setTextColor(...C.text2);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(label), x + 7, y + 6);
  doc.setTextColor(...C.text);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(safeText(value), x + 7, y + 13);
}

// ── Effective MYR value ───────────────────────────────────────────────────────
function effectiveMYR(h: ReportData['portfolio'][0]) {
  if (h.valueMYR > 0) return h.valueMYR;
  if (h.currency === 'MYR' && h.valueOrig > 0) return h.valueOrig;
  if (h.fxRate > 0 && h.valueOrig > 0) return h.valueOrig * h.fxRate;
  const FX: Record<string, number> = { MYR:1, USD:4.47, SGD:3.32, GBP:5.65, EUR:4.85, AUD:2.90, HKD:0.57 };
  return h.valueOrig * (FX[h.currency] ?? 1);
}

// ── Donut chart (triangle-strip approximation) ────────────────────────────────
function drawDonutChart(
  doc: jsPDF, cx: number, cy: number, outerR: number, innerR: number,
  entries: Array<{ value: number; color: [number,number,number] }>
) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total === 0) return;
  const STEPS = 40;
  let startAngle = -Math.PI / 2;
  entries.forEach(entry => {
    const sweep = (entry.value / total) * 2 * Math.PI;
    doc.setFillColor(...entry.color);
    for (let i = 0; i < STEPS; i++) {
      const a1 = startAngle + sweep * (i / STEPS);
      const a2 = startAngle + sweep * ((i + 1) / STEPS);
      const ix1 = cx + innerR * Math.cos(a1), iy1 = cy + innerR * Math.sin(a1);
      const ix2 = cx + innerR * Math.cos(a2), iy2 = cy + innerR * Math.sin(a2);
      const ox1 = cx + outerR * Math.cos(a1), oy1 = cy + outerR * Math.sin(a1);
      const ox2 = cx + outerR * Math.cos(a2), oy2 = cy + outerR * Math.sin(a2);
      doc.triangle(ix1, iy1, ix2, iy2, ox1, oy1, 'F');
      doc.triangle(ix2, iy2, ox2, oy2, ox1, oy1, 'F');
    }
    startAngle += sweep;
  });
  doc.setFillColor(...C.white);
  doc.circle(cx, cy, innerR - 0.5, 'F');
}

// ── Page footer ───────────────────────────────────────────────────────────────
function addFooter(doc: jsPDF, pageNum: number, today: string) {
  const W = 210, H = 297;
  doc.setFillColor(...C.black);
  doc.rect(0, H - 10, W, 10, 'F');
  doc.setFillColor(...C.red);
  doc.rect(0, H - 10, 3, 10, 'F');
  doc.setTextColor(...C.grey);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Bill Morrisons Financial Consulting  -  CONFIDENTIAL', 8, H - 4);
  doc.text(`Page ${pageNum} of 3  -  Generated ${today}`, W - 14, H - 4, { align: 'right' });
}

// ── Page header band (pages 2 & 3) ────────────────────────────────────────────
function addPageHeader(
  doc: jsPDF, title: string, clientName: string,
  logo: string | null
) {
  const W = 210;
  // Black band
  doc.setFillColor(...C.black);
  doc.rect(0, 0, W, 24, 'F');
  // Red bottom accent line
  doc.setFillColor(...C.red);
  doc.rect(0, 24, W, 1.5, 'F');
  // White bg behind logo
  if (logo) {
    doc.setFillColor(...C.white);
    doc.roundedRect(10, 3, LOGO.HEADER_W + 4, LOGO.HEADER_H + 3, 1, 1, 'F');
    doc.addImage(logo, 'PNG', 12, 4.5, LOGO.HEADER_W, LOGO.HEADER_H);
  }
  // Section title
  doc.setTextColor(...C.white);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, logo ? 64 : 14, 14);
  // Client name (right-aligned)
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.grey);
  doc.text(safeText(clientName), W - 14, 14, { align: 'right' });
}

// ── Main (async — needs to fetch logo) ───────────────────────────────────────
export async function generateClientReport(data: ReportData): Promise<void> {
  const logo  = await loadLogo();
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const today = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });
  const clientNameSafe = safeText(data.client.name);

  // Pre-compute portfolio data
  const active         = data.portfolio.filter(h => h.status?.includes('Active'));
  const totalAUM       = active.reduce((s, h) => s + effectiveMYR(h), 0);
  const activePolicies = data.insurance.filter(p => p.status?.includes('Active'));
  const totalSA        = activePolicies.reduce((s, p) => s + p.sumAssured, 0);
  const totalPremium   = activePolicies.reduce((s, p) => s + p.annualPremium, 0);

  /* ════════════════════════════════════════════════════════════════
     PAGE 1 — COVER
  ════════════════════════════════════════════════════════════════ */
  // Full black background
  doc.setFillColor(...C.black);
  doc.rect(0, 0, W, H, 'F');

  // White logo band at top
  doc.setFillColor(...C.white);
  doc.rect(0, 0, W, 38, 'F');

  // Logo centred in white band
  if (logo) {
    const lx = (W - LOGO.COVER_W) / 2;
    const ly = (38 - LOGO.COVER_H) / 2;
    doc.addImage(logo, 'PNG', lx, ly, LOGO.COVER_W, LOGO.COVER_H);
  } else {
    // Fallback: text-only
    doc.setTextColor(...C.text);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL MORRISONS', W / 2, 18, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('GLOBAL WEALTH ACCESS', W / 2, 26, { align: 'center', charSpace: 1 });
  }

  // Red accent strip below logo band
  doc.setFillColor(...C.red);
  doc.rect(0, 38, W, 3, 'F');

  // Report title
  doc.setTextColor(...C.grey);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('WEALTH SUMMARY REPORT', W / 2, 58, { align: 'center', charSpace: 2 });

  // Thin red rule under title
  doc.setDrawColor(...C.red);
  doc.setLineWidth(0.5);
  doc.line(70, 62, W - 70, 62);

  // Client name — large white
  doc.setTextColor(...C.white);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  const clientLines = doc.splitTextToSize(clientNameSafe, 160);
  doc.text(clientLines, W / 2, 76, { align: 'center' });

  // Status / segment / risk badges
  let badgeY = 86 + (clientLines.length - 1) * 8;
  const badges = [data.client.status, data.client.segment, data.client.risk]
    .map(safeText).filter(Boolean);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  const totalBadgeW = badges.reduce((s, b) => s + doc.getTextWidth(b) + 12, 0) + (badges.length - 1) * 4;
  let bx = (W - totalBadgeW) / 2;
  badges.forEach(badge => {
    const bw = doc.getTextWidth(badge) + 12;
    doc.setFillColor(...C.red);
    doc.setGState(new (doc as any).GState({ opacity: 0.18 }));
    doc.roundedRect(bx, badgeY, bw, 6, 3, 3, 'F');
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
    doc.setDrawColor(...C.red);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, badgeY, bw, 6, 3, 3, 'D');
    doc.setTextColor(...C.red);
    doc.text(badge, bx + bw / 2, badgeY + 4.2, { align: 'center' });
    bx += bw + 4;
  });

  // Stats bar (4 tiles)
  const statsY = badgeY + 18;
  const stats = [
    { label: 'Total AUM',      value: FMT.myr(totalAUM || data.client.aum) },
    { label: 'Holdings',       value: `${active.length}`                   },
    { label: 'Sum Assured',    value: FMT.myr(totalSA)                     },
    { label: 'Annual Premium', value: FMT.myr(totalPremium)                },
  ];
  const sw = (W - 28 - 12) / 4;
  stats.forEach((s, i) => {
    const sx = 14 + i * (sw + 4);
    // Tile bg — subtle dark box
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as any).GState({ opacity: 0.06 }));
    doc.roundedRect(sx, statsY, sw, 18, 2, 2, 'F');
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
    // Red left accent on first tile only (decorative)
    if (i === 0) {
      doc.setFillColor(...C.red);
      doc.roundedRect(sx, statsY, 2, 18, 1, 1, 'F');
    }
    doc.setTextColor(...C.grey);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(s.label, sx + sw / 2, statsY + 6.5, { align: 'center' });
    doc.setTextColor(...C.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(s.value, sx + sw / 2, statsY + 13.5, { align: 'center' });
  });

  // Financial goals
  if (data.client.goals?.length > 0) {
    const gy = statsY + 28;
    doc.setTextColor(...C.grey);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('FINANCIAL GOALS', W / 2, gy, { align: 'center', charSpace: 1 });
    doc.setTextColor(...C.red);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(safeText(data.client.goals.join('  *  ')), W / 2, gy + 7, { align: 'center' });
  }

  // Client detail grid near bottom
  const detY = H - 88;
  doc.setDrawColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
  doc.line(14, detY, W - 14, detY);
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  const details = [
    { label: 'Date of Birth',   value: FMT.date(data.client.dob)       },
    { label: 'Onboarding Date', value: FMT.date(data.client.onboarding) },
    { label: 'Next Review',     value: FMT.date(data.client.nextReview) },
    { label: 'Monthly Income',  value: data.client.income > 0 ? FMT.myr(data.client.income) : '—' },
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

  // Red rule + disclaimer
  doc.setFillColor(...C.red);
  doc.rect(14, H - 32, 182, 0.5, 'F');
  doc.setTextColor(...C.grey);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated on ${today}  -  CONFIDENTIAL - For client use only`, W / 2, H - 26, { align: 'center' });
  doc.text('Bill Morrisons Financial Consulting  -  This report is for informational purposes only and does not constitute financial advice.', W / 2, H - 20, { align: 'center' });

  /* ════════════════════════════════════════════════════════════════
     PAGE 2 — PORTFOLIO
  ════════════════════════════════════════════════════════════════ */
  doc.addPage();
  addPageHeader(doc, 'PORTFOLIO SUMMARY', clientNameSafe, logo);

  // Asset allocation
  const byClass: Record<string, number> = {};
  active.forEach(h => {
    const cls = h.assetClass || 'Others';
    byClass[cls] = (byClass[cls] || 0) + effectiveMYR(h);
  });
  const totalPortfolio = Object.values(byClass).reduce((s, v) => s + v, 0);

  const classColors: Record<string, [number,number,number]> = {
    'EPF':             [196, 28,  44],   // red (brand primary)
    'Unit Trust':      [220, 80,  60],   // red-orange
    'Fixed Deposit':   [180, 100,  6],   // gold
    'Stocks':          [80,  80,  80],   // charcoal
    'Bonds':           [120, 120, 120],  // medium grey
    'Structured Note': [140, 50,  70],   // dark rose
    'REIT':            [100, 40,  30],   // dark red-brown
    'ETF':             [160, 60,  20],   // rust
    'Others':          [180, 180, 180],  // light grey
  };

  const entries = Object.entries(byClass).sort((a, b) => b[1] - a[1]);

  let y = 34;
  y = sectionHeader(doc, y, 'ASSET ALLOCATION');

  if (entries.length > 0 && totalPortfolio > 0) {
    // Donut chart (left) + legend (right)
    const chartCX = 42, chartCY = y + 27;
    const outerR = 22, innerR = 13;

    drawDonutChart(doc, chartCX, chartCY, outerR, innerR,
      entries.map(([cls, val]) => ({ value: val, color: classColors[cls] ?? C.dark }))
    );

    // Centre AUM label
    doc.setTextColor(...C.text2);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('AUM', chartCX, chartCY - 2.5, { align: 'center' });
    doc.setTextColor(...C.text);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    const aumLbl = totalPortfolio >= 1_000_000
      ? `RM ${(totalPortfolio / 1_000_000).toFixed(1)}M`
      : `RM ${(totalPortfolio / 1_000).toFixed(0)}K`;
    doc.text(aumLbl, chartCX, chartCY + 3.5, { align: 'center' });

    // Legend — two columns right of donut
    let lx = 72, ly = y + 4, col = 0;
    const colW = 60;
    entries.forEach(([cls, val]) => {
      const pct  = ((val / totalPortfolio) * 100).toFixed(1);
      const lcol = classColors[cls] ?? C.dark;
      doc.setFillColor(...lcol);
      doc.roundedRect(lx + col * colW, ly, 3, 3, 0.5, 0.5, 'F');
      doc.setTextColor(...C.text2);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(cls, lx + col * colW + 5, ly + 2.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.text);
      doc.text(`${pct}%  ${FMT.myr(val)}`, lx + col * colW + 5, ly + 7.5);
      ly += 12;
      if (ly > y + 50 && col === 0) { col = 1; ly = y + 4; }
    });

    y += 58;

    // Allocation bar
    let barX = 14;
    const barW = W - 28, barH = 5;
    entries.forEach(([cls, val]) => {
      const segW = (val / totalPortfolio) * barW;
      doc.setFillColor(...(classColors[cls] ?? C.dark));
      doc.rect(barX, y, segW, barH, 'F');
      barX += segW;
    });
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, barW, barH, 1, 1, 'D');
    y += 10;
  }

  // Holdings table
  y = sectionHeader(doc, y, 'HOLDINGS DETAIL');

  const holdingRows = active.map(h => {
    const myr = effectiveMYR(h);
    const pnl = h.currency === 'MYR'
      ? (h.purchaseOrig > 0 ? h.valueOrig - h.purchaseOrig : null)
      : (h.purchaseMYR > 0 ? myr - h.purchaseMYR : null);
    return [
      safeText(h.name),
      safeText(h.assetClass || '—'),
      safeText(h.institution || '—'),
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
    headStyles: { fillColor: C.black, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
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
        else if (val.startsWith('-')) data.cell.styles.textColor = C.redloss;
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Total row
  const afterTable = (doc as any).lastAutoTable.finalY + 3;
  doc.setFillColor(...C.crimson);
  doc.roundedRect(14, afterTable, 182, 8, 1, 1, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Total Portfolio (MYR)', 18, afterTable + 5.5);
  doc.text(FMT.myr(totalPortfolio), W - 14, afterTable + 5.5, { align: 'right' });

  addFooter(doc, 2, today);

  /* ════════════════════════════════════════════════════════════════
     PAGE 3 — INSURANCE
  ════════════════════════════════════════════════════════════════ */
  doc.addPage();
  addPageHeader(doc, 'INSURANCE SUMMARY', clientNameSafe, logo);

  y = 34;

  // Coverage overview pills
  y = sectionHeader(doc, y, 'COVERAGE OVERVIEW');
  const insStats = [
    { label: 'Sum Assured',     value: FMT.myr(totalSA),           col: C.red   },
    { label: 'Annual Premium',  value: FMT.myr(totalPremium),      col: C.gold  },
    { label: 'Active Policies', value: `${activePolicies.length}`, col: C.green },
    { label: 'Total Policies',  value: `${data.insurance.length}`, col: C.dark  },
  ];
  const isw = (W - 28 - 12) / 4;
  insStats.forEach((s, i) => {
    statPill(doc, 14 + i * (isw + 4), y, isw, s.label, s.value, s.col);
  });
  y += 22;

  // Individual coverage amounts
  const coverFields = [
    { key: 'lifeCover', label: 'Life Cover'       },
    { key: 'ciCover',   label: 'Critical Illness'  },
    { key: 'paCover',   label: 'Personal Accident' },
    { key: 'tpdCover',  label: 'TPD'               },
  ];
  const income12 = (data.client.income || 0) * 12;

  y = sectionHeader(doc, y, 'INDIVIDUAL COVERAGE AMOUNTS');
  const cw = (W - 28 - 12) / 4;
  coverFields.forEach((cf, i) => {
    const total = activePolicies.reduce(
      (s, p) => s + (((p as unknown) as Record<string, number>)[cf.key] || 0), 0
    );
    const rec = cf.key === 'lifeCover' ? income12 * 10
              : cf.key === 'ciCover'   ? income12 * 5
              : cf.key === 'paCover'   ? income12 * 3 : 0;
    const adequate = total > 0 && (rec === 0 || total >= rec * 0.8);
    const col = total === 0 ? ([180,180,180] as [number,number,number])
              : adequate    ? C.green : C.gold;
    statPill(doc, 14 + i * (cw + 4), y, cw, cf.label, total > 0 ? FMT.myr(total) : 'Not filled', col);
  });
  y += 22;

  // Medical class
  const medClasses = activePolicies.map(p => p.medicalClass).filter(Boolean);
  if (medClasses.length > 0) {
    doc.setFillColor(...C.offwhite);
    doc.roundedRect(14, y, 182, 8, 1.5, 1.5, 'F');
    doc.setFillColor(...C.red);
    doc.roundedRect(14, y, 3, 8, 1, 1, 'F');
    doc.setTextColor(...C.text2);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Medical Coverage:', 20, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(safeText(medClasses.join('  *  ')), 56, y + 5.5);
    y += 12;
  }

  // Policy detail table
  y = sectionHeader(doc, y, 'POLICY DETAIL');

  const insRows = data.insurance.map(p => [
    safeText(p.policyName),
    safeText(p.insurer || '—'),
    safeText(p.insuranceType || '—'),
    safeBenefits(p.benefits),
    p.sumAssured > 0    ? Math.round(p.sumAssured).toLocaleString()    : '—',
    p.annualPremium > 0 ? Math.round(p.annualPremium).toLocaleString() : '—',
    safeText(p.status || '—'),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Policy Name', 'Insurer', 'Type', 'Benefits', 'SA (MYR)', 'Premium/yr', 'Status']],
    body: insRows.length > 0 ? insRows : [['No policies', '', '', '', '', '', '']],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, textColor: C.text, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.black, textColor: C.white, fontStyle: 'bold', fontSize: 7 },
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
        else if (val.includes('Lapsed')) data.cell.styles.textColor = C.redloss;
      }
    },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc, 3, today);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const filename = `${safeText(data.client.name).replace(/\s+/g, '_')}_Wealth_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
