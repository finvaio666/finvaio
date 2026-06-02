import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getActive, getFollowUps } from '@/lib/emailService';
import type { Institution } from '@/app/api/email/institutions/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  if (!getActive(config).connected) {
    return NextResponse.json({ followUps: [], connected: false });
  }

  let institutions: Institution[] = [];
  if (config.institutionsJson) {
    try { institutions = JSON.parse(config.institutionsJson); } catch { /* ignore */ }
  }
  const domains = [...new Set(institutions.map(i => i.domain).filter(Boolean))];
  if (domains.length === 0) {
    return NextResponse.json({ followUps: [], noWhitelist: true });
  }

  try {
    const followUps = await getFollowUps(config, domains, 3); // overdue after 3 days
    return NextResponse.json({ followUps, connected: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Follow-ups error:', msg);
    return NextResponse.json({ error: msg, followUps: [] }, { status: 500 });
  }
}
