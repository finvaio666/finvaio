// Reconcile Notion (current authoritative) Users DB → Supabase public.users, keyed on notion_id.
// DEFAULT = dry-run (report only, NO writes). Pass --apply to actually upsert.
//   Dry-run: node --env-file=.env.local --import tsx scripts/reconcile-users.ts
//   Apply:   node --env-file=.env.local --import tsx scripts/reconcile-users.ts --apply
//
// Cutover-prep tool — run once before flipping DATA_SOURCE_USERS. Nothing in the
// app depends on this script.
//
// Notes:
//  • Unlike the table reconcilers, this does NOT delete unmatched Supabase rows.
//    Users may be Supabase-native (created after migration, e.g. via the admin
//    console with useSupabaseUsers() already on) — deleting them would destroy
//    real accounts. Orphans (non-null notion_id absent from Notion) are reported,
//    never removed.
//  • password_hash IS synced (unlike most config fields it can drift from a
//    Notion-side password reset) — omitting it would leave Supabase login using
//    a stale hash after cutover.
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_ID = process.env.NOTION_USERS_DB_ID!;

// Post-cutover guard: once DATA_SOURCE_USERS=supabase, Supabase is authoritative —
// applying would overwrite newer Supabase edits (password resets, token refreshes,
// Supabase-native users) with stale Notion values.
if (APPLY && process.env.DATA_SOURCE_USERS === 'supabase') {
  console.error('✋ Refusing --apply: DATA_SOURCE_USERS=supabase (post-cutover).');
  process.exit(1);
}

type P = Record<string, unknown>;
const rt = (p: P, k: string) => { const v = p[k] as { type: string; rich_text?: { plain_text: string }[] }; return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : ''; };
const sel = (p: P, k: string) => { const v = p[k] as { type: string; select?: { name: string } | null }; return v?.type === 'select' ? (v.select?.name ?? '') : ''; };
const title = (p: P, k: string) => { const v = p[k] as { type: string; title?: { plain_text: string }[] }; return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : ''; };
const cb = (p: P, k: string): boolean => { const v = p[k] as { type: string; checkbox?: boolean }; return v?.type === 'checkbox' ? !!v.checkbox : false; };

// Property → column map (per task-5 brief). All *_db_id / token / address /
// provider / json fields are Notion rich_text, mirroring getAdvisorConfig.ts.
const COLS = [
  'name', 'username', 'password_hash', 'role', 'active', 'features',
  'notion_api_key', 'clients_db_id', 'portfolio_db_id', 'insurance_db_id',
  'cashflow_db_id', 'meeting_notes_db_id', 'tasks_db_id',
  'gmail_refresh_token', 'gmail_address', 'outlook_refresh_token', 'outlook_address',
  'email_provider', 'calendar_provider', 'calendar_refresh_token', 'calendar_address',
  'drive_refresh_token', 'institutions_json',
] as const;
type Col = typeof COLS[number];
type Rec = Record<Col, unknown>;

function recFromNotion(pg: PageObjectResponse): Rec {
  const p = pg.properties as P;
  return {
    name:                   title(p, 'Name'),
    username:               rt(p, 'Username'),
    password_hash:          rt(p, 'Password Hash'),
    role:                   sel(p, 'Role'),
    active:                 cb(p, 'Active'),
    features:               rt(p, 'Features'),
    notion_api_key:         rt(p, 'Notion API Key'),
    clients_db_id:          rt(p, 'Clients DB ID'),
    portfolio_db_id:        rt(p, 'Portfolio DB ID'),
    insurance_db_id:        rt(p, 'Insurance DB ID'),
    cashflow_db_id:         rt(p, 'Cashflow DB ID'),
    meeting_notes_db_id:    rt(p, 'Meeting Notes DB ID'),
    tasks_db_id:            rt(p, 'Tasks DB ID'),
    gmail_refresh_token:    rt(p, 'Gmail Refresh Token'),
    gmail_address:          rt(p, 'Gmail Address'),
    outlook_refresh_token:  rt(p, 'Outlook Refresh Token'),
    outlook_address:        rt(p, 'Outlook Address'),
    email_provider:         rt(p, 'Email Provider'),
    calendar_provider:      rt(p, 'Calendar Provider'),
    calendar_refresh_token: rt(p, 'Calendar Refresh Token'),
    calendar_address:       rt(p, 'Calendar Address'),
    drive_refresh_token:    rt(p, 'Drive Refresh Token'),
    institutions_json:      rt(p, 'Institutions JSON'),
  };
}

