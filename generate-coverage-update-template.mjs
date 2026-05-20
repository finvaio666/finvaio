// generate-coverage-update-template.mjs
// Generates: Coverage_Update_Template.xlsx
// Lists all existing policies so assistant can fill in per-benefit coverage amounts

import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const API_KEY      = env.NOTION_API_KEY;
const INSURANCE_DB = env.NOTION_INSURANCE_DB_ID.replace(/^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/, '$1-$2-$3-$4-$5');
const CLIENTS_DB   = '362de6dd-1dfe-80e5-9275-e4ce2fc046b2';
const headers      = { 'Authorization': `Bearer ${API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

async function fetchAll(dbId, sorts) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST', headers, body: JSON.stringify({ page_size: 100, sorts }),
  });
  return (await res.json()).results ?? [];
}

async function main() {
  // Fetch clients
  const clientPages = await fetchAll(CLIENTS_DB, [{ property: 'Client Name', direction: 'ascending' }]);
  const clientMap = {};
  clientPages.forEach(p => {
    const name = p.properties['Client Name']?.title?.[0]?.plain_text ?? '';
    if (name) clientMap[p.id] = name;
  });

  // Fetch insurance policies
  const polPages = await fetchAll(INSURANCE_DB, [{ property: 'Policy Name', direction: 'ascending' }]);
  const policies = polPages.map(page => {
    const p = page.properties;
    const clientRelIds = p['Clients']?.relation?.map(r => r.id) ?? [];
    const clientName = clientRelIds.map(id => clientMap[id]).filter(Boolean)[0] ?? '';
    const benefits = p['Benefits']?.multi_select?.map(b => b.name) ?? [];
    return {
      pageId:      page.id,
      clientName,
      policyName:  p['Policy Name']?.title?.[0]?.plain_text ?? '',
      insurer:     p['Insurer']?.rich_text?.[0]?.plain_text ?? '',
      benefits:    benefits.join(', '),
      sumAssured:  p['Sum Assured (MYR)']?.number ?? '',
      // existing coverage fields (may already be filled)
      lifeCover:   p['Life Cover (MYR)']?.number ?? '',
      ciCover:     p['CI Cover (MYR)']?.number ?? '',
      paCover:     p['PA Cover (MYR)']?.number ?? '',
      tpdCover:    p['TPD Cover (MYR)']?.number ?? '',
      medicalClass: p['Medical Class']?.rich_text?.[0]?.plain_text ?? '',
    };
  });

  // Sort by client name then policy name
  policies.sort((a, b) => a.clientName.localeCompare(b.clientName) || a.policyName.localeCompare(b.policyName));

  console.log(`Fetched ${policies.length} policies`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Coverage Update', { views: [{ state: 'frozen', ySplit: 3 }] });

  // Title
  ws.mergeCells('A1:K1');
  const t = ws.getCell('A1');
  t.value = 'Bill Morrisons — Coverage Amounts Update';
  t.font = { bold: true, size: 14, color: { argb: 'FF1A1A2E' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0EE' } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:K2');
  const s = ws.getCell('A2');
  s.value = 'Fill in YELLOW columns only · Leave blank if benefit not in this policy · Numbers only, no commas';
  s.font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0EE' } };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 16;

  const cols = [
    { header: 'Page ID',             key: 'pageId',       width: 38, editable: false },
    { header: 'Client Name',          key: 'clientName',   width: 24, editable: false },
    { header: 'Policy Name',          key: 'policyName',   width: 28, editable: false },
    { header: 'Insurer',              key: 'insurer',      width: 14, editable: false },
    { header: 'Benefits Covered',     key: 'benefits',     width: 50, editable: false },
    { header: 'Total Sum Assured',    key: 'sumAssured',   width: 18, editable: false },
    { header: '🛡️ Life Cover (MYR)', key: 'lifeCover',   width: 20, editable: true  },
    { header: '❤️ CI Cover (MYR)',   key: 'ciCover',     width: 20, editable: true  },
    { header: '🦺 PA Cover (MYR)',   key: 'paCover',     width: 20, editable: true  },
    { header: '♿ TPD Cover (MYR)',   key: 'tpdCover',    width: 20, editable: true  },
    { header: '🏥 Medical Class',     key: 'medicalClass', width: 20, editable: true  },
  ];

  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    const cell = ws.getRow(3).getCell(i + 1);
    cell.value = c.header;
    cell.font  = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.editable ? 'FF2D3250' : 'FF6B7280' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: c.editable ? 'FFFF6B35' : 'FF9CA3AF' } } };
  });
  ws.getRow(3).height = 36;

  const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
  const greyFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  let lastClient = '';
  policies.forEach((pol, ri) => {
    const rowNum = ri + 4;
    const row = ws.getRow(rowNum);
    row.height = 22;

    const isNewClient = pol.clientName !== lastClient;
    lastClient = pol.clientName;

    const values = [pol.pageId, pol.clientName, pol.policyName, pol.insurer, pol.benefits, pol.sumAssured, pol.lifeCover, pol.ciCover, pol.paCover, pol.tpdCover, pol.medicalClass];
    values.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = val === '' ? null : val;
      cell.fill  = cols[ci].editable ? yellowFill : greyFill;
      cell.font  = cols[ci].editable ? {} : { color: { argb: 'FF6B7280' } };
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });

    // Bold client name on first row for this client
    if (isNewClient) {
      row.getCell(2).font = { bold: true };
    }

    // Lock Page ID column from editing
    row.getCell(1).font = { size: 8, color: { argb: 'FFCCCCCC' } };
  });

  // Reference notes column (after data)
  ws.getCell(`A${policies.length + 5}`).value = '* Page ID is used by the import script to update the correct Notion record. Do not modify.';
  ws.getCell(`A${policies.length + 5}`).font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };

  const outPath = path.resolve('notion-import-templates/Coverage_Update_Template.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ Saved → ${outPath}`);
  console.log(`   ${policies.length} policies listed`);
}

main().catch(e => { console.error(e); process.exit(1); });
