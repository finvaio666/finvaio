import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { PDFDocument } from 'pdf-lib';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { uploadPdfToDrive } from '@/lib/drive';
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

// ── GET — list all forms (Admin only) ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin' && config?.name !== 'Sky Siew') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const dbId = process.env.COMPANY_FORMS_DB_ID;
  if (!config.notionApiKey || !dbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const notion = new Client({ auth: config.notionApiKey });
  const res = await notion.databases.query({ database_id: dbId, page_size: 100 });
  const forms = res.results.filter(isFullPage).map(toFormRecord);

  return NextResponse.json({ forms, driveConnected: !!config.driveRefreshToken });
}

// ── POST — upload a new form (Admin only) ─────────────────────────────────────
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin' && config?.name !== 'Sky Siew') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const dbId = process.env.COMPANY_FORMS_DB_ID;
  if (!config.notionApiKey || !dbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  if (!config.driveRefreshToken) {
    return NextResponse.json({ error: 'Connect Google Drive first (Forms Library page).' }, { status: 400 });
  }

  const form = await req.formData();
  const file     = form.get('file') as File | null;
  const name     = (form.get('name') as string | null)?.trim() ?? '';
  const provider = (form.get('provider') as string | null)?.trim() ?? '';
  const category = (form.get('category') as string | null)?.trim() ?? '';
  const tags     = ((form.get('tags') as string | null) ?? '').split(',').map(t => t.trim()).filter(Boolean);
  const formType = (form.get('formType') as string | null) ?? 'Fillable PDF';

  if (!file || !name || !provider) {
    return NextResponse.json({ error: 'name, provider and file are required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to Drive
  const { url } = await uploadPdfToDrive(config.driveRefreshToken, `${provider} - ${name}.pdf`, buffer);

  // For fillable PDFs, extract AcroForm field names so the admin can map them.
  let detectedFields: string[] = [];
  let fieldMapping: FieldMapping | null = null;
  if (formType === 'Fillable PDF') {
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      detectedFields = pdfDoc.getForm().getFields().map(f => f.getName());
      fieldMapping = { type: 'fillable', fields: detectedFields.map(pdfField => ({ pdfField, dataKey: '__manual' })) };
    } catch (e) {
      console.error('Failed to read PDF form fields:', e);
    }
  } else {
    fieldMapping = { type: 'scanned', fields: [] };
  }

  const properties: Record<string, unknown> = {
    'Name':          { title: [{ text: { content: name } }] },
    'Provider':      { select: { name: provider } },
    'Tags':          { multi_select: tags.map(t => ({ name: t })) },
    'Form Type':     { select: { name: formType } },
    'PDF URL':       { rich_text: [{ text: { content: url } }] },
    'Field Mapping': { rich_text: [{ text: { content: JSON.stringify(fieldMapping) } }] },
    'Active':        { checkbox: true },
    'Last Updated':  { date: { start: new Date().toISOString().slice(0, 10) } },
  };
  if (category) properties['Category'] = { select: { name: category } };

  const notion = new Client({ auth: config.notionApiKey });
  const page = await notion.pages.create({
    parent: { database_id: dbId },
    properties: properties as never,
  });

  return NextResponse.json({ id: page.id, pdfUrl: url, detectedFields, fieldMapping });
}
