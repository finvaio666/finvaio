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
import crypto from 'crypto';
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
// --push: stage what was found into note_intake, so it shows up in the Admin
// "New Notes" tab for review. Still not an insert — nothing reaches
// portfolio_holdings until a human confirms the terms and supplies the amount.
const push = process.argv.includes('--push');

if (!folder) {
  console.error('Usage: node scripts/scan-term-sheets.mjs "<folder to scan>" [--json out.json] [--push]');
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

// Loosen "LIM_WEI_YI" / "Siew Voon Fei" / "TracyChia" into a comparable form —
// underscores to spaces, case-folded — so it can be matched against real
// client_name values from the database.
const normalizeName = (s) => s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// Which client (if any) this file's folder path actually names. The deepest
// folder segment is tried first (client folders are usually the leaf, e.g.
// ".../TracyChia/LIM_WEI_YI/note.pdf"), falling back to shallower ones for
// files that sit directly under an advisor folder (".../Siew Voon Fei/note.pdf").
function matchClient(filePath, scanRoot, clients) {
  const rel = path.relative(scanRoot, filePath);
  const segments = rel.split(path.sep).slice(0, -1).reverse();
  for (const seg of segments) {
    const norm = normalizeName(seg);
    const hit = clients.find(c => normalizeName(c.client_name) === norm);
    if (hit) return hit;
  }
  return null;
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

/**
 * `iso` plus `n` business days, counting weekends only.
 *
 * Term sheets state maturity relative to the final valuation ("Valuation Date
 * + 2 Business Days"), and in this book maturity really is later than the
 * final observation on 36 of 43 notes — so equating the two is wrong, and
 * leaving it blank loses a date the PDF effectively gives you.
 *
 * Weekends only, no holiday calendar: a public holiday in the settlement
 * window pushes the real date out by another day, so this is a starting point
 * the reviewer confirms, never an authority. Callers say so in notes_.
 */
function addBusinessDays(iso, n) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * The tranche's total size and its minimum unit, in the note's own currency.
 *
 * Every issuer states both, under its own label:
 *   UBS     "Issue Amount: USD 550,000"          "Note Denomination: USD 50,000"
 *   Nomura  "Nominal Amount of Series USD 100,000.00"  "Denomination USD 100,000.00 per Security"
 *   Marex   "Issue Size Up to USD 480,000"       "Denomination USD 80,000"
 *
 * Worth pulling out because they are the only figures on a term sheet that can
 * CHECK the one number a human has to type: the per-client amounts must sum to
 * no more than the tranche, and each should be a whole number of denominations.
 * That turns a silent typo (500,000 for 50,000) into a caught one.
 */
function parseSizing(text) {
  const flat = text.replace(/\s+/g, ' ');
  const amt = s => (s ? +s.replace(/,/g, '') : null);
  const issueAmount = amt(
    flat.match(/Issue Amount:?\s*[A-Z]{3}\s*([\d,]+(?:\.\d+)?)/)?.[1]
    ?? flat.match(/Nominal Amount of Series\s*[A-Z]{3}\s*([\d,]+(?:\.\d+)?)/)?.[1]
    ?? flat.match(/Issue Size\s*(?:Up to\s*)?[A-Z]{3}\s*([\d,]+(?:\.\d+)?)/)?.[1]
  );
  const denomination = amt(
    flat.match(/(?:Note )?Denomination:?\s*[A-Z]{3}\s*([\d,]+(?:\.\d+)?)/)?.[1]
  );
  const currency = flat.match(/(?:Issue Amount|Issue Size|Nominal Amount of Series)[:\s]*(?:Up to\s*)?([A-Z]{3})\s*[\d,]/)?.[1] ?? null;
  return { issueAmount, denomination, currency };
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
  // pypdf wraps this template's prose mid-sentence, and mid-DATE ("22\nDec
  // 2026"), so every match below runs against a whitespace-flattened copy.
  // The original newlines carry no meaning here — unlike the Nomura/Natixis
  // basket tables, where a line break IS the row separator.
  const flat = text.replace(/\s+/g, ' ');

  const tradeDate = flat.match(/Trade Date:\s*(\d{1,2} \w+ \d{4})/)?.[1];
  const issueDate = flat.match(/Issue Date:\s*(\d{1,2} \w+ \d{4})/)?.[1];
  // The Valuation Date is the final observation; Maturity is stated only
  // relatively ("Valuation Date + 2 Business Days"), so it is left for the
  // reviewer rather than computed — business-day arithmetic needs a holiday
  // calendar this script does not have.
  const valuationDate = flat.match(/Valuation Date:\s*(\d{1,2} \w+ \d{4})/)?.[1];

  // "6 Months USD 14.77% (annualized basis)" — the headline is already p.a.,
  // unlike the per-period rate stated further down ("1.2308% ... every 1 Month").
  const couponPctPa = flat.match(/([\d.]+)%\s*\(annualized basis\)/)?.[1];

  // Conversion Price is quoted as a % of the Initial Price ("Xn = 70.00% x So").
  // For these ELNs that level IS the downside barrier the final close is
  // measured against, so it prefills the KI field.
  const conversionPct = flat.match(/\(\s*Xn\s*=\s*([\d.]+)%\s*x\s*So\s*\)/)?.[1];

  // "Tesla Inc (TSLA.OQ) USD 357.36 USD 250.1520 USD 50,000 / Xn"
  //  name        ticker      So          Xn (conversion/strike)
  const basketRows = [...flat.matchAll(/([A-Z][A-Za-z0-9 .&,'-]{2,40}?)\s*\(([A-Z]{1,6}\.[A-Z]{1,3})\)\s+[A-Z]{3}\s+([\d,]+\.?\d*)\s+[A-Z]{3}\s+([\d,]+\.?\d*)/g)];
  const num = s => +s.replace(/,/g, '');
  const underlyings = basketRows.map(r => ({
    // Each row ends "USD 50,000 / Xn" and pypdf runs it straight into the next
    // company name, so every row after the first arrives as "Xn Broadcom Inc".
    // Xn is the term sheet's symbol for the conversion price, never part of a name.
    name: r[1].trim().replace(/^Xn\s+/, ''),
    ticker: r[2], entry: num(r[3]), strike: num(r[4]),
  }));

  // Determination dates run to the Valuation Date inclusive; the Callable
  // Price step-down table covers every one EXCEPT the final ("each (apart from
  // the final one) Periodic Coupon Determination Date"). So the step-down
  // levels line up with the observations from the front, and the last date
  // falls through as the final valuation with no autocall barrier of its own.
  const detLine = flat.match(/Periodic Coupon Determination Dates:.{0,200}?currently expected to be (.{0,400}?),?\s*provided/)?.[1] ?? '';
  const dates = [...detLine.matchAll(/(\d{1,2} \w+ \d{4})/g)].map(m => toIso(m[1]));
  const callable = [...flat.matchAll(/(\d+)(?:st|nd|rd|th) Mandatory Early Redemption Date\s+([\d.]+)%\s*of Initial Price/g)]
    .reduce((acc, m) => { acc[+m[1]] = +m[2]; return acc; }, {});

  const schedule = dates.map((d, i) => ({
    n: i + 1, determinationDate: d,
    triggerPct: callable[i + 1] ?? null,   // null on the final date — it is not an autocall observation
  }));

  // "Maturity Date: Valuation Date + 2 Business Days ..." — maturity is stated
  // relative to the final valuation, never as an absolute date.
  // ...but the template then spells the resulting date out ("which is currently
  // expected to be 24 Mar 2027"). Prefer that: it is the issuer's own
  // calculation, holidays included, where the computed fallback below knows
  // only about weekends.
  const lag = +(flat.match(/Maturity Date:\s*Valuation Date \+\s*(\d+)\s*Business Days/)?.[1] ?? 0);
  const finalValuation = toIso(valuationDate) ?? dates[dates.length - 1] ?? null;
  const statedMaturity = toIso(
    flat.match(/Maturity Date:[\s\S]{0,400}?currently expected to be (\d{1,2} \w+ \d{4})/)?.[1]
  );
  const maturityDate = statedMaturity ?? (lag ? addBusinessDays(finalValuation, lag) : null);

  const notes_ = ['UBS VMRAN: schedule dates are Periodic Coupon Determination Dates, not Payment Dates.'];
  if (!underlyings.length) notes_.push('Basket table did not parse — read the underlyings and their Initial Prices manually.');
  if (!dates.length)       notes_.push('Determination-date list did not parse — read the schedule manually.');
  if (statedMaturity) {
    notes_.push(`Maturity ${statedMaturity} is stated in the term sheet (final valuation ${finalValuation} + ${lag} business days).`);
  } else if (maturityDate) {
    notes_.push(`Maturity ${maturityDate} is COMPUTED as final valuation ${finalValuation} + ${lag} business days (weekends only, no holiday calendar) — confirm it.`);
  } else if (finalValuation) {
    notes_.push(`Maturity is stated relative to the final valuation (${finalValuation}) and did not parse — read it manually.`);
  }

  return {
    tradeDate: toIso(tradeDate),
    issueDate: toIso(issueDate),
    maturityDate,
    couponPctPa: couponPctPa ? +couponPctPa : null,
    kiPct: conversionPct ? +conversionPct : null,
    koPct: callable[1] ?? null,
    schedule,
    finalValuationDate: finalValuation,
    underlyings,
    notes_,
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
// Keyed by ISIN alone AND by "ISIN__clientNotionId" — a shared note (several
// clients each holding their own slice of the same tranche) is common in this
// book, so "this ISIN exists somewhere" is not the same question as "this
// ISIN exists FOR THIS CLIENT". Diffing on ISIN alone would silently skip a
// new client who bought into an already-inserted note (caught 2026-09-05:
// XS3395171005 already sits under 4 different clients).
async function loadExisting() {
  const byIsin = new Set();
  const byIsinClient = new Set();
  let from = 0;
  for (;;) {
    const r = await fetch(`${SB}/rest/v1/portfolio_holdings?deleted_at=is.null&select=product_name,client_notion_id&order=id&offset=${from}&limit=1000`, { headers: H });
    const rows = await r.json();
    for (const row of rows) {
      if (!row.product_name) continue;
      byIsin.add(row.product_name);
      byIsinClient.add(`${row.product_name}__${row.client_notion_id}`);
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  return { byIsin, byIsinClient };
}

// Content hash, not path — this is the key the intake queue dedupes and
// "ignore permanently" work on, so renaming a file or moving it to a tidier
// folder must not resurrect a candidate that was already dealt with.
function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Documents already rejected in the app ("superseded draft", "duplicate",
 * "not ours"). Ignoring is per DOCUMENT, so one rejection covers every client
 * folder the same PDF sits in — and it's permanent, which is the whole point:
 * a nightly scan that keeps re-offering a note you already said no to is a
 * queue nobody reads.
 */
async function loadIgnoredHashes() {
  const out = new Set();
  const r = await fetch(`${SB}/rest/v1/note_intake?status=eq.ignored&select=file_hash`, { headers: H });
  if (!r.ok) return out;  // table not migrated yet — scanning still works, just without the memory
  for (const row of await r.json()) out.add(row.file_hash);
  return out;
}

async function loadClients() {
  const out = [];
  let from = 0;
  for (;;) {
    const r = await fetch(`${SB}/rest/v1/clients?select=notion_id,client_name,advisor&order=id&offset=${from}&limit=1000`, { headers: H });
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
}

// ── main ───────────────────────────────────────────────────────────────────────
const main = async () => {
  console.log(`Scanning ${folder} ...`);
  const pdfs = walkPdfs(folder);
  console.log(`Found ${pdfs.length} PDF(s).\n`);

  const { byIsin, byIsinClient } = await loadExisting();
  const clients = await loadClients();
  const ignoredHashes = await loadIgnoredHashes();
  console.log(`${byIsin.size} ISIN(s) already in the live book, across ${clients.length} clients.`);
  console.log(`${ignoredHashes.size} document(s) previously ignored — those stay hidden.\n`);

  const missing = [];
  const skipped = [];
  let ignoredSeen = 0;
  for (const filePath of pdfs) {
    const isin = isinFromFilename(filePath);
    if (!isin) { skipped.push({ filePath, reason: 'no ISIN found in filename' }); continue; }

    const fileHash = hashFile(filePath);
    if (ignoredHashes.has(fileHash)) { ignoredSeen++; continue; }

    const client = matchClient(filePath, folder, clients);
    const hint = likelyClientHint(filePath, folder);

    if (forceIsins.has(isin)) {
      // --force bypasses the "already have it" check entirely, for spot-testing.
    } else if (client) {
      // We know exactly which client this is — check the ISIN+client pair, not
      // just the ISIN, so a new client on an already-inserted note isn't skipped.
      if (byIsinClient.has(`${isin}__${client.notion_id}`)) continue;
    } else {
      // Couldn't match the folder to a known client at all — fall back to the
      // ISIN-only check (better than nothing) but flag it loudly, since this
      // is exactly the case that can hide a real new-client insertion.
      if (byIsin.has(isin)) {
        console.log(`⚠ ${isin}: folder "${hint}" didn't match any known client, and this ISIN already exists for OTHER client(s) — skipping, but VERIFY this isn't actually a new client. Rename the folder to match the client's name in FINVA to fix this.\n`);
        continue;
      }
    }
    missing.push({
      filePath, isin, fileHash, clientHint: hint,
      clientNotionId: client?.notion_id ?? '',
      matchedClient: client ? { name: client.client_name, advisor: client.advisor } : null,
    });
  }

  if (ignoredSeen) console.log(`Skipped ${ignoredSeen} file(s) previously ignored in the app.\n`);

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
    const clientLine = m.matchedClient
      ? `client: ${m.matchedClient.name} (${m.matchedClient.advisor}) — matched to folder "${m.clientHint}"`
      : `client: NOT MATCHED — folder "${m.clientHint}" doesn't correspond to a known client name; confirm manually`;
    console.log(`${m.isin}  —  ${clientLine}`);
    console.log(`  ${m.filePath}`);
    // The term sheet only ever states the total tranche size (e.g. "Denomination
    // USD 260,000"), never a per-client split — that number always has to come
    // from you (your own instruction, or the official position statement), the
    // same way it has for every shared note inserted this session.
    console.log(`  ⓘ This client's actual invested amount is NOT in the term sheet — you'll need to supply it.`);
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
    // Sizing is label-matched rather than template-specific, so it runs for
    // every issuer regardless of which parser handled the rest.
    const parsed = { ...PARSERS[family](text), ...parseSizing(text) };
    console.log(`  Template: ${family}`);
    if (parsed.issueAmount) {
      console.log(`  Tranche: ${parsed.currency ?? ''} ${parsed.issueAmount.toLocaleString()}${parsed.denomination ? ` (in units of ${parsed.denomination.toLocaleString()})` : ''}`);
    }
    console.log(`  Trade: ${parsed.tradeDate ?? '?'}  Issue: ${parsed.issueDate ?? '?'}  Coupon: ${parsed.couponPctPa ?? '?'}% p.a.`);
    console.log(`  Underlyings: ${parsed.underlyings.length ? parsed.underlyings.map(u => u.name).join(', ') : '(not parsed — read manually)'}`);
    console.log(`  Schedule: ${parsed.schedule.length} observation(s)${parsed.schedule.length ? ` — first ${parsed.schedule[0].determinationDate}, last ${parsed.schedule[parsed.schedule.length - 1].determinationDate}` : ''}`);
    parsed.notes_.forEach(n => console.log(`  ⓘ ${n}`));
    console.log();
    queue.push({ ...m, family, parsed });
  }

  if (push) {
    // Upsert on (file_hash, client_notion_id): a re-scan of a file still
    // sitting in the folder refreshes its parse and bumps last_seen_at rather
    // than piling up duplicates. status is deliberately NOT in the update list
    // — re-scanning must never flip a row an admin already resolved back to
    // pending, which would undo an "ignore" the moment the file was re-seen.
    const payload = queue.map(q => ({
      file_hash:           q.fileHash,
      file_path:           q.filePath,
      file_name:           path.basename(q.filePath),
      isin:                q.isin,
      client_notion_id:    q.clientNotionId || '',
      client_match_source: q.matchedClient ? 'folder' : null,
      client_hint:         q.clientHint,
      issuer_family:       q.family ?? null,
      parsed:              q.parsed ?? null,
      parse_warnings:      q.parseNotes ?? q.parsed?.notes_ ?? [],
      last_seen_at:        new Date().toISOString(),
    }));
    const res = await fetch(`${SB}/rest/v1/note_intake?on_conflict=file_hash,client_notion_id`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.log(`\n⚠ Could not stage into note_intake (${res.status}): ${await res.text()}`);
      console.log('  Has db/migrations/2026-09-09-create-note-intake.sql been applied?');
    } else {
      const rows = await res.json();
      const stillPending = rows.filter(r => r.status === 'pending').length;
      console.log(`\n✓ Staged ${rows.length} candidate(s) into the intake queue — ${stillPending} awaiting review.`);
      console.log('  Review them in FINVA: Dashboard → 📥 New Notes. Nothing has been inserted into the book.');
    }
  }

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(queue, null, 2));
    console.log(`Review queue written to ${jsonOut} — nothing has been inserted. Confirm each entry against its actual PDF before it goes into Supabase/Notion.`);
  } else if (!push) {
    console.log(`Nothing has been inserted. Re-run with --json <file> to save this queue, or hand the ${missing.length} PDF(s) above to Claude to insert after review.`);
  }
};

main();
