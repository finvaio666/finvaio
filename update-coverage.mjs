// update-coverage.mjs
// Run: node update-coverage.mjs
// Reads Coverage_Update_Template.xlsx and patches Notion insurance pages with coverage amounts

import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const API_KEY = env.NOTION_API_KEY;
const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('📥 Reading template…');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('./notion-import-templates/Coverage_Update_Template.xlsx');
  const ws = wb.getWorksheet('Coverage Update');

  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 4) return;
    const pageId = String(row.getCell(1).value ?? '').trim();
    if (!pageId || pageId.length < 30) return; // skip footer / blank

    const toNum = val => {
      if (val === null || val === undefined || val === '') return null;
      const n = Number(val);
      return isNaN(n) ? null : (n === 0 ? null : n);   // treat 0 same as blank — skip, don't overwrite
    };
    const toStr = val => String(val ?? '').trim();

    rows.push({
      pageId,
      clientName:   toStr(row.getCell(2).value),
      policyName:   toStr(row.getCell(3).value),
      lifeCover:    toNum(row.getCell(7).value),
      ciCover:      toNum(row.getCell(8).value),
      paCover:      toNum(row.getCell(9).value),
      tpdCover:     toNum(row.getCell(10).value),
      medicalClass: toStr(row.getCell(11).value),
    });
  });

  const toUpdate = rows.filter(r =>
    r.lifeCover !== null || r.ciCover !== null || r.paCover !== null ||
    r.tpdCover !== null || r.medicalClass
  );

  console.log(`📋 ${rows.length} rows found · ${toUpdate.length} have coverage data to update`);
  console.log('');

  let ok = 0, skip = 0, fail = 0;
  for (const row of rows) {
    const props = {};

    if (row.lifeCover    !== null) props['Life Cover (MYR)'] = { number: row.lifeCover };
    if (row.ciCover      !== null) props['CI Cover (MYR)']   = { number: row.ciCover };
    if (row.paCover      !== null) props['PA Cover (MYR)']   = { number: row.paCover };
    if (row.tpdCover     !== null) props['TPD Cover (MYR)']  = { number: row.tpdCover };
    if (row.medicalClass)          props['Medical Class']    = { rich_text: [{ text: { content: row.medicalClass } }] };

    if (Object.keys(props).length === 0) {
      console.log(`   ⊘  ${row.clientName} / ${row.policyName} — no amounts, skipped`);
      skip++;
      continue;
    }

    process.stdout.write(`   → ${row.clientName} / ${row.policyName}… `);
    const res = await fetch(`https://api.notion.com/v1/pages/${row.pageId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ properties: props }),
    });
    const json = await res.json();
    if (json.object === 'error') { console.error(`❌ ${json.message}`); fail++; }
    else { console.log('✅'); ok++; }
    await sleep(350);
  }

  console.log('');
  console.log(`🎉 Done! ${ok} updated · ${skip} skipped · ${fail} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
