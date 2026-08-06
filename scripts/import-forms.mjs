/**
 * scripts/import-forms.mjs
 * Bulk-import a provider's forms into the Forms Library (storage + Supabase
 * metadata), reusing the app's own storage dispatcher + repo so the result is
 * identical to an admin upload.
 *
 * Usage:
 *   npx tsx scripts/import-forms.mjs "Allianz" "C:\\Users\\skysi\\allianz-forms"
 *
 * The folder must contain an index.json (as produced by the allianz-forms-download
 * skill): [{ description, category, fileName, savedPath, bytes, status }, ...].
 * Skips forms already present for the provider (idempotent by provider+name).
 */

import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const { PDFDocument } = await import('pdf-lib');
const { uploadPdf } = await import('../lib/storage.ts');
const sbForms = await import('../lib/repos/formsLibrary.ts');
const { getSupabase } = await import('../lib/supabase.ts');

const PROVIDER = process.argv[2] || 'Allianz';
const FOLDER   = process.argv[3] || 'C:\\Users\\skysi\\allianz-forms';

// ── name → FINVA category ───────────────────────────────────────────────────
const CAT_RULES = [
  [/claim/i,                                            'Claim'],
  [/nominat|nominee|beneficiar/i,                       'Beneficiary Change'],
  [/surrender/i,                                        'Surrender'],
  [/\bswitch|fund\s*switch|redirect/i,                  'Fund Switch'],
  [/reinstat/i,                                         'Reinstatement'],
  [/address|change of particular|contact detail|change of detail|change of information/i, 'Address Change'],
  [/proposal|application|new business|enrol|proposer/i, 'New Application'],
  [/premium|payment|deferment|deferral|top.?up|withdrawal|partial|loan/i, 'Premium Payment Change'],
];
function inferCategory(name) {
  for (const [re, c] of CAT_RULES) if (re.test(name)) return c;
  return 'Other';
}

const STOP = new Set(['form','forms','the','and','for','of','to','a','an','or','use','staff',
  'customer','individual','version','allianz','malaysia','berhad','new','pdf','with','request',
  'department','services','life','sales','v1','v2','v3']);
function nameKeywords(name) {
  const words = (name.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => w.length >= 4 && !STOP.has(w));
  return [...new Set(words)].slice(0, 8);
}
function cleanName(fileName) {
  return fileName.replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  const idxPath = path.join(FOLDER, 'index.json');
  const arr = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const entries = arr.filter(e => e.status === 'ok' && e.savedPath && fs.existsSync(e.savedPath));
  console.log(`Importing ${entries.length} ${PROVIDER} forms from ${FOLDER}\n`);

  // Existing names for this provider → skip duplicates (idempotent).
  const existing = await sbForms.listForms();
  const seen = new Set(existing.filter(f => f.provider === PROVIDER).map(f => f.name.toLowerCase()));

  const report = { fillable: 0, scanned: 0, skipped: 0, failed: 0, byCat: {} };
  let i = 0;
  for (const e of entries) {
    i++;
    const name = cleanName(e.fileName || e.description);
    if (seen.has(name.toLowerCase())) { report.skipped++; continue; }
    try {
      const buffer = fs.readFileSync(e.savedPath);

      // Detect fillable AcroForm fields.
      let formType = 'Scanned PDF';
      let fieldMapping = { type: 'scanned', fields: [] };
      try {
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const fields = doc.getForm().getFields().map(f => f.getName());
        if (fields.length > 0) {
          formType = 'Fillable PDF';
          fieldMapping = { type: 'fillable', fields: fields.map(pdfField => ({ pdfField, dataKey: '__manual' })) };
        }
      } catch { /* unreadable form dict → treat as scanned */ }

      const category = inferCategory(name);
      const tags = [...new Set([e.category, ...nameKeywords(name)])].filter(Boolean);

      const pdfUrl = await uploadPdf(PROVIDER, name, buffer);
      await sbForms.createForm({ name, provider: PROVIDER, category, formType, pdfUrl, fieldMapping, tags, active: true });

      report[formType === 'Fillable PDF' ? 'fillable' : 'scanned']++;
      report.byCat[category] = (report.byCat[category] || 0) + 1;
      if (i % 20 === 0 || i === entries.length) console.log(`  [${i}/${entries.length}] ${formType === 'Fillable PDF' ? 'F' : 'S'}  ${name.slice(0, 60)}`);
    } catch (err) {
      report.failed++;
      console.log(`  [${i}] FAILED: ${name} — ${err.message}`);
    }
  }

  console.log('\n── Import summary ─────────────────────────');
  console.log('Fillable:', report.fillable, '| Scanned:', report.scanned, '| Skipped(dup):', report.skipped, '| Failed:', report.failed);
  console.log('By category:', JSON.stringify(report.byCat, null, 2));

  // Verify count in Supabase.
  const sb = getSupabase();
  const { count } = await sb.from('forms_library').select('id', { count: 'exact', head: true }).is('deleted_at', null);
  console.log('forms_library total rows now:', count);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
