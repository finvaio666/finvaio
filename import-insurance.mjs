// import-insurance.mjs
// Run: node import-insurance.mjs
// Imports Insurance_Policies_Template.xlsx → Notion Insurance DB

import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

// ── Read .env.local ────────────────────────────────────────────────────────
const envPath = path.resolve('.env.local');
const envVars = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) envVars[k.trim()] = v.join('=').trim();
});

const API_KEY      = envVars['NOTION_API_KEY'];
const CLIENTS_DB   = '362de6dd-1dfe-80e5-9275-e4ce2fc046b2';
const INSURANCE_DB = envVars['NOTION_INSURANCE_DB_ID']
  // normalise: add dashes if missing
  .replace(/^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/, '$1-$2-$3-$4-$5');

const headers = {
  'Authorization':  `Bearer ${API_KEY}`,
  'Notion-Version': '2022-06-28',
  'Content-Type':   'application/json',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Helpers ────────────────────────────────────────────────────────────────
function isoToDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return null;
}

function toStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// ── Fetch Clients → name→id map ────────────────────────────────────────────
async function fetchClientMap() {
  const res = await fetch(`https://api.notion.com/v1/databases/${CLIENTS_DB}/query`, {
    method: 'POST', headers,
    body: JSON.stringify({ page_size: 100 }),
  });
  const json = await res.json();
  const map = {};
  json.results?.forEach(page => {
    const name = page.properties['Client Name']?.title?.[0]?.plain_text ?? '';
    if (name) map[name.toUpperCase()] = page.id;
  });
  return map;
}

// ── Create one Insurance page ──────────────────────────────────────────────
async function createPolicy(row, clientMap) {
  const {
    clientName, policyName, insuranceType, benefits,
    status, insurer, policyNumber, sumAssured, annualPremium,
    commencementDate, maturityDate, beneficiary, notes,
  } = row;

  // Resolve client relation
  const clientId = clientMap[clientName.toUpperCase()];
  if (!clientId) {
    console.warn(`  ⚠️  Client not found: "${clientName}" — skipping`);
    return false;
  }

  // Parse benefits (comma-separated string → array, trim each)
  const benefitsArr = benefits
    ? benefits.split(',').map(b => b.trim()).filter(Boolean)
    : [];

  const properties = {
    'Policy Name': {
      title: [{ text: { content: policyName } }],
    },
    'Clients': {
      relation: [{ id: clientId }],
    },
    'Insurance Type': {
      select: { name: insuranceType },
    },
    'Benefits': {
      multi_select: benefitsArr.map(name => ({ name })),
    },
    'Status': {
      select: { name: status || 'Active' },
    },
  };

  if (insurer) {
    properties['Insurer'] = { rich_text: [{ text: { content: insurer } }] };
  }
  if (policyNumber) {
    properties['Policy Number'] = { rich_text: [{ text: { content: toStr(policyNumber) } }] };
  }
  if (sumAssured) {
    properties['Sum Assured (MYR)'] = { number: Number(sumAssured) };
  }
  if (annualPremium) {
    properties['Annual Premium (MYR)'] = { number: Number(annualPremium) };
  }
  const cd = isoToDate(commencementDate);
  if (cd) properties['Commencement Date'] = { date: { start: cd } };

  const md = isoToDate(maturityDate);
  if (md) properties['Maturity Date'] = { date: { start: md } };

  if (beneficiary && beneficiary !== 'NIL') {
    properties['Beneficiary'] = { rich_text: [{ text: { content: beneficiary } }] };
  }
  if (notes) {
    properties['Notes'] = { rich_text: [{ text: { content: notes } }] };
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers,
    body: JSON.stringify({ parent: { database_id: INSURANCE_DB }, properties }),
  });
  const json = await res.json();
  if (json.object === 'error') {
    console.error(`  ❌ Error creating "${policyName}":`, json.message);
    return false;
  }
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('📥 Reading Excel…');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('./notion-import-templates/Insurance_Policies_Template.xlsx');
  const ws = wb.getWorksheet('Insurance Policies');

  // Collect data rows (skip rows 1-3: title, subtitle, header)
  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 4) return;
    const clientName = toStr(row.getCell(1).value);
    const policyName = toStr(row.getCell(2).value);
    if (!clientName || !policyName) return; // skip empty rows

    rows.push({
      clientName,
      policyName,
      insuranceType:    toStr(row.getCell(3).value),
      benefits:         toStr(row.getCell(4).value),
      status:           toStr(row.getCell(5).value),
      insurer:          toStr(row.getCell(6).value),
      policyNumber:     row.getCell(7).value,
      sumAssured:       row.getCell(8).value,
      annualPremium:    row.getCell(9).value,
      commencementDate: row.getCell(10).value,
      maturityDate:     row.getCell(11).value,
      beneficiary:      toStr(row.getCell(12).value),
      notes:            toStr(row.getCell(13).value),
    });
  });

  console.log(`📋 Found ${rows.length} policies to import`);
  console.log('');

  console.log('🔍 Fetching client map from Notion…');
  const clientMap = await fetchClientMap();
  console.log(`   ${Object.keys(clientMap).length} clients loaded`);
  console.log('');

  let ok = 0, fail = 0;
  for (const row of rows) {
    process.stdout.write(`   → ${row.clientName} / ${row.policyName}… `);
    const success = await createPolicy(row, clientMap);
    if (success) { ok++; console.log('✅'); }
    else fail++;
    await sleep(400); // respect Notion rate limit
  }

  console.log('');
  console.log(`🎉 Done! ${ok} imported, ${fail} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
