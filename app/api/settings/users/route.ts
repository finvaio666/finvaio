import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import bcrypt from 'bcryptjs';
import { getAdvisorConfig, addAdvisorSelectOption } from '@/lib/getAdvisorConfig';
import * as sbUsers from '@/lib/repos/users';

export const dynamic = 'force-dynamic';
const useSupabaseUsers = () => process.env.DATA_SOURCE_USERS === 'supabase';

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}

// ── GET — list all users (Admin only) ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  if (useSupabaseUsers()) {
    try { return NextResponse.json({ users: await sbUsers.listUsers() }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  }

  const hostKey  = process.env.NOTION_API_KEY;
  const usersDbId = process.env.NOTION_USERS_DB_ID;
  if (!hostKey || !usersDbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion = new Client({ auth: hostKey });

  try {
    const res = await notion.databases.query({ database_id: usersDbId, page_size: 50 });
    const users = res.results.filter(isFullPage).map(page => {
      const p = page.properties as Record<string, unknown>;
      const name = (p['Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '';
      const role = (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor';
      const active = (p['Active'] as { type: string; checkbox?: boolean } | undefined)?.checkbox ?? true;
      return {
        id:       page.id,
        name,
        username: rt(p, 'Username'),
        role,
        active,
        hasGmail: !!rt(p, 'Gmail Refresh Token'),
      };
    });

    return NextResponse.json({ users });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — create new user (Admin only) ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  let body: { name: string; username: string; password: string; role: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  if (!body.name || !body.username || !body.password) {
    return NextResponse.json({ error: 'Name, username, and password are required.' }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const hostKey   = process.env.NOTION_API_KEY;
  const usersDbId = process.env.NOTION_USERS_DB_ID;
  if (!hostKey || !usersDbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion = new Client({ auth: hostKey });

  // Check username not already taken
  const existing = await notion.databases.query({
    database_id: usersDbId,
    filter: { property: 'Username', rich_text: { equals: body.username.trim().toLowerCase() } },
  });
  if (existing.results.length > 0) {
    return NextResponse.json({ error: 'Username already exists.' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  try {
    await notion.pages.create({
      parent: { database_id: usersDbId },
      properties: {
        'Name':          { title:     [{ text: { content: body.name.trim() } }] },
        'Username':      { rich_text: [{ text: { content: body.username.trim().toLowerCase() } }] },
        'Password Hash': { rich_text: [{ text: { content: passwordHash } }] },
        'Role':          { select:    { name: body.role === 'Admin' ? 'Admin' : 'Advisor' } },
        'Active':        { checkbox:  true },
      } as never,
    });

    // Tag the new advisor's name as a select option on every shared DB so
    // their imports/submissions don't fail Notion's select validation.
    await addAdvisorSelectOption(body.name.trim());

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH — toggle active / reset password ───────────────────────────────────
export async function PATCH(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  let body: { userId: string; active?: boolean; newPassword?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const hostKey = process.env.NOTION_API_KEY;
  if (!hostKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion   = new Client({ auth: hostKey });
  const updates: Record<string, unknown> = {};

  if (body.active !== undefined) {
    updates['Active'] = { checkbox: body.active };
  }
  if (body.newPassword) {
    if (body.newPassword.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    updates['Password Hash'] = { rich_text: [{ text: { content: await bcrypt.hash(body.newPassword, 10) } }] };
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  try {
    await notion.pages.update({ page_id: body.userId, properties: updates as never });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
