/**
 * scripts/overlay.mjs — tooling to build/verify/save coordinate overlay mappings.
 *
 *   node overlay.mjs dump    "<file>" <page>              # list text items + coords
 *   node overlay.mjs preview "<file>" "<mapping.json>"    # render mapped pages w/ SAMPLE data
 *   node overlay.mjs save    "<provider>" "<formName>" "<mapping.json>"   # persist to Supabase
 *
 * mapping.json = [{ dataKey, label?, page, x, y, size? }, ...]
 */
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const OUT = "C:\\Users\\skysi\\AppData\\Local\\Temp\\claude\\C--Users-skysi\\b0f07c6a-d77f-4b56-a23f-950240af83d3\\scratchpad";
const SAMPLE = {
  'client.name': 'Tan Ah Kow', 'client.icNumber': '880101-14-5566', 'client.dob': '01/01/1988',
  'client.address': '12 Jalan Bahagia, 50000 KL', 'client.phone': '012-3456789', 'client.email': 'tan@example.com',
  'policy.policyNumber': 'P-10293847', 'policy.provider': 'Allianz', 'policy.planName': 'Life Plan',
  'policy.sumAssured': '100000', 'account.accountNumber': 'ACC-778812', 'account.fundName': 'Growth Fund',
  'advisor.name': 'Sky Siew', '__manual': '(manual)',
};

const cmd = process.argv[2];

async function dump(file, page) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false }).promise;
  const pg = await doc.getPage(parseInt(page, 10));
  const vp = pg.getViewport({ scale: 1 });
  console.log(`page ${page} size (pts): ${Math.round(vp.width)} x ${Math.round(vp.height)}`);
  const tc = await pg.getTextContent();
  for (const it of tc.items) {
    const s = (it.str || '').trim();
    if (s) console.log(`(${Math.round(it.transform[4])}, ${Math.round(it.transform[5])}) w${Math.round(it.width)}  "${s}"`);
  }
}

async function fillOverlay(file, mapping, useSample) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const out = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
  const font = await out.embedFont(StandardFonts.Helvetica);
  const pages = out.getPages();
  for (const f of mapping) {
    const val = useSample ? (SAMPLE[f.dataKey] ?? f.dataKey) : '';
    const pg = pages[(f.page ?? 1) - 1];
    if (pg && val) pg.drawText(String(val), { x: f.x, y: f.y, size: f.size ?? 10, font, color: rgb(0.85, 0.1, 0.1) });
  }
  return await out.save();
}

async function preview(file, mapJson) {
  const mapping = JSON.parse(fs.readFileSync(mapJson, 'utf8'));
  const bytes = await fillOverlay(file, mapping, true);
  const tmp = path.join(OUT, '_ov_tmp.pdf');
  fs.writeFileSync(tmp, bytes);
  const { pdf } = await import('pdf-to-img');
  const pagesToShow = [...new Set(mapping.map(m => m.page ?? 1))].sort((a, b) => a - b);
  const doc = await pdf(tmp, { scale: 2 });
  let i = 0;
  for await (const img of doc) {
    i++;
    if (pagesToShow.includes(i)) {
      const p = path.join(OUT, `preview_p${i}.png`);
      fs.writeFileSync(p, img);
      console.log('preview', p);
    }
  }
}

async function save(provider, formName, mapJson) {
  const mapping = JSON.parse(fs.readFileSync(mapJson, 'utf8'));
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await sb.from('forms_library').select('id,name')
    .eq('provider', provider).is('deleted_at', null);
  if (error) throw new Error(error.message);
  const row = data.find(r => r.name === formName) || data.find(r => r.name.toLowerCase() === formName.toLowerCase());
  if (!row) { console.log('NO MATCH for', formName, '\ncandidates:', data.filter(r=>r.name.toLowerCase().includes(formName.toLowerCase().slice(0,8))).map(r=>r.name)); process.exit(2); }
  const fieldMapping = { type: 'overlay', fields: mapping };
  const { error: e2 } = await sb.from('forms_library')
    .update({ field_mapping: JSON.stringify(fieldMapping), last_updated: new Date().toISOString().slice(0,10) })
    .eq('id', row.id);
  if (e2) throw new Error(e2.message);
  console.log('SAVED overlay mapping to:', row.name, `(${mapping.length} fields)`);
}

if (cmd === 'dump') await dump(process.argv[3], process.argv[4] || '1');
else if (cmd === 'preview') await preview(process.argv[3], process.argv[4]);
else if (cmd === 'save') await save(process.argv[3], process.argv[4], process.argv[5]);
else console.log('unknown command');
process.exit(0);
