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
import * as repoForms from '../lib/repos/formsLibrary';

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

/**
 * Belt-and-braces safety net: hard-deletes any residual test rows left behind
 * when a section throws before reaching its own end-of-section cleanup (e.g.
 * `listed[0].id` on an empty array skips everything after it). Runs from a
 * `finally` in main() so it fires even on a mid-section throw.
 *
 * Scoped ONLY to unmistakable test identity so it can never touch real data:
 * every row this suite creates carries `advisor = ADV` ('SOFTDEL_TEST_ADVISOR',
 * which can never match a real advisor), except forms_library, which has no
 * advisor column — that one is purged by a `SOFTDEL` name prefix instead.
 * Covers all six tables the suite will eventually touch; purging a table with
 * no residue is a harmless no-op. This is a NET, not the primary cleanup path
 * — per-section hard-deletes and "row count restored" assertions still run.
 */
async function purgeResidue(): Promise<void> {
  const sb = getSupabase();
  const advisorScopedTables = [
    'tasks',
    'insurance_policies',
    'portfolio_holdings',
    'assets_liabilities',
    'cashflow_planner',
  ];
  for (const table of advisorScopedTables) {
    const { error } = await sb.from(table).delete().eq('advisor', ADV);
    if (error) console.error(`  ⚠️  purge ${table} failed: ${error.message}`);
  }
  const { error } = await sb.from('forms_library').delete().like('name', 'SOFTDEL%');
  if (error) console.error(`  ⚠️  purge forms_library failed: ${error.message}`);
}

async function main() {
  const sb = getSupabase();

  try {
    await section('tasks', async () => {
      const before = await count('tasks');

      await repoTasks.createTask(self, { task: 'SOFTDEL probe', type: 'Client' });
      const listed = (await repoTasks.listTasks(self)).filter(t => t.task === 'SOFTDEL probe');
      ok(listed.length === 1, 'created task is listed');
      const id = listed[0].id;

      // Prove setTaskStatus actually works on a live row FIRST — otherwise an
      // unconditional no-op would trivially "pass" the deleted-row check below.
      await repoTasks.setTaskStatus(self, id, true);
      const { data: live } = await sb.from('tasks').select('status').eq('id', id).single();
      ok((live as { status: string }).status === 'Done', 'setTaskStatus DOES update a live task');

      // Reset to Open (still live) so the post-delete assertion is unambiguous.
      await repoTasks.setTaskStatus(self, id, false);

      await repoTasks.deleteTask(self, id);
      ok(!(await repoTasks.listTasks(self)).some(t => t.id === id), 'soft-deleted task is NOT listed');

      const { data: row } = await sb.from('tasks').select('deleted_at').eq('id', id).single();
      ok((row as { deleted_at: string | null }).deleted_at !== null, 'row still exists with deleted_at set');

      await repoTasks.setTaskStatus(self, id, true);
      const { data: after } = await sb.from('tasks').select('status').eq('id', id).single();
      ok((after as { status: string }).status === 'Open', 'setTaskStatus does NOT update a soft-deleted task');

      await sb.from('tasks').update({ deleted_at: null }).eq('id', id);
      ok((await repoTasks.listTasks(self)).some(t => t.id === id), 'clearing deleted_at restores it');

      await sb.from('tasks').delete().eq('id', id);
      ok((await count('tasks')) === before, 'row count restored');
    });

    // ── Later table sections go HERE, inside this try, so purgeResidue() in the
    //    finally below always runs even if a section throws. Do NOT append below
    //    the finally block.

    await section('forms_library', async () => {
      const before = await count('forms_library');

      const { id } = await repoForms.createForm({
        name: 'SOFTDEL Form', provider: 'AIA', category: '', formType: 'Fillable PDF',
        pdfUrl: 'https://drive.google.com/uc?id=SOFTDEL', active: true,
        fieldMapping: { type: 'fillable', fields: [{ pdfField: 'X', dataKey: 'client.name' }] },
        tags: [],
      });
      ok((await repoForms.getForm(id)) !== null, 'created form is retrievable');
      ok((await repoForms.listForms()).some(f => f.id === id), 'created form is listed');

      await repoForms.deleteForm(id);
      ok((await repoForms.getForm(id)) === null, 'soft-deleted form: getForm returns null');
      ok(!(await repoForms.listForms()).some(f => f.id === id), 'soft-deleted form is NOT listed');
      ok(!(await repoForms.listForms({ activeOnly: true })).some(f => f.id === id), 'soft-deleted form is NOT in activeOnly list');

      const { data: row } = await sb.from('forms_library').select('deleted_at, active').eq('id', id).single();
      ok((row as { deleted_at: string | null }).deleted_at !== null, 'row still exists with deleted_at set');
      ok((row as { active: boolean }).active === true, 'active is untouched — active and deleted_at are independent');

      await repoForms.updateForm(id, { active: false });
      const { data: after } = await sb.from('forms_library').select('active').eq('id', id).single();
      ok((after as { active: boolean }).active === true, 'a deleted form cannot be updated');

      await sb.from('forms_library').update({ deleted_at: null }).eq('id', id);
      ok((await repoForms.getForm(id)) !== null, 'clearing deleted_at restores it');

      await sb.from('forms_library').delete().eq('id', id);
      ok((await count('forms_library')) === before, 'row count restored');
    });

  } finally {
    await purgeResidue();
  }

  console.log(failures === 0 ? '\n🎉 all soft-delete checks passed' : `\n💥 ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('crashed:', e); process.exit(1); });
