/**
 * Scans a folder tree of structured-note term sheets (PDFs), matches each one
 * to its ISIN, and reports which are NOT yet in the live book — a review
 * queue, not an auto-inserter.
 *
 * Why detect-only: term sheets vary a lot by issuer (Nomura, Marex, UBS,
 * CSI, Natixis all use different observation-date column names and table
 * layouts — see the "Observation vs Payment date" audit from 2026-08-29,
 * which found 5 real notes with the wrong date stored from a misread
 * column). A best-effort parse can get a field wrong in a way that looks
 * completely plausible and silently corrupts a KO/KI record. So this script
 * only ever gets you to "here's what's missing and here's my best-effort
 * read of its terms" — a human (or Claude, reading the actual PDF) still
 * confirms before anything is written to Supabase/Notion.
 *
 * Requires Python 3 with `pypdf` installed (`pip install pypdf`) — the same
 * tool used throughout this session's manual term-sheet reads, chosen over
 * pdfjs-dist here because reconstructing table layout from pdfjs's
 * position-only text items is exactly the kind of thing that silently
 * misreads a column, which is what this script exists to avoid.
 *
 * Usage:
 *   node scripts/scan-term-sheets.mjs "C:\path\to\term sheets folder"
 *   node scripts/scan-term-sheets.mjs "C:\path\to\folder" --json out.json
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  });
}

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1); }
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const folder = args[0];
const jsonOutIdx = process.argv.indexOf('--json');
const jsonOut = jsonOutIdx >= 0 ? process.argv[jsonOutIdx + 1] : null;
// --force ISIN1,ISIN2: parse these even though they're already in the book —
// for spot-checking the parser against a known-good ISIN, not normal use.
const forceIdx = process.argv.indexOf('--force');
const forceIsins = forceIdx >= 0 ? new Set(process.argv[forceIdx + 1].split(',')) : new Set();

if (!folder) {
  console.error('Usage: node scripts/scan-term-sheets.mjs "<folder to scan>" [--json out.json]');
  process.exit(1);
}
if (!fs.existsSync(folder)) { console.error(`Folder not found: ${folder}`); process.exit(1); }

// ── 1. Walk the folder for PDFs ───────────────────────────────────────────────
function walkPdfs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPdfs(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) out.push(full);
  }
  return out;
}

// ── 2. ISIN from the filename (every term sheet in this book has one) ────────
// ISIN = 2 letters + 10 alphanumerics. Filenames put it in the "XS..." form
// consistently across every issuer seen this session, so this alone is
// reliable — no PDF text extraction needed just to find the ISIN.
function isinFromFilename(filePath) {
  // Not \b — underscore counts as a word character in regex, so it doesn't mark
  // a boundary in "_XS3395171005_", which is exactly how most of these filenames
  // wrap the ISIN. Match against non-alphanumeric context instead (start/end of
  // string counts too), so "_", "(", ")" all work as separators.
  const m = path.basename(filePath).match(/(?:^|[^A-Za-z0-9])([A-Z]{2}[A-Z0-9]{9}\d)(?:$|[^A-Za-z0-9])/);
  return m ? m[1] : null;
}

// A folder path like ".../TracyChia/LIM_WEI_YI/..." or ".../Siew Voon Fei/..."
// is a strong hint for which client this belongs to, but only a hint —
// confirm against the actual client list before inserting.
function likelyClientHint(filePath, scanRoot) {
  const rel = path.relative(scanRoot, filePath);
  const segments = rel.split(path.sep).slice(0, -1); // drop the filename
  return segments.filter(Boolean).join(' / ') || '(root of scanned folder)';
}

// ── 3. Extract full text via Python + pypdf ───────────────────────────────────
function extractText(filePath) {
  const escaped = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const py = `
import pypdf, sys
r = pypdf.PdfReader('${escaped}')
print('\\n'.join((p.extract_text() or '') for p in r.pages))
`;
  try {
    // Windows' default console codepage (cp1252) can't encode characters some
    // of these term sheets actually contain (curly quotes, em-dashes) —
    // without this, python's own stdout write crashes before we get anything.
    return execFileSync('python3', ['-c', py], {
      encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
  } catch (e) {
    return null;
  }
}

// ── 4. Template family detection + best-effort field extraction ──────────────
// Each family is identified by a marker phrase unique to that issuer's
// template (verified against every term sheet processed manually this
// session). Extraction is best-effort per field — a field that isn't found
// is reported as missing, never guessed.

const MONTH_NUM = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function toIso(dateStr) {
  if (!dateStr) return null;
  // "19-Oct-2026" / "19 October 2026" / "19 Oct 2026" → parsed by hand against
  // an explicit month table and built with Date.UTC. `new Date("19 Aug 2026")`
  // parses as LOCAL midnight — in Malaysia (UTC+8) that's the previous day in
  // UTC, so .toISOString() silently shifted every date back by one (caught by
  // testing against XS3425822221's already-verified terms: 19-Aug came out as
  // 18-Aug). Never construct a date this way again in this file.
  const m = dateStr.match(/(\d{1,2})[\s-]+(\w{3})\w*[\s-]+(\d{4})/);
  if (!m) return null;
  const month = MONTH_NUM[m[2].toLowerCase().slice(0, 3)];
  if (month === undefined) return null;
  return new Date(Date.UTC(+m[3], month, +m[1])).toISOString().slice(0, 10);
}

function detectFamily(text) {
  if (text.includes('Knock-Out Determination Day')) return 'nomura';
  if (text.includes('Early Redemption Observation Date')) return 'marex';
  if (text.includes('Periodic Coupon Determination Date')) return 'ubs_vmran';
  if (text.includes('Knock-out Observation Date')) return 'csi';
  if (text.includes('Automatic Early Redemption Valuation Date')) return 'natixis';
  return 'unknown';
}

function parseNomura(text) {
  const notes = [];
  const trade = text.match(/Trade Date\s+(\d{1,2}-\w{3}-\d{4})/)?.[1];
  const issue = text.match(/Issue Date\s+(\d{1,2}-\w{3}-\d{4})/)?.[1];
  const couponPeriod = text.match(/Fixed Coupon Rate\s+([\d.]+)%/)?.[1];
  const table = text.match(/t Knock-Out Determination[\s\S]{0,40}?\n([\s\S]{0,2000}?)REDEMPTION TERMS/)?.[1] ?? '';
  const rows = [...table.matchAll(/(\d+)\s+(\d{1,2}-\w{3}-\d{4})(?:\s+([\d.]+)%)?\s+(\d{1,2}-\w{3}-\d{4})/g)];
  const schedule = rows.map(r => ({ n: +r[1], determinationDate: toIso(r[2]), triggerPct: r[3] ? +r[3] : 100, paymentDate: toIso(r[4]) }));
  const basketBlock = text.match(/Share Basket comprises Shares in the table below:\s*\n([\s\S]{0,1500})/)?.[1] ?? '';
  // Company names wrap across multiple lines in this table ("ADVANCED \r\nMICRO
  // \r\nDEVICES") — pypdf's line breaks here are \r\n, not \n, so the name
  // capture must allow both or it silently drops any multi-word name that
  // wraps (caught by testing against XS3425822221, whose basket first came
  // back with only 2 of its 3 underlyings, then still only 2 after adding
  // \n alone — the \r was the actual missing piece).
  const basketRows = [...basketBlock.matchAll(/\d+\s+([A-Z][A-Za-z0-9 &.,\-\r\n]+?)\s+([A-Z]{1,6})\s+U[QN]\s+Equity[\s\S]{0,120}?USD\s+([\d.]+)\s+([\d.]+)/g)];
  const underlyings = basketRows.map(r => ({ name: r[1].replace(/\s+/g, ' ').trim(), ticker: r[2], entry: +r[3], strike: +r[4] }));
  notes.push({
    tradeDate: toIso(trade), issueDate: toIso(issue),
    couponPctPa: couponPeriod ? +(+couponPeriod * 12).toFixed(4) : null,
    schedule, underlyings,
    notes_: ['Nomura: schedule dates are the Determination Day (observation), not the Coupon Payment Date.'],
  });
  return notes[0];
}

function parseMarex(text) {
  const table = text.match(/N Autocall Level\*[\s\S]{0,40}?\n([\s\S]{0,2000}?)\*\s*levels/)?.[1] ?? '';
  const rows = [...table.matchAll(/(\d+)\s+([\d.]+)%\s+[\d.]+%\s+(\d{1,2} \w+ \d{4})\s+(\d{1,2} \w+ \d{4})/g)];
  const schedule = rows.map(r => ({ n: +r[1], triggerPct: +r[2], determinationDate: toIso(r[3]), paymentDate: toIso(r[4]) }));
  const couponMatch = text.match(/([\d.]+)%\s*p\.a\./i);
  return {
    tradeDate: null, issueDate: null,
    couponPctPa: couponMatch ? +couponMatch[1] : null,
    schedule, underlyings: [],
    notes_: ['Marex: schedule dates are the Early Redemption Observation Date, not the Early Redemption Date.', 'Coupon and underlying basket need manual confirmation from the PDF — table layout too inconsistent to auto-parse reliably.'],
  };
}

function parseUbsVmran(text) {
  const detLine = text.match(/Periodic Coupon Determination Dates:[\s\S]{0,20}?which are currently expected to be ([\s\S]{0,400}?), provided/)?.[1] ?? '';
  const dates = [...detLine.matchAll(/(\d{1,2} \w+ \d{4})/g)].map(m => toIso(m[1]));
  const valuationDate = text.match(/Valuation Date:\s*(\d{1,2} \w+ \d{4})/)?.[1];
  return {
    tradeDate: null, issueDate: text.match(/Settlement Date/) ? null : null,
    couponPctPa: null,
    schedule: dates.map((d, i) => ({ n: i + 1, determinationDate: d, triggerPct: null })),
    finalValuationDate: toIso(valuationDate),
    underlyings: [],
    notes_: ['UBS VMRAN: schedule dates are Periodic Coupon Determination Dates, not Payment Dates.', 'Trigger % (Callable Price step-down) and coupon rate need manual read — stated separately from the date table.'],
  };
}

function parseCsi(text) {
  const table = text.match(/k Knock-[\s\S]{0,80}?Sharei\s*\n\s*\(i = 3\)\s*\n([\s\S]{0,2000}?)Each Knock-out/)?.[1] ?? '';
  const rows = [...table.matchAll(/(\d+)\s+(\d{1,2} \w+\s*\n?\d{4})\s+(\d{1,2} \w+\s*\n?\d{4})\s+([\d.]+)\s*%/g)];
  const schedule = rows.map(r => ({ n: +r[1], determinationDate: toIso(r[2].replace(/\s*\n\s*/, ' ')), paymentDate: toIso(r[3].replace(/\s*\n\s*/, ' ')), triggerPct: +r[4] }));
  return {
    tradeDate: null, issueDate: null, couponPctPa: null,
    schedule, underlyings: [],
    notes_: ['CSI: schedule dates are the Knock-out Observation Date, not the Knock-out Redemption Date.', 'Table often splits across a page break — verify the schedule count against the PDF directly.'],
  };
}

