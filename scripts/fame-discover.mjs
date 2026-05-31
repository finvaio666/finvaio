/**
 * FAME (Phillip) Portfolio Discovery Script
 *
 * Step 1 of 2 — Captures the HTML structure of a client portfolio page
 * so that the real import script can be written with correct selectors.
 *
 * Usage:
 *   node scripts/fame-discover.mjs
 *
 * What it does:
 *   1. Opens Chrome using your existing user profile (already logged in)
 *   2. Navigates to fame.com.my
 *   3. Waits for you to navigate to a client's portfolio page in the browser
 *   4. Press ENTER in this terminal when you're on the right page
 *   5. Saves: screenshot + full HTML + extracted table data → scripts/fame-discovery/
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'fame-discovery');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep  = ms => new Promise(r => setTimeout(r, ms));

function waitForEnter(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('\n🔍 FAME Portfolio Discovery');
console.log('━'.repeat(50));
console.log('  This script will open Chrome and wait for you');
console.log('  to navigate to a client\'s portfolio page.');
console.log('  It will then capture the page structure.\n');

// Try to connect to an existing Chrome with remote debugging first,
// then fall back to launching with the user profile.
let browser;
try {
  console.log('  Trying to connect to existing Chrome on port 9222…');
  browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
  console.log('  ✅ Connected to existing Chrome session\n');
} catch {
  console.log('  Not found — launching Chrome with your profile…');

  // Common Chrome locations on Windows
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const chromePath = chromePaths.find(p => fs.existsSync(p));

  // Chrome user profile — uses your existing login session
  const userDataDir = path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data');

  browser = await puppeteer.launch({
    executablePath: chromePath,
    userDataDir: fs.existsSync(userDataDir) ? userDataDir : undefined,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-first-run', '--disable-sync'],
  });
  console.log('  ✅ Chrome launched\n');
}

const pages = await browser.pages();
const page = pages[0] ?? await browser.newPage();

// Navigate to fame.com.my if not already there
const currentUrl = page.url();
if (!currentUrl.includes('fame.com.my')) {
  console.log('  Navigating to fame.com.my…');
  await page.goto('https://www.fame.com.my', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
}

console.log('━'.repeat(50));
console.log('\n  👆 ACTION REQUIRED:');
console.log('  In the Chrome window, navigate to a CLIENT\'s portfolio page.');
console.log('  (The page that shows their fund holdings, units, values)');
console.log('  Pick any one client — this is just to learn the page structure.\n');

await waitForEnter('  Press ENTER when you\'re on the portfolio page…');

console.log('\n  📸 Capturing page…');

// 1. Screenshot
const screenshotPath = path.join(OUT_DIR, 'portfolio-page.png');
await page.screenshot({ path: screenshotPath, fullPage: true });
console.log(`  ✅ Screenshot saved: ${screenshotPath}`);

// 2. Full HTML
const html = await page.content();
const htmlPath = path.join(OUT_DIR, 'portfolio-page.html');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`  ✅ HTML saved: ${htmlPath}`);

// 3. Current URL
const finalUrl = page.url();
console.log(`  📍 Page URL: ${finalUrl}`);

// 4. Extract ALL tables from the page
const tables = await page.evaluate(() => {
  const result = [];
  document.querySelectorAll('table').forEach((tbl, tblIdx) => {
    const rows = [];
    tbl.querySelectorAll('tr').forEach(tr => {
      const cells = Array.from(tr.querySelectorAll('th, td')).map(td => td.innerText.trim());
      if (cells.some(c => c)) rows.push(cells);
    });
    if (rows.length > 0) {
      result.push({
        tableIndex: tblIdx,
        tableClass: tbl.className,
        tableId:    tbl.id,
        rowCount:   rows.length,
        headers:    rows[0],
        sampleRows: rows.slice(0, 5),
      });
    }
  });
  return result;
});

const tablesPath = path.join(OUT_DIR, 'tables.json');
fs.writeFileSync(tablesPath, JSON.stringify(tables, null, 2), 'utf8');
console.log(`  ✅ Tables JSON saved: ${tablesPath}`);
console.log(`  📊 Found ${tables.length} table(s) on the page`);

// 5. Extract any visible text that looks like fund/holding data
const textSummary = await page.evaluate(() => {
  // Get all meaningful text nodes grouped by container
  const sections = [];
  document.querySelectorAll('div, section, article, main').forEach(el => {
    const text = el.innerText?.trim();
    if (text && text.length > 20 && text.length < 5000 && el.children.length < 50) {
      sections.push({
        tag:   el.tagName,
        id:    el.id,
        class: el.className?.slice(0, 80),
        text:  text.slice(0, 300),
      });
    }
  });
  return sections.slice(0, 30); // top 30 sections
});

const textPath = path.join(OUT_DIR, 'text-sections.json');
fs.writeFileSync(textPath, JSON.stringify(textSummary, null, 2), 'utf8');
console.log(`  ✅ Text sections saved: ${textPath}`);

// 6. Page title + meta
const pageInfo = await page.evaluate(() => ({
  title:   document.title,
  url:     window.location.href,
  headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(h => ({
    tag: h.tagName,
    text: h.innerText.trim(),
  })).slice(0, 20),
}));

const infoPath = path.join(OUT_DIR, 'page-info.json');
fs.writeFileSync(infoPath, JSON.stringify(pageInfo, null, 2), 'utf8');

console.log('\n━'.repeat(50));
console.log('\n  🎉 Discovery complete!');
console.log(`  Files saved to: ${OUT_DIR}\n`);
console.log('  Table summary:');
if (tables.length === 0) {
  console.log('  ⚠️  No <table> elements found — site may use div-based layout');
  console.log('  Check the screenshot to understand the page structure');
} else {
  tables.forEach((t, i) => {
    console.log(`    Table ${i}: [${t.tableClass || t.tableId || 'no class'}] ${t.rowCount} rows`);
    console.log(`      Headers: ${JSON.stringify(t.headers)}`);
  });
}

console.log('\n  Next step: Share the discovery output with Claude');
console.log('  (screenshot + tables.json) to build the real import script.\n');

await browser.disconnect().catch(() => browser.close().catch(() => {}));
