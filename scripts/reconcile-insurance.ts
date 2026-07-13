// Reconcile Notion (authoritative) → Supabase insurance_policies, keyed on notion_id.
// DEFAULT = dry-run (report only, NO writes). Pass --apply to upsert/delete.
//   Dry-run: node --env-file=.env.local --import tsx scripts/reconcile-insurance.ts
//   Apply:   node --env-file=.env.local --import tsx scripts/reconcile-insurance.ts --apply
//
// Notes:
//  • client link = Notion "Clients" relation[0] → client_notion_id (= clients.notion_id).
//  • CHECK constraints: insurance_type IN (ILP/IUL/UL/VUL/Term Life/Endowment),
//    status IN (Active/Lapsed/Surrendered). Empty selects → null (selN).
//  • benefits (multi_select) → text[] array.
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_ID = process.env.COMPANY_INSURANCE_DB_ID!;

if (APPLY && process.env.DATA_SOURCE_INSURANCE === 'supabase') {
  console.error('✋ Refusing --apply: DATA_SOURCE_INSURANCE=supabase (post-cutover). Supabase is now');
  console.error('   authoritative; syncing Notion → Supabase would clobber newer Supabase edits.');
  process.exit(1);
}

type P = Record<string, unknown>;
const rt = (p: P, k: string) => { const v = p[k] as { type: string; rich_text?: { plain_text: string }[] }; return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : ''; };
const sel = (p: P, k: string) => { const v = p[k] as { type: string; select?: { name: string } | null }; return v?.type === 'select' ? (v.select?.name ?? '') : ''; };
const selN = (p: P, k: string): string | null => sel(p, k) || null;
const ms = (p: P, k: string): string[] => { const v = p[k] as { type: string; multi_select?: { name: string }[] }; return v?.type === 'multi_select' ? (v.multi_select ?? []).map(o => o.name) : []; };
const nnum = (p: P, k: string): number | null => { const v = p[k] as { type: string; number?: number | null }; return v?.type === 'number' ? (v.number ?? null) : null; };
const dt = (p: P, k: string): string | null => { const v = p[k] as { type: string; date?: { start: string } | null }; return v?.type === 'date' ? ((v.date?.start ?? '').slice(0, 10) || null) : null; };
const title = (p: P, k: string) => { const v = p[k] as { type: string; title?: { plain_text: string }[] }; return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : ''; };
const relFirst = (p: P, k: string): string | null => { const v = p[k] as { type: string; relation?: { id: string }[] }; return v?.type === 'relation' ? (v.relation?.[0]?.id.replace(/-/g, '') ?? null) : null; };

const COLS = [
  'policy_name', 'client_notion_id', 'policy_number', 'policy_owner', 'life_assured', 'insurer',
  'insurance_type', 'benefits', 'annual_premium_myr', 'sum_assured_myr', 'life_cover_myr',
  'ci_cover_myr', 'tpd_cover_myr', 'pa_cover_myr', 'medical_card', 'medical_class', 'beneficiary',
  'commencement_date', 'maturity_date', 'status', 'notes', 'advisor',
] as const;
type Col = typeof COLS[number];
type Rec = Record<Col, unknown>;
const NUM_COLS = new Set(['annual_premium_myr', 'sum_assured_myr', 'life_cover_myr', 'ci_cover_myr', 'tpd_cover_myr', 'pa_cover_myr']);
const DATE_COLS = new Set(['commencement_date', 'maturity_date']);

