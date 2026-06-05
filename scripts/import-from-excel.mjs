/**
 * ARIA Excel → Notion Import Script
 * Reads 1_Clients_Database.xlsx, 3_Portfolio_Holdings.xlsx, Insurance_Policies_Template.xlsx
 * and upserts data into skysiew's Notion databases.
 *
 * Usage:  node scripts/import-from-excel.mjs
 *         node scripts/import-from-excel.mjs --dry-run   (preview only, no writes)
 */

import { Client, isFullPage } from '@notionhq/client';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Load .env.local (Node 20.6+ supports --env-file; this is the fallback) ──
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  });
}

// ── Config ────────────────────────────────────────────────────────────────────
const NOTION_KEY = process.env.NOTION_API_KEY;
if (!NOTION_KEY) {
  console.error('❌ NOTION_API_KEY not set. Add it to .env.local');
  process.exit(1);
}

const DB = {
  clients:   '362de6dd1dfe80e59275e4ce2fc046b2',
  portfolio: '363de6dd1dfe8058b73ec7fa8bb431fb',
  insurance: 'b03d83d0e5a7409684993758865cde7f',
};

const notion = new Client({ auth: NOTION_KEY });

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Convert Excel serial date → ISO string 'YYYY-MM-DD', or '' if invalid */
function excelDate(serial) {
  if (!serial || typeof serial !== 'number') return '';
  const d = new Date((serial - 25569) * 86400 * 1000);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/** Sleep ms */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Log with prefix */
const log = (icon, msg) => console.log(`${icon} ${msg}`);

/**
 * Wrap any Notion API call with automatic retry on 429 rate-limit errors.
 * Reads the retry-after header when present; otherwise uses exponential backoff.
 * Max 5 retries (~30 s total wait time).
 */
async function notionCall(fn) {
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err?.code === 'rate_limited' && attempt < MAX_RETRIES) {
        const retryAfter = Number(err?.headers?.get?.('retry-after') ?? 0);
        const waitMs = retryAfter > 0
          ? retryAfter * 1000 + 200          // honour Notion's retry-after + buffer
          : Math.min(1000 * 2 ** attempt, 16000); // exponential: 1s, 2s, 4s, 8s, 16s
        log('⏳', `Rate limited — waiting ${(waitMs / 1000).toFixed(1)}s before retry (attempt ${attempt + 1}/${MAX_RETRIES})…`);
        await sleep(waitMs);
      } else {
        throw err; // non-429 errors bubble up immediately
      }
    }
  }
}

// ── Read Excel ────────────────────────────────────────────────────────────────
function readSheet(filename, sheetName) {
  const wb = xlsx.readFile(path.join(ROOT, 'notion-import-templates', filename));
  const ws = wb.Sheets[sheetName];
  const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return raw;
}

