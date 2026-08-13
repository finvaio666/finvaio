// Reconcile Notion (authoritative) → Supabase ai_usage_log, keyed on notion_id.
// DEFAULT = dry-run. Pass --apply to upsert/delete.
//   node --env-file=.env.local --import tsx scripts/reconcile-ai-usage.ts [--apply]
//
// Notes:
//  • Write-only log table (no in-app reader). logAiUsage() appends one row per AI
//    call. This reconcile keeps the Supabase copy in sync with the Notion source.
//  • All 50 seed rows already have clean 32-char notion_ids (no prefix defect).
//  • total_tokens is stored as reported by the model (may exceed input+output —
//    e.g. thinking tokens), so it is copied verbatim, never recomputed.
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_ID = process.env.COMPANY_AI_USAGE_DB_ID!;

if (APPLY && process.env.DATA_SOURCE_AI_USAGE === 'supabase') {
  console.error('✋ Refusing --apply: DATA_SOURCE_AI_USAGE=supabase (post-cutover). Supabase is authoritative.');
  process.exit(1);
}

type P = Record<string, unknown>;
const rt = (p: P, k: string) => { const v = p[k] as { type: string; rich_text?: { plain_text: string }[] }; return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : ''; };
const sel = (p: P, k: string) => { const v = p[k] as { type: string; select?: { name: string } | null }; return v?.type === 'select' ? (v.select?.name ?? '') : ''; };
const dateOf = (p: P, k: string): string | null => { const v = p[k] as { type: string; date?: { start: string } | null }; return v?.type === 'date' ? (v.date?.start ?? null) : null; };
const nnum = (p: P, k: string): number | null => { const v = p[k] as { type: string; number?: number | null }; return v?.type === 'number' ? (v.number ?? null) : null; };
const title = (p: P, k: string) => { const v = p[k] as { type: string; title?: { plain_text: string }[] }; return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : ''; };

const COLS = ['entry', 'advisor', 'date', 'feature', 'question', 'input_tokens', 'output_tokens', 'total_tokens'] as const;
type Col = typeof COLS[number];
type Rec = Record<Col, unknown>;
const NUM_COLS = new Set(['input_tokens', 'output_tokens', 'total_tokens']);

function recFromNotion(pg: PageObjectResponse): Rec {
  const p = pg.properties as P;
  return {
    entry:         title(p, 'Entry'),
    advisor:       sel(p, 'Advisor'),
    date:          dateOf(p, 'Date'),
    feature:       sel(p, 'Feature'),
    question:      rt(p, 'Question'),
    input_tokens:  nnum(p, 'Input Tokens'),
    output_tokens: nnum(p, 'Output Tokens'),
    total_tokens:  nnum(p, 'Total Tokens'),
  };
}

function norm(col: Col, v: unknown): string {
  if (NUM_COLS.has(col)) return v == null || v === '' ? '' : String(Number(v));
  if (col === 'date') return v == null ? '' : String(v).slice(0, 10);
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
    .filter(r => (r.rec.entry as string).trim());
  const notionById = new Map(notionRecs.map(r => [r.notion_id, r]));

  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();
  const sbRows = (await db.query(
    `select id, notion_id, entry, advisor, to_char(date,'YYYY-MM-DD') as date, feature, question,
            input_tokens, output_tokens, total_tokens
     from ai_usage_log`
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

  console.log(`\n── RECONCILE ai_usage_log  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`Notion: ${notionRecs.length}   Supabase: ${sbRows.length}`);
  console.log(`\n➕ INSERT: ${toInsert.length}`);
  toInsert.slice(0, 10).forEach(r => console.log(`   • [${r.rec.advisor}] ${(r.rec.entry as string).slice(0, 46)}  tok=${r.rec.total_tokens ?? 0}`));
  console.log(`\n✏️  UPDATE: ${toUpdate.length}`);
  toUpdate.slice(0, 10).forEach(u => console.log(`   • ${(u.rec.entry as string).slice(0, 40)} | ${u.diffs.join(', ')}`));
  console.log(`\n🗑️  ORPHAN: ${orphans.length}`);
  orphans.slice(0, 10).forEach(r => console.log(`   • notion_id=${r.notion_id} (len ${(r.notion_id as string)?.length})  ${((r.entry as string) || '').slice(0, 40)}`));
  console.log(`\nℹ️  null notion_id: ${nullNotion.length}`);

  if (!APPLY) { console.log('\n(dry-run — no changes written.)'); await db.end(); return; }

  const cols = ['notion_id', ...COLS];
  const ph$ = cols.map((_, i) => `$${i + 1}`).join(',');
  let ins = 0, upd = 0, del = 0;
  for (const r of toInsert) { await db.query(`insert into ai_usage_log (${cols.join(',')}) values (${ph$})`, [r.notion_id, ...COLS.map(c => r.rec[c])]); ins++; }
  for (const u of toUpdate) {
    const setSql = COLS.map((c, i) => `${c}=$${i + 2}`).join(', ');
    await db.query(`update ai_usage_log set ${setSql} where notion_id=$1`, [u.notion_id, ...COLS.map(c => u.rec[c])]); upd++;
  }
  for (const r of orphans) { await db.query(`delete from ai_usage_log where id=$1`, [r.id]); del++; }
  console.log(`\n✅ APPLIED — inserted ${ins}, updated ${upd}, deleted ${del} orphans.`);
  const total = (await db.query(`select count(*)::int n from ai_usage_log`)).rows[0].n;
  console.log(`Supabase now: ${total} (Notion: ${notionRecs.length})  match: ${total === notionRecs.length}`);
  await db.end();
}
main().catch(e => { console.error('reconcile crashed:', e); process.exit(1); });
