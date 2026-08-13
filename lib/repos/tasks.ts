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
import {
  type Task, type TaskStatus,
  toStatus, parseProgress, filterAndSortTasks, todayMYT,
} from '../taskModel';

const TABLE = 'tasks';

/** Columns read on every list/get — keep in sync with Row. */
const COLS = 'id, notion_id, task, client, status, type, due_date, done_date, source, progress_log, updated_at, advisor';

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
  progress_log: string | null;
  updated_at: string | null;
  advisor: string | null;
}

function toTask(r: Row): Task {
  return {
    id:       r.id,
    task:     r.task ?? '',
    client:   r.client ?? '',
    status:   toStatus(r.status),
    due:      r.due_date ?? '',
    source:   r.source ?? '',
    doneDate: r.done_date ?? '',
    type:     r.type ?? '',
    progress: parseProgress(r.progress_log),
    // stored as a date column; slice guards against a timestamptz-shaped value
    updated:  (r.updated_at ?? '').slice(0, 10),
  };
}

/** List tasks. Filter/sort is shared with the Notion path (lib/tasks.ts). */
export async function listTasks(
  config: AdvisorConfig,
  opts: { client?: string; status?: TaskStatus; type?: 'Admin' | 'Client' } = {},
): Promise<Task[]> {
  const sb = getSupabase();
  let q = sb.from(TABLE).select(COLS).is('deleted_at', null);
  // Centralized model: scope to this advisor's tasks (Admin sees all).
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`tasks list failed: ${error.message}`);

  const tasks = (data as unknown as Row[]).map(toTask).filter(t => t.task);
  return filterAndSortTasks(tasks, opts);
}

/** Fetch one live task, or null if it's missing or soft-deleted. */
export async function getTask(taskId: string): Promise<Task | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE)
    .select(COLS)
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`task fetch failed: ${error.message}`);
  return data ? toTask(data as unknown as Row) : null;
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

/**
 * Mark a task done or reopen it, without touching the movement log.
 * Kept as-is for the smoke/soft-delete scripts that drive the repo directly;
 * app traffic goes through updateTask so the log stays complete.
 */
export async function setTaskStatus(_config: AdvisorConfig, taskId: string, done: boolean): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update({
    status:     done ? 'Done' : 'Open',
    done_date:  done ? todayMYT() : null,
    updated_at: todayMYT(),
  }).eq('id', taskId).is('deleted_at', null);
  if (error) throw new Error(`task status update failed: ${error.message}`);
}

/**
 * Move a task and/or replace its movement log. The log is composed by the
 * caller (lib/tasks.updateTask) so both back ends store identical text.
 *
 * Soft-deleted rows are untouched, matching setTaskStatus/deleteTask.
 */
export async function updateTask(
  taskId: string,
  change: { status?: TaskStatus; progressLog?: string },
): Promise<void> {
  const sb = getSupabase();
  const today = todayMYT();
  const patch: Record<string, unknown> = { updated_at: today };
  if (change.status) {
    patch.status    = change.status;
    // 'Done' date is the completion stamp — clear it if the task reopens.
    patch.done_date = change.status === 'Done' ? today : null;
  }
  if (change.progressLog !== undefined) patch.progress_log = change.progressLog || null;

  const { error } = await sb.from(TABLE).update(patch).eq('id', taskId).is('deleted_at', null);
  if (error) throw new Error(`task update failed: ${error.message}`);
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
