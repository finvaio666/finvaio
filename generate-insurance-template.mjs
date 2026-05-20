// generate-insurance-template.mjs
// Run: node generate-insurance-template.mjs
// Generates: Insurance_Policies_Template.xlsx

import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

// ── Read .env.local to get Notion credentials ──────────────────────────────
const envPath = path.resolve('.env.local');
const envVars = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) envVars[k.trim()] = v.join('=').trim();
});

const NOTION_API_KEY   = envVars['NOTION_API_KEY'];
const NOTION_CLIENTS_DB = '362de6dd-1dfe-80e5-9275-e4ce2fc046b2';

// ── Fetch client names from Notion ─────────────────────────────────────────
async function fetchClients() {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_CLIENTS_DB}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sorts: [{ property: 'Client Name', direction: 'ascending' }] }),
  });
  const json = await res.json();
  return json.results
    .filter(p => p.object === 'page')
    .map(p => p.properties['Client Name']?.title?.[0]?.plain_text ?? '')
    .filter(Boolean);
}

// ── Build workbook ─────────────────────────────────────────────────────────
async function main() {
  const clients = await fetchClients();
  console.log(`Fetched ${clients.length} clients:`, clients);

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Bill Morrisons Financial Consulting';
  wb.created  = new Date();

  // ── Sheet 1: Data Entry ─────────────────────────────────────────────────
  const ws = wb.addWorksheet('Insurance Policies', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  // Title row
  ws.mergeCells('A1:M1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Bill Morrisons — Insurance Policies Data Entry';
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FF1A1A2E' } };
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0EE' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Sub-title row
  ws.mergeCells('A2:M2');
  const subCell = ws.getCell('A2');
  subCell.value = `Template generated ${new Date().toLocaleDateString('en-MY')} · Fill in all yellow columns · Dates format: DD/MM/YYYY · Benefits: separate multiple with comma`;
  subCell.font  = { italic: true, size: 9, color: { argb: 'FF666666' } };
  subCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0EE' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  // Column definitions
  const columns = [
    { header: 'Client Name *',         key: 'clientName',        width: 24, required: true,  note: 'Must match exactly one of your clients' },
    { header: 'Policy Name *',         key: 'policyName',        width: 28, required: true,  note: 'Descriptive name e.g. "AIA Vitality Pro"' },
    { header: 'Insurance Type *',      key: 'insuranceType',     width: 16, required: true,  note: 'See Reference sheet for valid options' },
    { header: 'Benefits *',            key: 'benefits',          width: 40, required: true,  note: 'Comma-separated. See Reference sheet' },
    { header: 'Status *',              key: 'status',            width: 14, required: true,  note: 'Active / Lapsed / Surrendered' },
    { header: 'Insurer',               key: 'insurer',           width: 20, required: false, note: 'e.g. AIA, Prudential, Great Eastern' },
    { header: 'Policy Number',         key: 'policyNumber',      width: 20, required: false, note: 'As on policy document' },
    { header: 'Sum Assured (MYR)',     key: 'sumAssured',        width: 18, required: false, note: 'Numbers only, no commas' },
    { header: 'Annual Premium (MYR)',  key: 'annualPremium',     width: 20, required: false, note: 'Numbers only, no commas' },
    { header: 'Commencement Date',     key: 'commencementDate',  width: 20, required: false, note: 'DD/MM/YYYY' },
    { header: 'Maturity Date',         key: 'maturityDate',      width: 18, required: false, note: 'DD/MM/YYYY (leave blank for term)' },
    { header: 'Beneficiary',           key: 'beneficiary',       width: 22, required: false, note: 'Name of beneficiary' },
    { header: 'Notes',                 key: 'notes',             width: 30, required: false, note: 'Any additional remarks' },
  ];

  // Header row (row 3)
  const headerRow = ws.getRow(3);
  headerRow.height = 24;

  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font  = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.required ? 'FF2D3250' : 'FF424769' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFFF6B35' } },
    };

    // Set column width
    ws.getColumn(i + 1).width = col.width;

    // Add comment/note
    cell.note = col.note;
  });

  // ── Pre-fill one blank row per client (rows 4–8+) ──────────────────────
  const fillColor  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } }; // yellow = required
  const plainColor = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

  const dataStartRow = 4;
  const rowsPerClient = 3; // 3 policy rows per client

  clients.forEach((clientName, ci) => {
    for (let r = 0; r < rowsPerClient; r++) {
      const rowNum = dataStartRow + ci * rowsPerClient + r;
      const row = ws.getRow(rowNum);
      row.height = 20;

      columns.forEach((col, ci2) => {
        const cell = row.getCell(ci2 + 1);
        cell.fill = col.required ? fillColor : plainColor;
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
        };
        cell.alignment = { vertical: 'middle', wrapText: false };

        // Pre-fill client name in col A for first row of each client
        if (col.key === 'clientName' && r === 0) {
          cell.value = clientName;
          cell.font  = { bold: true };
        }
        // Pre-fill Status default
        if (col.key === 'status') {
          cell.value = 'Active';
        }
      });
    }

    // Light separator after each client block
    if (ci < clients.length - 1) {
      const sepRow = dataStartRow + (ci + 1) * rowsPerClient;
      ws.getRow(sepRow - 1).getCell(1).border = {
        ...ws.getRow(sepRow - 1).getCell(1).border,
        bottom: { style: 'medium', color: { argb: 'FFCCCCCC' } },
      };
    }
  });

  // ── Dropdowns (Data Validation) ───────────────────────────────────────
  const totalDataRows = clients.length * rowsPerClient;
  const lastDataRow   = dataStartRow + totalDataRows - 1;

  // Insurance Type dropdown
  const insuranceTypes = ['ILP', 'IUL', 'UL', 'VUL', 'Term Life', 'Endowment'];
  for (let r = dataStartRow; r <= lastDataRow; r++) {
    ws.getCell(`C${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`"${insuranceTypes.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid Type',
      error: `Must be one of: ${insuranceTypes.join(', ')}`,
    };
    ws.getCell(`E${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Active,Lapsed,Surrendered"'],
    };
  }

  // ── Sheet 2: Reference ──────────────────────────────────────────────────
  const ref = wb.addWorksheet('Reference', { tabColor: { argb: 'FFFF6B35' } });
  ref.views = [{ state: 'frozen', ySplit: 1 }];

  const refCols = [
    { header: 'Insurance Type',  key: 'type',    width: 18 },
    { header: 'Description',     key: 'typeDesc',width: 35 },
    { header: '',                key: 'gap',     width: 4  },
    { header: 'Benefits (multi-select)', key: 'benefit', width: 30 },
    { header: 'Coverage Target', key: 'target',  width: 38 },
    { header: '',                key: 'gap2',    width: 4  },
    { header: 'Status Options',  key: 'status',  width: 18 },
  ];

  refCols.forEach((c, i) => {
    ref.getColumn(i + 1).width = c.width;
    const cell = ref.getRow(1).getCell(i + 1);
    cell.value = c.header;
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3250' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ref.getRow(1).height = 22;

  // Insurance type descriptions
  const typeData = [
    ['ILP',       'Investment-Linked Policy — premiums split between insurance & investment funds'],
    ['IUL',       'Indexed Universal Life — cash value tied to market index (e.g. S&P 500)'],
    ['UL',        'Universal Life — flexible premium, cash value with interest crediting'],
    ['VUL',       'Variable Universal Life — cash value in sub-accounts (stocks/bonds)'],
    ['Term Life',  'Pure protection, fixed term (10/20/30 yr), no cash value'],
    ['Endowment',  'Savings + protection; pays out at maturity or on death'],
  ];

  // Benefits with coverage guidance
  const benefitData = [
    ['🛡️ Life Cover',              'Target: 10× annual income (e.g. income MYR 10k/mth → MYR 1.2M cover)'],
    ['❤️ Critical Illness (CI)',    'Target: 5× annual income for major illness payout'],
    ['🌟 Early CI',                 'Early stage critical illness — covers earlier diagnosis'],
    ['🏥 Medical',                  'Hospital & surgical cover — must have at least 1 active policy'],
    ['🦺 Personal Accident',        'Target: 3× annual income for accidental death/disability'],
    ['♿ TPD',                      'Total & Permanent Disability rider — lump sum on disability'],
    ['⏸️ Waiver of Premium',        'Premiums waived on disability or CI — protects policy continuity'],
    ['👶 Payor Benefit',            'Premiums waived if policy owner (parent) dies/disabled'],
  ];

  const statusData = [['Active'], ['Lapsed'], ['Surrendered']];

  const maxRows = Math.max(typeData.length, benefitData.length, statusData.length);

  for (let i = 0; i < maxRows; i++) {
    const row = ref.getRow(i + 2);
    row.height = 28;

    // Type col
    if (typeData[i]) {
      row.getCell(1).value = typeData[i][0];
      row.getCell(2).value = typeData[i][1];
      row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
      row.getCell(1).font = { bold: true };
    }
    // Benefit col
    if (benefitData[i]) {
      row.getCell(4).value = benefitData[i][0];
      row.getCell(5).value = benefitData[i][1];
      row.getCell(4).font  = { bold: true };
      row.getCell(5).alignment = { wrapText: true, vertical: 'middle' };
    }
    // Status col
    if (statusData[i]) {
      row.getCell(7).value = statusData[i][0];
    }

    // Alternating row shade
    if (i % 2 === 0) {
      [1, 2, 4, 5, 7].forEach(c => {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } };
      });
    }
  }

  // ── Sheet 3: Sample (filled example) ───────────────────────────────────
  const sample = wb.addWorksheet('Sample', { tabColor: { argb: 'FF4ECDC4' } });
  sample.getRow(1).height = 22;

  columns.forEach((col, i) => {
    sample.getColumn(i + 1).width = col.width;
    const cell = sample.getRow(1).getCell(i + 1);
    cell.value = col.header;
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3250' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Sample data rows
  const sampleData = [
    [
      clients[0] ?? 'Client A',
      'AIA Vitality Pro (ILP)',
      'ILP',
      '🛡️ Life Cover, ❤️ Critical Illness (CI), 🌟 Early CI, ⏸️ Waiver of Premium',
      'Active',
      'AIA',
      'A12345678',
      500000,
      6000,
      '01/01/2020',
      '',
      'Spouse',
      'Main ILP with CI rider',
    ],
    [
      clients[0] ?? 'Client A',
      'Prudential PRUshield',
      'Term Life',
      '🏥 Medical',
      'Active',
      'Prudential',
      'P98765432',
      '',
      3600,
      '15/06/2018',
      '',
      '',
      'Medical card — Panel A',
    ],
  ];

  sampleData.forEach((rowData, ri) => {
    const row = sample.getRow(ri + 2);
    row.height = 20;
    rowData.forEach((val, ci) => {
      row.getCell(ci + 1).value = val;
      row.getCell(ci + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFFFDE7' : 'FFFFFFFF' } };
    });
  });

  // ── Save ────────────────────────────────────────────────────────────────
  const outPath = path.resolve('Insurance_Policies_Template.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅ Template saved → ${outPath}`);
  console.log(`   ${clients.length} clients pre-filled · ${clients.length * rowsPerClient} data rows ready`);
}

main().catch(err => { console.error(err); process.exit(1); });