function recFromNotion(pg: PageObjectResponse): Rec {
  const p = pg.properties as P;
  return {
    policy_name:       title(p, 'Policy Name'),
    client_notion_id:  relFirst(p, 'Clients'),
    policy_number:     rt(p, 'Policy Number'),
    policy_owner:      rt(p, 'Policy Owner'),
    life_assured:      rt(p, 'Life Assured'),
    insurer:           rt(p, 'Insurer'),
    insurance_type:    selN(p, 'Insurance Type'),
    benefits:          ms(p, 'Benefits'),
    annual_premium_myr: nnum(p, 'Annual Premium (MYR)'),
    sum_assured_myr:   nnum(p, 'Sum Assured (MYR)'),
    life_cover_myr:    nnum(p, 'Life Cover (MYR)'),
    ci_cover_myr:      nnum(p, 'CI Cover (MYR)'),
    tpd_cover_myr:     nnum(p, 'TPD Cover (MYR)'),
    pa_cover_myr:      nnum(p, 'PA Cover (MYR)'),
    medical_card:      rt(p, 'Medical Card'),
    medical_class:     rt(p, 'Medical Class'),
    beneficiary:       rt(p, 'Beneficiary'),
    commencement_date: dt(p, 'Commencement Date'),
    maturity_date:     dt(p, 'Maturity Date'),
    status:            selN(p, 'Status'),
    notes:             rt(p, 'Notes'),
    advisor:           sel(p, 'Advisor'),
  };
}

function norm(col: Col, v: unknown): string {
  if (col === 'benefits') return JSON.stringify([...((v as string[]) ?? [])].sort());
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
    .filter(r => (r.rec.policy_name as string).trim());
  const notionById = new Map(notionRecs.map(r => [r.notion_id, r]));

  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();
  const selCols = `id, notion_id, ${COLS.map(c => DATE_COLS.has(c) ? `${c}::text` : c).join(', ')}`;
  const sbRows = (await db.query(`select ${selCols} from insurance_policies`)).rows as Record<string, unknown>[];
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

  console.log(`\n── RECONCILE insurance_policies  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`Notion policies: ${notionRecs.length}   Supabase policies: ${sbRows.length}`);
  console.log(`\n➕ INSERT: ${toInsert.length}`);
  toInsert.slice(0, 8).forEach(r => console.log(`   • [${r.rec.advisor}] ${(r.rec.policy_name as string).slice(0, 38)}  ${r.rec.insurance_type ?? '-'} SA=${r.rec.sum_assured_myr ?? 0}`));
  console.log(`\n✏️  UPDATE: ${toUpdate.length}`);
  toUpdate.slice(0, 8).forEach(u => console.log(`   • ${(u.rec.policy_name as string).slice(0, 30)} | ${u.diffs.join(', ')}`));
  console.log(`\n🗑️  ORPHAN (in Supabase, gone from Notion): ${orphans.length}`);
  orphans.slice(0, 8).forEach(r => console.log(`   • ${((r.policy_name as string) || '').slice(0, 40)}`));
  console.log(`\nℹ️  Supabase policies with null notion_id: ${nullNotion.length}`);
  console.log(`ℹ️  Notion policies with no client link: ${noClient.length}`);

  if (!APPLY) {
    console.log('\n(dry-run — no changes written. Re-run with --apply to sync.)');
    await db.end(); return;
  }

  const cols = ['notion_id', ...COLS];
  const ph$ = cols.map((_, i) => `$${i + 1}`).join(',');
  let ins = 0, upd = 0, del = 0;
  for (const r of toInsert) {
    await db.query(`insert into insurance_policies (${cols.join(',')}) values (${ph$})`, [r.notion_id, ...COLS.map(c => r.rec[c])]);
    ins++;
  }
  for (const u of toUpdate) {
    const setSql = COLS.map((c, i) => `${c}=$${i + 2}`).join(', ');
    await db.query(`update insurance_policies set ${setSql} where notion_id=$1`, [u.notion_id, ...COLS.map(c => u.rec[c])]);
    upd++;
  }
  for (const r of orphans) { await db.query(`delete from insurance_policies where id=$1`, [r.id]); del++; }
  console.log(`\n✅ APPLIED — inserted ${ins}, updated ${upd}, deleted ${del} orphans.`);
  const total = (await db.query(`select count(*)::int n from insurance_policies`)).rows[0].n;
  console.log(`Supabase policies now: ${total} (Notion: ${notionRecs.length})  match: ${total === notionRecs.length}`);
  await db.end();
}
main().catch(e => { console.error('reconcile crashed:', e); process.exit(1); });
