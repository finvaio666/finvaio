// generate-units-template.mjs
// Generates: notion-import-templates/Units_Update_Template.xlsx
// Lists all active portfolio holdings so FA can fill in units held

import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const API_KEY      = env.NOTION_API_KEY;
const PORTFOLIO_DB = '363de6dd-1dfe-8058-b73e-c7fa8bb431fb';
const CLIENTS_DB   = '362de6dd-1dfe-80e5-9275-e4ce2fc046b2';
const headers      = { 'Authorization': `Bearer ${API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

async function fetchAll(dbId, sorts) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST', headers, body: JSON.stringify({ page_size: 100, sorts }),
  });
  return (await res.json()).results ?? [];
}

async function main() {
  const clientPages = await fetchAll(CLIENTS_DB, [{ property: 'Client Name', direction: 'ascending' }]);
  const clientMap = {};
  clientPages.forEach(p => {
    const name = p.properties['Client Name']?.title?.[0]?.plain_text ?? '';
    if (name) clientMap[p.id] = name;
  });

  const holdingPages = await fetchAll(PORTFOLIO_DB, [{ property: 'Holding Name', direction: 'ascending' }]);
  const holdings = holdingPages
    .filter(p => {
      const status = p.properties['Status']?.select?.name ?? '';
      return !status.toLowerCase().includes('redeem');
    })
    .map(page => {
      const p = page.properties;
      const clientRelIds = p['👥 Clients']?.relation?.map(r => r.id) ?? [];
      const clientName = clientRelIds.map(id => clientMap[id]).filter(Boolean)[0] ?? '';
      const valueOrig = p['Value (Original Currency)']?.number ?? 0;
      const units = p['Units']?.number ?? null;
      const nav = (units && units > 0) ? (valueOrig / units).toFixed(4) : '';
      return {
        pageId:    page.id,
        clientName,
        fundName:  p['Holding Name']?.title?.[0]?.plain_text ?? '',
        assetClass: p['Asset class']?.select?.name ?? '',
        institution: p['Institution']?.rich_text?.[0]?.plain_text ?? '',
        currency:  p['Currency']?.select?.name ?? 'MYR',
        valueOrig,
        units:     units ?? '',
        nav,
      };
    });

  // Sort by fund name then client
  holdings.sort((a, b) => a.fundName.localeCompare(b.fundName) || a.clientName.localeCompare(b.clientName));

  console.log(`Found ${holdings.length} active holdings`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Units Update', { views: [{ state: 'frozen', ySplit: 3 }] });

  // Title
  ws.mergeCells('A1:I1');
  const t = ws.getCell('A1');
  t.value = 'Bill Morrisons — Portfolio Units Update';
  t.font  = { bold: true, size: 14, color: { argb: 'FF1A1A2E' } };
  t.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0EE' } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:I2');
  const s = ws.getCell('A2');
  s.value = 'Fill YELLOW column only · Units = number of units/shares held by this client for this fund';
  s.font  = { italic: true, size: 9, color: { argb: 'FF666666' } };
  s.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0EE' } };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 16;

  const cols = [
    { header: 'Page ID',              key: 'pageId',      width: 38, editable: false },
    { header: 'Client Name',           key: 'clientName',  width: 24, editable: false },
    { header: 'Fund / Holding Name',   key: 'fundName',    width: 30, editable: false },
    { header: 'Asset Class',           key: 'assetClass',  width: 14, editable: false },
    { header: 'Institution',           key: 'institution', width: 20, editable: false },
    { header: 'Currency',              key: 'currency',    width: 10, editable: false },
    { header: 'Current Value (Orig)',  key: 'valueOrig',   width: 20, editable: false },
    { header: '★ Units Held',          key: 'units',       width: 18, editable: true  },
    { header: 'NAV / Price (calc)',    key: 'nav',         width: 18, editable: false },
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
  ws.getRow(3).height = 30;

  const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
  const greyFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  let lastFund = '';
  holdings.forEach((h, ri) => {
    const rowNum = ri + 4;
    const row = ws.getRow(rowNum);
    row.height = 20;

    const isNewFund = h.fundName !== lastFund;
    lastFund = h.fundName;

    const values = [h.pageId, h.clientName, h.fundName, h.assetClass, h.institution, h.currency, h.valueOrig, h.units, h.nav];
    values.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = val === '' || val === null ? null : val;
      cell.fill  = cols[ci].editable ? yellowFill : greyFill;
      cell.font  = cols[ci].editable ? { bold: true } : { color: { argb: 'FF6B7280' }, size: ci === 0 ? 7 : 11 };
      cell.alignment = { vertical: 'middle' };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });

    // Bold fund name on first row for each new fund
    if (isNewFund) row.getCell(3).font = { bold: true, color: { argb: 'FF2D3250' } };
  });

  const outPath = path.resolve('notion-import-templates/Units_Update_Template.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ Saved → ${outPath}`);
  console.log(`   ${holdings.length} holdings listed`);
}

main().catch(e => { console.error(e); process.exit(1); });
