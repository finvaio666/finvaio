// Reconcile Notion (current authoritative) → Supabase tasks, keyed on notion_id.
// DEFAULT = dry-run (report only, NO writes). Pass --apply to actually upsert/delete.
//   Dry-run: node --env-file=.env.local --import tsx scripts/reconcile-tasks.ts
//   Apply:   node --env-file=.env.local --import tsx scripts/reconcile-tasks.ts --apply
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_ID = process.env.COMPANY_TASKS_DB_ID!;

type P = Record<string, unknown>;
const rt  = (p: P, k: string) => { const v = p[k] as { type: string; rich_text?: { plain_text: string }[] }; return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : ''; };
const sel = (p: P, k: string) => { const v = p[k] as { type: string; select?: { name: string } }; return v?.type === 'select' ? (v.select?.name ?? '') : ''; };
const dt  = (p: P, k: string) => { const v = p[k] as { type: string; date?: { start: string } | null }; return v?.type === 'date' ? (v.date?.start ?? '').slice(0, 10) : ''; };
const title = (p: P) => { const v = p['Task'] as { type: string; title?: { plain_text: string }[] }; return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : ''; };

interface Rec { notion_id: string; task: string; client: string; status: string; type: string; due_date: string; done_date: string; source: string; advisor: string; }
const FIELDS: (keyof Omit<Rec, 'notion_id'>)[] = ['task', 'client', 'status', 'type', 'due_date', 'done_date', 'source', 'advisor'];
const norm = (v: unknown) => (v ?? '').toString().trim();
const normDate = (v: unknown) => (v ?? '').toString().slice(0, 10);

async function main() {
  // ── read all Notion tasks (paginate past 100) ──
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({ database_id: DB_ID, page_size: 100, start_cursor: cursor });
    pages.push(...res.results.filter(isFullPage));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const notionRecs: Rec[] = pages.map(pg => {
    const p = pg.properties as P;
    // Supabase stores notion_id dashless (32 hex); Notion API returns dashed (36). Normalize.
    return { notion_id: pg.id.replace(/-/g, ''), task: title(p), client: rt(p, 'Client'), status: sel(p, 'Status') === 'Done' ? 'Done' : 'Open',
      type: sel(p, 'Type'), due_date: dt(p, 'Due'), done_date: dt(p, 'Done'), source: rt(p, 'Source'), advisor: sel(p, 'Advisor') };
  }).filter(r => r.task);
  const notionById = new Map(notionRecs.map(r => [r.notion_id, r]));

  // ── read all Supabase tasks ──
  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();
  const sbRows = (await db.query(`select id, notion_id, task, client, status, type, due_date::text, done_date::text, source, advisor from tasks`)).rows;
  const sbById = new Map(sbRows.filter(r => r.notion_id).map(r => [r.notion_id as string, r]));

  const toInsert: Rec[] = [];
  const toUpdate: { rec: Rec; diffs: string[] }[] = [];
  for (const r of notionRecs) {
    const ex = sbById.get(r.notion_id);
    if (!ex) { toInsert.push(r); continue; }
    const diffs: string[] = [];
    for (const f of FIELDS) {
      const a = (f === 'due_date' || f === 'done_date') ? normDate(r[f]) : norm(r[f]);
      const b = (f === 'due_date' || f === 'done_date') ? normDate(ex[f]) : norm(ex[f]);
      if (a !== b) diffs.push(`${f}: "${b}" → "${a}"`);
    }
    if (diffs.length) toUpdate.push({ rec: r, diffs });
  }
  const orphans = sbRows.filter(r => r.notion_id && !notionById.has(r.notion_id));
  const nullNotion = sbRows.filter(r => !r.notion_id);

  // ── report ──
  console.log(`\n── RECONCILE tasks  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`Notion tasks: ${notionRecs.length}   Supabase tasks: ${sbRows.length}`);
  console.log(`\n➕ INSERT (in Notion, missing in Supabase): ${toInsert.length}`);
  toInsert.slice(0, 8).forEach(r => console.log(`   • [${r.advisor}] ${r.task.slice(0, 60)}`));
  console.log(`\n✏️  UPDATE (fields changed): ${toUpdate.length}`);
  toUpdate.slice(0, 8).forEach(u => console.log(`   • ${u.rec.task.slice(0, 45)} | ${u.diffs.join('; ')}`));
  console.log(`\n🗑️  ORPHAN (in Supabase, gone from Notion): ${orphans.length}`);
  orphans.slice(0, 8).forEach(r => console.log(`   • [${r.advisor}] ${(r.task||'').slice(0, 60)}`));
  console.log(`\nℹ️  Supabase tasks with null notion_id (created outside import): ${nullNotion.length}`);

  if (!APPLY) {
    console.log('\n(dry-run — no changes written. Re-run with --apply to sync.)');
    await db.end(); return;
  }

  // ── apply ──
  let ins = 0, upd = 0, del = 0;
  for (const r of toInsert) {
    await db.query(`insert into tasks (notion_id, task, client, status, type, due_date, done_date, source, advisor)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [r.notion_id, r.task, r.client || '', r.status, r.type || null, r.due_date || null, r.done_date || null, r.source || 'Manual', r.advisor || null]);
    ins++;
  }
  for (const { rec: r } of toUpdate) {
    await db.query(`update tasks set task=$2, client=$3, status=$4, type=$5, due_date=$6, done_date=$7, source=$8, advisor=$9 where notion_id=$1`,
      [r.notion_id, r.task, r.client || '', r.status, r.type || null, r.due_date || null, r.done_date || null, r.source || 'Manual', r.advisor || null]);
    upd++;
  }
  for (const r of orphans) { await db.query(`delete from tasks where id=$1`, [r.id]); del++; }
  console.log(`\n✅ APPLIED — inserted ${ins}, updated ${upd}, deleted ${del} orphans.`);
  const total = (await db.query(`select count(*)::int n from tasks`)).rows[0].n;
  console.log(`Supabase tasks now: ${total} (Notion: ${notionRecs.length})  match: ${total === notionRecs.length}`);
  await db.end();
}
main().catch(e => { console.error('reconcile crashed:', e); process.exit(1); });