function parseNatixis(text) {
  const valTable = text.match(/Automatic Early\s*\nRedemption Valuation\s*\nDate \(t\)[\s\S]{0,40}?\n([\s\S]{0,1200}?)If on any/)?.[1] ?? '';
  const valRows = [...valTable.matchAll(/(\d+)\s+(\d{1,2} \w+ \d{4})\s+(\d{1,2} \w+ \d{4})\s+([\d.]+)%/g)];
  const priceTable = text.match(/Automatic Early\s*\nRedemption\s*\nValuation Date\(t\)\s*\n\s*Automatic Early\s*\nRedemption\s*\nPrice\s*\n([\s\S]{0,700}?)(?:\||Final Redemption)/)?.[1] ?? '';
  const priceRows = [...priceTable.matchAll(/(\d+)\s+(\d{1,2} \w+ \d{4})\s+([\d.]+)%/g)];
  const triggerByN = Object.fromEntries(priceRows.map(r => [+r[1], +r[3]]));
  const schedule = valRows.map(r => ({ n: +r[1], determinationDate: toIso(r[2]), paymentDate: toIso(r[3]), triggerPct: triggerByN[+r[1]] ?? 100 }));
  const couponMatch = text.match(/Denomination x\s*([\d.]+)%\s*\/\s*12/);
  const basketBlock = text.match(/Initial Price:\s*\n\s*\ni Share Initial Price\s*\n([\s\S]{0,600}?)\|/)?.[1] ?? '';
  // Same \r\n wrapping risk as the Nomura basket.
  const basketRows = [...basketBlock.matchAll(/\d+\s+([A-Za-z0-9 &.,\-\r\n]+?)\s+USD\s+([\d.]+)/g)];
  const underlyings = basketRows.map(r => ({ name: r[1].replace(/\s+/g, ' ').trim(), entry: +r[2] }));
  return {
    tradeDate: toIso(text.match(/Trade Date:\s*(\d{1,2} \w+ \d{4})/)?.[1]),
    issueDate: toIso(text.match(/Issue Date:\s*(\d{1,2} \w+ \d{4})/)?.[1]),
    maturityDate: toIso(text.match(/Maturity Date:\s*(\d{1,2} \w+ \d{4})/)?.[1]),
    couponPctPa: couponMatch ? +couponMatch[1] : null,
    schedule, underlyings,
    notes_: ['Natixis: schedule dates are the Automatic Early Redemption Valuation Date, not the Redemption Date.'],
  };
}

