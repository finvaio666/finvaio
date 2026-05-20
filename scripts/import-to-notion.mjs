/**
 * import-to-notion.mjs
 * Reads Clients + Portfolio Excel files and imports into Notion via API.
 *
 * Usage:
 *   node scripts/import-to-notion.mjs clients
 *   node scripts/import-to-notion.mjs portfolio
 *   node scripts/import-to-notion.mjs all
 */

import ExcelJS from 'exceljs';
import { Client } from '@notionhq/client';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Manually parse .env.local (avoids needing dotenv package)
const envPath = path.join(__dirname, '../.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim();
});

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB = {
  clients:   '362de6dd-1dfe-80e5-9275-e4ce2fc046b2',
  portfolio: '363de6dd-1dfe-8058-b73e-c7fa8bb431fb',
};

const TEMPLATE_DIR = path.join(__dirname, '../notion-import-templates');

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const d = val.toISOString().split('T')[0];
    return d === '1899-12-30' ? null : d;  // ExcelJS epoch quirk
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Clients Import ──────────────────────────────────────────────────────────

async function importClients() {
  console.log('\n📂 Reading Clients Excel…');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TEMPLATE_DIR, '1_Clients_Database.xlsx'));

  const sheet = wb.getWorksheet('Clients Data Entry');
  if (!sheet) throw new Error('Sheet "Clients Data Entry" not found');

  const rows = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum < 5) return;                           // skip title/header rows (data starts row 5)
    const name = String(row.getCell(1).value ?? '').trim();
    if (!name || name.startsWith('⬅') || name.startsWith('✏') || name.startsWith('Full')) return;
    rows.push({
      name,
      status:      String(row.getCell(2).value  ?? '').trim(),
      segment:     String(row.getCell(3).value  ?? '').trim(),
      risk:        String(row.getCell(4).value  ?? '').trim(),
      aum:         Number(row.getCell(5).value  ?? 0),
      income:      Number(row.getCell(6).value  ?? 0),
      dob:         parseDate(row.getCell(7).value),
      onboarding:  parseDate(row.getCell(8).value),
      lastReview:  parseDate(row.getCell(9).value),
      nextReview:  parseDate(row.getCell(10).value),
      goals:       String(row.getCell(11).value ?? '').trim(),
      phone:       String(row.getCell(12).value ?? '').trim(),
      email:       String(row.getCell(13).value ?? '').trim(),
    });
  });

  console.log(`  Found ${rows.length} client row(s) to import.`);
  if (rows.length === 0) return;

  let ok = 0, fail = 0;
  for (const c of rows) {
    try {
      const props = {
        'Client Name': { title: [{ text: { content: c.name } }] },
      };
      if (c.status)  props['Status']           = { select: { name: c.status } };
      if (c.segment) props['Client Segment']   = { select: { name: c.segment } };
      if (c.risk)    props['Risk Profile']      = { select: { name: c.risk } };
      if (c.aum)     props['AUM (MYR)']         = { number: c.aum };
      if (c.income)  props['Monthly income (MYR)'] = { number: c.income };
      if (c.dob)     props['Date of Birth']     = { date: { start: c.dob } };
      if (c.onboarding) props['Onboarding date'] = { date: { start: c.onboarding } };
      if (c.lastReview) props['Last review date'] = { date: { start: c.lastReview } };
      if (c.nextReview) props['Next review date'] = { date: { start: c.nextReview } };
      if (c.phone)   props['Phone']             = { phone_number: c.phone };
      if (c.email)   props['Email']             = { email: c.email };
      if (c.goals) {
        const goalList = c.goals.split(',').map(g => g.trim()).filter(Boolean);
        if (goalList.length) props['Financial goals'] = { multi_select: goalList.map(name => ({ name })) };
      }

      await notion.pages.create({ parent: { database_id: DB.clients }, properties: props });
      console.log(`  ✅ ${c.name}`);
      ok++;
      await sleep(350); // Notion API rate limit ~3 req/s
    } catch (e) {
      console.error(`  ❌ ${c.name} — ${e.message}`);
      fail++;
    }
  }
  console.log(`\n  Clients done: ${ok} imported, ${fail} failed.`);
}

// ─── Portfolio Import ────────────────────────────────────────────────────────

