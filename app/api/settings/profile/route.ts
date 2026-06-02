import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { getAdvisorConfig, clearAdvisorCache } from '@/lib/getAdvisorConfig';

export const dynamic = 'force-dynamic';

// ── GET — return current profile ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    name:              config.name,
    role:              config.role,
    gmailAddress:      config.gmailAddress,
    gmailConnected:    !!config.gmailRefreshToken,
    outlookAddress:    config.outlookAddress,
    outlookConnected:  !!config.outlookRefreshToken,
    emailProvider:     config.emailProvider || 'gmail',
    features:          config.features,
    notionApiKey:      config.notionApiKey ? '••••••••' + config.notionApiKey.slice(-6) : '',
  });
}

// ── PATCH — update display name ───────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; gmailAddress?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const hostKey = process.env.NOTION_API_KEY;
  if (!hostKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion = new Client({ auth: hostKey });
  const updates: Record<string, unknown> = {};

  if (body.name?.trim()) {
    updates['Name'] = { title: [{ text: { content: body.name.trim().slice(0, 100) } }] };
  }
  if (body.gmailAddress !== undefined) {
    updates['Gmail Address'] = { rich_text: [{ text: { content: body.gmailAddress.trim().slice(0, 200) } }] };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    await notion.pages.update({ page_id: advisorId, properties: updates as never });
    clearAdvisorCache(advisorId);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
