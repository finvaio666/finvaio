// Reconcile Notion (authoritative) → Supabase assets_liabilities, keyed on notion_id.
// DEFAULT = dry-run. Pass --apply to upsert/delete.
//   node --env-file=.env.local --import tsx scripts/reconcile-assets.ts [--apply]
//
// Notes:
//  • Client is a NAME STRING here (Notion 'Client' rich_text → `client` text), NOT a
//    relation — this table joins to clients by name (like tasks), not notion_id.
//  • CHECK: type IN (Asset/Liability). Empty selects → null (selN).
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_ID = process.env.COMPANY_ASSETS_DB_ID!;

if (APPLY && process.env.DATA_SOURCE_ASSETS === 'supabase') {
  console.error('✋ Refusing --apply: DATA_SOURCE_ASSETS=supabase (post-cutover). Supabase is authoritative.');
  process.exit(1);
}

type P = Record<string, unknown>;
const rt = (p: P, k: string) => { const v = p[k] as { type: string; rich_text?: { plain_text: string }[] }; return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : ''; };
const sel = (p: P, k: string) => { const v = p[k] as { type: string; select?: { name: string } | null }; return v?.type === 'select' ? (v.select?.name ?? '') : ''; };
const selN = (p: P, k: string): string | null => sel(p, k) || null;
const nnum = (p: P, k: string): number | null => { const v = p[k] as { type: string; number?: number | null }; return v?.type === 'number' ? (v.number ?? null) : null; };
const title = (p: P, k: string) => { const v = p[k] as { type: string; title?: { plain_text: string }[] }; return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : ''; };

const COLS = ['name', 'client', 'type', 'category', 'value_myr', 'notes', 'advisor'] as const;
type Col = typeof COLS[number];
type Rec = Record<Col, unknown>;
const NUM_COLS = new Set(['value_myr']);

function recFromNotion(pg: PageObjectResponse): Rec {
  const p = pg.properties as P;
  return {
    name:      title(p, 'Name'),
    client:    rt(p, 'Client'),
    type:      selN(p, 'Type'),
    category:  selN(p, 'Category'),
    value_myr: nnum(p, 'Value (MYR)'),
    notes:     rt(p, 'Notes'),
    advisor:   sel(p, 'Advisor'),
  };
}

function norm(col: Col, v: unknown): string {
  if (NUM_COLS.has(col)) return v == null || v === '' ? '' : String(Number(v));
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
    .filter(r => (r.rec.name as string).trim());
  const notionById = new Map(notionRecs.map(r => [r.notion_id, r]));

  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();
  const sbRows = (await db.query(`select id, notion_id, ${COLS.join(', ')} from assets_liabilities`)).rows as Record<string, unknown>[];
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

  console.log(`\n── RECONCILE assets_liabilities  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`Notion: ${notionRecs.length}   Supabase: ${sbRows.length}`);
  console.log(`\n➕ INSERT: ${toInsert.length}`);
  toInsert.slice(0, 10).forEach(r => console.log(`   • [${r.rec.advisor}] ${(r.rec.name as string).slice(0, 34)}  ${r.rec.type ?? '-'}  ${r.rec.client}  ${r.rec.value_myr ?? 0}`));
  console.log(`\n✏️  UPDATE: ${toUpdate.length}`);
  toUpdate.slice(0, 10).forEach(u => console.log(`   • ${(u.rec.name as string).slice(0, 30)} | ${u.diffs.join(', ')}`));
  console.log(`\n🗑️  ORPHAN: ${orphans.length}`);
  orphans.slice(0, 10).forEach(r => console.log(`   • ${((r.name as string) || '').slice(0, 40)}`));
  console.log(`\nℹ️  null notion_id: ${nullNotion.length}`);

  if (!APPLY) { console.log('\n(dry-run — no changes written.)'); await db.end(); return; }

  const cols = ['notion_id', ...COLS];
  const ph$ = cols.map((_, i) => `$${i + 1}`).join(',');
  let ins = 0, upd = 0, del = 0;
  for (const r of toInsert) { await db.query(`insert into assets_liabilities (${cols.join(',')}) values (${ph$})`, [r.notion_id, ...COLS.map(c => r.rec[c])]); ins++; }
  for (const u of toUpdate) {
    const setSql = COLS.map((c, i) => `${c}=$${i + 2}`).join(', ');
    await db.query(`update assets_liabilities set ${setSql} where notion_id=$1`, [u.notion_id, ...COLS.map(c => u.rec[c])]); upd++;
  }
  for (const r of orphans) { await db.query(`delete from assets_liabilities where id=$1`, [r.id]); del++; }
  console.log(`\n✅ APPLIED — inserted ${ins}, updated ${upd}, deleted ${del} orphans.`);
  const total = (await db.query(`select count(*)::int n from assets_liabilities`)).rows[0].n;
  console.log(`Supabase now: ${total} (Notion: ${notionRecs.length})  match: ${total === notionRecs.length}`);
  await db.end();
}
main().catch(e => { console.error('reconcile crashed:', e); process.exit(1); });