async function importPortfolio() {
  console.log('\n📂 Fetching client page IDs from Notion…');
  // Build a map of client name (uppercase) → Notion page ID for the relation field
  const clientMap = {};
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DB.clients,
      start_cursor: cursor,
    });
    for (const page of res.results) {
      const nameArr = page.properties['Client Name']?.title;
      if (nameArr?.length) {
        const name = nameArr[0].plain_text.trim().toUpperCase();
        clientMap[name] = page.id;
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  console.log(`  Found ${Object.keys(clientMap).length} clients:`, Object.keys(clientMap).join(', '));

  console.log('\n📂 Reading Portfolio Excel…');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TEMPLATE_DIR, '3_Portfolio_Holdings.xlsx'));

  const sheet = wb.getWorksheet('Portfolio Data Entry');
  if (!sheet) throw new Error('Sheet "Portfolio Data Entry" not found');

  const rows = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum < 5) return;
    const holdingName = String(row.getCell(2).value ?? '').trim();
    if (!holdingName || holdingName.startsWith('⬅') || holdingName.startsWith('✏') || holdingName.startsWith('Full')) return;
    const clientName = String(row.getCell(1).value ?? '').trim();
    if (!clientName || clientName.startsWith('Must match')) return;

    // Col 10 & 11 may be formula objects — resolve them
    const rawValueMYR    = row.getCell(10).value;
    const rawPurchaseMYR = row.getCell(11).value;
    const valueMYR    = typeof rawValueMYR    === 'object' && rawValueMYR?.result    != null ? Number(rawValueMYR.result)    : Number(rawValueMYR    ?? 0);
    const purchaseMYR = typeof rawPurchaseMYR === 'object' && rawPurchaseMYR?.result != null ? Number(rawPurchaseMYR.result) : Number(rawPurchaseMYR ?? 0);

    rows.push({
      clientName: clientName.toUpperCase(),
      holdingName,
      assetClass:   String(row.getCell(3).value  ?? '').trim(),
      institution:  String(row.getCell(4).value  ?? '').trim(),
      status:       String(row.getCell(5).value  ?? '').trim(),
      currency:     String(row.getCell(6).value  ?? 'MYR').trim(),
      valueOrig:    Number(row.getCell(7).value  ?? 0),
      purchaseOrig: Number(row.getCell(8).value  ?? 0),
      fxRate:       Number(row.getCell(9).value  ?? 1),
      valueMYR,
      purchaseMYR,
      maturity:     parseDate(row.getCell(12).value),
    });
  });

  console.log(`  Found ${rows.length} portfolio row(s) to import.`);
  if (rows.length === 0) return;

  let ok = 0, fail = 0;
  for (const h of rows) {
    try {
      const props = {
        'Holding Name': { title: [{ text: { content: h.holdingName } }] },
      };

      // Relation to Clients database
      const clientPageId = clientMap[h.clientName];
      if (clientPageId) {
        props['👥 Clients'] = { relation: [{ id: clientPageId }] };
      } else {
        console.warn(`  ⚠️  No Notion page found for client "${h.clientName}" — relation skipped`);
      }

      if (h.assetClass)    props['Asset class']                        = { select: { name: h.assetClass } };
      if (h.institution)   props['Institution']                        = { rich_text: [{ text: { content: h.institution } }] };
      if (h.status)        props['Status']                             = { select: { name: h.status } };
      if (h.currency)      props['Currency']                           = { select: { name: h.currency } };
      if (h.valueOrig)     props['Value (Original Currency)']          = { number: h.valueOrig };
      if (h.purchaseOrig)  props['Purchase price (original currency)'] = { number: h.purchaseOrig };
      if (h.fxRate)        props['FX Rate to MYR']                     = { number: h.fxRate };
      if (h.valueMYR)      props['Value (MYR)']                        = { number: h.valueMYR };
      if (h.purchaseMYR)   props['Purchase price (MYR)']               = { number: h.purchaseMYR };
      if (h.maturity)      props['Maturity date']                      = { date: { start: h.maturity } };

      await notion.pages.create({ parent: { database_id: DB.portfolio }, properties: props });
      console.log(`  ✅ ${h.clientName} — ${h.holdingName}`);
      ok++;
      await sleep(350);
    } catch (e) {
      console.error(`  ❌ ${h.clientName} / ${h.holdingName} — ${e.message}`);
      fail++;
    }
  }
  console.log(`\n  Portfolio done: ${ok} imported, ${fail} failed.`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const target = process.argv[2] ?? 'all';

if (target === 'clients' || target === 'all') await importClients();
if (target === 'portfolio' || target === 'all') await importPortfolio();

console.log('\n🎉 Import complete.');
