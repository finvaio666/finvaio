/**
 * lib/repos/tasks.ts
 * Supabase data-access layer for Tasks (Phase 1 pilot).
 *
 * Straight cutover (decided 2026-07-07): when DATA_SOURCE_TASKS='supabase',
 * Supabase is the single source of truth. No Notion writes happen here — the
 * Notion Tasks DB is left frozen as a backup. Safety comes from: reconcile +
 * count-check before switching, instant rollback via the flag, and the frozen
 * Notion copy (re-syncable later via the notion_id column if ever needed).
 *
 * Column names match the EXISTING Supabase schema (client / due_date / advisor
 * / notion_id), not the draft names in MIGRATION.md.
 */

import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import type { Task } from '../tasks';

const TABLE = 'tasks';

interface Row {
  id: string;
  notion_id: string | null;
  task: string | null;
  client: string | null;
  status: string | null;
  type: string | null;
  due_date: string | null;
  done_date: string | null;
  source: string | null;
  advisor: string | null;
}

function toTask(r: Row): Task {
  return {
    id:       r.id,
    task:     r.task ?? '',
    client:   r.client ?? '',
    status:   (r.status === 'Done' ? 'Done' : 'Open') as 'Open' | 'Done',
    due:      r.due_date ?? '',
    source:   r.source ?? '',
    doneDate: r.done_date ?? '',
    type:     r.type ?? '',
  };
}

/** List tasks. Same filter/sort logic as the Notion path in lib/tasks.ts. */
export async function listTasks(
  config: AdvisorConfig,
  opts: { client?: string; status?: 'Open' | 'Done'; type?: 'Admin' | 'Client' } = {},
): Promise<Task[]> {
  const sb = getSupabase();
  let q = sb.from(TABLE).select('*').is('deleted_at', null);
  // Centralized model: scope to this advisor's tasks (Admin sees all).
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`tasks list failed: ${error.message}`);

  let tasks = (data as Row[]).map(toTask).filter(t => t.task);

  // ── identical filter/sort to lib/tasks.ts ──
  if (opts.type) {
    tasks = tasks.filter(t => (opts.type === 'Admin' ? t.type === 'Admin' : t.type !== 'Admin'));
  }
  if (opts.client) {
    const c = opts.client.toLowerCase().trim();
    tasks = tasks.filter(t => {
      const tc = t.client.toLowerCase().trim();
      if (!tc) return false;
      return tc === c || tc.includes(c) || (c.includes(tc) && tc.length > 4);
    });
  }
  if (opts.status) tasks = tasks.filter(t => t.status === opts.status);

  return tasks.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Open' ? -1 : 1;
    return (a.due || '9999').localeCompare(b.due || '9999');
  });
}

/** Create a task. */
export async function createTask(
  config: AdvisorConfig,
  t: { task: string; client?: string; due?: string; source?: string; type?: 'Admin' | 'Client' },
): Promise<void> {
  const sb = getSupabase();
  const row: Record<string, unknown> = {
    task:    t.task.slice(0, 200),
    status:  'Open',
    client:  (t.client ?? '').slice(0, 200),
    source:  (t.source ?? 'Manual').slice(0, 200),
    advisor: config.name,
  };
  if (t.due)  row.due_date = t.due;
  if (t.type) row.type = t.type;

  const { error } = await sb.from(TABLE).insert(row);
  if (error) throw new Error(`task create failed: ${error.message}`);
}

/** Mark a task done or reopen it. */
export async function setTaskStatus(_config: AdvisorConfig, taskId: string, done: boolean): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update({
    status:    done ? 'Done' : 'Open',
    done_date: done ? new Date().toISOString().split('T')[0] : null,
  }).eq('id', taskId).is('deleted_at', null);
  if (error) throw new Error(`task status update failed: ${error.message}`);
}

/** Soft-delete a task (recoverable — clear deleted_at to restore). */
export async function deleteTask(_config: AdvisorConfig, taskId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', taskId)
    .is('deleted_at', null);
  if (error) throw new Error(`task delete failed: ${error.message}`);
}
