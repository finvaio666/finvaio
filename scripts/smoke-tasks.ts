// Safe Supabase-only test of lib/repos/tasks.ts (Notion mirror disabled).
// Run: node --env-file=.env.local --import tsx scripts/smoke-tasks.ts
import * as repo from '../lib/repos/tasks';
import type { AdvisorConfig } from '../lib/getAdvisorConfig';
import pg from 'pg';

async function main() {
const pgc = new pg.Client({ ssl: { rejectUnauthorized: false } });
await pgc.connect();
const count = async (adv: string) => (await pgc.query(`select count(*)::int n from tasks where advisor=$1`, [adv])).rows[0].n;

// Real advisor scope, but notionApiKey=DEMO_MODE => mirror skipped (no Notion writes).
const config = { role: 'Advisor', name: 'Sky Siew', notionApiKey: 'DEMO_MODE', tasksDbId: undefined } as unknown as AdvisorConfig;
const MARK = `__SMOKE__ ${Date.now()}`;

const before = await count('Sky Siew');
console.log('before:', before);

await repo.createTask(config, { task: MARK, client: 'Smoke Client', due: '2026-08-01', type: 'Client', source: 'Manual' });
const afterCreate = await count('Sky Siew');
const row = (await pgc.query(`select * from tasks where task=$1`, [MARK])).rows[0];
console.log('after create:', afterCreate, '| row:', { id: row?.id?.slice(0, 8), task: row?.task, client: row?.client, status: row?.status, due_date: row?.due_date, type: row?.type, notion_id: row?.notion_id });
const id = row.id;

const listed = await repo.listTasks(config);
const found = listed.find(t => t.task === MARK);
console.log('list found:', found ? { status: found.status, due: found.due, type: found.type, client: found.client } : 'NOT FOUND');

await repo.setTaskStatus(config, id, true);
const doneRow = (await pgc.query(`select status, done_date from tasks where id=$1`, [id])).rows[0];
console.log('after setDone:', doneRow);

await repo.deleteTask(config, id);
const afterDelete = await count('Sky Siew');
const gone = (await pgc.query(`select count(*)::int n from tasks where id=$1`, [id])).rows[0].n === 0;
console.log('after delete:', afterDelete, '| gone:', gone);

const ok = afterCreate === before + 1 && !!found && found.status === 'Open' && found.type === 'Client'
  && row.type === 'Client'
  && doneRow.status === 'Done' && !!doneRow.done_date
  && afterDelete === before && gone && row.notion_id === null;
console.log(ok ? '\n✅ PASS — Supabase CRUD correct incl. type=Client; no Notion write (notion_id null)' : '\n❌ FAIL');
await pgc.end();
process.exit(ok ? 0 : 1);
}

main();
