import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getForm } from '@/lib/formsLibrary';

export const dynamic = 'force-dynamic';

// ── GET — a single active form + its field mapping (any signed-in FA) ──────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Form via the data-source abstraction (Notion or Supabase per flag).
  const form = await getForm(config, id);
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!form.active) return NextResponse.json({ error: 'Form not available' }, { status: 404 });

  return NextResponse.json({ form });
}
