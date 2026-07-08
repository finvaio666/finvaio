/**
 * lib/tasks.ts
 * To-Do / Task management backed by a Notion "Tasks" database.
 *
 * Expected Notion DB properties:
 *   Task       (title)
 *   Client     (rich_text)   — client name
 *   Status     (select)      — "Open" | "Done"
 *   Due        (date)        — optional
 *   Source     (rich_text)   — e.g. "Meeting 2026-05-26" or "Manual"
 *   Done Date  (date)        — set when completed
 *   Type       (select)      — "Admin" | "Client" (optional; used to separate
 *                               an Admin's own daily work from FA/client tasks)
 */

import { Client, isFullPage } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';
import * as sbTasks from './repos/tasks';

/**
 * Data-source switch. When DATA_SOURCE_TASKS === 'supabase', Tasks are routed
 * through Supabase (primary) with a best-effort Notion mirror. Any other value
 * (incl. unset) keeps the original Notion-only path below unchanged, so setting
 * the flag back to 'notion' is an instant rollback.
 */
function useSupabase(): boolean {
  return process.env.DATA_SOURCE_TASKS === 'supabase';
}

export interface Task {
  id:       string;
  task:     string;
  client:   string;
  status:   'Open' | 'Done';
  due:      string;   // ISO date or ''
  source:   string;
  doneDate: string;
  type:     string;   // "Admin" | "Client" | '' (unset = Client)
}

function rt(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : '';
}
function titleOf(p: Record<string, unknown>): string {
  const v = p['Task'] as { type: string; title?: { plain_text: string }[] } | undefined;
  if (v?.type === 'title') return v.title?.[0]?.plain_text ?? '';
  for (const val of Object.values(p)) {
    const t = val as { type: string; title?: { plain_text: string }[] } | undefined;
    if (t?.type === 'title') return t.title?.[0]?.plain_text ?? '';
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
  opts: { client?: string; status?: 'Open' | 'Done'; type?: 'Admin' | 'Client' } = {},
): Promise<Task[]> {
  if (useSupabase()) return sbTasks.listTasks(config, opts);
  if (!config.tasksDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];
  const notion = notionFor(config);
  // Centralized model: scope to this advisor's tasks (Admin sees all).
  const advisorScope = config.role === 'Admin'
    ? {}
    : { filter: { property: 'Advisor', select: { equals: config.name } } };
  const res = await notion.databases.query({ database_id: config.tasksDbId, page_size: 100, ...advisorScope });
  let tasks = res.results.filter(isFullPage).map(pg => {
    const p = pg.properties as Record<string, unknown>;
    return {
      id:       pg.id,
      task:     titleOf(p),
      client:   rt(p, 'Client'),
      status:   (sel(p, 'Status') === 'Done' ? 'Done' : 'Open') as 'Open' | 'Done',
      due:      dt(p, 'Due'),
      source:   rt(p, 'Source'),
      doneDate: dt(p, 'Done'),
      type:     sel(p, 'Type'),
    };
  }).filter(t => t.task);

  if (opts.type) {
    tasks = tasks.filter(t => (opts.type === 'Admin' ? t.type === 'Admin' : t.type !== 'Admin'));
  }
  if (opts.client) {
    const c = opts.client.toLowerCase().trim();
    tasks = tasks.filter(t => {
      const tc = t.client.toLowerCase().trim();
      if (!tc) return false;
      // Compare whole client names — avoids short-name false matches (e.g. "Tng" vs "Ng")
      return tc === c || tc.includes(c) || (c.includes(tc) && tc.length > 4);
    });
  }
  if (opts.status) tasks = tasks.filter(t => t.status === opts.status);

  // Open first, then by due date
  return tasks.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Open' ? -1 : 1;
    return (a.due || '9999').localeCompare(b.due || '9999');
  });
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
    'Task':   { title: [{ text: { content: t.task.slice(0, 200) } }] },
    'Status': { select: { name: 'Open' } },
    'Client': { rich_text: [{ text: { content: (t.client ?? '').slice(0, 200) } }] },
    'Source': { rich_text: [{ text: { content: (t.source ?? 'Manual').slice(0, 200) } }] },
    // Centralized model: stamp the owning advisor so it stays scoped to them.
    'Advisor': { select: { name: config.name } },
  };
  if (t.due) props['Due'] = { date: { start: t.due } };
  // Admin's own daily work vs FA/client tasks — requires a "Type" select
  // property on the Notion Tasks DB with "Admin" / "Client" options.
  if (t.type) props['Type'] = { select: { name: t.type } };
  await notion.pages.create({ parent: { database_id: config.tasksDbId }, properties: props as never });
}

/** Mark a task done or reopen it. */
export async function setTaskStatus(config: AdvisorConfig, taskId: string, done: boolean): Promise<void> {
  if (useSupabase()) return sbTasks.setTaskStatus(config, taskId, done);
  const notion = notionFor(config);
  const props: Record<string, unknown> = {
    'Status': { select: { name: done ? 'Done' : 'Open' } },
    'Done': done ? { date: { start: new Date().toISOString().split('T')[0] } } : { date: null },
  };
  await notion.pages.update({ page_id: taskId, properties: props as never });
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
  const notion = notionFor(config);

  // Existing tasks — dedupe key = client|task (lowercased)
  const existing = await listTasks(config);
  const seen = new Set(existing.map(t => `${t.client.toLowerCase()}|${t.task.toLowerCase().trim()}`));

  const mres = await notion.databases.query({
    database_id: config.meetingNotesDbId,
    ...(config.role === 'Admin' ? {} : { filter: { property: 'Advisor', select: { equals: config.name } } }),
    sorts: [{ property: 'Meeting Date', direction: 'descending' }],
    page_size: 50,
  });

  let created = 0;
  for (const m of mres.results) {
    if (!isFullPage(m)) continue;
    const p = m.properties as Record<string, unknown>;
    const action = rt(p, 'Action Items');
    if (!action.trim()) continue;

    // Client name: from "Client Name" field or parsed from title "Name — Type — Date"
    const titleProp = p['Name'] as { type: string; title?: { plain_text: string }[] } | undefined;
    const title = titleProp?.type === 'title' ? (titleProp.title?.[0]?.plain_text ?? '') : '';
    const client = rt(p, 'Client Name') || title.split(' — ')[0]?.trim() || '';
    const mdate  = dt(p, 'Meeting Date');

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
