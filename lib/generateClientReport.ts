/**
 * Client Wealth Summary PDF — Bill Morrisons Group
 * Premium redesign: clean, minimal, private-banking style.
 * Red · Black · White brand theme.
 *
 * jsPDF Helvetica = Latin-1 only. Use safeText() on all user strings.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { upperName } from './displayName';

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

const FMT = {
  myr: (n: number) =>
    n === 0 ? '—'
    : n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000     ? `RM ${(n / 1_000).toFixed(1)}K`
    : `RM ${Math.round(n).toLocaleString()}`,
  date: (s: string) =>
    s ? new Date(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }) : '—',
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

/**
 * Cost in MYR, resolved the same way as the value above — and the same way the
 * Investment page resolves it. MYR holdings carry their figures in the *_myr
 * columns with the original-currency ones left null, so reading purchaseOrig
 * first (as this report used to) yielded no cost and printed a dash.
 */
/**
 * jsPDF measures alignment on the *untracked* string, so letter-spaced text is
 * placed as if the tracking were not there and drifts by half of it — 15mm for
 * a 21-character title at 1.5mm. Measure the real width and position it here.
 */
function trackedText(
  doc: jsPDF, text: string, x: number, y: number, charSpace: number,
  align: 'center' | 'right' = 'center',
) {
  const w = doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
  doc.text(text, align === 'center' ? x - w / 2 : x - w, y, { charSpace });
}

/**
 * A review date that has already passed reads as neglect on a client-facing
 * report, so an overdue — or missing — one is rolled forward to three months
 * from today, the standard review cycle. Only the report is adjusted; the
 * stored date is left alone.
 */
function reviewDate(stored: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = stored ? new Date(stored) : null;
  if (d && !isNaN(d.getTime()) && d >= today) return FMT.date(stored);
  const next = new Date(today);
  next.setMonth(next.getMonth() + 3);
  // Build the date from local parts — toISOString() would shift Malaysian
  // local midnight back into the previous UTC day.
  const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  return FMT.date(iso);
}

/**
 * "PRS Acc A" / "PRS Acc B" are sub-accounts of one pot; showing the letter
 * reads as separate categories when it isn't. The account number already tells
 * them apart. Mirrors the Investment page.
 */
const normalizeFundSource = (fs: string) => /^PRS\s*Acc/i.test(fs) ? 'PRS Acc' : fs;

/**
 * The same grouping the Investment page uses: by custodian account where there
 * is one, else by platform, with anything unattributed last. Holdings were
 * previously printed as one flat list whose "Institution" column mixed fund
 * houses (Principal, United) with platforms (iFAST, Phillip) — and an EPF pot
 * sat next to a cash one with nothing to separate them.
 */
function groupHoldings<T extends { platform?: string; fameAccountNo?: string; fundSource?: string }>(rows: T[]) {
  const byAccount  = new Map<string, T[]>();
  const byPlatform = new Map<string, T[]>();
  const loose: T[] = [];
  for (const h of rows) {
    if (h.fameAccountNo)  { const a = byAccount.get(h.fameAccountNo) ?? [];  a.push(h); byAccount.set(h.fameAccountNo, a); }
    else if (h.platform)  { const a = byPlatform.get(h.platform) ?? [];      a.push(h); byPlatform.set(h.platform, a); }
    else loose.push(h);
  }
  const groups = Array.from(byAccount.entries()).map(([acct, rs]) => ({
    label: [rs[0].platform, `Account ${acct}`, rs[0].fundSource ? normalizeFundSource(rs[0].fundSource) : '']
      .filter(Boolean).join(' · '),
    rows: rs,
  }));
  for (const [platform, rs] of byPlatform) groups.push({ label: platform, rows: rs });
  if (loose.length) groups.push({ label: 'Other Holdings (manual entries)', rows: loose });
  return groups;
}

/** height ÷ width of the logo asset, so it is drawn at its true proportions. */
function logoRatio(doc: jsPDF, logo: string): number {
  try {
    const p = doc.getImageProperties(logo);
    if (p?.width > 0 && p?.height > 0) return p.height / p.width;
  } catch { /* fall through to the shipped asset's ratio */ }
  return 75 / 396;
}

