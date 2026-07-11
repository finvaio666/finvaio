import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { FieldMapping, FormRecord } from '@/lib/formsLibrary';

export const dynamic = 'force-dynamic';

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}

// ── GET — a single active form + its field mapping (any signed-in FA) ──────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const notion = new Client({ auth: config.notionApiKey });
  const page = await notion.pages.retrieve({ page_id: id });
  if (!isFullPage(page)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const p = page.properties as Record<string, unknown>;
  const active = (p['Active'] as { checkbox?: boolean } | undefined)?.checkbox ?? false;
  if (!active) return NextResponse.json({ error: 'Form not available' }, { status: 404 });

  const mappingRaw = rt(p, 'Field Mapping');
  let fieldMapping: FieldMapping | null = null;
  if (mappingRaw) { try { fieldMapping = JSON.parse(mappingRaw); } catch { /* ignore */ } }

  const form: FormRecord = {
    id: page.id,
    name: (p['Name'] as { title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '',
    provider: (p['Provider'] as { select?: { name: string } } | undefined)?.select?.name ?? '',
    category: (p['Category'] as { select?: { name: string } } | undefined)?.select?.name ?? '',
    tags: ((p['Tags'] as { multi_select?: { name: string }[] } | undefined)?.multi_select ?? []).map(t => t.name),
    formType: (p['Form Type'] as { select?: { name: string } } | undefined)?.select?.name as FormRecord['formType'] ?? '',
    pdfUrl: rt(p, 'PDF URL'),
    fieldMapping,
    active,
  };

  return NextResponse.json({ form });
}
