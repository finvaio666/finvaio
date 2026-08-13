// Backfill clients.aum_myr by recomputing from portfolio_holdings (Phase 2.2 follow-up).
// AUM per client = sum of holding MYR value (value_myr, else value_original * fx_rate).
// DEFAULT = dry-run (report only). Pass --apply to write.
//   Dry-run: node --env-file=.env.local --import tsx scripts/backfill-client-aum.ts
//   Apply:   node --env-file=.env.local --import tsx scripts/backfill-client-aum.ts --apply
//
// Authority for AUM is now the portfolio (per 2026-07-13 decision). Policy: only
// clients WITH holdings are recomputed; clients with NO portfolio holdings are left
// untouched (existing manual aum kept, nulls stay null) — matches the old sync-aum,
// which skipped clients with no holdings.
import pg from 'pg';

const APPLY = process.argv.includes('--apply');

async function main() {
  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();

  // Recomputed AUM per client (MYR), matching the portfolio page's value fallback.
  const aumRows = (await db.query(`
    select client_notion_id,
           round(sum(coalesce(value_myr, value_original_currency * fx_rate_to_myr, 0)))::numeric as aum
    from portfolio_holdings
    where client_notion_id is not null
    group by client_notion_id
  `)).rows as { client_notion_id: string; aum: string }[];
  const newAumByClient = new Map(aumRows.map(r => [r.client_notion_id, Number(r.aum)]));

  const clients = (await db.query(`select id, notion_id, client_name, aum_myr from clients`)).rows as
    { id: string; notion_id: string | null; client_name: string | null; aum_myr: string | null }[];

  let changed = 0, unchanged = 0, untouched = 0;
  let oldTotal = 0, newTotal = 0;
  const deltas: { name: string; old: number | null; neu: number; delta: number }[] = [];

  for (const c of clients) {
    const old = c.aum_myr == null ? null : Number(c.aum_myr);
    const hasHoldings = !!c.notion_id && newAumByClient.has(c.notion_id);
    if (!hasHoldings) { untouched++; oldTotal += old ?? 0; newTotal += old ?? 0; continue; } // no holdings → leave as-is
    const neu = newAumByClient.get(c.notion_id!)!;
    oldTotal += old ?? 0;
    newTotal += neu;
    if (old !== neu) { changed++; deltas.push({ name: c.client_name ?? '(no name)', old, neu, delta: neu - (old ?? 0) }); }
    else unchanged++;
  }

  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log(`\n── BACKFILL clients.aum_myr from portfolio  (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`policy: only clients WITH holdings are recomputed; no-holdings clients left untouched.`);
  console.log(`clients: ${clients.length}   will change: ${changed}   unchanged: ${unchanged}   untouched (no holdings): ${untouched}`);
  console.log(`total AUM (MYR):  old ${Math.round(oldTotal).toLocaleString()}  →  new ${Math.round(newTotal).toLocaleString()}`);
  console.log(`\nTop 15 changes (old → new  [Δ]):`);
  for (const d of deltas.slice(0, 15)) {
    const oldS = d.old == null ? 'null' : Math.round(d.old).toLocaleString();
    console.log(`   • ${d.name.slice(0, 26).padEnd(26)} ${oldS.padStart(12)} → ${Math.round(d.neu).toLocaleString().padStart(12)}  [${d.delta >= 0 ? '+' : ''}${Math.round(d.delta).toLocaleString()}]`);
  }
  const nullFilled = clients.filter(c => c.aum_myr == null && c.notion_id && newAumByClient.has(c.notion_id)).length;
  console.log(`\n(of the changes, ${nullFilled} clients currently have null aum + holdings → will be filled)`);

  if (!APPLY) {
    console.log('\n(dry-run — no changes written. Re-run with --apply to write.)');
    await db.end(); return;
  }

  let upd = 0;
  for (const c of clients) {
    if (!c.notion_id || !newAumByClient.has(c.notion_id)) continue; // only clients WITH holdings
    const neu = newAumByClient.get(c.notion_id)!;
    const old = c.aum_myr == null ? null : Number(c.aum_myr);
    if (old === neu) continue;
    await db.query(`update clients set aum_myr = $1 where notion_id = $2`, [neu, c.notion_id]);
    upd++;
  }
  console.log(`\n✅ APPLIED — updated aum_myr on ${upd} clients.`);
  await db.end();
}
main().catch(e => { console.error('backfill crashed:', e); process.exit(1); });
