/**
 * scripts/reclassify-forms.mjs
 * Re-derive the `category` for a provider's already-imported forms using a
 * richer keyword ruleset with a department-based fallback (department = tags[0],
 * as set by import-forms.mjs). Reduces the "Other" bucket for menu-filtering.
 *
 * Usage: npx tsx scripts/reclassify-forms.mjs "Allianz"
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const PROVIDER = process.argv[2] || 'Allianz';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const NAME_RULES = [
  [/claim|reimbursement|healing progress|discharge|admission|hospital|medical report|bill|receipt/i, 'Claim'],
  [/nominat|nominee|beneficiar|trustee|hibah/i,                    'Nomination'],
  [/surrender/i,                                                    'Surrender'],
  [/switch|fund\b|redirect|unit/i,                                  'Fund Switch'],
  [/reinstat/i,                                                     'Reinstatement'],
  [/address|change of particular|contact|change of detail|change of information|correspondence|e-?invoice|update/i, 'Details Change'],
  [/premium|payment|deferment|deferral|top.?up|withdrawal|partial|loan|mode of pay/i, 'Premium / Payment'],
  [/questionnaire|declaration|covid|asthma|diabet|obstetric|gynaec|cardiac|hepatitis|essential|\bci-|health|medical|nicotine|drug|hiv/i, 'Medical / Underwriting'],
  [/proposal|application|new business|enrol|proposer|referral|order form|setup|sign.?up/i, 'New Application'],
];
const DEPT_FALLBACK = {
  'Underwriting Department':                 'Medical / Underwriting',
  'Allianz Care Services':                   'Claim',
  'Policy Management Individual Department':  'Policy Servicing',
  'Life Sales':                              'New Application',
  'Employee Benefits':                       'Employee Benefits',
};

function categorize(name, dept) {
  for (const [re, c] of NAME_RULES) if (re.test(name)) return c;
  return DEPT_FALLBACK[dept] || 'Other';
}

const { data, error } = await sb.from('forms_library')
  .select('id,name,category,tags').eq('provider', PROVIDER).is('deleted_at', null);
if (error) { console.error(error.message); process.exit(1); }

const counts = {};
let changed = 0;
for (const r of data) {
  const dept = (r.tags && r.tags[0]) || '';
  const cat = categorize(r.name, dept);
  counts[cat] = (counts[cat] || 0) + 1;
  if (cat !== r.category) {
    const { error: e } = await sb.from('forms_library').update({ category: cat }).eq('id', r.id);
    if (e) console.log('update failed', r.name, e.message); else changed++;
  }
}
console.log(`Reclassified ${PROVIDER}: ${changed} rows changed of ${data.length}`);
console.log('New category distribution:', JSON.stringify(counts, null, 2));
