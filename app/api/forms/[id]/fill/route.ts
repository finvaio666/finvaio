import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { downloadPdf, storageReady } from '@/lib/storage';
import { getForm, FieldMapping, OverlayFieldMapping } from '@/lib/formsLibrary';

export const dynamic = 'force-dynamic';

const isSupabaseForms = () => process.env.DATA_SOURCE_FORMS === 'supabase';

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
  if (!storageReady()) {
    return NextResponse.json({ error: 'File storage (R2) is not configured.' }, { status: 500 });
  }

  const { fieldValues } = (await req.json()) as Body;

  // ── Resolve the form's source PDF key + name + mapping (Notion or Supabase) ───
  let pdfKey: string;
  let formName: string;
  let mapping: FieldMapping | null = null;
  if (isSupabaseForms()) {
    const form = await getForm(config, id);
    if (!form)        return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    if (!form.active) return NextResponse.json({ error: 'Form not available' }, { status: 404 });
    pdfKey   = form.pdfUrl;
    formName = form.name || 'form';
    mapping  = form.fieldMapping;
  } else {
    const notion = new Client({ auth: config.notionApiKey });
    const page = await notion.pages.retrieve({ page_id: id });
    if (!isFullPage(page)) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    const props = page.properties as Record<string, unknown>;
    const active = (props['Active'] as { checkbox?: boolean } | undefined)?.checkbox ?? false;
    if (!active) return NextResponse.json({ error: 'Form not available' }, { status: 404 });
    pdfKey   = rt(props, 'PDF URL');
    formName = (props['Name'] as { title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? 'form';
    const raw = rt(props, 'Field Mapping');
    if (raw) { try { mapping = JSON.parse(raw); } catch { /* ignore */ } }
  }

  if (!pdfKey) return NextResponse.json({ error: 'Form PDF not found' }, { status: 404 });

  const source = await downloadPdf(pdfKey);
  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true });

  if (mapping?.type === 'overlay') {
    // ── Overlay: draw text at mapped coordinates (works on scanned/flat/XFA) ────
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    mapping.fields.forEach((f, i) => {
      const o = f as OverlayFieldMapping;
      const value = fieldValues?.[String(i)];
      if (value == null || value === '') return;
      const page = pages[(o.page ?? 1) - 1];
      if (!page) return;
      page.drawText(String(value), { x: o.x, y: o.y, size: o.size ?? 10, font, color: rgb(0, 0, 0) });
    });
  } else {
    // ── AcroForm fill (do NOT flatten — keep editable) ─────────────────────────
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
          try { form.getTextField(name).setText(String(value)); } catch { /* skip */ }
        }
      } catch { /* field not present in this PDF — skip */ }
    }
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
