import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getForm } from '@/lib/formsLibrary';
import { downloadPdf, storageReady } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/[id]/download
 * Streams the blank form PDF (any signed-in FA). Works for every form —
 * fillable, scanned, or XFA — since it just returns the stored file as-is.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!storageReady()) return NextResponse.json({ error: 'File storage is not configured.' }, { status: 500 });

  const form = await getForm(config, id);
  if (!form || !form.active) return NextResponse.json({ error: 'Form not available' }, { status: 404 });
  if (!form.pdfUrl) return NextResponse.json({ error: 'Form PDF not found' }, { status: 404 });

  const bytes = await downloadPdf(form.pdfUrl);
  const safeName = `${form.name}`.replace(/[^\w\-. ]+/g, '_');
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
