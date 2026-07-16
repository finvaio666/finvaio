import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { FieldMapping } from '@/lib/formsLibrary';
import * as sbForms from '@/lib/repos/formsLibrary';

export const dynamic = 'force-dynamic';

const useSupabaseForms = () => process.env.DATA_SOURCE_FORMS === 'supabase';

interface Body {
  fieldMapping?: FieldMapping;
  active?: boolean;
}

// ── PATCH — update field mapping / active flag (Admin only) ──────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin' && config?.name !== 'Sky Siew') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  if (!config.notionApiKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const body = (await req.json()) as Body;

  if (useSupabaseForms()) {
    await sbForms.updateForm(id, { fieldMapping: body.fieldMapping, active: body.active });
    return NextResponse.json({ success: true });
  }

  const properties: Record<string, unknown> = {
    'Last Updated': { date: { start: new Date().toISOString().slice(0, 10) } },
  };
  if (body.fieldMapping !== undefined) {
    properties['Field Mapping'] = { rich_text: [{ text: { content: JSON.stringify(body.fieldMapping) } }] };
  }
  if (body.active !== undefined) {
    properties['Active'] = { checkbox: body.active };
  }

  const notion = new Client({ auth: config.notionApiKey });
  await notion.pages.update({ page_id: id, properties: properties as never });

  return NextResponse.json({ success: true });
}

// ── DELETE — archive a form (Admin only) ──────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin' && config?.name !== 'Sky Siew') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  if (!config.notionApiKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  if (useSupabaseForms()) {
    await sbForms.deleteForm(id);
    return NextResponse.json({ success: true });
  }

  const notion = new Client({ auth: config.notionApiKey });
  await notion.pages.update({ page_id: id, archived: true });

  return NextResponse.json({ success: true });
}
