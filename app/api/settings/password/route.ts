import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import bcrypt from 'bcryptjs';
import { getAdvisorConfig, clearAdvisorCache } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { currentPassword: string; newPassword: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json({ error: 'Both current and new password are required.' }, { status: 400 });
  }
  if (body.newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
  }

  const hostKey = process.env.NOTION_API_KEY;
  if (!hostKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion = new Client({ auth: hostKey });

  try {
    // Read current password hash from Notion
    const page = await notion.pages.retrieve({ page_id: advisorId });
    if (!isFullPage(page)) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const pwProp = page.properties['Password Hash'];
    const storedHash = pwProp?.type === 'rich_text'
      ? ((pwProp as { type: 'rich_text'; rich_text: { plain_text: string }[] }).rich_text?.[0]?.plain_text ?? '')
      : '';

    const valid = await bcrypt.compare(body.currentPassword, storedHash);
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });

    // Hash the new password
    const newHash = await bcrypt.hash(body.newPassword, 10);

    await notion.pages.update({
      page_id:    advisorId,
      properties: { 'Password Hash': { rich_text: [{ text: { content: newHash } }] } } as never,
    });

    clearAdvisorCache(advisorId);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
