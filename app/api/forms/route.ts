import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { FieldMapping, FormRecord } from '@/lib/formsLibrary';

export const dynamic = 'force-dynamic';

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}

function toFormRecord(page: import('@notionhq/client/build/src/api-endpoints').PageObjectResponse): FormRecord {
  const p = page.properties as Record<string, unknown>;
  const name = (p['Name'] as { title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '';
  const provider = (p['Provider'] as { select?: { name: string } } | undefined)?.select?.name ?? '';
  const category = (p['Category'] as { select?: { name: string } } | undefined)?.select?.name ?? '';
  const tags = ((p['Tags'] as { multi_select?: { name: string }[] } | undefined)?.multi_select ?? []).map(t => t.name);
  const formType = (p['Form Type'] as { select?: { name: string } } | undefined)?.select?.name as FormRecord['formType'] ?? '';
  const pdfUrl = rt(p, 'PDF URL');
  const active = (p['Active'] as { checkbox?: boolean } | undefined)?.checkbox ?? false;
  const mappingRaw = rt(p, 'Field Mapping');
  let fieldMapping: FieldMapping | null = null;
  if (mappingRaw) {
    try { fieldMapping = JSON.parse(mappingRaw); } catch { /* ignore malformed */ }
  }
  return { id: page.id, name, provider, category, tags, formType, pdfUrl, fieldMapping, active };
}

// ── GET — list ACTIVE forms (any signed-in FA) ────────────────────────────────
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbId = process.env.COMPANY_FORMS_DB_ID;
  if (!config.notionApiKey || !dbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion = new Client({ auth: config.notionApiKey });
  const res = await notion.databases.query({
    database_id: dbId,
    filter: { property: 'Active', checkbox: { equals: true } },
    page_size: 100,
  });
  // FA list doesn't need the raw field mapping — keep the payload light.
  const forms = res.results.filter(isFullPage).map(toFormRecord).map(f => ({
    id: f.id, name: f.name, provider: f.provider, category: f.category,
    tags: f.tags, formType: f.formType,
  }));

  return NextResponse.json({ forms });
}