function effectivePurchaseMYR(h: { purchaseMYR: number; purchaseOrig: number; currency: string; fxRate: number }) {
  if (h.purchaseMYR > 0) return h.purchaseMYR;
  if (h.currency === 'MYR' && h.purchaseOrig > 0) return h.purchaseOrig;
  if (h.fxRate > 0 && h.purchaseOrig > 0) return h.purchaseOrig * h.fxRate;
  return 0;
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
  // Logo left — height follows the file's own proportions, so the wordmark is
  // never stretched if the asset is ever replaced with a different crop.
  if (logo) {
    const lw = 42;
    const lh = lw * logoRatio(doc, logo);
    doc.addImage(logo, 'PNG', MARGIN, 10 - lh / 2, lw, lh);
  }
  // Page title right
  doc.setTextColor(...T.text3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  trackedText(doc, safeText(clientName), W - MARGIN, 9.5, 0.2, 'right');
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
  doc.text('Bill Morrisons Group  |  CONFIDENTIAL — For client use only', MARGIN, H - 7);
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
    platform?: string; fameAccountNo?: string; fundSource?: string;
    valueOrig: number; valueMYR: number; purchaseOrig: number; purchaseMYR: number;
    fxRate: number; status: string; maturityDate: string;
  }>;
  insurance: Array<{
    policyName: string; insuranceType: string; benefits: string[];
    status: string; insurer: string; policyNumber: string;
    sumAssured: number; lifeCover: number; ciCover: number; paCover: number;
    tpdCover: number; medicalClass: string; medicalCard?: string; annualPremium: number;
    commencementDate: string; maturityDate: string; beneficiary: string;
    policyOwner?: string; lifeAssured?: string;
  }>;
  generatedAt: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export async function generateClientReport(data: ReportData): Promise<void> {
  const logo  = await loadLogo();
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
  const clientName = safeText(upperName(data.client.name));
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
    const lw = 76;
    const lh = lw * logoRatio(doc, logo);
    const padX = 7, padY = 5;
    const lx = (W - lw) / 2;
    const ly = (52 - (lh + padY * 2)) / 2 + padY;   // centre the plate in the banner
    doc.setFillColor(...T.white);
    doc.roundedRect(lx - padX, ly - padY, lw + padX * 2, lh + padY * 2, 2.5, 2.5, 'F');
    doc.addImage(logo, 'PNG', lx, ly, lw, lh);
  } else {
    doc.setTextColor(...T.white);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL MORRISONS', W / 2, 22, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    trackedText(doc, 'GLOBAL WEALTH ACCESS', W / 2, 30, 1.5);
  }

  // ── "Wealth Summary Report" label just below banner ───────────────────────
  doc.setTextColor(...T.red);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  trackedText(doc, 'WEALTH SUMMARY REPORT', W / 2, 61, 1.5);

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
    trackedText(doc, 'FINANCIAL GOALS', W / 2, goalY, 0.8);
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
    { label: 'Next Review',     value: reviewDate(data.client.nextReview) },
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
  doc.text('Bill Morrisons Group', MARGIN, H - 13);
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

  // "MYR Equiv." only earns a column when something is actually held in another
  // currency; for an all-MYR book it was a column of dashes.
  const hasForeign = active.some(h => h.currency && h.currency !== 'MYR');

  const colCount = hasForeign ? 7 : 6;
  // FMT.myr renders 0 as a dash, so a flat position must not be given a sign —
  // notes held at par were printing "+—".
  const signed   = (n: number | null) =>
    n == null || n === 0 ? '—' : n > 0 ? `+${FMT.myr(n)}` : `-${FMT.myr(Math.abs(n))}`;
  const pct      = (r: number | null) => r == null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(0)}%`;

  // The column is the fund house. Where the data repeats the platform there —
  // FAME rows often do — the group header above already says it.
  const fundHouse = (h: ReportData['portfolio'][number]) => {
    const inst = safeText(h.institution || '');
    if (!inst || inst.toLowerCase() === safeText(h.platform || '').toLowerCase()) return '—';
    // Structured-note issuers run long — 'Citigroup Global Markets Funding
    // Luxembourg S.C.A. ("CGMFL")' wrapped a row to six lines. The holding name
    // carries the issuer in full, so the column only needs to identify it.
    const short = inst.split('(')[0].trim();
    return short.length > 24 ? `${short.slice(0, 22).trim()}...` : short;
  };

  type Cell = string | { content: string; colSpan?: number };
  const holdingRows: Cell[][] = [];
  const groupHeadAt = new Set<number>();
  const subtotalAt  = new Set<number>();

  for (const g of groupHoldings(active)) {
    holdingRows.push([{ content: safeText(g.label), colSpan: colCount }]);
    groupHeadAt.add(holdingRows.length - 1);

    let gValue = 0, gCost = 0;
    for (const h of g.rows) {
      const myr      = effectiveMYR(h);
      const purchase = effectivePurchaseMYR(h);
      const pnl      = purchase > 0 ? myr - purchase : null;
      gValue += myr;
      gCost  += purchase;
      const row: Cell[] = [
        safeText(h.name),
        safeText(h.assetClass || '—'),
        fundHouse(h),
        h.currency !== 'MYR' ? `${h.currency} ${h.valueOrig.toLocaleString()}` : FMT.myr(myr),
      ];
      if (hasForeign) row.push(h.currency !== 'MYR' ? FMT.myr(myr) : '—');
      row.push(signed(pnl));
      row.push(pct(pnl ? (pnl / purchase) * 100 : null));   // flat or unknown → dash
      holdingRows.push(row);
    }

    const gPnl = gCost > 0 ? gValue - gCost : null;
    const sub: Cell[] = [{ content: `Subtotal — ${safeText(g.label)}`, colSpan: 3 }, FMT.myr(gValue)];
    if (hasForeign) sub.push('');
    sub.push(signed(gPnl));
    sub.push(pct(gPnl ? (gPnl / gCost) * 100 : null));
    holdingRows.push(sub);
    subtotalAt.add(holdingRows.length - 1);
  }

  const holdHead = hasForeign
    ? ['Holding Name', 'Asset Class', 'Fund House', 'Value', 'MYR Equiv.', 'Gain / Loss', 'Return']
    : ['Holding Name', 'Asset Class', 'Fund House', 'Value', 'Gain / Loss', 'Return'];

  const holdCols: Record<number, { cellWidth: number; halign?: 'right'; fontStyle?: 'bold'; textColor?: [number, number, number] }> =
    hasForeign
      ? { 0: { cellWidth: 46, fontStyle: 'bold', textColor: T.text1 }, 1: { cellWidth: 20 }, 2: { cellWidth: 22 },
          3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 22, halign: 'right' } }
      : { 0: { cellWidth: 58, fontStyle: 'bold', textColor: T.text1 }, 1: { cellWidth: 24 }, 2: { cellWidth: 26 },
          3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 22, halign: 'right' } };

  autoTable(doc, {
    startY: y,
    head: [holdHead],
    body: holdingRows.length ? holdingRows : [holdHead.map(() => '')],
    theme: 'plain',
    styles: {
      fontSize: 8, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      textColor: T.text2, lineColor: T.border, lineWidth: 0,
    },
    headStyles: {
      fillColor: T.red, textColor: T.white, fontStyle: 'bold',
      fontSize: 7, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
    },
    columnStyles: holdCols,
    didParseCell: d => {
      if (d.section !== 'body') return;
      if (groupHeadAt.has(d.row.index)) {
        d.cell.styles.fillColor = [238, 240, 243];
        d.cell.styles.textColor = T.text1;
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize  = 7.5;
        return;
      }
      if (subtotalAt.has(d.row.index)) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.textColor = T.text1;
      }
      // Gain and return carry a leading sign; the em-dash placeholder does not.
      const raw = d.cell.raw;
      if (typeof raw === 'string') {
        if (raw.startsWith('+'))      d.cell.styles.textColor = T.green;
        else if (raw.startsWith('-')) d.cell.styles.textColor = T.loss;
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
    { label: 'Total Sum Assured',  value: FMT.myr(totalSA),          sub: 'All active policies', color: T.red },
    { label: 'Premium / Year',     value: FMT.myr(totalPremium),      sub: 'Total yearly cost',   color: T.amber },
    { label: 'Premium / Month',    value: FMT.myr(totalPremium / 12), sub: 'Average per month',   color: T.amber },
    { label: 'Active Policies',    value: `${activePolicies.length}`, sub: `of ${data.insurance.length} total`, color: T.green },
  ];
  const itW = (CW - 12) / 4;
  insTiles.forEach((t, i) => {
    kpiTile(doc, MARGIN + i * (itW + 4), y, itW, 26, t.label, t.value, t.sub, t.color);
  });
  y += 32;

  // ── What each policy covers ───────────────────────────────────────────────
  // One row per policy, one column per benefit: the reader sees at a glance
  // which policy carries which cover, and the TOTAL row is the household's
  // real protection. Blank means that policy does not carry that benefit.
  const income12 = (data.client.income || 0) * 12;
  const amt = (n: number) => n > 0 ? Math.round(n).toLocaleString() : '—';
  const medOf = (p: ReportData['insurance'][number]) => safeText(p.medicalCard || p.medicalClass || '');
  // The medical field is a long sentence ("… Room & Board: RM200/day · Annual
  // Limit: …"). The matrix has room for the room-and-board rate only; the full
  // text gets its own block below.
  const roomBoard = (s: string) => {
    const m = s.match(/(?:Room\s*&\s*Board|R&B)\s*:?\s*(RM\s?[\d,]+)/i);
    return m ? `${m[1].replace(/\s/g, '')}/day` : '';
  };
  const sumOf = (k: 'lifeCover' | 'ciCover' | 'tpdCover' | 'paCover') =>
    activePolicies.reduce((s, p) => s + (p[k] || 0), 0);
  const anyMedical = activePolicies.some(p => medOf(p) !== '');

  y = sectionTitle(doc, y, 'What Each Policy Covers');

  const matrixRows = activePolicies.map(p => [
    safeText(p.policyName),
    safeText(p.insurer || '—'),
    amt(p.lifeCover),
    amt(p.ciCover),
    amt(p.tpdCover),
    amt(p.paCover),
    medOf(p) ? (roomBoard(medOf(p)) || 'Yes') : '—',
    p.annualPremium > 0 ? Math.round(p.annualPremium).toLocaleString() : '—',
  ]);
  matrixRows.push([
    'TOTAL', '',
    amt(sumOf('lifeCover')), amt(sumOf('ciCover')), amt(sumOf('tpdCover')), amt(sumOf('paCover')),
    anyMedical ? 'Yes' : '—',
    totalPremium > 0 ? Math.round(totalPremium).toLocaleString() : '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Policy', 'Insurer', 'Life', 'Critical Illness', 'TPD', 'Personal Accident', 'Medical R&B', 'Premium / yr']],
    body: matrixRows.length > 1 ? matrixRows : [['No active policies', '', '', '', '', '', '', '']],
    theme: 'plain',
    styles: { fontSize: 7, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 }, textColor: T.text2, lineWidth: 0 },
    headStyles: {
      fillColor: T.red, textColor: T.white, fontStyle: 'bold',
      fontSize: 6.5, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
    },
    alternateRowStyles: { fillColor: T.bg },
    columnStyles: {
      0: { cellWidth: 36, fontStyle: 'bold', textColor: T.text1, halign: 'left' },
      1: { cellWidth: 20, halign: 'left' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 20, halign: 'center' },
      7: { cellWidth: 20, halign: 'right' },
    },
    didParseCell: d => {
      // Head must line up with the body: names left, money right, medical centred.
      if (d.section === 'head') {
        d.cell.styles.halign = d.column.index <= 1 ? 'left'
                             : d.column.index === 6 ? 'center' : 'right';
        return;
      }
      if (d.section !== 'body') return;
      const isTotal = d.row.index === matrixRows.length - 1 && matrixRows.length > 1;
      if (isTotal) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.textColor = T.text1;
        d.cell.styles.fillColor = [238, 240, 243];
      } else if (String(d.cell.raw) === '—') {
        d.cell.styles.textColor = T.text4;   // absent cover recedes
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 7;

  // ── Medical coverage detail ───────────────────────────────────────────────
  // The plan wording carries the limits a client actually asks about (room rate,
  // annual and lifetime caps), so it is printed in full rather than squeezed
  // into the matrix column.
  const medLines = activePolicies
    .map(p => ({ name: safeText(p.policyName), text: medOf(p) }))
    .filter(m => m.text !== '');
  if (medLines.length) {
    y = sectionTitle(doc, y, 'Medical Coverage');
    for (const m of medLines) {
      const wrapped = doc.splitTextToSize(m.text, CW - 50) as string[];
      const blockH  = Math.max(9, wrapped.length * 3.4 + 4.5);
      doc.setFillColor(...T.bg);
      doc.roundedRect(MARGIN, y, CW, blockH, 1, 1, 'F');
      doc.setFillColor(...T.red);
      doc.roundedRect(MARGIN, y, 2.5, blockH, 1, 1, 'F');
      doc.rect(MARGIN + 1.2, y, 1.3, blockH, 'F');
      doc.setTextColor(...T.text1);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.text((doc.splitTextToSize(m.name, 38) as string[])[0], MARGIN + 6, y + 5);
      doc.setTextColor(...T.text2);
      doc.setFont('helvetica', 'normal');
      doc.text(wrapped, MARGIN + 46, y + 5);
      y += blockH + 2;
    }
    y += 4;
  }

  // ── Protection check ──────────────────────────────────────────────────────
  // Says plainly, per benefit, whether there is cover at all and how it compares
  // with the rule-of-thumb target. Targets need income; without it we only
  // report presence or absence rather than inventing a benchmark.
  y = sectionTitle(doc, y, 'Protection Check');

  const checks: { label: string; have: number; target: number; flag?: boolean }[] = [
    { label: 'Life Cover',        have: sumOf('lifeCover'), target: income12 * 10 },
    { label: 'Critical Illness',  have: sumOf('ciCover'),   target: income12 * 5  },
    { label: 'TPD',               have: sumOf('tpdCover'),  target: income12 * 10 },
    { label: 'Personal Accident', have: sumOf('paCover'),   target: income12 * 3  },
    { label: 'Medical Card',      have: anyMedical ? 1 : 0, target: 1, flag: true },
  ];

  const chW = (CW - 16) / 5;
  checks.forEach((c, i) => {
    const x     = MARGIN + i * (chW + 4);
    const none  = c.have <= 0;
    const short = !none && !c.flag && c.target > 0 && c.have < c.target * 0.8;
    const col   = none ? T.loss : short ? T.amber : T.green;
    const verdict = none ? 'No cover' : short ? 'Below target' : 'Covered';
    const detail  = c.flag  ? (none ? 'None in force' : 'In force')
                  : none    ? 'Nothing in force'
                  : c.target > 0 ? `${FMT.myr(c.have)} of ${FMT.myr(c.target)}`
                  : FMT.myr(c.have);

    doc.setFillColor(...T.white);
    doc.setDrawColor(...T.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, chW, 22, 1.5, 1.5, 'FD');
    doc.setFillColor(...col);
    doc.roundedRect(x, y, chW, 2.6, 1.5, 1.5, 'F');
    doc.rect(x, y + 1.3, chW, 1.3, 'F');

    doc.setTextColor(...T.text3);
    doc.setFontSize(5.8);
    doc.setFont('helvetica', 'normal');
    doc.text(c.label.toUpperCase(), x + 3, y + 8);

    doc.setTextColor(...col);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(verdict, x + 3, y + 14);

    doc.setTextColor(...T.text3);
    doc.setFontSize(5.8);
    doc.setFont('helvetica', 'normal');
    doc.text(detail, x + 3, y + 19);
  });
  y += 28;

  if (income12 === 0) {
    doc.setTextColor(...T.text4);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text('Targets need a recorded monthly income — add one to benchmark Life, CI, TPD and PA cover.', MARGIN, y);
    y += 6;
  }

  // ── Policy details ────────────────────────────────────────────────────────
  y = sectionTitle(doc, y, 'Policy Details');

  const insRows = data.insurance.map(p => [
    // Many policy names already end in the policy number — don't print it twice.
    safeText(p.policyName) + (p.policyNumber && !p.policyName.includes(p.policyNumber)
      ? `\nNo. ${safeText(p.policyNumber)}` : ''),
    safeText([p.insurer, p.insuranceType].filter(Boolean).join(' · ')) || '—',
    safeText(p.lifeAssured || p.policyOwner || '') || '—',
    p.commencementDate ? FMT.date(p.commencementDate) : '—',
    p.maturityDate ? FMT.date(p.maturityDate) : '—',
    safeText(p.beneficiary || '') || '—',
    safeText(p.status || '—'),
  ]);

  // A long policy list spills onto further pages; autoTable adds them but knows
  // nothing about the branded header, so it is redrawn on each continuation.
  const detailStartPage = doc.getNumberOfPages();

  autoTable(doc, {
    startY: y,
    head: [['Policy', 'Insurer / Type', 'Life Assured', 'Start', 'Maturity', 'Beneficiary', 'Status']],
    body: insRows.length ? insRows : [['No policies recorded', '', '', '', '', '', '']],
    didDrawPage: () => {
      if (doc.getNumberOfPages() > detailStartPage) {
        pageHeader(doc, logo, 'Insurance Summary (cont.)', clientName);
      }
    },
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
      0: { cellWidth: 40, fontStyle: 'bold', textColor: T.text1 },
      1: { cellWidth: 24 },
      2: { cellWidth: 28 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
      5: { cellWidth: 32 },
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
    margin: { left: MARGIN, right: MARGIN, top: 28 },
  });

  // Footers last: a long policy list can push the report past three pages, so
  // "Page n of m" is only correct once all the content has been laid out.
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    pageFooter(doc, i, pageCount, today);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const fname = `${safeText(data.client.name).replace(/\s+/g, '_')}_Wealth_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fname);
}