// ── 1. CLIENTS ────────────────────────────────────────────────────────────────
async function importClients() {
  log('👥', 'Reading clients from Excel…');
  const rows = readSheet('1_Clients_Database.xlsx', 'Clients Data Entry');
  const headers = rows[2]; // row index 2
  const data = rows.slice(4).filter(r =>
    r[0] && !String(r[0]).includes('EXAMPLE') && !String(r[0]).includes('Full legal name')
  );
  log('📊', `Found ${data.length} clients in Excel`);

  // Get existing clients from Notion
  const existing = await notionCall(() => notion.databases.query({ database_id: DB.clients }));
  const existingMap = {};
  existing.results.filter(isFullPage).forEach(p => {
    const name = p.properties['Client Name']?.title?.[0]?.plain_text ?? '';
    if (name) existingMap[name.trim().toUpperCase()] = p.id;
  });
  log('🔍', `Found ${Object.keys(existingMap).length} existing clients in Notion`);

  const clientIdMap = { ...existingMap }; // will be updated after creates

  for (const row of data) {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });

    const name       = String(obj['Client Name'] ?? '').trim();
    if (!name) continue;

    const goals = String(obj['Financial goals'] ?? '').split(',').map(g => g.trim()).filter(Boolean);
    const phone = String(obj['Phone'] ?? '').replace(/[^\d+]/g, '');
    const phoneFormatted = phone ? (phone.startsWith('+') ? phone : '+' + phone) : '';

    const props = {
      'Client Name':          { title:        [{ text: { content: name } }] },
      'Status':               obj['Status']            ? { select: { name: String(obj['Status']) } } : undefined,
      'Client Segment':       obj['Client Segment']    ? { select: { name: String(obj['Client Segment']) } } : undefined,
      'Risk Profile':         obj['Risk Profile']      ? { select: { name: String(obj['Risk Profile']) } } : undefined,
      'AUM (MYR)':            obj['AUM (MYR)'] !== ''  ? { number: Number(obj['AUM (MYR)']) } : undefined,
      'Monthly income (MYR)': obj['Monthly income (MYR)'] !== '' ? { number: Number(obj['Monthly income (MYR)']) } : undefined,
      'Date of Birth':        excelDate(obj['Date of Birth']) ? { date: { start: excelDate(obj['Date of Birth']) } } : undefined,
      'Onboarding date':      excelDate(obj['Onboarding date']) ? { date: { start: excelDate(obj['Onboarding date']) } } : undefined,
      'Last review date':     excelDate(obj['Last review date']) ? { date: { start: excelDate(obj['Last review date']) } } : undefined,
      'Next review date':     excelDate(obj['Next review date']) ? { date: { start: excelDate(obj['Next review date']) } } : undefined,
      'Financial goals':      goals.length > 0 ? { multi_select: goals.map(g => ({ name: g })) } : undefined,
      'Phone':                phoneFormatted  ? { phone_number: phoneFormatted } : undefined,
      'Email':                obj['Email']    ? { email: String(obj['Email']).toLowerCase().trim() } : undefined,
    };

    // Remove undefined
    Object.keys(props).forEach(k => props[k] === undefined && delete props[k]);

    const key = name.toUpperCase();
    if (existingMap[key]) {
      log('✏️ ', `Update client: ${name}`);
      if (!DRY_RUN) {
        await notionCall(() => notion.pages.update({ page_id: existingMap[key], properties: props }));
        await sleep(400);
      }
    } else {
      log('➕', `Create client: ${name}`);
      if (!DRY_RUN) {
        const created = await notionCall(() => notion.pages.create({ parent: { database_id: DB.clients }, properties: props }));
        clientIdMap[key] = created.id;
        await sleep(400);
      }
    }
  }

  log('✅', 'Clients done\n');
  return clientIdMap;
}

