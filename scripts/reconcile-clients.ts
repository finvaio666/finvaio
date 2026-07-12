// Reconcile Notion (authoritative) → Supabase clients, keyed on notion_id.
// DEFAULT = dry-run (report only, NO writes). Pass --apply to upsert/delete.
//   Dry-run: node --env-file=.env.local --import tsx scripts/reconcile-clients.ts
//   Apply:   node --env-file=.env.local --import tsx scripts/reconcile-clients.ts --apply
//
// Notes:
//  • Uses the REAL Notion property names + types (Email=email, Phone=phone_number,
//    'Next review date', etc.) — NOT the buggy rich_text mapping the old routes used.
//  • aum_myr is intentionally NOT written here — it is recomputed from portfolio
//    holdings after Phase 2.2 (user decision 2026-07-12). New rows get null aum.
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_ID = process.env.COMPANY_CLIENTS_DB_ID!;

// Post-cutover guard: once DATA_SOURCE_CLIENTS=supabase, Supabase is authoritative —
// applying would overwrite newer Supabase edits with stale Notion values.
// NOTE: this only sees the LOCAL .env.local flag; always confirm the Vercel
// (production) flag is still 'notion' before running --apply.
if (APPLY && process.env.DATA_SOURCE_CLIENTS === 'supabase') {
  console.error('✋ Refusing --apply: DATA_SOURCE_CLIENTS=supabase (post-cutover). Supabase is now');
  console.error('   authoritative; syncing Notion → Supabase would clobber newer Supabase edits.');
  process.exit(1);
}

type P = Record<string, unknown>;
const rt = (p: P, k: string) => { const v = p[k] as { type: string; rich_text?: { plain_text: string }[] }; return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : ''; };
const em = (p: P, k: string) => { const v = p[k] as { type: string; email?: string | null }; return v?.type === 'email' ? (v.email ?? '') : ''; };
const ph = (p: P, k: string) => { const v = p[k] as { type: string; phone_number?: string | null }; return v?.type === 'phone_number' ? (v.phone_number ?? '') : ''; };
const sel = (p: P, k: string) => { const v = p[k] as { type: string; select?: { name: string } | null }; return v?.type === 'select' ? (v.select?.name ?? '') : ''; };
const ms = (p: P, k: string) => { const v = p[k] as { type: string; multi_select?: { name: string }[] }; return v?.type === 'multi_select' ? (v.multi_select ?? []).map(o => o.name) : []; };
const nnum = (p: P, k: string): number | null => { const v = p[k] as { type: string; number?: number | null }; return v?.type === 'number' ? (v.number ?? null) : null; };
const dt = (p: P, k: string): string | null => { const v = p[k] as { type: string; date?: { start: string } | null }; return v?.type === 'date' ? ((v.date?.start ?? '').slice(0, 10) || null) : null; };
const title = (p: P, k: string) => { const v = p[k] as { type: string; title?: { plain_text: string }[] }; return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : ''; };

// Columns written by this script (aum_myr deliberately excluded).
const COLS = [
  'client_name', 'phone', 'email', 'date_of_birth', 'client_segment', 'risk_profile',
  'monthly_income_myr', 'financial_goals', 'status', 'onboarding_date', 'last_review_date',
  'next_review_date', 'advisor', 'fame_accounts', 'invested_capital_myr', 'fame_sync_date',
  'client_type', 'nric_reg_no', 'epf_account_no', 'occupation',
] as const;
type Col = typeof COLS[number];
type Rec = Record<Col, unknown>;

function recFromNotion(pg: PageObjectResponse): Rec {
  const p = pg.properties as P;
  return {
    client_name:          title(p, 'Client Name'),
    phone:                ph(p, 'Phone'),
    email:                em(p, 'Email'),
    date_of_birth:        dt(p, 'Date of Birth'),
    client_segment:       sel(p, 'Client Segment'),
    risk_profile:         sel(p, 'Risk Profile'),
    monthly_income_myr:   nnum(p, 'Monthly income (MYR)'),
    financial_goals:      ms(p, 'Financial goals'),
    status:               sel(p, 'Status'),
    onboarding_date:      dt(p, 'Onboarding date'),
    last_review_date:     dt(p, 'Last review date'),
    next_review_date:     dt(p, 'Next review date'),
    advisor:              sel(p, 'Advisor'),
    fame_accounts:        rt(p, 'FAME Accounts'),
    invested_capital_myr: nnum(p, 'Invested Capital (MYR)'),
    fame_sync_date:       dt(p, 'FAME Sync Date'),
    client_type:          sel(p, 'Client Type'),
    nric_reg_no:          rt(p, 'NRIC / Reg No'),
    epf_account_no:       rt(p, 'EPF Account No'),
    occupation:           rt(p, 'Occupation'),
  };
}

