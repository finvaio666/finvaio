// Reconcile Notion (authoritative) → Supabase portfolio_holdings, keyed on notion_id.
// DEFAULT = dry-run (report only, NO writes). Pass --apply to upsert/delete.
//   Dry-run: node --env-file=.env.local --import tsx scripts/reconcile-portfolio.ts
//   Apply:   node --env-file=.env.local --import tsx scripts/reconcile-portfolio.ts --apply
//
// Notes:
//  • client link = Notion "👥 Clients" relation[0] → client_notion_id (= clients.notion_id).
//    Recon confirmed every holding has exactly 1 client and all resolve to imported clients.
//  • currency empty → null (CHECK currency IN MYR/AUD/SGD/USD).
//  • Formula columns (Return %, Gain/Loss) are NOT stored — derived on read.
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_ID = process.env.COMPANY_PORTFOLIO_DB_ID!;

// Post-cutover guard: once DATA_SOURCE_PORTFOLIO=supabase, Supabase is authoritative.
if (APPLY && process.env.DATA_SOURCE_PORTFOLIO === 'supabase') {
  console.error('✋ Refusing --apply: DATA_SOURCE_PORTFOLIO=supabase (post-cutover). Supabase is now');
  console.error('   authoritative; syncing Notion → Supabase would clobber newer Supabase edits.');
  process.exit(1);
}

type P = Record<string, unknown>;
const rt = (p: P, k: string) => { const v = p[k] as { type: string; rich_text?: { plain_text: string }[] }; return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : ''; };
const sel = (p: P, k: string) => { const v = p[k] as { type: string; select?: { name: string } | null }; return v?.type === 'select' ? (v.select?.name ?? '') : ''; };
const selN = (p: P, k: string): string | null => sel(p, k) || null;
const nnum = (p: P, k: string): number | null => { const v = p[k] as { type: string; number?: number | null }; return v?.type === 'number' ? (v.number ?? null) : null; };
const dt = (p: P, k: string): string | null => { const v = p[k] as { type: string; date?: { start: string } | null }; return v?.type === 'date' ? ((v.date?.start ?? '').slice(0, 10) || null) : null; };
const title = (p: P, k: string) => { const v = p[k] as { type: string; title?: { plain_text: string }[] }; return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : ''; };
const relFirst = (p: P, k: string): string | null => { const v = p[k] as { type: string; relation?: { id: string }[] }; return v?.type === 'relation' ? (v.relation?.[0]?.id.replace(/-/g, '') ?? null) : null; };

const COLS = [
  'holding_name', 'client_notion_id', 'asset_class', 'product_name', 'institution', 'currency',
  'fx_rate_to_myr', 'units', 'purchase_price_original', 'purchase_price_myr', 'value_original_currency',
  'value_myr', 'start_date', 'maturity_date', 'status', 'advisor', 'geography', 'fame_account_no',
  'fund_source', 'fame_sync_date',
] as const;
type Col = typeof COLS[number];
type Rec = Record<Col, unknown>;
const NUM_COLS = new Set(['fx_rate_to_myr', 'units', 'purchase_price_original', 'purchase_price_myr', 'value_original_currency', 'value_myr']);
const DATE_COLS = new Set(['start_date', 'maturity_date', 'fame_sync_date']);

function recFromNotion(pg: PageObjectResponse): Rec {
  const p = pg.properties as P;
  return {
    holding_name:            title(p, 'Holding Name'),
    client_notion_id:        relFirst(p, '👥 Clients'),
    asset_class:             selN(p, 'Asset class'),
    product_name:            rt(p, 'Product name'),
    institution:             rt(p, 'Institution'),
    currency:                selN(p, 'Currency'),
    fx_rate_to_myr:          nnum(p, 'FX Rate to MYR'),
    units:                   nnum(p, 'Units'),
    purchase_price_original: nnum(p, 'Purchase price (original currency)'),
    purchase_price_myr:      nnum(p, 'Purchase price (MYR)'),
    value_original_currency: nnum(p, 'Value (Original Currency)'),
    value_myr:               nnum(p, 'Value (MYR)'),
    start_date:              dt(p, 'Start date'),
    maturity_date:           dt(p, 'Maturity date'),
    status:                  selN(p, 'Status'),
    advisor:                 sel(p, 'Advisor'),
    geography:               rt(p, 'Geography'),
    fame_account_no:         rt(p, 'FAME Account No'),
    fund_source:             rt(p, 'Fund Source'),
    fame_sync_date:          dt(p, 'FAME Sync Date'),
  };
}

