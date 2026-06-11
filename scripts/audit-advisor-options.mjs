// Read-only audit: for every advisor in the Users DB, check whether their
// name exists as an "Advisor" select option in each shared company DB.
// Usage: node scripts/audit-advisor-options.mjs
import { Client, isFullPage } from '@notionhq/client';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DBS = {
  'Clients DB':   process.env.COMPANY_CLIENTS_DB_ID,
  'Portfolio DB': process.env.COMPANY_PORTFOLIO_DB_ID,
  'Insurance DB': process.env.COMPANY_INSURANCE_DB_ID,
  'Cashflow DB':  process.env.COMPANY_CASHFLOW_DB_ID,
  'Assets DB':    process.env.COMPANY_ASSETS_DB_ID,
  'Tasks DB':     process.env.COMPANY_TASKS_DB_ID,
};

// 1. List all advisor names from the Users DB
const usersRes = await notion.databases.query({ database_id: process.env.NOTION_USERS_DB_ID, page_size: 100 });
const advisors = usersRes.results.filter(isFullPage).map(page => {
  const p = page.properties;
  const name = p['Name']?.title?.[0]?.plain_text ?? '(unnamed)';
  const role = p['Role']?.select?.name ?? 'Advisor';
  const active = p['Active']?.checkbox ?? true;
  return { name, role, active };
});

console.log('Advisors found in Users DB:');
for (const a of advisors) console.log(`  - ${a.name} (${a.role}${a.active ? '' : ', inactive'})`);
console.log('');

// 2. For each shared DB, fetch the Advisor select options
for (const [label, dbId] of Object.entries(DBS)) {
  if (!dbId) { console.log(`${label}: no DB ID configured, skipping\n`); continue; }
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const prop = db.properties['Advisor'];
    if (!prop || prop.type !== 'select') {
      console.log(`${label}: no "Advisor" select property, skipping\n`);
      continue;
    }
    const existing = new Set((prop.select.options ?? []).map(o => o.name));
    const missing = advisors.filter(a => !existing.has(a.name));
    if (missing.length === 0) {
      console.log(`${label}: OK — all ${advisors.length} advisors present`);
    } else {
      console.log(`${label}: MISSING — ${missing.map(m => m.name).join(', ')}`);
    }
  } catch (e) {
    console.error(`${label}: FAILED — ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log('');
}