const PARSERS = { nomura: parseNomura, marex: parseMarex, ubs_vmran: parseUbsVmran, csi: parseCsi, natixis: parseNatixis };

// ── 5. What's already in the live book ────────────────────────────────────────
async function loadExistingIsins() {
  const set = new Set();
  let from = 0;
  for (;;) {
    const r = await fetch(`${SB}/rest/v1/portfolio_holdings?deleted_at=is.null&select=product_name&order=id&offset=${from}&limit=1000`, { headers: H });
    const rows = await r.json();
    for (const row of rows) if (row.product_name) set.add(row.product_name);
    if (rows.length < 1000) break;
    from += 1000;
  }
  return set;
}

// ── main ───────────────────────────────────────────────────────────────────────
const main = async () => {
  console.log(`Scanning ${folder} ...`);
  const pdfs = walkPdfs(folder);
  console.log(`Found ${pdfs.length} PDF(s).\n`);

  const existing = await loadExistingIsins();
  console.log(`${existing.size} ISIN(s) already in the live book.\n`);

  const missing = [];
  const skipped = [];
  for (const filePath of pdfs) {
    const isin = isinFromFilename(filePath);
    if (!isin) { skipped.push({ filePath, reason: 'no ISIN found in filename' }); continue; }
    if (existing.has(isin) && !forceIsins.has(isin)) continue; // already inserted — nothing to do
    missing.push({ filePath, isin, clientHint: likelyClientHint(filePath, folder) });
  }

  if (skipped.length) {
    console.log(`Skipped (no ISIN in filename — check manually):`);
    skipped.forEach(s => console.log(`  ${s.filePath}`));
    console.log();
  }

  if (!missing.length) {
    console.log('Nothing missing — every ISIN found in the folder is already in the book.');
    return;
  }

  console.log(`=== ${missing.length} note(s) in the folder NOT yet in the book ===\n`);
  const queue = [];
  for (const m of missing) {
    console.log(`${m.isin}  (client hint: ${m.clientHint})`);
    console.log(`  ${m.filePath}`);
    const text = extractText(m.filePath);
    if (!text) {
      console.log(`  ⚠ Could not extract PDF text (is python3 + pypdf installed? \`pip install pypdf\`)\n`);
      queue.push({ ...m, family: null, parsed: null, parseNotes: ['PDF text extraction failed'] });
      continue;
    }
    const family = detectFamily(text);
    if (family === 'unknown') {
      console.log(`  ⚠ Unrecognized term sheet format — no known issuer template matched. Read manually.\n`);
      queue.push({ ...m, family: null, parsed: null, parseNotes: ['Unrecognized template — none of the known issuer markers matched'] });
      continue;
    }
    const parsed = PARSERS[family](text);
    console.log(`  Template: ${family}`);
    console.log(`  Trade: ${parsed.tradeDate ?? '?'}  Issue: ${parsed.issueDate ?? '?'}  Coupon: ${parsed.couponPctPa ?? '?'}% p.a.`);
    console.log(`  Underlyings: ${parsed.underlyings.length ? parsed.underlyings.map(u => u.name).join(', ') : '(not parsed — read manually)'}`);
    console.log(`  Schedule: ${parsed.schedule.length} observation(s)${parsed.schedule.length ? ` — first ${parsed.schedule[0].determinationDate}, last ${parsed.schedule[parsed.schedule.length - 1].determinationDate}` : ''}`);
    parsed.notes_.forEach(n => console.log(`  ⓘ ${n}`));
    console.log();
    queue.push({ ...m, family, parsed });
  }

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(queue, null, 2));
    console.log(`Review queue written to ${jsonOut} — nothing has been inserted. Confirm each entry against its actual PDF before it goes into Supabase/Notion.`);
  } else {
    console.log(`Nothing has been inserted. Re-run with --json <file> to save this queue, or hand the ${missing.length} PDF(s) above to Claude to insert after review.`);
  }
};

main();
