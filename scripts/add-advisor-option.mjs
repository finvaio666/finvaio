// Manual/recovery tool: add a new "Advisor" select option to all shared Notion DBs.
// As of 2026-06-10, POST /api/settings/users (Settings > Users > Add New User)
// does this automatically via lib/getAdvisorConfig.ts:addAdvisorSelectOption().
// Use this script only to backfill advisors created before that change.
// Usage: node scripts/add-advisor-option.mjs "TAN TIAN YING"
import { Client } from '@notionhq/client';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const advisorName = process.argv[2];
if (!advisorName) {
  console.error('Usage: node scripts/add-advisor-option.mjs "<Advisor Name>"');
  process.exit(1);
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DBS = {
  'Clients DB':   process.env.COMPANY_CLIENTS_DB_ID,
  'Portfolio DB': process.env.COMPANY_PORTFOLIO_DB_ID,
  'Insurance DB': process.env.COMPANY_INSURANCE_DB_ID,
  'Cashflow DB':  process.env.COMPANY_CASHFLOW_DB_ID,
  'Assets DB':    process.env.COMPANY_ASSETS_DB_ID,
  'Tasks DB':     process.env.COMPANY_TASKS_DB_ID,
};

for (const [label, dbId] of Object.entries(DBS)) {
  if (!dbId) { console.log(`- ${label}: no DB ID configured, skipping`); continue; }
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const prop = db.properties['Advisor'];
    if (!prop || prop.type !== 'select') {
      console.log(`- ${label}: no "Advisor" select property, skipping`);
      continue;
    }
    const existing = prop.select.options ?? [];
    if (existing.some(o => o.name === advisorName)) {
      console.log(`- ${label}: "${advisorName}" already present`);
      continue;
    }
    await notion.databases.update({
      database_id: dbId,
      properties: {
        'Advisor': {
          select: { options: [...existing, { name: advisorName }] },
        },
      },
    });
    console.log(`- ${label}: added "${advisorName}"`);
  } catch (e) {
    console.error(`- ${label}: FAILED — ${e instanceof Error ? e.message : String(e)}`);
  }
}
