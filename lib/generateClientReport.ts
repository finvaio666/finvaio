/**
 * Client Wealth Summary PDF — Bill Morrisons Financial Consulting
 * Premium redesign: clean, minimal, private-banking style.
 * Red · Black · White brand theme.
 *
 * jsPDF Helvetica = Latin-1 only. Use safeText() on all user strings.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  // Brand
  red:     [185,  18,  34] as [number,number,number],
  redDark: [140,  12,  24] as [number,number,number],
  black:   [ 15,  15,  15] as [number,number,number],
  // Text
  text1:   [ 15,  15,  15] as [number,number,number],   // headings
  text2:   [ 55,  65,  81] as [number,number,number],   // body
  text3:   [107, 114, 128] as [number,number,number],   // labels / muted
  text4:   [156, 163, 175] as [number,number,number],   // placeholders
  // Surfaces
  white:   [255, 255, 255] as [number,number,number],
  bg:      [249, 250, 251] as [number,number,number],   // alt table rows
  border:  [229, 231, 235] as [number,number,number],   // dividers
  // Status
  green:   [ 22, 163,  74] as [number,number,number],
  amber:   [180, 100,   6] as [number,number,number],
  loss:    [220,  38,  38] as [number,number,number],
};

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const W = 210;
const MARGIN = 16;           // left & right margin
const CW = W - MARGIN * 2;  // content width = 178 mm

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const safeText = (s: string) =>
  s.replace(/[^\x00-\xFF]/g, '').replace(/\s+/g, ' ').trim();

const safeBenefits = (b: string[]) =>
  b.map(safeText).filter(Boolean).join(', ') || '—';

const FMT = {
  myr: (n: number) =>
    n === 0 ? '—'
    : n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000     ? `RM ${(n / 1_000).toFixed(1)}K`
    : `RM ${Math.round(n).toLocaleString()}`,
  date: (s: string) =>
    s ? new Date(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
};

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function effectiveMYR(h: { valueMYR: number; valueOrig: number; currency: string; fxRate: number }) {
  if (h.valueMYR > 0) return h.valueMYR;
  if (h.currency === 'MYR' && h.valueOrig > 0) return h.valueOrig;
  if (h.fxRate > 0 && h.valueOrig > 0) return h.valueOrig * h.fxRate;
  const FX: Record<string, number> = { MYR:1, USD:4.47, SGD:3.32, GBP:5.65, EUR:4.85, AUD:2.90, HKD:0.57 };
  return h.valueOrig * (FX[h.currency] ?? 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWING PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/** Thin horizontal rule */
function rule(doc: jsPDF, y: number, color = T.border, lw = 0.3) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(MARGIN, y, W - MARGIN, y);
}

/** Full-bleed horizontal rule (edge to edge) */
function ruleBleed(doc: jsPDF, y: number, color = T.border, lw = 0.4) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(0, y, W, y);
}

/** Section heading: left red bar + uppercase label + thin underline */
function sectionTitle(doc: jsPDF, y: number, label: string): number {
  doc.setFillColor(...T.red);
  doc.rect(MARGIN, y, 2.5, 5.5, 'F');
  doc.setTextColor(...T.red);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), MARGIN + 5, y + 4.5, { charSpace: 0.8 });
  rule(doc, y + 7, T.border, 0.25);
  return y + 12;
}

/** KPI tile: clean card with top red accent */
function kpiTile(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, sub: string = '',
  accentColor: [number,number,number] = T.red
) {
  // Card background
  doc.setFillColor(...T.white);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F');
  doc.setDrawColor(...T.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'D');
  // Top accent bar
  doc.setFillColor(...accentColor);
  doc.rect(x, y, w, 2, 'F');
  // Round the top corners of accent bar manually
  doc.setFillColor(...accentColor);
  doc.roundedRect(x, y, w, 3, 1.5, 1.5, 'F');
  doc.rect(x, y + 1.5, w, 1.5, 'F'); // fill lower half to hide bottom rounding
  // Label
  doc.setTextColor(...T.text3);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(label.toUpperCase(), x + 5, y + 9, { charSpace: 0.3 });
  // Value
  doc.setTextColor(...T.text1);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(safeText(value), x + 5, y + 18);
  // Sub-label
  if (sub) {
    doc.setTextColor(...T.text3);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(safeText(sub), x + 5, y + 23);
  }
}

