import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listTasks, createTask, updateTask, deleteTask, TASK_STATUSES, type TaskStatus } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

function isTaskStatus(v: string | null): v is TaskStatus {
  return !!v && (TASK_STATUSES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });
  if (!config.tasksDbId) return NextResponse.json({ tasks: [], notConfigured: true });

  const { searchParams } = new URL(req.url);
  const client    = searchParams.get('client') ?? undefined;
  const rawStatus = searchParams.get('status');
  const status    = isTaskStatus(rawStatus) ? rawStatus : undefined;
  const type      = (searchParams.get('type') as 'Admin' | 'Client' | null) ?? undefined;

  try {
    const tasks = await listTasks(config, { client, status: status ?? undefined, type: type ?? undefined });
    return NextResponse.json({ tasks });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), tasks: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (!config?.tasksDbId) return NextResponse.json({ error: 'Tasks database not configured.' }, { status: 400 });

  let body: { task: string; client?: string; due?: string; type?: 'Admin' | 'Client' };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body.task?.trim()) return NextResponse.json({ error: 'Task text required.' }, { status: 400 });

  try {
    await createTask(config, { task: body.task.trim(), client: body.client, due: body.due, type: body.type });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  // `done` is the original toggle; `status` + `note` are the richer path that
  // moves a task through its stages and appends to its movement log. Callers
  // may send either — `done` is still used by the dashboard assistant.
  let body: { taskId: string; done?: boolean; status?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  let status: TaskStatus | undefined;
  if (body.status !== undefined) {
    if (!isTaskStatus(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${TASK_STATUSES.join(', ')}` }, { status: 400 });
    }
    status = body.status;
  } else if (body.done !== undefined) {
    status = body.done ? 'Done' : 'Open';
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!status && !note) {
    return NextResponse.json({ error: 'Nothing to update — send a status or a note.' }, { status: 400 });
  }

  try {
    await updateTask(config, body.taskId, { status, note });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('id');
  if (!taskId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    await deleteTask(config, taskId);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
