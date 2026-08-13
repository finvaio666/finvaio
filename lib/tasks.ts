/**
 * lib/tasks.ts
 * To-Do / Task management backed by a Notion "Tasks" database.
 *
 * Expected Notion DB properties:
 *   Task       (title)
 *   Client     (rich_text)   — client name
 *   Status     (select)      — see TASK_STATUSES
 *   Due        (date)        — optional
 *   Source     (rich_text)   — e.g. "Meeting 2026-05-26" or "Manual"
 *   Done Date  (date)        — set when completed
 *   Type       (select)      — "Admin" | "Client" (optional; used to separate
 *                               an Admin's own daily work from FA/client tasks)
 *   Progress   (rich_text)   — optional append-only movement log (see appendProgress)
 *   Updated    (date)        — optional; last time the task moved
 */

import { Client, isFullPage } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';
import { readRichText, readTitle, toRichText } from './notionText';
import {
  type Task, type TaskStatus,
  toStatus, parseProgress, serializeProgress, appendProgress,
  filterAndSortTasks, todayMYT,
} from './taskModel';
import * as sbTasks from './repos/tasks';
import { listMeetings } from './meetingNotes';

/**
 * Data-source switch. When DATA_SOURCE_TASKS === 'supabase', Tasks are served
 * from Supabase ONLY (straight cutover, decided 2026-07-07) — there is NO
 * Notion mirror; the Notion Tasks DB stays frozen as a pre-cutover backup.
 * Any other value (incl. unset) keeps the original Notion-only path below
 * unchanged. Flipping back to 'notion' is a READ-ONLY rollback: tasks
 * created/updated while on Supabase do not exist in Notion and will vanish
 * from the UI until re-synced. Never run reconcile --apply after cutover.
 */
function useSupabase(): boolean {
  return process.env.DATA_SOURCE_TASKS === 'supabase';
}

// The task shape and all pure logic over it live in lib/taskModel.ts — shared
// with the Supabase repo. Re-exported here so `@/lib/tasks` stays the one import
// site callers already use.
export {
  TASK_STATUSES, toStatus, statusRank, todayMYT, daysSince,
  parseProgress, serializeProgress, appendProgress, filterAndSortTasks,
} from './taskModel';
export type { Task, TaskStatus, ProgressEntry } from './taskModel';

function rt(p: Record<string, unknown>, k: string): string {
  return readRichText(p[k]);
}
function titleOf(p: Record<string, unknown>): string {
  const direct = readTitle(p['Task']);
  if (direct) return direct;
  for (const val of Object.values(p)) {
    const t = readTitle(val);
    if (t) return t;
  }
  return '';
}
function sel(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; select?: { name: string } } | undefined;
  return v?.type === 'select' ? (v.select?.name ?? '') : '';
}
function dt(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; date?: { start: string } | null } | undefined;
  return v?.type === 'date' ? (v.date?.start ?? '') : '';
}

function notionFor(config: AdvisorConfig) {
  return new Client({ auth: config.notionApiKey });
}

/** List tasks, optionally filtered by client name and/or status. */
export async function listTasks(
  config: AdvisorConfig,
  opts: { client?: string; status?: TaskStatus; type?: 'Admin' | 'Client' } = {},
): Promise<Task[]> {
  if (useSupabase()) return sbTasks.listTasks(config, opts);
  if (!config.tasksDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];
  const notion = notionFor(config);
  // Centralized model: scope to this advisor's tasks (Admin sees all).
  const advisorScope = config.role === 'Admin'
    ? {}
    : { filter: { property: 'Advisor', select: { equals: config.name } } };
  const res = await notion.databases.query({ database_id: config.tasksDbId, page_size: 100, ...advisorScope });
  const tasks = res.results.filter(isFullPage).map(pg => {
    const p = pg.properties as Record<string, unknown>;
    const progressRaw = rt(p, 'Progress');
    return {
      id:       pg.id,
      task:     titleOf(p),
      client:   rt(p, 'Client'),
      status:   toStatus(sel(p, 'Status')),
      due:      dt(p, 'Due'),
      source:   rt(p, 'Source'),
      doneDate: dt(p, 'Done'),
      type:     sel(p, 'Type'),
      progress: parseProgress(progressRaw),
      updated:  dt(p, 'Updated'),
    };
  }).filter(t => t.task);

  return filterAndSortTasks(tasks, opts);
}

/** Create a new task. */
export async function createTask(
  config: AdvisorConfig,
  t: { task: string; client?: string; due?: string; source?: string; type?: 'Admin' | 'Client' },
): Promise<void> {
  if (useSupabase()) return sbTasks.createTask(config, t);
  if (!config.tasksDbId) throw new Error('Tasks database not configured.');
  const notion = notionFor(config);
  const props: Record<string, unknown> = {
    'Task':   { title: toRichText(t.task.slice(0, 200)) },
    'Status': { select: { name: 'Open' } },
    'Client': { rich_text: toRichText((t.client ?? '').slice(0, 200)) },
    'Source': { rich_text: toRichText((t.source ?? 'Manual').slice(0, 200)) },
    // Centralized model: stamp the owning advisor so it stays scoped to them.
    'Advisor': { select: { name: config.name } },
  };
  if (t.due) props['Due'] = { date: { start: t.due } };
  // Admin's own daily work vs FA/client tasks — requires a "Type" select
  // property on the Notion Tasks DB with "Admin" / "Client" options.
  if (t.type) props['Type'] = { select: { name: t.type } };
  await notion.pages.create({ parent: { database_id: config.tasksDbId }, properties: props as never });
}