function norm(col: Col, v: unknown): string {
  if (col === 'financial_goals') return JSON.stringify([...((v as string[]) ?? [])].sort());
  if (col === 'monthly_income_myr' || col === 'invested_capital_myr') return v == null || v === '' ? '' : String(Number(v));
  if (col.endsWith('_date') || col === 'date_of_birth') return (v ?? '').toString().slice(0, 10);
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
    .filter(r => (r.rec.client_name as string).trim());
  const notionById = new Map(notionRecs.map(r => [r.notion_id, r]));

  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();
  const selCols = `id, notion_id, ${COLS.map(c => (c.endsWith('_date') || c === 'date_of_birth') ? `${c}::text` : c).join(', ')}`;
  const sbRows = (await db.query(`select ${selCols} from clients`)).rows as Record<string, unknown>[];
  const sbById = new Map(sbRows.filter(r => r.notion_id).map(r => [r.notion_id as string, r]));

  const toInsert: typeof notionRecs = [];
  const toUpdate: { notion_id: string; rec: Rec; diffs: string[] }[] = [];
  for (const r of notionRecs) {
    const ex = sbById.get(r.notion_id);
    if (!ex) { toInsert.push(r); continue; }
    const diffs: string[] = [];
    for (const c of COLS) {
      if (norm(c, r.rec[c]) !== norm(c, ex[c])) diffs.push(c);
    }
    if (diffs.length) toUpdate.push({ notion_id: r.notion_id, rec: r.rec, diffs });
  }
  const orphans = sbRows.filter(r => r.notion_id && !notionById.has(r.notion_id as string));
  const nullNotion = sbRows.filter(r => !r.notion_id);

  console.log(`\n── RECONCILE clients  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`Notion clients: ${notionRecs.length}   Supabase clients: ${sbRows.length}`);
  console.log(`\n➕ INSERT (in Notion, missing in Supabase): ${toInsert.length}`);
  toInsert.slice(0, 10).forEach(r => console.log(`   • [${r.rec.advisor}] ${(r.rec.client_name as string).slice(0, 40)}  nric=${r.rec.nric_reg_no ? 'y' : '-'} epf=${r.rec.epf_account_no ? 'y' : '-'} phone=${r.rec.phone ? 'y' : '-'} email=${r.rec.email ? 'y' : '-'}`));
  console.log(`\n✏️  UPDATE (fields changed): ${toUpdate.length}`);
  toUpdate.slice(0, 10).forEach(u => console.log(`   • ${(u.rec.client_name as string).slice(0, 30)} | ${u.diffs.join(', ')}`));
  console.log(`\n🗑️  ORPHAN (in Supabase, gone from Notion): ${orphans.length}`);
  orphans.slice(0, 10).forEach(r => console.log(`   • [${r.advisor}] ${((r.client_name as string) || '').slice(0, 40)}`));
  console.log(`\nℹ️  Supabase clients with null notion_id: ${nullNotion.length}`);
  console.log(`ℹ️  aum_myr is NOT touched by this script (recomputed after portfolio migration).`);

  if (!APPLY) {
    console.log('\n(dry-run — no changes written. Re-run with --apply to sync.)');
    await db.end(); return;
  }

  const cols = ['notion_id', ...COLS];
  const ph$ = cols.map((_, i) => `$${i + 1}`).join(',');
  let ins = 0, upd = 0, del = 0;
  for (const r of toInsert) {
    await db.query(`insert into clients (${cols.join(',')}) values (${ph$})`, [r.notion_id, ...COLS.map(c => r.rec[c])]);
    ins++;
  }
  for (const u of toUpdate) {
    const setSql = COLS.map((c, i) => `${c}=$${i + 2}`).join(', ');
    await db.query(`update clients set ${setSql} where notion_id=$1`, [u.notion_id, ...COLS.map(c => u.rec[c])]);
    upd++;
  }
  for (const r of orphans) { await db.query(`delete from clients where id=$1`, [r.id]); del++; }
  console.log(`\n✅ APPLIED — inserted ${ins}, updated ${upd}, deleted ${del} orphans.`);
  const total = (await db.query(`select count(*)::int n from clients`)).rows[0].n;
  console.log(`Supabase clients now: ${total} (Notion: ${notionRecs.length})  match: ${total === notionRecs.length}`);
  await db.end();
}
main().catch(e => { console.error('reconcile crashed:', e); process.exit(1); });
