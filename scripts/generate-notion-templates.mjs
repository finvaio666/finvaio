import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'notion-import-templates');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  hdrBg:    '0F2012',  // dark green header
  hdrFg:    'E8F5EA',  // off-white text
  subBg:    '1A3D1E',  // sub-header bg
  subFg:    'A8D5AC',  // sub-header text
  inputBg:  'FFFDE7',  // yellow — cells to fill in
  inputFg:  '0000FF',  // blue text = hardcoded input (industry standard)
  calcBg:   'E8F5EA',  // light green — auto-calculated, read-only
  calcFg:   '2D6A35',  // dark green text
  reqBg:    'FFF3CD',  // amber — required field
  optBg:    'F5FAF6',  // light — optional field
  border:   'C5DFC7',
  exBg:     'E3F2FD',  // light blue — example row
  exFg:     '1565C0',  // blue text for example
  delBg:    'FFEBEE',  // red tint — delete before import
  delFg:    'C62828',
  white:    'FFFFFF',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function font(opts = {}) {
  return { name: 'Arial', size: opts.size ?? 10, bold: opts.bold ?? false,
    italic: opts.italic ?? false, color: { argb: opts.color ?? '000000' } };
}
function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function border(color = C.border) {
  return {
    top:    { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    left:   { style: 'thin', color: { argb: color } },
    right:  { style: 'thin', color: { argb: color } },
  };
}
function align(h = 'left', v = 'middle', wrap = false) {
  return { horizontal: h, vertical: v, wrapText: wrap };
}

function addDropdown(sheet, col, startRow, endRow, options) {
  for (let r = startRow; r <= endRow; r++) {
    sheet.getCell(r, col).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${options.join(',')}"`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Invalid option',
      error: `Please choose: ${options.join(' | ')}`,
    };
  }
}

function addDateNote(sheet, col, startRow, endRow) {
  for (let r = startRow; r <= endRow; r++) {
    sheet.getCell(r, col).dataValidation = {
      type: 'custom',
      allowBlank: true,
      formulae: ['TRUE'],
      showInputMessage: true,
      promptTitle: 'Date format',
      prompt: 'Enter date as YYYY-MM-DD  e.g. 2026-05-19',
    };
  }
}

// Makes a styled section title spanning full width
function sectionTitle(sheet, text, colCount, bg = C.hdrBg, fg = C.hdrFg, size = 14) {
  const r = sheet.addRow([text]);
  sheet.mergeCells(r.number, 1, r.number, colCount);
  const cell = r.getCell(1);
  cell.font = font({ size, bold: true, color: fg });
  cell.fill = fill(bg);
  cell.alignment = align('left', 'middle');
  r.height = size === 14 ? 28 : 20;
  return r;
}

function subTitle(sheet, text, colCount) {
  return sectionTitle(sheet, text, colCount, C.subBg, C.subFg, 10);
}

function headerRow(sheet, labels, widths) {
  const r = sheet.addRow(labels);
  r.height = 32;
  r.eachCell((cell, col) => {
    cell.font = font({ bold: true, size: 10, color: C.hdrFg });
    cell.fill = fill(C.hdrBg);
    cell.alignment = align('center', 'middle', true);
    cell.border = border();
  });
  if (widths) sheet.columns.forEach((c, i) => { c.width = widths[i] ?? 16; });
  return r;
}

function hintRow(sheet, hints, colCount) {
  const r = sheet.addRow(hints);
  r.height = 28;
  r.eachCell((cell) => {
    cell.font = font({ italic: true, size: 9, color: '555555' });
    cell.fill = fill('F1F8F2');
    cell.alignment = align('left', 'middle', true);
    cell.border = border('DDDDDD');
  });
  return r;
}

