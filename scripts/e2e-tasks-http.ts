// End-to-end test of the Tasks Supabase cutover through the real HTTP stack:
//   middleware (JWT) -> app/api/tasks/route.ts -> lib/tasks.ts flag -> lib/repos/tasks.ts -> Supabase
// Uses a self-signed session cookie (AUTH_SECRET) for advisor "Sky Siew" so no
// password is needed. Self-cleaning. Run:
//   node --env-file=.env.local --import tsx scripts/e2e-tasks-http.ts
import { SignJWT } from 'jose';
import pg from 'pg';

const BASE = 'http://127.0.0.1:3000';
const ADVISOR_NAME = 'Sky Siew';
const MARK = `__E2E__ ${Date.now()}`;

async function main() {
  const db = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await db.connect();
  const dbCount = async () => (await db.query(`select count(*)::int n from tasks where advisor=$1`, [ADVISOR_NAME])).rows[0].n;

  // advisorId = the Notion page id of Sky Siew (login route keys identity on this)
  const u = (await db.query(`select notion_id, username, role from users where name=$1`, [ADVISOR_NAME])).rows[0];
  if (!u?.notion_id) throw new Error('advisor notion_id not found in users table');

  // mint session cookie exactly like app/api/auth/login/route.ts
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({ advisorId: u.notion_id, username: u.username, role: u.role })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
  const cookie = `aria-session=${token}`;
  const H = { 'Content-Type': 'application/json', Cookie: cookie };

  const results: string[] = [];
  const check = (label: string, pass: boolean, extra = '') => {
    results.push(`${pass ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
    return pass;
  };

  // 1) LIST — should return Sky Siew's Supabase tasks
  const before = await dbCount();
  const listRes = await fetch(`${BASE}/api/tasks`, { headers: H });
  const listJson = await listRes.json();
  const listCount = Array.isArray(listJson.tasks) ? listJson.tasks.length : -1;
  check('GET /api/tasks 200 + scoped list', listRes.status === 200 && listCount >= 0, `http ${listRes.status}, ${listCount} tasks vs ${before} in db`);

  // 2) CREATE with type:'Client' (the case that used to hit the FA constraint)
  const postRes = await fetch(`${BASE}/api/tasks`, { method: 'POST', headers: H,
    body: JSON.stringify({ task: MARK, client: 'E2E Client', due: '2026-09-15', type: 'Client' }) });
  const postJson = await postRes.json();
  check('POST create (type=Client)', postRes.status === 200 && postJson.success === true, `http ${postRes.status} ${JSON.stringify(postJson)}`);
  const afterCreate = await dbCount();
  const dbRow = (await db.query(`select id, task, client, type, status, due_date, notion_id from tasks where task=$1`, [MARK])).rows[0];
  check('created row in Supabase, type=Client, no Notion write', afterCreate === before + 1 && dbRow?.type === 'Client' && dbRow?.notion_id === null,
    `count ${before}->${afterCreate}, type=${dbRow?.type}, notion_id=${dbRow?.notion_id}`);

  // 3) LIST again — new task visible via API, id = Supabase uuid
  const list2 = await (await fetch(`${BASE}/api/tasks`, { headers: H })).json();
  const apiTask = list2.tasks?.find((t: { task: string }) => t.task === MARK);
  check('new task visible via GET', !!apiTask && apiTask.status === 'Open' && apiTask.type === 'Client' && apiTask.id === dbRow.id,
    apiTask ? `id matches uuid=${apiTask.id === dbRow.id}` : 'not found');

  // 4) PATCH done
  const patchRes = await fetch(`${BASE}/api/tasks`, { method: 'PATCH', headers: H, body: JSON.stringify({ taskId: dbRow.id, done: true }) });
  const doneRow = (await db.query(`select status, done_date from tasks where id=$1`, [dbRow.id])).rows[0];
  check('PATCH mark done', patchRes.status === 200 && doneRow.status === 'Done' && !!doneRow.done_date, `status=${doneRow.status}`);

  // 5) DELETE
  const delRes = await fetch(`${BASE}/api/tasks?id=${dbRow.id}`, { method: 'DELETE', headers: H });
  const afterDelete = await dbCount();
  const gone = (await db.query(`select count(*)::int n from tasks where id=$1`, [dbRow.id])).rows[0].n === 0;
  check('DELETE removes row (self-clean)', delRes.status === 200 && gone && afterDelete === before, `count back to ${afterDelete}`);

  console.log('\n── E2E: Tasks over real HTTP stack (DATA_SOURCE_TASKS=supabase) ──');
  console.log(results.join('\n'));
  const allPass = results.every(r => r.startsWith('✅'));
  console.log(allPass ? '\n🎉 ALL PASS' : '\n❌ SOME FAILED');
  await db.end();
  process.exit(allPass ? 0 : 1);
}
main().catch(e => { console.error('E2E crashed:', e); process.exit(1); });
