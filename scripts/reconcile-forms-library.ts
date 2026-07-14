// Reconcile Notion (authoritative) → Supabase forms_library, keyed on notion_id.
// DEFAULT = dry-run. Pass --apply to upsert/delete.
//   node --env-file=.env.local --import tsx scripts/reconcile-forms-library.ts [--apply]
//
// Notes:
//  • Company-wide shared catalogue; PDF bodies live in Google Drive — this table
//    holds only metadata + field mapping (pdf_url points at Drive). Both Notion
//    and Supabase are currently EMPTY (no forms uploaded yet), so this is a no-op
//    until forms exist; the script is ready for that day.
//  • CHECK: form_type IN ('Fillable PDF','Scanned PDF') — empty select → null.
//  • tags = multi_select → text[]; field_mapping = rich_text JSON → text (verbatim).
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_ID = process.env.COMPANY_FORMS_DB_ID!;

if (APPLY && process.env.DATA_SOURCE_FORMS === 'supabase') {
  console.error('✋ Refusing --apply: DATA_SOURCE_FORMS=supabase (post-cutover). Supabase is authoritative.');
  process.exit(1);
}

type P = Record<string, unknown>;
const rt = (p: P, k: string) => { const v = p[k] as { type: string; rich_text?: { plain_text: string }[] }; return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : ''; };
const sel = (p: P, k: string) => { const v = p[k] as { type: string; select?: { name: string } | null }; return v?.type === 'select' ? (v.select?.name ?? '') : ''; };
const selN = (p: P, k: string): string | null => sel(p, k) || null;
const dateOf = (p: P, k: string): string | null => { const v = p[k] as { type: string; date?: { start: string } | null }; return v?.type === 'date' ? (v.date?.start ?? null) : null; };
const title = (p: P, k: string) => { const v = p[k] as { type: string; title?: { plain_text: string }[] }; return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : ''; };
const cb = (p: P, k: string): boolean => { const v = p[k] as { type: string; checkbox?: boolean }; return v?.type === 'checkbox' ? !!v.checkbox : false; };
const ms = (p: P, k: string): string[] => { const v = p[k] as { type: string; multi_select?: { name: string }[] }; return v?.type === 'multi_select' ? (v.multi_select ?? []).map(t => t.name) : []; };

const COLS = ['name', 'category', 'form_type', 'provider', 'pdf_url', 'field_mapping', 'tags', 'active', 'last_updated'] as const;
type Col = typeof COLS[number];
type Rec = Record<Col, unknown>;
const DATE_COLS = new Set(['last_updated']);
const BOOL_COLS = new Set(['active']);
const ARR_COLS = new Set(['tags']);

function recFromNotion(pg: PageObjectResponse): Rec {
  const p = pg.properties as P;
  return {
    name:          title(p, 'Name'),
    category:      selN(p, 'Category'),
    form_type:     selN(p, 'Form Type'),
    provider:      selN(p, 'Provider'),
    pdf_url:       rt(p, 'PDF URL'),
    field_mapping: rt(p, 'Field Mapping'),
    tags:          ms(p, 'Tags'),
    active:        cb(p, 'Active'),
    last_updated:  dateOf(p, 'Last Updated'),
  };
}

function norm(col: Col, v: unknown): string {
  if (DATE_COLS.has(col)) return v == null ? '' : String(v).slice(0, 10);
  if (BOOL_COLS.has(col)) return v ? 'true' : 'false';
  if (ARR_COLS.has(col)) return JSON.stringify(Array.isArray(v) ? v : []);
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
  const sbRows = (await db.query(
    `select id, notion_id, name, category, form_type, provider, pdf_url, field_mapping, tags, active,
            to_char(last_updated,'YYYY-MM-DD') as last_updated
     from forms_library`
  )).rows as Record<string, unknown>[];
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

  console.log(`\n── RECONCILE forms_library  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`Notion: ${notionRecs.length}   Supabase: ${sbRows.length}`);
  console.log(`\n➕ INSERT: ${toInsert.length}`);
  toInsert.slice(0, 10).forEach(r => console.log(`   • ${(r.rec.name as string).slice(0, 40)}  ${r.rec.form_type ?? '-'}  active=${r.rec.active}`));
  console.log(`\n✏️  UPDATE: ${toUpdate.length}`);
  toUpdate.slice(0, 10).forEach(u => console.log(`   • ${(u.rec.name as string).slice(0, 34)} | ${u.diffs.join(', ')}`));
  console.log(`\n🗑️  ORPHAN: ${orphans.length}`);
  orphans.slice(0, 10).forEach(r => console.log(`   • ${((r.name as string) || '').slice(0, 40)}`));
  console.log(`\nℹ️  null notion_id: ${nullNotion.length}`);

  if (!APPLY) { console.log('\n(dry-run — no changes written.)'); await db.end(); return; }

  const cols = ['notion_id', ...COLS];
  const ph$ = cols.map((_, i) => `$${i + 1}`).join(',');
  let ins = 0, upd = 0, del = 0;
  for (const r of toInsert) { await db.query(`insert into forms_library (${cols.join(',')}) values (${ph$})`, [r.notion_id, ...COLS.map(c => r.rec[c])]); ins++; }
  for (const u of toUpdate) {
    const setSql = COLS.map((c, i) => `${c}=$${i + 2}`).join(', ');
    await db.query(`update forms_library set ${setSql} where notion_id=$1`, [u.notion_id, ...COLS.map(c => u.rec[c])]); upd++;
  }
  for (const r of orphans) { await db.query(`delete from forms_library where id=$1`, [r.id]); del++; }
  console.log(`\n✅ APPLIED — inserted ${ins}, updated ${upd}, deleted ${del} orphans.`);
  const total = (await db.query(`select count(*)::int n from forms_library`)).rows[0].n;
  console.log(`Supabase now: ${total} (Notion: ${notionRecs.length})  match: ${total === notionRecs.length}`);
  await db.end();
}
main().catch(e => { console.error('reconcile crashed:', e); process.exit(1); });