/** Donut chart — triangle-strip approximation */
function donut(
  doc: jsPDF, cx: number, cy: number, R: number, r: number,
  slices: Array<{ value: number; color: [number,number,number] }>
) {
  const total = slices.reduce((s, e) => s + e.value, 0);
  if (!total) return;
  const STEPS = 48;
  let a0 = -Math.PI / 2;
  slices.forEach(sl => {
    const sweep = (sl.value / total) * 2 * Math.PI;
    doc.setFillColor(...sl.color);
    for (let i = 0; i < STEPS; i++) {
      const a1 = a0 + sweep * (i / STEPS);
      const a2 = a0 + sweep * ((i + 1) / STEPS);
      const ix1 = cx + r * Math.cos(a1), iy1 = cy + r * Math.sin(a1);
      const ix2 = cx + r * Math.cos(a2), iy2 = cy + r * Math.sin(a2);
      const ox1 = cx + R * Math.cos(a1), oy1 = cy + R * Math.sin(a1);
      const ox2 = cx + R * Math.cos(a2), oy2 = cy + R * Math.sin(a2);
      doc.triangle(ix1, iy1, ix2, iy2, ox1, oy1, 'F');
      doc.triangle(ix2, iy2, ox2, oy2, ox1, oy1, 'F');
    }
    a0 += sweep;
  });
  // Hole
  doc.setFillColor(...T.white);
  doc.circle(cx, cy, r - 0.5, 'F');
}

/** Standard page header (pages 2+) */
function pageHeader(doc: jsPDF, logo: string | null, pageTitle: string, clientName: string) {
  // White bg (default) — just draw elements
  // Thin top red strip
  doc.setFillColor(...T.red);
  doc.rect(0, 0, W, 1.5, 'F');
  // Logo left
  if (logo) {
    doc.setFillColor(...T.white);
    doc.rect(MARGIN, 4, 44, 12, 'F');
    doc.addImage(logo, 'PNG', MARGIN, 5, 42, 11);
  }
  // Page title right
  doc.setTextColor(...T.text3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(clientName), W - MARGIN, 9.5, { align: 'right', charSpace: 0.2 });
  doc.setTextColor(...T.text1);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(pageTitle, W - MARGIN, 16, { align: 'right' });
  // Bottom rule
  ruleBleed(doc, 21, T.border, 0.3);
  // Red dot accent left of title
  doc.setFillColor(...T.red);
  doc.circle(W - MARGIN - doc.getTextWidth(pageTitle) - 4, 15, 1.2, 'F');
}