// ── 2. PORTFOLIO ──────────────────────────────────────────────────────────────
async function importPortfolio(clientIdMap) {
  log('📈', 'Reading portfolio from Excel…');
  const rows = readSheet('3_Portfolio_Holdings.xlsx', 'Portfolio Data Entry');
  const headers = rows[2];
  const data = rows.slice(3).filter(r =>
    r[0] && !String(r[0]).includes('Must match')
  );
  log('📊', `Found ${data.length} portfolio rows in Excel`);

  // Get existing holdings
  const existing = await notionCall(() => notion.databases.query({ database_id: DB.portfolio, page_size: 100 }));
  const existingMap = {};
  existing.results.filter(isFullPage).forEach(p => {
    const holdingName = p.properties['Holding Name']?.title?.[0]?.plain_text ?? '';
    const clientRel   = p.properties['👥 Clients']?.relation?.[0]?.id ?? '';
    const key = `${clientRel}||${holdingName.trim().toUpperCase()}`;
    existingMap[key] = p.id;
  });
  log('🔍', `Found ${Object.keys(existingMap).length} existing holdings in Notion`);

  let created = 0, updated = 0, skipped = 0;

  for (const row of data) {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });

    const clientName  = String(obj['Client Name'] ?? '').trim();
    const holdingName = String(obj['Holding Name'] ?? '').trim();
    if (!clientName || !holdingName) { skipped++; continue; }

    const clientPageId = clientIdMap[clientName.toUpperCase()];
    if (!clientPageId) {
      log('⚠️ ', `Client not found in Notion: "${clientName}" — skipping "${holdingName}"`);
      skipped++;
      continue;
    }

    const valueOrig    = obj['Value (original currency)'] !== '' ? Number(obj['Value (original currency)']) : null;
    const purchaseOrig = obj['Purchase price (original currency)'] !== '' ? Number(obj['Purchase price (original currency)']) : null;
    const fxRate       = obj['FX Rate to MYR'] !== '' ? Number(obj['FX Rate to MYR']) : null;
    const valueMYR     = obj['Value (MYR)'] !== '' ? Number(obj['Value (MYR)']) : null;
    const purchaseMYR  = obj['Purchase price (MYR)'] !== '' ? Number(obj['Purchase price (MYR)']) : null;
    const maturityDate = excelDate(obj['Maturity date']);
    const currency     = String(obj['Currency'] ?? 'MYR').trim() || 'MYR';

    const props = {
      'Holding Name':                       { title: [{ text: { content: holdingName } }] },
      '👥 Clients':                          { relation: [{ id: clientPageId }] },
      'Asset class':                         obj['Asset class']  ? { select: { name: String(obj['Asset class']) } } : undefined,
      'Institution':                         obj['Institution']  ? { rich_text: [{ text: { content: String(obj['Institution']) } }] } : undefined,
      'Status':                              obj['Status']       ? { select: { name: String(obj['Status']) } } : undefined,
      'Currency':                            { select: { name: currency } },
      'Value (Original Currency)':           valueOrig    != null ? { number: valueOrig }    : undefined,
      'Purchase price (original currency)':  purchaseOrig != null ? { number: purchaseOrig } : undefined,
      'FX Rate to MYR':                      fxRate       != null ? { number: fxRate }       : undefined,
      'Value (MYR)':                         valueMYR     != null ? { number: valueMYR }     : undefined,
      'Purchase price (MYR)':                purchaseMYR  != null ? { number: purchaseMYR }  : undefined,
      'Maturity date':                       maturityDate  ? { date: { start: maturityDate } } : undefined,
    };
    Object.keys(props).forEach(k => props[k] === undefined && delete props[k]);

    const key = `${clientPageId}||${holdingName.toUpperCase()}`;
    if (existingMap[key]) {
      log('✏️ ', `Update holding: ${clientName} — ${holdingName}`);
      updated++;
      if (!DRY_RUN) { await notionCall(() => notion.pages.update({ page_id: existingMap[key], properties: props })); await sleep(400); }
    } else {
      log('➕', `Create holding: ${clientName} — ${holdingName}`);
      created++;
      if (!DRY_RUN) { await notionCall(() => notion.pages.create({ parent: { database_id: DB.portfolio }, properties: props })); await sleep(400); }
    }
  }

  log('✅', `Portfolio done — created: ${created}, updated: ${updated}, skipped: ${skipped}\n`);
}

