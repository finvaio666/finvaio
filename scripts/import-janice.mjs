/**
 * One-time import: Janice Quek Khang Wen
 * Reads directly from Desktop Excel files and upserts into skysiew's Notion DBs.
 * Usage: node scripts/import-janice.mjs
 *        node scripts/import-janice.mjs --dry-run
 */

import { Client, isFullPage } from '@notionhq/client';
import xlsx from 'xlsx';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Config (skysiew) ─────────────────────────────────────────────────────────
const NOTION_KEY = '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';
const DB = {
  clients:   '362de6dd1dfe80e59275e4ce2fc046b2',
  portfolio: '363de6dd1dfe8058b73ec7fa8bb431fb',
  insurance: 'b03d83d0e5a7409684993758865cde7f',
};

const notion = new Client({ auth: NOTION_KEY });
const sleep  = ms => new Promise(r => setTimeout(r, ms));
const log    = (icon, msg) => console.log(`${icon} ${msg}`);

/** Convert Excel serial date → ISO string 'YYYY-MM-DD' */
function excelDate(serial) {
  if (!serial || typeof serial !== 'number') return '';
  const d = new Date((serial - 25569) * 86400 * 1000);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

// ── File paths ────────────────────────────────────────────────────────────────
const BASE = 'C:/Users/skysi/OneDrive/Desktop';
const FILES = {
  clients:   `${BASE}/Janice Quek Khang Wen - Clients Database.xlsx`,
  portfolio: `${BASE}/Janice Quek Khang Wen - Portfolio Holdings.xlsx`,
  insurance: `${BASE}/Janice Quek Khang Wen - Insurance Policies Template.xlsx`,
};

// ── 1. UPSERT CLIENT ──────────────────────────────────────────────────────────
async function upsertClient() {
  log('👤', 'Reading client data…');
  const wb   = xlsx.readFile(FILES.clients);
  const ws   = wb.Sheets['Clients Data Entry'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const headers = rows[2];
  // Find Janice's row (skip example rows)
  const dataRows = rows.slice(4).filter(r =>
    r[0] && !String(r[0]).includes('EXAMPLE') && !String(r[0]).includes('Full legal name')
  );

  if (dataRows.length === 0) {
    log('⚠️ ', 'No client rows found — check sheet structure'); return null;
  }

  const row = dataRows[0]; // first (only) data row
  const obj = {};
  headers.forEach((h, i) => { if (h) obj[h] = row[i]; });

  const name  = String(obj['Client Name'] ?? '').trim();
  const phone = String(obj['Phone'] ?? '').replace(/[^\d+]/g, '');
  const phoneFormatted = phone ? (phone.startsWith('+') ? phone : '+' + phone) : '';
  const dob      = excelDate(obj['Date of Birth']);
  const onboard  = excelDate(obj['Onboarding date']);

  log('📋', `Client: ${name} | DOB: ${dob} | Onboarding: ${onboard}`);

  // Check existing
  const existing = await notion.databases.query({ database_id: DB.clients });
  const existingMap = {};
  existing.results.filter(isFullPage).forEach(p => {
    const n = p.properties['Client Name']?.title?.[0]?.plain_text ?? '';
    if (n) existingMap[n.trim().toUpperCase()] = p.id;
  });

  const props = {
    'Client Name':     { title: [{ text: { content: name } }] },
    'Status':          obj['Status'] ? { select: { name: String(obj['Status']) } } : undefined,
    'Date of Birth':   dob   ? { date: { start: dob } }    : undefined,
    'Onboarding date': onboard ? { date: { start: onboard } } : undefined,
    'Phone':           phoneFormatted ? { phone_number: phoneFormatted } : undefined,
    'Email':           obj['Email'] ? { email: String(obj['Email']).toLowerCase().trim() } : undefined,
  };
  Object.keys(props).forEach(k => props[k] === undefined && delete props[k]);

  const key = name.toUpperCase();
  let clientPageId;

  if (existingMap[key]) {
    log('✏️ ', `Update existing client: ${name}`);
    clientPageId = existingMap[key];
    if (!DRY_RUN) {
      await notion.pages.update({ page_id: clientPageId, properties: props });
      await sleep(300);
    }
  } else {
    log('➕', `Create new client: ${name}`);
    if (!DRY_RUN) {
      const created = await notion.pages.create({ parent: { database_id: DB.clients }, properties: props });
      clientPageId = created.id;
      await sleep(300);
    } else {
      clientPageId = 'DRY_RUN_PLACEHOLDER';
    }
  }

  log('✅', `Client done — page ID: ${clientPageId}\n`);
  return { name, clientPageId };
}

// ── 2. UPSERT PORTFOLIO ────────────────────────────────────────────────────────
async function upsertPortfolio(clientName, clientPageId) {
  log('📈', 'Reading portfolio data…');
  const wb   = xlsx.readFile(FILES.portfolio);
  const ws   = wb.Sheets['Portfolio Data Entry'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const headers  = rows[2];
  const dataRows = rows.slice(3).filter(r =>
    r[0] && String(r[0]).trim().toUpperCase() === clientName.toUpperCase()
  );
  log('📊', `Found ${dataRows.length} portfolio rows for ${clientName}`);

  // Get existing holdings for this client
  const existing = await notion.databases.query({ database_id: DB.portfolio, page_size: 100 });
  const existingMap = {};
  existing.results.filter(isFullPage).forEach(p => {
    const holdingName = p.properties['Holding Name']?.title?.[0]?.plain_text ?? '';
    const clientRel   = p.properties['👥 Clients']?.relation?.[0]?.id ?? '';
    if (clientRel === clientPageId) {
      existingMap[holdingName.trim().toUpperCase()] = p.id;
    }
  });

  let created = 0, updated = 0;

  for (const row of dataRows) {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });

    const holdingName = String(obj['Holding Name'] ?? '').trim();
    if (!holdingName || holdingName.includes('EXAMPLE')) continue;

    const valueOrig    = obj['Value (original currency)'] !== '' ? Number(obj['Value (original currency)']) : null;
    const purchaseOrig = obj['Purchase price (original currency)'] !== '' ? Number(obj['Purchase price (original currency)']) : null;
    const fxRate       = obj['FX Rate to MYR'] !== '' && obj['FX Rate to MYR'] !== 0 ? Number(obj['FX Rate to MYR']) : null;
    const valueMYR     = obj['Value (MYR)'] !== '' && obj['Value (MYR)'] !== 0 ? Number(obj['Value (MYR)']) : null;
    const purchaseMYR  = obj['Purchase price (MYR)'] !== '' && obj['Purchase price (MYR)'] !== 0 ? Number(obj['Purchase price (MYR)']) : null;
    const currency     = String(obj['Currency'] ?? 'MYR').trim() || 'MYR';
    const maturityDate = excelDate(obj['Maturity date']);

    log('📌', `  ${holdingName} | ${obj['Asset class']} | ${obj['Institution']} | Value: ${valueOrig} ${currency}`);

    const props = {
      'Holding Name': { title: [{ text: { content: holdingName } }] },
      '👥 Clients':   { relation: [{ id: clientPageId }] },
      'Currency':     { select: { name: currency } },
    };
    if (obj['Asset class'])  props['Asset class']  = { select: { name: String(obj['Asset class']) } };
    if (obj['Institution'])  props['Institution']  = { rich_text: [{ text: { content: String(obj['Institution']) } }] };
    if (obj['Status'])       props['Status']       = { select: { name: String(obj['Status']) } };
    if (valueOrig    != null) props['Value (Original Currency)']          = { number: valueOrig };
    if (purchaseOrig != null) props['Purchase price (original currency)'] = { number: purchaseOrig };
    if (fxRate       != null) props['FX Rate to MYR']                     = { number: fxRate };
    if (valueMYR     != null) props['Value (MYR)']                        = { number: valueMYR };
    if (purchaseMYR  != null) props['Purchase price (MYR)']               = { number: purchaseMYR };
    if (maturityDate)         props['Maturity date']                       = { date: { start: maturityDate } };

    const key = holdingName.toUpperCase();
    if (existingMap[key]) {
      log('✏️ ', `  Update holding: ${holdingName}`);
      updated++;
      if (!DRY_RUN) { await notion.pages.update({ page_id: existingMap[key], properties: props }); await sleep(300); }
    } else {
      log('➕', `  Create holding: ${holdingName}`);
      created++;
      if (!DRY_RUN) { await notion.pages.create({ parent: { database_id: DB.portfolio }, properties: props }); await sleep(300); }
    }
  }

  log('✅', `Portfolio done — created: ${created}, updated: ${updated}\n`);
}

// ── 3. UPSERT INSURANCE ────────────────────────────────────────────────────────
async function upsertInsurance(clientName, clientPageId) {
  log('🛡️ ', 'Reading insurance data…');
  const wb   = xlsx.readFile(FILES.insurance);
  const ws   = wb.Sheets['Insurance Policies'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const headers  = rows[2];
  const dataRows = rows.slice(3).filter(r =>
    r[0] && String(r[0]).trim().toUpperCase() === clientName.toUpperCase()
  );
  log('📊', `Found ${dataRows.length} insurance rows for ${clientName}`);

  // Get existing policies for this client
  const existing = await notion.databases.query({ database_id: DB.insurance, page_size: 100 });
  const existingMap = {};
  existing.results.filter(isFullPage).forEach(p => {
    const policyName   = p.properties['Policy Name']?.title?.[0]?.plain_text ?? '';
    const policyNumber = p.properties['Policy Number']?.rich_text?.[0]?.plain_text ?? '';
    const clientRel    = p.properties['Clients']?.relation?.[0]?.id ?? '';
    if (clientRel === clientPageId) {
      const key = policyNumber
        ? policyNumber.trim()
        : policyName.trim().toUpperCase();
      existingMap[key] = p.id;
    }
  });

  let created = 0, updated = 0;

  for (const row of dataRows) {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });

    const policyName   = String(obj['Policy Name *'] ?? '').trim();
    const policyNumber = String(obj['Policy Number'] ?? '').trim();
    if (!policyName) continue;

    // Keep emoji in benefits (they're benefit names in Notion)
    const benefits = String(obj['Benefits *'] ?? '')
      .split(',').map(b => b.trim()).filter(Boolean);

    const commDate    = excelDate(obj['Commencement Date']);
    const matDate     = excelDate(obj['Maturity Date']);
    const sumAssured  = obj['Sum Assured (MYR)']    !== '' ? Number(obj['Sum Assured (MYR)'])    : null;
    const annPremium  = obj['Annual Premium (MYR)'] !== '' ? Number(obj['Annual Premium (MYR)']) : null;
    const lifeCover   = obj['Life Cover (MYR)']  !== '' && obj['Life Cover (MYR)']  !== 0 ? Number(obj['Life Cover (MYR)'])  : null;
    const ciCover     = obj['CI Cover (MYR)']    !== '' && obj['CI Cover (MYR)']    !== 0 ? Number(obj['CI Cover (MYR)'])    : null;
    const paCover     = obj['PA Cover (MYR)']    !== '' && obj['PA Cover (MYR)']    !== 0 ? Number(obj['PA Cover (MYR)'])    : null;
    const tpdCover    = obj['TPD Cover (MYR)']   !== '' && obj['TPD Cover (MYR)']   !== 0 ? Number(obj['TPD Cover (MYR)'])   : null;
    const medClass    = String(obj['Medical Class']  ?? '').trim();
    const policyOwner = String(obj['Policy Owner']   ?? '').trim();
    const lifeAssured = String(obj['Life Assured']   ?? '').trim();
    const beneficiary = String(obj['Beneficiary']    ?? '').trim();

    log('📋', `  ${policyName} | ${obj['Insurance Type *']} | ${obj['Insurer']} | Policy#: ${policyNumber}`);
    log('   ', `  Benefits: ${benefits.join(', ')}`);
    log('   ', `  Comm: ${commDate} | Mat: ${matDate} | SA: ${sumAssured} | Premium: ${annPremium}`);

    const props = {
      'Policy Name': { title: [{ text: { content: policyName } }] },
      'Clients':     { relation: [{ id: clientPageId }] },
    };
    if (obj['Insurance Type *']) props['Insurance Type']       = { select: { name: String(obj['Insurance Type *']) } };
    if (benefits.length > 0)     props['Benefits']             = { multi_select: benefits.map(b => ({ name: b })) };
    if (obj['Status *'])         props['Status']               = { select: { name: String(obj['Status *']) } };
    if (obj['Insurer'])          props['Insurer']              = { rich_text: [{ text: { content: String(obj['Insurer']) } }] };
    if (policyNumber)            props['Policy Number']        = { rich_text: [{ text: { content: policyNumber } }] };
    if (sumAssured  != null)     props['Sum Assured (MYR)']    = { number: sumAssured };
    if (lifeCover   != null)     props['Life Cover (MYR)']     = { number: lifeCover };
    if (ciCover     != null)     props['CI Cover (MYR)']       = { number: ciCover };
    if (paCover     != null)     props['PA Cover (MYR)']       = { number: paCover };
    if (tpdCover    != null)     props['TPD Cover (MYR)']      = { number: tpdCover };
    if (medClass)                props['Medical Class']        = { rich_text: [{ text: { content: medClass } }] };
    if (policyOwner)             props['Policy Owner']         = { rich_text: [{ text: { content: policyOwner } }] };
    if (lifeAssured)             props['Life Assured']         = { rich_text: [{ text: { content: lifeAssured } }] };
    if (annPremium  != null)     props['Annual Premium (MYR)'] = { number: annPremium };
    if (commDate)                props['Commencement Date']    = { date: { start: commDate } };
    if (matDate)                 props['Maturity Date']        = { date: { start: matDate } };
    if (beneficiary && beneficiary.toUpperCase() !== 'NIL') props['Beneficiary'] = { rich_text: [{ text: { content: beneficiary } }] };
    if (obj['Notes']) props['Notes'] = { rich_text: [{ text: { content: String(obj['Notes']) } }] };

    const key = policyNumber || policyName.toUpperCase();
    if (existingMap[key]) {
      log('✏️ ', `  Update policy: ${policyName}`);
      updated++;
      if (!DRY_RUN) { await notion.pages.update({ page_id: existingMap[key], properties: props }); await sleep(300); }
    } else {
      log('➕', `  Create policy: ${policyName}`);
      created++;
      if (!DRY_RUN) { await notion.pages.create({ parent: { database_id: DB.insurance }, properties: props }); await sleep(300); }
    }
  }

  log('✅', `Insurance done — created: ${created}, updated: ${updated}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n🚀 ARIA Import — Janice Quek Khang Wen${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log('━'.repeat(50));

const clientResult = await upsertClient();
if (!clientResult) { console.log('❌ Client import failed — stopping.'); process.exit(1); }

const { name, clientPageId } = clientResult;
await upsertPortfolio(name, clientPageId);
await upsertInsurance(name, clientPageId);

console.log('━'.repeat(50));
console.log(`🎉 Import complete!${DRY_RUN ? ' (dry run — nothing written)' : ''}`);