function norm(col: Col, v: unknown): string {
  if (NUM_COLS.has(col)) return v == null || v === '' ? '' : String(Number(v));
  if (DATE_COLS.has(col)) return (v ?? '').toString().slice(0, 10);
  return (v ?? '').toString().trim();
}

async function main() {
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({ database_id: DB_ID, page_size: 100, start_cursor: cursor });
    pages.push(...res.results.filter(isFullPage));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const notionRecs = pages
    .map(pg => ({ notion_id: pg.id.replace(/-/g, ''), rec: recFromNotion(pg) }))
    .filter(r => (r.rec.holding_name as string).trim());
  const notionById = new Map(notionRecs.map(r => [r.notion_id, r]));

  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();
  const selCols = `id, notion_id, ${COLS.map(c => DATE_COLS.has(c) ? `${c}::text` : c).join(', ')}`;
  const sbRows = (await db.query(`select ${selCols} from portfolio_holdings`)).rows as Record<string, unknown>[];
  const sbById = new Map(sbRows.filter(r => r.notion_id).map(r => [r.notion_id as string, r]));

  const toInsert: typeof notionRecs = [];
  const toUpdate: { notion_id: string; rec: Rec; diffs: string[] }[] = [];
  for (const r of notionRecs) {
    const ex = sbById.get(r.notion_id);
    if (!ex) { toInsert.push(r); continue; }
    const diffs: string[] = [];
    for (const c of COLS) if (norm(c, r.rec[c]) !== norm(c, ex[c])) diffs.push(c);
    if (diffs.length) toUpdate.push({ notion_id: r.notion_id, rec: r.rec, diffs });
  }
  const orphans = sbRows.filter(r => r.notion_id && !notionById.has(r.notion_id as string));
  const nullNotion = sbRows.filter(r => !r.notion_id);
  const noClient = notionRecs.filter(r => !r.rec.client_notion_id);

  console.log(`\n── RECONCILE portfolio_holdings  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`Notion holdings: ${notionRecs.length}   Supabase holdings: ${sbRows.length}`);
  console.log(`\n➕ INSERT: ${toInsert.length}`);
  toInsert.slice(0, 8).forEach(r => console.log(`   • [${r.rec.advisor}] ${(r.rec.holding_name as string).slice(0, 38)}  ${r.rec.currency ?? '-'} ${r.rec.value_myr ?? 0}`));
  console.log(`\n✏️  UPDATE: ${toUpdate.length}`);
  toUpdate.slice(0, 8).forEach(u => console.log(`   • ${(u.rec.holding_name as string).slice(0, 30)} | ${u.diffs.join(', ')}`));
  console.log(`\n🗑️  ORPHAN (in Supabase, gone from Notion): ${orphans.length}`);
  orphans.slice(0, 8).forEach(r => console.log(`   • ${((r.holding_name as string) || '').slice(0, 40)}`));
  console.log(`\nℹ️  Supabase holdings with null notion_id: ${nullNotion.length}`);
  console.log(`ℹ️  Notion holdings with no client link: ${noClient.length}`);

  if (!APPLY) {
    console.log('\n(dry-run — no changes written. Re-run with --apply to sync.)');
    await db.end(); return;
  }

  const cols = ['notion_id', ...COLS];
  const ph$ = cols.map((_, i) => `$${i + 1}`).join(',');
  let ins = 0, upd = 0, del = 0;
  for (const r of toInsert) {
    await db.query(`insert into portfolio_holdings (${cols.join(',')}) values (${ph$})`, [r.notion_id, ...COLS.map(c => r.rec[c])]);
    ins++;
  }
  for (const u of toUpdate) {
    const setSql = COLS.map((c, i) => `${c}=$${i + 2}`).join(', ');
    await db.query(`update portfolio_holdings set ${setSql} where notion_id=$1`, [u.notion_id, ...COLS.map(c => u.rec[c])]);
    upd++;
  }
  for (const r of orphans) { await db.query(`delete from portfolio_holdings where id=$1`, [r.id]); del++; }
  console.log(`\n✅ APPLIED — inserted ${ins}, updated ${upd}, deleted ${del} orphans.`);
  const total = (await db.query(`select count(*)::int n from portfolio_holdings`)).rows[0].n;
  console.log(`Supabase holdings now: ${total} (Notion: ${notionRecs.length})  match: ${total === notionRecs.length}`);
  await db.end();
}
main().catch(e => { console.error('reconcile crashed:', e); process.exit(1); });
