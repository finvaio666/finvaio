import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { searchClientEmails } from '@/lib/gmail';
import type { Institution } from '@/app/api/email/institutions/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientName = searchParams.get('clientName') ?? '';
  if (!clientName.trim()) return NextResponse.json({ emails: [] });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  if (!config.gmailRefreshToken) {
    return NextResponse.json({ emails: [], connected: false });
  }

  // Domain whitelist
  let institutions: Institution[] = [];
  if (config.institutionsJson) {
    try { institutions = JSON.parse(config.institutionsJson); } catch { /* ignore */ }
  }
  const domains = [...new Set(institutions.map(i => i.domain).filter(Boolean))];
  if (domains.length === 0) {
    return NextResponse.json({ emails: [], noWhitelist: true });
  }

  try {
    const emails = await searchClientEmails(
      config.gmailRefreshToken,
      domains,
      config.gmailAddress || '',
      clientName,
    );
    return NextResponse.json({ emails, connected: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Client timeline error:', msg);
    return NextResponse.json({ error: msg, emails: [] }, { status: 500 });
  }
}
