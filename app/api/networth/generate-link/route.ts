import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { generateFormToken } from '@/lib/formToken';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { clientId: string; clientName: string };
  if (!body.clientId || !body.clientName) {
    return NextResponse.json({ error: 'clientId and clientName are required' }, { status: 400 });
  }

  const token = generateFormToken({
    advisorId,
    clientId:   body.clientId,
    clientName: body.clientName,
    month:      '',  // not used for net worth
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'https://aria-app-liart.vercel.app');

  return NextResponse.json({
    url:        `${baseUrl}/form/networth/${token}`,
    token,
    expiresIn:  '7 days',
    clientName: body.clientName,
    advisorName: config.name,
  });
}
