// update-units.mjs
// Reads notion-import-templates/Units_Update_Template.xlsx
// and PATCHes the Units field for every row that has a numeric value in column H.
//
// Usage:  node update-units.mjs
// Pre-req: fill the yellow "★ Units Held" column first, then run this.

import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const API_KEY = env.NOTION_API_KEY;
const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const filePath = path.resolve('notion-import-templates/Units_Update_Template.xlsx');

async function patchUnits(pageId, units) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      properties: {
        'Units': { number: units },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH failed for ${pageId}: ${res.status} ${body}`);
  }
  return res.json();
}

async function main() {
  if (!API_KEY) { console.error('NOTION_API_KEY not set'); process.exit(1); }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet('Units Update');
  if (!ws) { console.error('Sheet "Units Update" not found'); process.exit(1); }

  let updated = 0, skipped = 0, errors = 0;

  // Data starts at row 4 (rows 1–3 are title / subtitle / header)
  for (let r = 4; r <= ws.rowCount; r++) {
    const row   = ws.getRow(r);
    const pageId = row.getCell(1).value?.toString().trim();
    const units  = row.getCell(8).value;   // column H = "★ Units Held"

    if (!pageId || pageId === 'Page ID') continue;  // skip blank / header
    if (units === null || units === undefined || units === '') {
      skipped++;
      continue;
    }
    const numUnits = typeof units === 'number' ? units : parseFloat(String(units));
    if (isNaN(numUnits)) { skipped++; continue; }

    const fundName   = row.getCell(3).value?.toString() ?? '';
    const clientName = row.getCell(2).value?.toString() ?? '';
    try {
      await patchUnits(pageId, numUnits);
      console.log(`  ✅ ${clientName} / ${fundName} → ${numUnits.toLocaleString()} units`);
      updated++;
    } catch (e) {
      console.error(`  ❌ ${clientName} / ${fundName}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Updated: ${updated}  Skipped (blank): ${skipped}  Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
