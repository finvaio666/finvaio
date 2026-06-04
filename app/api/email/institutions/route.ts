import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getCompanyInstitutions, setCompanyInstitutions } from '@/lib/institutions';

export const dynamic = 'force-dynamic';

export interface Institution {
  id:     string;   // uuid-ish string
  name:   string;
  email:  string;
  domain: string;
  type:   'insurance' | 'fund' | 'other';
}

// ── GET — return current institutions list ───────────────────────────────────

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  // Company-wide shared whitelist (merged across all records)
  const institutions = await getCompanyInstitutions();
  return NextResponse.json({ institutions });
}

// ── POST — save full institutions list ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Institution whitelist management is admin-only
  const adminCfg = await getAdvisorConfig(advisorId);
  if (adminCfg?.role !== 'Admin') {
    return NextResponse.json({ error: 'Only admins can manage the institution whitelist.' }, { status: 403 });
  }

  let body: { institutions: Institution[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!Array.isArray(body.institutions)) {
    return NextResponse.json({ error: 'institutions must be an array' }, { status: 400 });
  }

  // Validate & sanitize each entry
  const clean: Institution[] = body.institutions.map(inst => ({
    id:     String(inst.id     ?? Date.now()),
    name:   String(inst.name   ?? '').slice(0, 200),
    email:  String(inst.email  ?? '').slice(0, 200),
    domain: String(inst.domain ?? '').toLowerCase().slice(0, 100),
    type:   (['insurance', 'fund', 'other'].includes(inst.type) ? inst.type : 'other') as Institution['type'],
  })).filter(i => i.name && (i.email || i.domain));

  // Save as the company-wide canonical list (admin record + clears others)
  await setCompanyInstitutions(advisorId, clean);
  return NextResponse.json({ success: true, count: clean.length });
}