function norm(col: Col, v: unknown): string {
  if (col === 'active') return v ? 'true' : 'false';
  return (v ?? '').toString().trim();
}

async function main() {
  // ── read all Notion users (paginate past 100) ──
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({ database_id: DB_ID, page_size: 100, start_cursor: cursor });
    pages.push(...res.results.filter(isFullPage));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const notionRecs = pages
    // Supabase stores notion_id dashless (32 hex); Notion API returns dashed (36). Normalize.
    .map(pg => ({ notion_id: pg.id.replace(/-/g, ''), rec: recFromNotion(pg) }))
    .filter(r => (r.rec.name as string).trim());
  const notionById = new Map(notionRecs.map(r => [r.notion_id, r]));

  // ── read all Supabase users ──
  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();
  const sbRows = (await db.query(
    `select id, notion_id, ${COLS.join(', ')} from users`
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
  // ORPHANS: users may be Supabase-native (created post-migration) — report only, never delete.
  const orphans = sbRows.filter(r => r.notion_id && !notionById.has(r.notion_id as string));
  const nullNotion = sbRows.filter(r => !r.notion_id);

  // ── report ──
  console.log(`\n── RECONCILE users  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`Notion users: ${notionRecs.length}   Supabase users: ${sbRows.length}`);
  console.log(`\n➕ INSERT (in Notion, missing in Supabase): ${toInsert.length}`);
  toInsert.slice(0, 10).forEach(r => console.log(`   • [${r.rec.role}] ${(r.rec.name as string).slice(0, 40)} (${r.rec.username})`));
  console.log(`\n✏️  UPDATE (fields changed): ${toUpdate.length}`);
  toUpdate.slice(0, 10).forEach(u => console.log(`   • ${(u.rec.name as string).slice(0, 34)} | ${u.diffs.join(', ')}`));
  console.log(`\n⚠️  ORPHAN (notion_id set, gone from Notion — NOT deleted, may be Supabase-native): ${orphans.length}`);
  orphans.slice(0, 10).forEach(r => console.log(`   • notion_id=${r.notion_id}  ${((r.name as string) || '').slice(0, 40)} (${r.username})`));
  console.log(`\nℹ️  Supabase users with null notion_id (Supabase-native, created outside import): ${nullNotion.length}`);

  if (!APPLY) {
    console.log('\n(dry-run — no changes written. Re-run with --apply to sync.)');
    await db.end(); return;
  }

  // ── apply — insert/update only; orphans are never deleted ──
  const cols = ['notion_id', ...COLS];
  const ph$ = cols.map((_, i) => `$${i + 1}`).join(',');
  let ins = 0, upd = 0;
  for (const r of toInsert) {
    await db.query(`insert into users (${cols.join(',')}) values (${ph$})`, [r.notion_id, ...COLS.map(c => r.rec[c])]);
    ins++;
  }
  for (const u of toUpdate) {
    const setSql = COLS.map((c, i) => `${c}=$${i + 2}`).join(', ');
    await db.query(`update users set ${setSql} where notion_id=$1`, [u.notion_id, ...COLS.map(c => u.rec[c])]);
    upd++;
  }
  console.log(`\n✅ APPLIED — inserted ${ins}, updated ${upd}. Orphans left untouched: ${orphans.length}.`);
  const total = (await db.query(`select count(*)::int n from users`)).rows[0].n;
  console.log(`Supabase users now: ${total} (Notion: ${notionRecs.length})`);
  await db.end();
}
main().catch(e => { console.error('reconcile crashed:', e); process.exit(1); });