// ── 3. INSURANCE ─────────────────────────────────────────────────────────────
async function importInsurance(clientIdMap) {
  log('🛡️ ', 'Reading insurance from Excel…');
  const rows = readSheet('Insurance_Policies_Template.xlsx', 'Insurance Policies');
  const headers = rows[2];
  const data = rows.slice(3).filter(r => r[0] && String(r[0]).trim());
  log('📊', `Found ${data.length} insurance rows in Excel`);

  // Get existing policies
  const existing = await notionCall(() => notion.databases.query({ database_id: DB.insurance, page_size: 100 }));
  const existingMap = {};
  existing.results.filter(isFullPage).forEach(p => {
    const policyName   = p.properties['Policy Name']?.title?.[0]?.plain_text ?? '';
    const policyNumber = p.properties['Policy Number']?.rich_text?.[0]?.plain_text ?? '';
    const clientRel    = p.properties['Clients']?.relation?.[0]?.id ?? '';
    const key = policyNumber
      ? `${clientRel}||${policyNumber.trim()}`
      : `${clientRel}||${policyName.trim().toUpperCase()}`;
    existingMap[key] = p.id;
  });
  log('🔍', `Found ${Object.keys(existingMap).length} existing policies in Notion`);

  let created = 0, updated = 0, skipped = 0;

  for (const row of data) {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });

    // The Policy Owner column is the client this policy links to. Accept the new
    // 'Policy Owner *' header, fall back to the old 'Client Name *' for old files.
    const clientName   = String(obj['Policy Owner *'] ?? obj['Client Name *'] ?? '').trim();
    const policyName   = String(obj['Policy Name *'] ?? '').trim();
    const policyNumber = String(obj['Policy Number'] ?? '').trim();
    if (!clientName || !policyName) { skipped++; continue; }

    const clientPageId = clientIdMap[clientName.toUpperCase()];
    if (!clientPageId) {
      log('⚠️ ', `Client not found: "${clientName}" — skipping "${policyName}"`);
      skipped++;
      continue;
    }

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
    const medCard     = String(obj['Medical Card (R&B / Annual Limit)'] ?? obj['Medical Card'] ?? '').trim();
    // Policy Owner = the linked client (from the Policy Owner * / Client Name * column)
    const policyOwner = clientName || String(obj['Policy Owner'] ?? '').trim();
    const lifeAssured = String(obj['Life Assured']   ?? '').trim();
    const beneficiary = String(obj['Beneficiary']    ?? '').trim();

    const props = {
      'Policy Name':         { title: [{ text: { content: policyName } }] },
      'Clients':             { relation: [{ id: clientPageId }] },
      'Insurance Type':      obj['Insurance Type *'] ? { select: { name: String(obj['Insurance Type *']) } } : undefined,
      'Benefits':            benefits.length > 0    ? { multi_select: benefits.map(b => ({ name: b })) } : undefined,
      'Status':              obj['Status *']         ? { select: { name: String(obj['Status *']) } } : undefined,
      'Insurer':             obj['Insurer']          ? { rich_text: [{ text: { content: String(obj['Insurer']) } }] } : undefined,
      'Policy Number':       policyNumber            ? { rich_text: [{ text: { content: policyNumber } }] } : undefined,
      'Sum Assured (MYR)':   sumAssured   != null    ? { number: sumAssured }   : undefined,
      'Life Cover (MYR)':    lifeCover    != null    ? { number: lifeCover }    : undefined,
      'CI Cover (MYR)':      ciCover      != null    ? { number: ciCover }      : undefined,
      'PA Cover (MYR)':      paCover      != null    ? { number: paCover }      : undefined,
      'TPD Cover (MYR)':     tpdCover     != null    ? { number: tpdCover }     : undefined,
      'Medical Class':       medClass                ? { rich_text: [{ text: { content: medClass } }] }    : undefined,
      'Medical Card':        medCard                 ? { rich_text: [{ text: { content: medCard } }] }     : undefined,
      'Policy Owner':        policyOwner             ? { rich_text: [{ text: { content: policyOwner } }] } : undefined,
      'Life Assured':        lifeAssured             ? { rich_text: [{ text: { content: lifeAssured } }] } : undefined,
      'Annual Premium (MYR)': annPremium  != null    ? { number: annPremium }   : undefined,
      'Commencement Date':   commDate     ? { date: { start: commDate } } : undefined,
      'Maturity Date':       matDate      ? { date: { start: matDate } }  : undefined,
      'Beneficiary':         beneficiary             ? { rich_text: [{ text: { content: beneficiary } }] } : undefined,
      'Notes':               obj['Notes']            ? { rich_text: [{ text: { content: String(obj['Notes']) } }] } : undefined,
    };
    Object.keys(props).forEach(k => props[k] === undefined && delete props[k]);

    const key = policyNumber
      ? `${clientPageId}||${policyNumber}`
      : `${clientPageId}||${policyName.toUpperCase()}`;

    if (existingMap[key]) {
      log('✏️ ', `Update policy: ${clientName} — ${policyName}`);
      updated++;
      if (!DRY_RUN) { await notionCall(() => notion.pages.update({ page_id: existingMap[key], properties: props })); await sleep(400); }
    } else {
      log('➕', `Create policy: ${clientName} — ${policyName}`);
      created++;
      if (!DRY_RUN) { await notionCall(() => notion.pages.create({ parent: { database_id: DB.insurance }, properties: props })); await sleep(400); }
    }
  }

  log('✅', `Insurance done — created: ${created}, updated: ${updated}, skipped: ${skipped}\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n🚀 ARIA Excel → Notion Import${DRY_RUN ? ' [DRY RUN — no writes]' : ''}`);
console.log('━'.repeat(50));

const clientIdMap = await importClients();
await importPortfolio(clientIdMap);
await importInsurance(clientIdMap);

console.log('━'.repeat(50));
console.log('🎉 Import complete!');
if (DRY_RUN) console.log('   (Dry run — nothing was written to Notion)');
