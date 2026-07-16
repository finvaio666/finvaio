import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { PDFDocument } from 'pdf-lib';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { downloadPdfFromDrive } from '@/lib/drive';
import { driveFileIdFromUrl, getForm } from '@/lib/formsLibrary';

export const dynamic = 'force-dynamic';

const useSupabaseForms = () => process.env.DATA_SOURCE_FORMS === 'supabase';

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}

interface Body { fieldValues: Record<string, string>; }

/**
 * POST /api/forms/[id]/fill
 * Body: { fieldValues: { pdfField: value } }
 * Fills the source PDF's AcroForm fields (kept editable) and streams it back.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!config.driveRefreshToken) {
    return NextResponse.json({ error: 'Company Drive is not connected.' }, { status: 500 });
  }

  const { fieldValues } = (await req.json()) as Body;

  // ── Resolve the form's source PDF + name (Notion or Supabase per flag) ────────
  let pdfUrl: string;
  let formName: string;
  if (useSupabaseForms()) {
    const form = await getForm(config, id);
    if (!form)        return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    if (!form.active) return NextResponse.json({ error: 'Form not available' }, { status: 404 });
    pdfUrl   = form.pdfUrl;
    formName = form.name || 'form';
  } else {
    const notion = new Client({ auth: config.notionApiKey });
    const page = await notion.pages.retrieve({ page_id: id });
    if (!isFullPage(page)) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    const props = page.properties as Record<string, unknown>;
    const active = (props['Active'] as { checkbox?: boolean } | undefined)?.checkbox ?? false;
    if (!active) return NextResponse.json({ error: 'Form not available' }, { status: 404 });
    pdfUrl   = rt(props, 'PDF URL');
    formName = (props['Name'] as { title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? 'form';
  }

  const fileId = driveFileIdFromUrl(pdfUrl);
  if (!fileId) return NextResponse.json({ error: 'Form PDF not found' }, { status: 404 });

  // ── Fill the AcroForm fields (do NOT flatten — keep editable) ─────────────────
  const source = await downloadPdfFromDrive(config.driveRefreshToken, fileId);
  const pdfDoc = await PDFDocument.load(source);
  const form = pdfDoc.getForm();

  for (const [name, value] of Object.entries(fieldValues ?? {})) {
    if (value == null || value === '') continue;
    try {
      const field = form.getField(name);
      const type = field.constructor.name;
      if (type === 'PDFTextField') {
        form.getTextField(name).setText(String(value));
      } else if (type === 'PDFCheckBox') {
        const v = String(value).toLowerCase();
        if (v === 'true' || v === 'yes' || v === '1' || v === 'on') form.getCheckBox(name).check();
        else form.getCheckBox(name).uncheck();
      } else if (type === 'PDFDropdown') {
        form.getDropdown(name).select(String(value));
      } else if (type === 'PDFRadioGroup') {
        form.getRadioGroup(name).select(String(value));
      } else {
        // Best effort for any other field type.
        try { form.getTextField(name).setText(String(value)); } catch { /* skip */ }
      }
    } catch { /* field not present in this PDF — skip */ }
  }

  const bytes = await pdfDoc.save();
  const safeName = `${formName}`.replace(/[^\w\-. ]+/g, '_');

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
