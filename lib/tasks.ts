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
 */

import { Client, isFullPage } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';

export interface Task {
  id:       string;
  task:     string;
  client:   string;
  status:   'Open' | 'Done';
  due:      string;   // ISO date or ''
  source:   string;
  doneDate: string;
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
  opts: { client?: string; status?: 'Open' | 'Done' } = {},
): Promise<Task[]> {
  if (!config.tasksDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];
  const notion = notionFor(config);
  const res = await notion.databases.query({ database_id: config.tasksDbId, page_size: 100 });
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
    };
  }).filter(t => t.task);

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
  t: { task: string; client?: string; due?: string; source?: string },
): Promise<void> {
  if (!config.tasksDbId) throw new Error('Tasks database not configured.');
  const notion = notionFor(config);
  const props: Record<string, unknown> = {
    'Task':   { title: [{ text: { content: t.task.slice(0, 200) } }] },
    'Status': { select: { name: 'Open' } },
    'Client': { rich_text: [{ text: { content: (t.client ?? '').slice(0, 200) } }] },
    'Source': { rich_text: [{ text: { content: (t.source ?? 'Manual').slice(0, 200) } }] },
  };
  if (t.due) props['Due'] = { date: { start: t.due } };
  await notion.pages.create({ parent: { database_id: config.tasksDbId }, properties: props as never });
}

/** Mark a task done or reopen it. */
export async function setTaskStatus(config: AdvisorConfig, taskId: string, done: boolean): Promise<void> {
  const notion = notionFor(config);
  const props: Record<string, unknown> = {
    'Status': { select: { name: done ? 'Done' : 'Open' } },
    'Done': done ? { date: { start: new Date().toISOString().split('T')[0] } } : { date: null },
  };
  await notion.pages.update({ page_id: taskId, properties: props as never });
}

/** Delete a task (archive the Notion page). */
export async function deleteTask(config: AdvisorConfig, taskId: string): Promise<void> {
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
