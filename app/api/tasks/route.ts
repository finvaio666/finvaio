import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listTasks, createTask, setTaskStatus, deleteTask } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });
  if (!config.tasksDbId) return NextResponse.json({ tasks: [], notConfigured: true });

  const { searchParams } = new URL(req.url);
  const client = searchParams.get('client') ?? undefined;
  const status = (searchParams.get('status') as 'Open' | 'Done' | null) ?? undefined;

  try {
    const tasks = await listTasks(config, { client, status: status ?? undefined });
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

  let body: { task: string; client?: string; due?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body.task?.trim()) return NextResponse.json({ error: 'Task text required.' }, { status: 400 });

  try {
    await createTask(config, { task: body.task.trim(), client: body.client, due: body.due });
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

  let body: { taskId: string; done: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  try {
    await setTaskStatus(config, body.taskId, !!body.done);
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
