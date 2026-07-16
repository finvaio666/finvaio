import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { PDFDocument } from 'pdf-lib';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { uploadPdfToDrive } from '@/lib/drive';
import { FieldMapping, listForms } from '@/lib/formsLibrary';
import * as sbForms from '@/lib/repos/formsLibrary';

export const dynamic = 'force-dynamic';

const useSupabaseForms = () => process.env.DATA_SOURCE_FORMS === 'supabase';

// ── GET — list all forms (Admin only) ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin' && config?.name !== 'Sky Siew') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const dbId = process.env.COMPANY_FORMS_DB_ID;
  if (!config.notionApiKey || !dbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  // Admin list via the data-source abstraction (Notion or Supabase per flag).
  const forms = await listForms(config);

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

  // ── Supabase write path (Phase 2.11) — Drive upload above is shared; only the
  // metadata record differs. field_mapping persisted as a JSON string.
  if (useSupabaseForms()) {
    const { id } = await sbForms.createForm({ name, provider, category, formType, pdfUrl: url, fieldMapping, tags, active: true });
    return NextResponse.json({ id, pdfUrl: url, detectedFields, fieldMapping });
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
