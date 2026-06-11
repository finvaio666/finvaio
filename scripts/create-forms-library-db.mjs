// One-off: add the Form Finder schema to the existing "Forms Library" Notion DB
// (already created manually by Sky, shared with the ARIA integration).
// Usage: node scripts/create-forms-library-db.mjs
import { Client } from '@notionhq/client';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const FORMS_DB_ID = '37cde6dd1dfe804baafee9e6be3f38d0';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

await notion.databases.update({
  database_id: FORMS_DB_ID,
  title: [{ type: 'text', text: { content: 'Forms Library' } }],
  properties: {
    'Provider':      { select: { options: [] } },
    'Category':      {
      select: {
        options: [
          { name: 'New Application' },
          { name: 'Fund Switch' },
          { name: 'Beneficiary Change' },
          { name: 'Address Change' },
          { name: 'Claim' },
          { name: 'Premium Payment Change' },
          { name: 'Surrender' },
          { name: 'Other' },
        ],
      },
    },
    'Tags':          { multi_select: { options: [] } },
    'Form Type':     {
      select: {
        options: [
          { name: 'Fillable PDF' },
          { name: 'Scanned PDF' },
        ],
      },
    },
    'PDF URL':       { rich_text: {} },
    'Field Mapping': { rich_text: {} },
    'Active':        { checkbox: {} },
    'Last Updated':  { date: {} },
  },
});

console.log('Updated Forms Library DB schema.');
console.log('\nAdd this to .env.local:');
console.log(`COMPANY_FORMS_DB_ID=${FORMS_DB_ID}`);