// Styles a data cell as an input field (yellow bg, blue text)
function inputCell(cell, value = '', required = true) {
  cell.value = value === '' ? null : value;
  cell.font = font({ color: C.inputFg, size: 10 });
  cell.fill = fill(required ? C.inputBg : C.optBg);
  cell.alignment = align('left', 'middle');
  cell.border = border();
}

// Example data row styling
function exampleCell(cell, value) {
  cell.value = value;
  cell.font = font({ italic: true, size: 10, color: C.exFg });
  cell.fill = fill(C.exBg);
  cell.alignment = align('left', 'middle');
  cell.border = border('BAD7F5');
}

// Read-only calculated cell
function calcCell(cell, formula) {
  cell.value = { formula };
  cell.font = font({ color: C.calcFg, size: 10 });
  cell.fill = fill(C.calcBg);
  cell.alignment = align('right', 'middle');
  cell.border = border();
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED: README sheet
// ══════════════════════════════════════════════════════════════════════════════
function addReadme(wb, dbName, steps, rules) {
  const sh = wb.addWorksheet('📋 READ ME FIRST', { tabColor: { argb: 'FF5722' } });
  sh.columns = [{ width: 5 }, { width: 60 }, { width: 5 }];

  const addLine = (text, opts = {}) => {
    const r = sh.addRow(['', text, '']);
    r.getCell(2).font = font({ size: opts.size ?? 10, bold: opts.bold ?? false,
      italic: opts.italic ?? false, color: opts.color ?? '1A1A1A' });
    r.getCell(2).alignment = align('left', 'middle', true);
    r.height = opts.height ?? 18;
    return r;
  };

  sh.addRow([]);
  addLine(`📊  ${dbName}`, { size: 16, bold: true, color: '0A4A14', height: 30 });
  addLine('Bill Morrisons Financial Consulting — Data Entry Guide', { size: 11, italic: true, color: '4A7A4E', height: 20 });
  sh.addRow([]);

  addLine('HOW TO USE THIS FILE', { bold: true, size: 11, color: C.hdrBg, height: 22 });
  steps.forEach((s, i) => addLine(`  ${i + 1}.  ${s}`, { height: 20 }));
  sh.addRow([]);

  addLine('COLOUR GUIDE', { bold: true, size: 11, color: C.hdrBg, height: 22 });
  const colours = [
    [C.inputBg, C.inputFg, '🟡 Yellow cells — REQUIRED: your assistant must fill these in'],
    [C.optBg,   '1A1A1A',  '🟢 Light green cells — OPTIONAL: fill in if available'],
    [C.calcBg,  C.calcFg,  '🔵 Auto-calculated — do NOT edit these'],
    [C.exBg,    C.exFg,    '🔷 Light blue row — EXAMPLE only, delete before importing'],
    [C.delBg,   C.delFg,   '🔴 Pink column — DELETE before importing to Notion'],
  ];
  colours.forEach(([bg, fg, label]) => {
    const r = sh.addRow(['', label, '']);
    r.getCell(2).font = font({ size: 10, color: fg });
    r.getCell(2).fill = fill(bg);
    r.getCell(2).alignment = align('left', 'middle');
    r.getCell(2).border = border();
    r.height = 20;
  });
  sh.addRow([]);

  addLine('RULES & IMPORTANT NOTES', { bold: true, size: 11, color: C.hdrBg, height: 22 });
  rules.forEach(rule => addLine(`  ⚠️  ${rule}`, { height: 20 }));

  return sh;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. CLIENTS DATABASE
// ══════════════════════════════════════════════════════════════════════════════
async function makeClients() {
  const wb = new ExcelJS.Workbook();

  addReadme(wb, 'Clients Database', [
    'Go to the "Clients Data Entry" sheet (tab at the bottom)',
    'Delete the blue EXAMPLE row (Row 5) before adding real data',
    'Fill in one client per row — yellow cells are required, green are optional',
    'For "Financial goals": type goals separated by commas  e.g.  Retirement,Property',
    'For all date fields: use YYYY-MM-DD format  e.g.  1984-06-15',
    'When done: File → Save As → CSV UTF-8 (.csv)',
    'In Notion: open the Clients database → ⋯ menu → Import → CSV → upload the file',
  ], [
    'Do NOT change the column headers in Row 3 — Notion uses them to match fields',
    'Dates MUST be in YYYY-MM-DD format or Notion will not recognise them',
    'Financial goals must be comma-separated with no spaces  e.g.  Retirement,Property,Education',
    'AUM and Monthly Income: numbers only — no "RM", no commas  e.g.  250000',
  ]);

  const sh = wb.addWorksheet('Clients Data Entry', {
    tabColor: { argb: '2E7D32' },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });

  const cols = [
    'Client Name','Status','Client Segment','Risk Profile',
    'AUM (MYR)','Monthly income (MYR)',
    'Date of Birth','Onboarding date','Last review date','Next review date',
    'Financial goals','Phone','Email',
  ];

  const widths = [36, 14, 18, 16, 14, 20, 16, 18, 18, 18, 44, 20, 30];

  sectionTitle(sh, '  Bill Morrisons Financial Consulting  —  Clients Database', cols.length);
  subTitle(sh, '  ✏️  Fill in one client per row  |  Yellow = Required  |  Green = Optional  |  Delete the blue example row before importing', cols.length);
  headerRow(sh, cols, widths);
  hintRow(sh, [
    'Full legal name','Active / Prospect / Inactive','Affluent / Mass Affluent / HNW / UHNW',
    'Conservative / Moderate / Aggressive',
    'Numbers only  e.g. 250000','Numbers only  e.g. 12000',
    'YYYY-MM-DD','YYYY-MM-DD','YYYY-MM-DD','YYYY-MM-DD',
    'Comma-separated  e.g. Retirement,Property','e.g. +60123456789','e.g. client@email.com',
  ], cols.length);

  // Example row
  const ex = sh.addRow([
    'Ahmad Rizal bin Abdullah','Active','Affluent','Moderate',
    250000, 12000,
    '1984-06-15','2024-01-10','2025-08-16','2026-08-16',
    'Retirement,Property','+60123456789','ahmad@email.com',
  ]);
  ex.height = 22;
  ex.eachCell(cell => exampleCell(cell, cell.value));
  sh.getCell(ex.number, 1).value = '⬅ EXAMPLE — DELETE THIS ROW BEFORE IMPORTING';
  sh.getCell(ex.number, 1).font = font({ italic: true, bold: true, size: 9, color: C.exFg });

  // 50 blank input rows
  const DATA_START = 6;
  const DATA_END   = 55;
  for (let i = DATA_START; i <= DATA_END; i++) {
    const r = sh.addRow(Array(cols.length).fill(null));
    r.height = 22;
    r.eachCell((cell, colNum) => {
      const optional = [8, 9, 12, 13].includes(colNum); // onboarding, last review, phone, email
      inputCell(cell, '', !optional);
    });
  }

  // Dropdowns
  addDropdown(sh, 2, DATA_START, DATA_END, ['Active', 'Prospect', 'Inactive']);
  addDropdown(sh, 3, DATA_START, DATA_END, ['Affluent', 'Mass Affluent', 'HNW', 'UHNW']);
  addDropdown(sh, 4, DATA_START, DATA_END, ['Conservative', 'Moderate', 'Aggressive']);
  [7, 8, 9, 10].forEach(col => addDateNote(sh, col, DATA_START, DATA_END));

  await wb.xlsx.writeFile(path.join(OUT, '1_Clients_Database.xlsx'));
  console.log('✅  1_Clients_Database.xlsx');
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. CASH FLOW DATABASE
// ══════════════════════════════════════════════════════════════════════════════
async function makeCashflow() {
  const wb = new ExcelJS.Workbook();

  addReadme(wb, 'Cash Flow Planner Database', [
    'Go to the "Cash Flow Data Entry" sheet',
    'Delete the blue EXAMPLE row (Row 5) before adding real data',
    'Enter one row per client per month',
    '"Entry" is just a label — suggested format:  ClientName — Month Year  e.g.  Ahmad Rizal — May 2026',
    '"Month" must be the first day of the month in YYYY-MM-DD format  e.g.  2026-05-01',
    'All amounts are numbers only — no "RM", no commas',
    'Surplus and Savings Rate columns auto-calculate — do NOT edit them',
    'DELETE the last two columns (Surplus & Savings Rate) before importing to Notion',
    'When done: File → Save As → CSV UTF-8 (.csv) → Import to Notion',
  ], [
    'Do NOT change column headers in Row 3',
    'Month MUST be YYYY-MM-DD (first of month)  e.g.  2026-05-01  not  May 2026',
    'DELETE the pink "Surplus" and "Savings Rate" columns before importing — Notion calculates these in the dashboard',
    'All amounts: numbers only, no currency symbols or commas',
  ]);

  const sh = wb.addWorksheet('Cash Flow Data Entry', {
    tabColor: { argb: '1565C0' },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });

  const cols = [
    'Entry','Month',
    'Monthly income (MYR)','Fixed expenses (MYR)',
    'Variable expenses (MYR)','EPF contribution (MYR)',
    '⚠️ Surplus — DELETE BEFORE IMPORT',
    '⚠️ Savings Rate — DELETE BEFORE IMPORT',
  ];
  const widths = [38, 18, 22, 22, 22, 22, 26, 28];

  sectionTitle(sh, '  Bill Morrisons Financial Consulting  —  Cash Flow Planner', cols.length);
  subTitle(sh, '  ✏️  One row per client per month  |  DELETE the last 2 pink columns before importing to Notion', cols.length);
  headerRow(sh, cols, widths);

  // Mark last 2 header cells as delete-warning
  [7, 8].forEach(col => {
    const cell = sh.getRow(3).getCell(col);
    cell.font = font({ bold: true, size: 9, color: C.delFg });
    cell.fill = fill(C.delBg);
  });

  hintRow(sh, [
    'e.g. Ahmad Rizal — May 2026',
    'YYYY-MM-DD first of month  e.g. 2026-05-01',
    'Total gross monthly income','Rent/mortgage, loans, insurance, etc.',
    'Food, transport, lifestyle, etc.','Employee + Employer EPF total',
    '=auto','=auto',
  ], cols.length);

  // Example row
  const exRow = 5;
  const ex = sh.addRow([
    'Ahmad Rizal — May 2026','2026-05-01',
    12000, 4320, 2400, 2640,
  ]);
  ex.height = 22;
  ex.eachCell((cell, col) => { if (col <= 6) exampleCell(cell, cell.value); });
  const exG = ex.getCell(7);
  exG.value = { formula: `=C${exRow}-D${exRow}-E${exRow}-F${exRow}` };
  exG.font = font({ italic: true, size: 10, color: C.exFg }); exG.fill = fill(C.exBg); exG.border = border('BAD7F5');
  const exH = ex.getCell(8);
  exH.value = { formula: `=IF(C${exRow}>0,(C${exRow}-D${exRow}-E${exRow}-F${exRow})/C${exRow},0)` };
  exH.numFmt = '0.0%';
  exH.font = font({ italic: true, size: 10, color: C.exFg }); exH.fill = fill(C.exBg); exH.border = border('BAD7F5');
  sh.getCell(exRow, 1).value = '⬅ EXAMPLE — DELETE THIS ROW';
  sh.getCell(exRow, 1).font = font({ italic: true, bold: true, size: 9, color: C.exFg });

  // 50 blank input rows
  const DS = 6, DE = 55;
  for (let i = DS; i <= DE; i++) {
    const r = sh.addRow(Array(cols.length).fill(null));
    r.height = 22;
    [1,2,3,4,5,6].forEach(col => inputCell(r.getCell(col), '', true));
    calcCell(r.getCell(7), `C${i}-D${i}-E${i}-F${i}`);
    const rateCell = r.getCell(8);
    rateCell.value = { formula: `IF(C${i}>0,(C${i}-D${i}-E${i}-F${i})/C${i},0)` };
    rateCell.numFmt = '0.0%';
    rateCell.font = font({ color: C.calcFg }); rateCell.fill = fill(C.calcBg); rateCell.border = border();
    // Pink on delete cols
    [7, 8].forEach(col => { r.getCell(col).fill = fill('FFF0F0'); });
  }

  addDateNote(sh, 2, DS, DE);

  await wb.xlsx.writeFile(path.join(OUT, '2_CashFlow_Database.xlsx'));
  console.log('✅  2_CashFlow_Database.xlsx');
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. PORTFOLIO HOLDINGS DATABASE
// ══════════════════════════════════════════════════════════════════════════════
async function makePortfolio() {
  const wb = new ExcelJS.Workbook();

  addReadme(wb, 'Portfolio Holdings Database', [
    'Go to the "Portfolio Data Entry" sheet',
    'Delete the blue EXAMPLE rows before adding real data',
    'Enter one row per holding (EPF, unit trust, FD, stocks, etc.)',
    '"Client Name" = the client who owns this holding — must match the name in the Clients database',
    '"Purchase price" = original amount invested; "Value" = current market value',
    '"Maturity date" only applies to Fixed Deposits and bonds — leave blank for others',
    'Gain/Loss and Return % are auto-calculated — do NOT edit them',
    'DELETE the last two pink columns before importing to Notion',
    'When done: File → Save As → CSV UTF-8 (.csv) → Import to Notion',
  ], [
    'Do NOT change column headers in Row 3',
    'Client Name must match exactly the name in your Clients database',
    'Asset class must match exactly: EPF | Unit Trust | Fixed Deposit | Stocks | Bonds',
    'Maturity date: YYYY-MM-DD only  e.g.  2026-11-30  — leave empty for EPF/unit trusts',
    'DELETE the pink Gain/Loss and Return % columns before importing to Notion',
    'All amounts: numbers only, no "RM" or commas  e.g.  115000 not RM 115,000',
  ]);

  const sh = wb.addWorksheet('Portfolio Data Entry', {
    tabColor: { argb: 'E65100' },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });

  // Col layout:
  // A(1)  Client Name
  // B(2)  Holding Name
  // C(3)  Asset class
  // D(4)  Institution
  // E(5)  Status
  // F(6)  Currency          ← NEW
  // G(7)  Value (original currency)   ← NEW  — enter amount in home currency
  // H(8)  Purchase price (original currency)  ← NEW
  // I(9)  FX Rate to MYR    ← NEW  (1 for MYR, e.g. 4.47 for USD)
  // J(10) Value (MYR)       ← auto-calculated = G*I
  // K(11) Purchase price (MYR) ← auto-calculated = H*I
  // L(12) Maturity date
  // M(13) ⚠️ Gain/Loss — DELETE BEFORE IMPORT
  // N(14) ⚠️ Return % — DELETE BEFORE IMPORT
  const cols = [
    'Client Name','Holding Name','Asset class','Institution','Status',
    'Currency',
    'Value (original currency)','Purchase price (original currency)',
    'FX Rate to MYR',
    'Value (MYR)','Purchase price (MYR)',
    'Maturity date',
    '⚠️ Gain/Loss — DELETE BEFORE IMPORT',
    '⚠️ Return % — DELETE BEFORE IMPORT',
  ];
  const widths = [30, 36, 14, 20, 12, 10, 24, 28, 16, 16, 20, 18, 28, 24];

  sectionTitle(sh, '  Bill Morrisons Financial Consulting  —  Portfolio Holdings', cols.length);
  subTitle(sh, '  ✏️  Supports MYR / USD / SGD / GBP / EUR  |  Enter original currency amount + FX rate → MYR auto-calculated  |  DELETE last 2 pink cols before import', cols.length);
  headerRow(sh, cols, widths);

  // Mark last 2 header cells as delete-warning
  [13, 14].forEach(col => {
    const cell = sh.getRow(3).getCell(col);
    cell.font = font({ bold: true, size: 9, color: C.delFg });
    cell.fill = fill(C.delBg);
  });

  // Mark Value(MYR) and Purchase(MYR) as auto-calc in header
  [10, 11].forEach(col => {
    const cell = sh.getRow(3).getCell(col);
    cell.font = font({ bold: true, size: 9, color: C.calcFg });
    cell.fill = fill(C.calcBg);
  });

  hintRow(sh, [
    'Must match name in Clients DB',
    'Full product name',
    'EPF/Unit Trust/Fixed Deposit/Stocks/Bonds',
    'e.g. KWSP / Maybank / Interactive Brokers',
    'Active/Matured/Redeemed',
    'MYR / USD / SGD / GBP / EUR / AUD / HKD',
    'Amount in original currency  e.g. 10000',
    'Original purchase amount in same currency',
    'MYR=1 · USD≈4.47 · SGD≈3.32 · GBP≈5.65',
    '=auto (G×I)','=auto (H×I)',
    'YYYY-MM-DD for FD/bonds only',
    '=auto','=auto',
  ], cols.length);

  // Example rows
  // MYR example, USD example, SGD example
  const examples = [
    ['Ahmad Rizal bin Abdullah', 'EPF Account 1',              'EPF',           'KWSP',                'Active', 'MYR', 115000, 92000,  1,    115000, 92000,  ''],
    ['Ahmad Rizal bin Abdullah', 'Public Mutual Growth Fund',  'Unit Trust',    'Public Mutual',       'Active', 'MYR', 85000,  70000,  1,    85000,  70000,  ''],
    ['Ahmad Rizal bin Abdullah', 'Maybank FD 12-Month',        'Fixed Deposit', 'Maybank',             'Active', 'MYR', 50000,  50000,  1,    50000,  50000,  '2026-11-30'],
    ['Ahmad Rizal bin Abdullah', 'Apple Inc (AAPL)',           'Stocks',        'Interactive Brokers', 'Active', 'USD', 5000,   4200,   4.47, 22350,  18774,  ''],
    ['Ahmad Rizal bin Abdullah', 'Nikko AM STI ETF',           'Unit Trust',    'DBS Vickers',         'Active', 'SGD', 8000,   7000,   3.32, 26560,  23240,  ''],
  ];

  examples.forEach((row, idx) => {
    const rowNum = 5 + idx;
    const r = sh.addRow(row);
    r.height = 22;
    r.eachCell((cell, col) => { if (col <= 12) exampleCell(cell, cell.value); });
    // Gain/Loss col M (13) = J - K
    const gainCell = r.getCell(13);
    gainCell.value = { formula: `J${rowNum}-K${rowNum}` };
    gainCell.numFmt = '#,##0;(#,##0);-';
    gainCell.font = font({ italic: true, size: 10, color: C.exFg }); gainCell.fill = fill(C.exBg); gainCell.border = border('BAD7F5');
    // Return % col N (14)
    const retCell = r.getCell(14);
    retCell.value = { formula: `IF(K${rowNum}>0,(J${rowNum}-K${rowNum})/K${rowNum},0)` };
    retCell.numFmt = '0.0%';
    retCell.font = font({ italic: true, size: 10, color: C.exFg }); retCell.fill = fill(C.exBg); retCell.border = border('BAD7F5');
  });

  // Mark example rows
  for (let i = 5; i <= 9; i++) {
    sh.getCell(i, 2).value = (i === 5 ? '⬅ EXAMPLE MYR' : i === 8 ? '⬅ EXAMPLE USD' : i === 9 ? '⬅ EXAMPLE SGD' : '⬅ EXAMPLE — DELETE');
    sh.getCell(i, 2).font = font({ italic: true, bold: true, size: 9, color: C.exFg });
  }

  // 50 blank input rows
  const DS = 10, DE = 59;
  for (let i = DS; i <= DE; i++) {
    const r = sh.addRow(Array(cols.length).fill(null));
    r.height = 22;
    // Input cells: A-F required, G-I required, L optional
    [1,2,3,4,5,6,7,8,9].forEach(col => inputCell(r.getCell(col), '', true));
    inputCell(r.getCell(12), '', false); // maturity optional

    // Value (MYR) = G*I  col J(10)
    const valMYR = r.getCell(10);
    valMYR.value = { formula: `G${i}*I${i}` };
    valMYR.numFmt = '#,##0;(#,##0);-';
    valMYR.font = font({ color: C.calcFg }); valMYR.fill = fill(C.calcBg); valMYR.border = border();

    // Purchase (MYR) = H*I  col K(11)
    const purMYR = r.getCell(11);
    purMYR.value = { formula: `H${i}*I${i}` };
    purMYR.numFmt = '#,##0;(#,##0);-';
    purMYR.font = font({ color: C.calcFg }); purMYR.fill = fill(C.calcBg); purMYR.border = border();

    // Gain/Loss col M (13)
    const gainCell = r.getCell(13);
    gainCell.value = { formula: `J${i}-K${i}` };
    gainCell.numFmt = '#,##0;(#,##0);-';
    gainCell.font = font({ color: C.calcFg }); gainCell.fill = fill('FFF0F0'); gainCell.border = border();

    // Return % col N (14)
    const retCell = r.getCell(14);
    retCell.value = { formula: `IF(K${i}>0,(J${i}-K${i})/K${i},0)` };
    retCell.numFmt = '0.0%';
    retCell.font = font({ color: C.calcFg }); retCell.fill = fill('FFF0F0'); retCell.border = border();
  }

  // Total row
  const totalR = sh.addRow(['TOTAL', '', '', '', '', '', '', '', '',
    { formula: `SUM(J10:J${DE})` },
    { formula: `SUM(K10:K${DE})` },
    '', { formula: `SUM(M10:M${DE})` },
    { formula: `IF(SUM(K10:K${DE})>0,SUM(M10:M${DE})/SUM(K10:K${DE}),0)` },
  ]);
  totalR.height = 26;
  totalR.eachCell((cell, col) => {
    cell.font = font({ bold: true, size: 10, color: '0A4A14' });
    cell.fill = fill('D0EDD3');
    cell.border = { top: { style: 'medium', color: { argb: '2E7D32' } } };
    if ([10,11,13].includes(col)) cell.numFmt = '#,##0;(#,##0);-';
    if (col === 14) cell.numFmt = '0.0%';
  });

  addDropdown(sh, 3, DS, DE, ['EPF', 'Unit Trust', 'Fixed Deposit', 'Stocks', 'Bonds']);
  addDropdown(sh, 5, DS, DE, ['Active', 'Matured', 'Redeemed', 'Pending']);
  addDropdown(sh, 6, DS, DE, ['MYR', 'USD', 'SGD', 'GBP', 'EUR', 'AUD', 'HKD', 'JPY', 'CNY']);
  addDateNote(sh, 12, DS, DE);

  await wb.xlsx.writeFile(path.join(OUT, '3_Portfolio_Holdings.xlsx'));
  console.log('✅  3_Portfolio_Holdings.xlsx');
}

// ── Run ────────────────────────────────────────────────────────────────────────
await makeClients();
await makeCashflow();
await makePortfolio();
console.log(`\n📁  Saved to: ${OUT}`);