/** Fetch one task, or null if it's gone. Returns null rather than throwing. */
export async function getTask(config: AdvisorConfig, taskId: string): Promise<Task | null> {
  if (useSupabase()) return sbTasks.getTask(taskId);
  if (!config.tasksDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return null;
  try {
    const pg = await notionFor(config).pages.retrieve({ page_id: taskId });
    if (!isFullPage(pg)) return null;
    const p = pg.properties as Record<string, unknown>;
    return {
      id:       pg.id,
      task:     titleOf(p),
      client:   rt(p, 'Client'),
      status:   toStatus(sel(p, 'Status')),
      due:      dt(p, 'Due'),
      source:   rt(p, 'Source'),
      doneDate: dt(p, 'Done'),
      type:     sel(p, 'Type'),
      progress: parseProgress(rt(p, 'Progress')),
      updated:  dt(p, 'Updated'),
    };
  } catch {
    return null;
  }
}

/**
 * Names of properties this codebase added after the original Tasks DB shipped.
 * An advisor's Notion DB may predate them, and Notion rejects the whole update
 * if you write a property that doesn't exist — so writes carrying these retry
 * once without them (the stage change still lands; only the log is lost).
 */
const OPTIONAL_TASK_PROPS = ['Progress', 'Updated'] as const;

async function updateNotionTask(
  config: AdvisorConfig,
  taskId: string,
  props: Record<string, unknown>,
): Promise<void> {
  const notion = notionFor(config);
  try {
    await notion.pages.update({ page_id: taskId, properties: props as never });
  } catch (e) {
    if (!String(e).includes('is not a property')) throw e;
    const core = { ...props };
    for (const k of OPTIONAL_TASK_PROPS) delete core[k];
    if (Object.keys(core).length === 0) return;
    await notion.pages.update({ page_id: taskId, properties: core as never });
  }
}

/** Mark a task done or reopen it. Kept for callers that only need the toggle. */
export async function setTaskStatus(config: AdvisorConfig, taskId: string, done: boolean): Promise<void> {
  return updateTask(config, taskId, { status: done ? 'Done' : 'Open' });
}

/**
 * Move a task and/or record what happened.
 *
 * Every call appends to the movement log: an explicit `note` if given, plus an
 * automatic "Open → In Progress" line whenever the stage changes. That is what
 * makes the log a history rather than a comment box — an advisor reviewing a
 * client six months later can see when work started and where it stalled.
 */
export async function updateTask(
  config: AdvisorConfig,
  taskId: string,
  change: { status?: TaskStatus; note?: string },
): Promise<void> {
  const { status, note } = change;
  if (!status && !note?.trim()) return;

  // Read the current row so we can append to the log and label the stage move.
  const current  = await getTask(config, taskId);
  const previous = current?.status;
  const moved    = !!status && !!previous && status !== previous;

  let log = current ? serializeProgress(current.progress) : '';
  if (note?.trim()) log = appendProgress(log, note);
  if (moved)        log = appendProgress(log, `Status: ${previous} → ${status}`);
  else if (status && !previous) log = appendProgress(log, `Status: ${status}`);

  if (useSupabase()) return sbTasks.updateTask(taskId, { status, progressLog: log });

  const today = todayMYT();
  const props: Record<string, unknown> = { 'Updated': { date: { start: today } } };
  if (status) {
    props['Status'] = { select: { name: status } };
    // 'Done' date is the completion stamp — clear it if the task reopens.
    props['Done'] = status === 'Done' ? { date: { start: today } } : { date: null };
  }
  if (log) props['Progress'] = { rich_text: toRichText(log) };

  await updateNotionTask(config, taskId, props);
}

/** Delete a task (archive the Notion page). */
export async function deleteTask(config: AdvisorConfig, taskId: string): Promise<void> {
  if (useSupabase()) return sbTasks.deleteTask(config, taskId);
  const notion = notionFor(config);
  await notion.pages.update({ page_id: taskId, archived: true } as never);
}

/**
 * Sync tasks from meeting-note action items. Splits each meeting's "Action Items"
 * text into individual task lines and creates any that don't already exist
 * (deduped by client + task text). Returns the number of new tasks created.
 */
export async function syncTasksFromMeetings(config: AdvisorConfig): Promise<number> {
  if (!config.tasksDbId || !config.meetingNotesDbId) return 0;

  // Existing tasks — dedupe key = client|task (lowercased)
  const existing = await listTasks(config);
  const seen = new Set(existing.map(t => `${t.client.toLowerCase()}|${t.task.toLowerCase().trim()}`));

  // Meeting notes via the data-source abstraction (Notion or Supabase per flag).
  // listMeetings is already advisor-scoped and sorted newest-first; slice(0, 50)
  // preserves the original page_size:50 "latest 50 meetings" behaviour.
  const meetings = (await listMeetings(config)).slice(0, 50);

  let created = 0;
  for (const m of meetings) {
    const action = m.actionItems;
    if (!action.trim()) continue;

    // clientName is already resolved (dedicated field or parsed from the title).
    const client = m.clientName;
    const mdate  = m.meetingDate;

    // Split action items into individual lines (newlines, bullets, semicolons)
    const lines = action
      .split(/\r?\n|;|•|·|(?:^|\s)[-*]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 2);

    for (const line of lines) {
      const key = `${client.toLowerCase()}|${line.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await createTask(config, { task: line, client, due: '', source: `Meeting ${mdate || ''}`.trim() });
        created++;
      } catch { /* skip on error */ }
    }
  }
  return created;
}
