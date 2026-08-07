import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listForms } from '@/lib/formsLibrary';

export const dynamic = 'force-dynamic';

// ── GET — list ACTIVE forms (any signed-in FA) ────────────────────────────────
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Forms via the data-source abstraction (Notion or Supabase per flag).
  // FA list doesn't need the raw field mapping — keep the payload light, but
  // flag whether the form can be auto-filled (AcroForm fields OR an overlay map).
  const forms = (await listForms(config, { activeOnly: true })).map(f => {
    const m = f.fieldMapping;
    const hasFill = !!m && (m.type === 'fillable' || m.type === 'overlay') && (m.fields?.length ?? 0) > 0;
    return {
      id: f.id, name: f.name, provider: f.provider, category: f.category,
      tags: f.tags, formType: f.formType, hasFill,
    };
  });

  return NextResponse.json({ forms });
}