/** Standard page footer */
function pageFooter(doc: jsPDF, pageNum: number, total: number, today: string) {
  const H = 297;
  ruleBleed(doc, H - 12, T.border, 0.25);
  doc.setTextColor(...T.text4);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Bill Morrisons Financial Consulting  |  CONFIDENTIAL — For client use only', MARGIN, H - 7);
  doc.text(`${today}  |  Page ${pageNum} of ${total}`, W - MARGIN, H - 7, { align: 'right' });
  // Red pip left
  doc.setFillColor(...T.red);
  doc.circle(MARGIN - 4, H - 7.5, 1, 'F');
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSET CLASS PALETTE  (red / dark family, readable on white)
// ─────────────────────────────────────────────────────────────────────────────
const CLASS_COLORS: Record<string, [number,number,number]> = {
  'EPF':             [185,  18,  34],
  'Unit Trust':      [220,  80,  60],
  'Fixed Deposit':   [180, 100,   6],
  'Stocks':          [ 60,  80, 120],
  'Bonds':           [ 80, 110, 150],
  'Structured Note': [130,  50,  90],
  'REIT':            [ 40, 120, 100],
  'ETF':             [ 80, 140, 100],
  'Cash':            [ 80,  80,  80],
  'Others':          [160, 160, 160],
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPE
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export async function generateClientReport(data: ReportData): Promise<void> {
  const logo  = await loadLogo();
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });
  const clientName = safeText(data.client.name);
  const H = 297;

  // Pre-compute
  const active   = data.portfolio.filter(h => h.status?.includes('Active'));
  const totalAUM = active.reduce((s, h) => s + effectiveMYR(h), 0);
  const activePolicies  = data.insurance.filter(p => p.status?.includes('Active'));
  const totalSA         = activePolicies.reduce((s, p) => s + p.sumAssured, 0);
  const totalPremium    = activePolicies.reduce((s, p) => s + p.annualPremium, 0);

  const byClass: Record<string, number> = {};
  active.forEach(h => {
    const cls = h.assetClass || 'Others';
    byClass[cls] = (byClass[cls] || 0) + effectiveMYR(h);
  });
  const totalPortfolio = Object.values(byClass).reduce((s, v) => s + v, 0);
  const entries = Object.entries(byClass).sort((a, b) => b[1] - a[1]);

  /* ══════════════════════════════════════════════════════════════════════
     PAGE 1  —  COVER
  ══════════════════════════════════════════════════════════════════════ */

  // ── Full-page white background ───────────────────────────────────────────
  doc.setFillColor(...T.white);
  doc.rect(0, 0, W, H, 'F');

  // ── Red top banner ────────────────────────────────────────────────────────
  doc.setFillColor(...T.red);
  doc.rect(0, 0, W, 52, 'F');

  // ── Logo (white area within banner) ──────────────────────────────────────
  if (logo) {
    const lw = 70, lh = 18;
    const lx = (W - lw) / 2, ly = 11;
    doc.setFillColor(...T.white);
    doc.roundedRect(lx - 6, ly - 4, lw + 12, lh + 8, 2, 2, 'F');
    doc.addImage(logo, 'PNG', lx, ly, lw, lh);
  } else {
    doc.setTextColor(...T.white);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL MORRISONS', W / 2, 22, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('GLOBAL WEALTH ACCESS', W / 2, 30, { align: 'center', charSpace: 1.5 });
  }

  // ── "Wealth Summary Report" label just below banner ───────────────────────
  doc.setTextColor(...T.red);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('WEALTH SUMMARY REPORT', W / 2, 61, { align: 'center', charSpace: 1.5 });

  // ── Thin red rule ─────────────────────────────────────────────────────────
  doc.setDrawColor(...T.red);
  doc.setLineWidth(0.4);
  doc.line(MARGIN + 40, 64, W - MARGIN - 40, 64);

  // ── Client name ───────────────────────────────────────────────────────────
  doc.setTextColor(...T.text1);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  const nameLines = doc.splitTextToSize(clientName, CW);
  doc.text(nameLines, W / 2, 76, { align: 'center' });
  const nameBottom = 76 + (nameLines.length - 1) * 9;

  // ── Status / Segment / Risk pills ────────────────────────────────────────
  const pillY = nameBottom + 6;
  const pills = [data.client.status, data.client.segment, data.client.risk].map(safeText).filter(Boolean);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  const pillTotalW = pills.reduce((s, p) => s + doc.getTextWidth(p) + 10, 0) + (pills.length - 1) * 4;
  let px = (W - pillTotalW) / 2;
  pills.forEach(pill => {
    const pw = doc.getTextWidth(pill) + 10;
    doc.setDrawColor(...T.red);
    doc.setLineWidth(0.4);
    doc.setFillColor(...T.white);
    doc.roundedRect(px, pillY, pw, 6, 3, 3, 'FD');
    doc.setTextColor(...T.red);
    doc.text(pill, px + pw / 2, pillY + 4.2, { align: 'center' });
    px += pw + 4;
  });

  // ── KPI tiles (4-up) ──────────────────────────────────────────────────────
  const tileY = pillY + 14;
  const tileW = (CW - 12) / 4;
  const tileH = 28;
  const tiles = [
    { label: 'Total AUM',       value: FMT.myr(totalAUM || data.client.aum), sub: 'Active holdings', color: T.red },
    { label: 'Portfolio Items', value: `${active.length}`,                   sub: 'Active positions', color: [60,80,120] as [number,number,number] },
    { label: 'Sum Assured',     value: FMT.myr(totalSA),                     sub: 'Insurance coverage', color: [22,163,74] as [number,number,number] },
    { label: 'Annual Premium',  value: FMT.myr(totalPremium),                sub: 'Total premiums', color: [180,100,6] as [number,number,number] },
  ];
  tiles.forEach((t, i) => {
    kpiTile(doc, MARGIN + i * (tileW + 4), tileY, tileW, tileH, t.label, t.value, t.sub, t.color);
  });

  // ── Financial goals ───────────────────────────────────────────────────────
  if (data.client.goals?.length > 0) {
    const goalY = tileY + tileH + 12;
    doc.setTextColor(...T.text3);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('FINANCIAL GOALS', W / 2, goalY, { align: 'center', charSpace: 0.8 });
    doc.setTextColor(...T.text1);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(safeText(data.client.goals.join('   |   ')), W / 2, goalY + 6, { align: 'center' });
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  const divY = tileY + tileH + (data.client.goals?.length ? 32 : 18);
  rule(doc, divY, T.border, 0.25);

  // ── Client detail grid (2 × 2 or 4 across) ───────────────────────────────
  const details = [
    { label: 'Date of Birth',   value: FMT.date(data.client.dob)        },
    { label: 'Onboarded',       value: FMT.date(data.client.onboarding)  },
    { label: 'Next Review',     value: FMT.date(data.client.nextReview)  },
    { label: 'Monthly Income',  value: data.client.income > 0 ? FMT.myr(data.client.income) : '—' },
  ].filter(d => d.value !== '—');

  const detY = divY + 8;
  const dw = CW / Math.min(details.length, 4);
  details.forEach((d, i) => {
    const dx = MARGIN + i * dw;
    doc.setTextColor(...T.text3);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(d.label.toUpperCase(), dx, detY, { charSpace: 0.3 });
    doc.setTextColor(...T.text1);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(d.value, dx, detY + 6.5);
  });

  // ── Contact row ───────────────────────────────────────────────────────────
  if (data.client.email || data.client.phone) {
    const contY = detY + 16;
    rule(doc, contY - 3, T.border, 0.2);
    doc.setTextColor(...T.text3);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const contactLine = [data.client.email, data.client.phone].filter(Boolean).map(safeText).join('   |   ');
    doc.text(contactLine, W / 2, contY + 3, { align: 'center' });
  }

  // ── Prepared-by footer band ────────────────────────────────────────────────
  doc.setFillColor(...T.black);
  doc.rect(0, H - 22, W, 22, 'F');
  doc.setFillColor(...T.red);
  doc.rect(0, H - 22, W, 1.5, 'F');
  doc.setTextColor(...T.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill Morrisons Financial Consulting', MARGIN, H - 13);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text('GLOBAL WEALTH ACCESS', MARGIN, H - 8);
  doc.setTextColor(180, 180, 180);
  doc.text(`Generated: ${today}`, W - MARGIN, H - 13, { align: 'right' });
  doc.text('CONFIDENTIAL — For client use only', W - MARGIN, H - 8, { align: 'right' });

  /* ══════════════════════════════════════════════════════════════════════
     PAGE 2  —  PORTFOLIO
  ══════════════════════════════════════════════════════════════════════ */
  doc.addPage();
  doc.setFillColor(...T.white);
  doc.rect(0, 0, W, H, 'F');
  pageHeader(doc, logo, 'Portfolio Summary', clientName);

  let y = 28;

  // ── Asset allocation section ───────────────────────────────────────────────
  y = sectionTitle(doc, y, 'Asset Allocation');

  if (entries.length > 0 && totalPortfolio > 0) {
    // Donut + legend side by side
    const chartCX = MARGIN + 26, chartCY = y + 26;
    const outerR = 22, innerR = 13;
    donut(doc, chartCX, chartCY, outerR, innerR,
      entries.map(([cls, val]) => ({ value: val, color: CLASS_COLORS[cls] ?? T.text3 })));

    // Centre text
    doc.setTextColor(...T.text3);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text('TOTAL', chartCX, chartCY - 3, { align: 'center' });
    doc.setTextColor(...T.text1);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const aumLbl = totalPortfolio >= 1_000_000
      ? `RM${(totalPortfolio / 1_000_000).toFixed(1)}M`
      : `RM${(totalPortfolio / 1_000).toFixed(0)}K`;
    doc.text(aumLbl, chartCX, chartCY + 3, { align: 'center' });

    // Legend — 2 columns, to the right of the chart
    const legX = MARGIN + 58, legColW = 58;
    let ly = y + 2, legCol = 0;
    entries.forEach(([cls, val]) => {
      const pct = ((val / totalPortfolio) * 100).toFixed(1);
      const lx2 = legX + legCol * legColW;
      const col = CLASS_COLORS[cls] ?? T.text3;
      // Colour swatch
      doc.setFillColor(...col);
      doc.roundedRect(lx2, ly + 1, 3.5, 3.5, 0.5, 0.5, 'F');
      // Label
      doc.setTextColor(...T.text2);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(cls, lx2 + 6, ly + 4);
      // Value + pct
      doc.setTextColor(...T.text1);
      doc.setFont('helvetica', 'bold');
      doc.text(`${pct}%`, lx2 + 6, ly + 9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...T.text3);
      doc.setFontSize(7);
      doc.text(FMT.myr(val), lx2 + 20, ly + 9);
      ly += 12;
      if (ly > y + 50 && legCol === 0) { legCol = 1; ly = y + 2; }
    });

    y += 56;

    // Stacked allocation bar
    let barX = MARGIN;
    const barW = CW, barH = 4.5;
    entries.forEach(([cls, val]) => {
      const segW = (val / totalPortfolio) * barW;
      doc.setFillColor(...(CLASS_COLORS[cls] ?? T.text3));
      doc.rect(barX, y, segW, barH, 'F');
      barX += segW;
    });
    doc.setDrawColor(...T.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(MARGIN, y, CW, barH, 1, 1, 'D');
    y += 10;
  }

  // ── Holdings table ─────────────────────────────────────────────────────────
  y = sectionTitle(doc, y, 'Holdings Detail');

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
    head: [['Holding Name', 'Asset Class', 'Institution', 'Value', 'MYR Equiv.', 'Gain / Loss']],
    body: holdingRows.length ? holdingRows : [['No active holdings', '', '', '', '', '']],
    theme: 'plain',
    styles: {
      fontSize: 8, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      textColor: T.text2, lineColor: T.border, lineWidth: 0,
    },
    headStyles: {
      fillColor: T.red, textColor: T.white, fontStyle: 'bold',
      fontSize: 7, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: T.bg },
    columnStyles: {
      0: { cellWidth: 56, fontStyle: 'bold', textColor: T.text1 },
      1: { cellWidth: 28 },
      2: { cellWidth: 30 },
      3: { cellWidth: 27, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 23, halign: 'right' },
    },
    didParseCell: d => {
      if (d.section === 'body' && d.column.index === 5) {
        const v = String(d.cell.raw ?? '');
        if (v.startsWith('+')) d.cell.styles.textColor = T.green;
        else if (v.startsWith('-')) d.cell.styles.textColor = T.loss;
      }
    },
    didDrawCell: d => {
      // Bottom border per row
      if (d.section === 'body') {
        doc.setDrawColor(...T.border);
        doc.setLineWidth(0.2);
        doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
      }
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // Total bar
  const aft2 = (doc as any).lastAutoTable.finalY + 2;
  doc.setFillColor(...T.black);
  doc.roundedRect(MARGIN, aft2, CW, 9, 1, 1, 'F');
  doc.setFillColor(...T.red);
  doc.roundedRect(MARGIN, aft2, 3, 9, 1, 1, 'F');
  doc.rect(MARGIN + 1.5, aft2, 1.5, 9, 'F'); // fix right edge of red pip
  doc.setTextColor(...T.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Total Portfolio Value (MYR)', MARGIN + 7, aft2 + 6);
  doc.text(FMT.myr(totalPortfolio), W - MARGIN - 2, aft2 + 6, { align: 'right' });

  pageFooter(doc, 2, 3, today);

  /* ══════════════════════════════════════════════════════════════════════
     PAGE 3  —  INSURANCE
  ══════════════════════════════════════════════════════════════════════ */
  doc.addPage();
  doc.setFillColor(...T.white);
  doc.rect(0, 0, W, H, 'F');
  pageHeader(doc, logo, 'Insurance Summary', clientName);

  y = 28;

  // ── Coverage overview ──────────────────────────────────────────────────────
  y = sectionTitle(doc, y, 'Coverage Overview');

  const insTiles = [
    { label: 'Total Sum Assured',  value: FMT.myr(totalSA),            sub: 'All active policies', color: T.red },
    { label: 'Annual Premium',     value: FMT.myr(totalPremium),        sub: 'Total yearly cost', color: [180,100,6] as [number,number,number] },
    { label: 'Active Policies',    value: `${activePolicies.length}`,   sub: `of ${data.insurance.length} total`, color: T.green },
  ];
  const itW = (CW - 8) / 3;
  insTiles.forEach((t, i) => {
    kpiTile(doc, MARGIN + i * (itW + 4), y, itW, 26, t.label, t.value, t.sub, t.color);
  });
  y += 32;

  // ── Individual coverage ────────────────────────────────────────────────────
  const coverFields = [
    { key: 'lifeCover', label: 'Life Cover'        },
    { key: 'ciCover',   label: 'Critical Illness'   },
    { key: 'paCover',   label: 'Personal Accident'  },
    { key: 'tpdCover',  label: 'TPD'                },
  ];
  const income12 = (data.client.income || 0) * 12;

  y = sectionTitle(doc, y, 'Individual Coverage Amounts');

  const cvW = (CW - 12) / 4;
  coverFields.forEach((cf, i) => {
    const total = activePolicies.reduce(
      (s, p) => s + (((p as unknown) as Record<string, number>)[cf.key] || 0), 0
    );
    const rec = cf.key === 'lifeCover' ? income12 * 10
              : cf.key === 'ciCover'   ? income12 * 5
              : cf.key === 'paCover'   ? income12 * 3 : 0;
    const adequate = total > 0 && (rec === 0 || total >= rec * 0.8);
    const acol: [number,number,number] = total === 0
      ? [170,170,170] : adequate ? T.green : T.amber;
    kpiTile(doc, MARGIN + i * (cvW + 4), y, cvW, 26, cf.label, total > 0 ? FMT.myr(total) : 'Not filled', '', acol);
  });
  y += 32;

  // Medical class row
  const medClasses = activePolicies.map(p => p.medicalClass).filter(Boolean);
  if (medClasses.length > 0) {
    doc.setFillColor(...T.bg);
    doc.roundedRect(MARGIN, y, CW, 8, 1, 1, 'F');
    doc.setFillColor(...T.red);
    doc.roundedRect(MARGIN, y, 2.5, 8, 1, 1, 'F');
    doc.rect(MARGIN + 1.2, y, 1.3, 8, 'F');
    doc.setTextColor(...T.text3);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Medical Coverage:', MARGIN + 6, y + 5.2);
    doc.setTextColor(...T.text1);
    doc.setFont('helvetica', 'bold');
    doc.text(safeText(medClasses.join('   |   ')), MARGIN + 42, y + 5.2);
    y += 13;
  }

  // ── Policy detail table ────────────────────────────────────────────────────
  y = sectionTitle(doc, y, 'Policy Detail');

  const insRows = data.insurance.map(p => [
    safeText(p.policyName),
    safeText(p.insurer || '—'),
    safeText(p.insuranceType || '—'),
    safeBenefits(p.benefits),
    p.sumAssured    > 0 ? Math.round(p.sumAssured).toLocaleString()    : '—',
    p.annualPremium > 0 ? Math.round(p.annualPremium).toLocaleString() : '—',
    safeText(p.status || '—'),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Policy Name', 'Insurer', 'Type', 'Benefits', 'SA (MYR)', 'Premium/yr', 'Status']],
    body: insRows.length ? insRows : [['No policies recorded', '', '', '', '', '', '']],
    theme: 'plain',
    styles: {
      fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      textColor: T.text2, lineWidth: 0,
    },
    headStyles: {
      fillColor: T.red, textColor: T.white, fontStyle: 'bold',
      fontSize: 7, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: T.bg },
    columnStyles: {
      0: { cellWidth: 44, fontStyle: 'bold', textColor: T.text1 },
      1: { cellWidth: 28 },
      2: { cellWidth: 20 },
      3: { cellWidth: 38 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 14, halign: 'center' },
    },
    didParseCell: d => {
      if (d.section === 'body' && d.column.index === 6) {
        const v = String(d.cell.raw ?? '');
        if (v.includes('Active')) d.cell.styles.textColor = T.green;
        else if (v.includes('Lapsed')) d.cell.styles.textColor = T.loss;
      }
    },
    didDrawCell: d => {
      if (d.section === 'body') {
        doc.setDrawColor(...T.border);
        doc.setLineWidth(0.2);
        doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
      }
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  pageFooter(doc, 3, 3, today);

  // ── Save ──────────────────────────────────────────────────────────────────
  const fname = `${safeText(data.client.name).replace(/\s+/g, '_')}_Wealth_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fname);
}
