/**
 * scripts/test-soft-delete.ts
 * Soft-delete regression test — all tables that have a delete entry point.
 *   node --env-file=.env.local --import tsx scripts/test-soft-delete.ts
 *
 * Guards the single failure mode of the soft-delete design: a read path that
 * forgot its `deleted_at IS NULL` filter, which would resurrect deleted rows
 * in the UI. Runs against the REAL Supabase DB and is SELF-CLEANING — every row
 * it creates is hard-deleted at the end, so table counts are unchanged.
 *
 * Spec: docs/superpowers/specs/2026-07-17-soft-delete-design.md
 */
import { getSupabase } from '../lib/supabase';
import type { AdvisorConfig } from '../lib/getAdvisorConfig';
import * as repoTasks from '../lib/repos/tasks';

export const ADV = 'SOFTDEL_TEST_ADVISOR';
export const admin = { role: 'Admin', name: 'SOFTDEL_TEST_ADMIN' } as unknown as AdvisorConfig;
export const self = { role: 'FA', name: ADV } as unknown as AdvisorConfig;

let failures = 0;

function ok(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✅ ${msg}`);
  else { console.error(`  ❌ ${msg}`); failures++; }
}

async function section(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n── ${name} ──`);
  try {
    await fn();
  } catch (e) {
    console.error(`  ❌ threw: ${(e as Error).message}`);
    failures++;
  }
}

async function count(table: string): Promise<number> {
  const { count: n } = await getSupabase().from(table).select('*', { count: 'exact', head: true });
  return n ?? 0;
}

async function main() {
  const sb = getSupabase();

  await section('tasks', async () => {
    const before = await count('tasks');

    await repoTasks.createTask(self, { task: 'SOFTDEL probe', type: 'Client' });
    const listed = (await repoTasks.listTasks(self)).filter(t => t.task === 'SOFTDEL probe');
    ok(listed.length === 1, 'created task is listed');
    const id = listed[0].id;

    await repoTasks.deleteTask(self, id);
    ok(!(await repoTasks.listTasks(self)).some(t => t.id === id), 'soft-deleted task is NOT listed');

    const { data: row } = await sb.from('tasks').select('deleted_at').eq('id', id).single();
    ok((row as { deleted_at: string | null }).deleted_at !== null, 'row still exists with deleted_at set');

    await repoTasks.setTaskStatus(self, id, true);
    const { data: after } = await sb.from('tasks').select('status').eq('id', id).single();
    ok((after as { status: string }).status !== 'Done', 'a deleted task cannot be updated');

    await sb.from('tasks').update({ deleted_at: null }).eq('id', id);
    ok((await repoTasks.listTasks(self)).some(t => t.id === id), 'clearing deleted_at restores it');

    await sb.from('tasks').delete().eq('id', id);
    ok((await count('tasks')) === before, 'row count restored');
  });

  console.log(failures === 0 ? '\n🎉 all soft-delete checks passed' : `\n💥 ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('crashed:', e); process.exit(1); });
