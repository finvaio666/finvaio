/**
 * lib/taskModel.ts
 * The shape of a task and the pure logic over it — no I/O, no imports.
 *
 * Both back ends depend on this: lib/tasks.ts (Notion) and lib/repos/tasks.ts
 * (Supabase). Keeping it in its own module is what stops those two importing
 * each other in a cycle, and guarantees a task means the same thing whichever
 * store served it.
 */

/**
 * The stages a task moves through. Order matters — it drives the list sort and
 * the order of the pills in the UI.
 *
 * Historic rows only ever hold 'Open' or 'Done'; anything unrecognised reads
 * back as 'Open', so widening this list is backwards compatible.
 */
export const TASK_STATUSES = ['Open', 'In Progress', 'Waiting on Client', 'Done'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

/** Normalise whatever the store returns into a known stage. */
export function toStatus(raw: string | null | undefined): TaskStatus {
  const s = (raw ?? '').trim();
  return (TASK_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : 'Open';
}

/** Sort weight — live work first, most-active stage at the top, Done last. */
export function statusRank(s: TaskStatus): number {
  return { 'In Progress': 0, 'Open': 1, 'Waiting on Client': 2, 'Done': 3 }[s];
}

export interface ProgressEntry {
  date: string;   // 'YYYY-MM-DD' (Malaysia time)
  note: string;
}

export interface Task {
  id:       string;
  task:     string;
  client:   string;
  status:   TaskStatus;
  due:      string;   // ISO date or ''
  source:   string;
  doneDate: string;
  type:     string;   // "Admin" | "Client" | '' (unset = Client)
  /**
   * Append-only movement log, oldest first: what happened and when. Stage
   * changes are recorded automatically; the advisor can add their own notes.
   */
  progress: ProgressEntry[];
  /** 'YYYY-MM-DD' of the last movement — drives the "no movement in Nd" hint. */
  updated:  string;
}

/** Today in Malaysia time — the app runs on MYT, so never use UTC for dates. */
export function todayMYT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

/** Whole days between an ISO date and today (MYT). Null when there's no date. */
export function daysSince(iso: string): number | null {
  if (!iso) return null;
  const then = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const now  = Date.parse(`${todayMYT()}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.round((now - then) / 86_400_000);
}

/**
 * The movement log is stored as one text blob, one entry per line:
 *   2026-08-07 · Submitted to Allianz
 * Kept as plain text (not a child table / Notion blocks) so the Notion and
 * Supabase paths behave identically and a human reading the raw record in
 * either back end still sees a legible history.
 */
export function parseProgress(raw: string | null | undefined): ProgressEntry[] {
  return (raw ?? '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const m = /^(\d{4}-\d{2}-\d{2})\s*·\s*([\s\S]*)$/.exec(line);
      return m ? { date: m[1], note: m[2].trim() } : { date: '', note: line };
    })
    .filter(e => e.note);
}

export function serializeProgress(entries: ProgressEntry[]): string {
  return entries.map(e => (e.date ? `${e.date} · ${e.note}` : e.note)).join('\n');
}

/** Append one entry to a raw progress blob, returning the new blob. */
export function appendProgress(raw: string | null | undefined, note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return raw ?? '';
  // Collapse newlines — one entry is one line, so a pasted multi-line note
  // must not fracture into several undated entries on the way back out.
  const flat = trimmed.replace(/\s*\r?\n\s*/g, ' · ');
  return serializeProgress([...parseProgress(raw), { date: todayMYT(), note: flat }]);
}

/**
 * Shared filter + sort for both back ends, so the Notion and Supabase paths can
 * never drift apart on what "the task list" means.
 *
 * `status: 'Open'` means "not finished" — it matches every live stage, not just
 * the literal Open one. Callers like the AI assistant ask for open tasks meaning
 * outstanding work, and a task parked on "Waiting on Client" is still that.
 */
export function filterAndSortTasks(
  tasks: Task[],
  opts: { client?: string; status?: TaskStatus; type?: 'Admin' | 'Client' } = {},
): Task[] {
  let out = tasks;

  if (opts.type) {
    out = out.filter(t => (opts.type === 'Admin' ? t.type === 'Admin' : t.type !== 'Admin'));
  }
  if (opts.client) {
    const c = opts.client.toLowerCase().trim();
    out = out.filter(t => {
      const tc = t.client.toLowerCase().trim();
      if (!tc) return false;
      // Compare whole client names — avoids short-name false matches (e.g. "Tng" vs "Ng")
      return tc === c || tc.includes(c) || (c.includes(tc) && tc.length > 4);
    });
  }
  if (opts.status === 'Open')      out = out.filter(t => t.status !== 'Done');
  else if (opts.status)            out = out.filter(t => t.status === opts.status);

  // Live work first (most-active stage at the top), then by due date.
  return [...out].sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status);
    if (r !== 0) return r;
    return (a.due || '9999').localeCompare(b.due || '9999');
  });
}
