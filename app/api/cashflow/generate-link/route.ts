import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { generateFormToken } from '@/lib/formToken';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

  if (!config) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    clientId:   string;
    clientName: string;
    month:      string; // YYYY-MM-DD
  };

  if (!body.clientId || !body.clientName || !body.month) {
    return NextResponse.json({ error: 'clientId, clientName, and month are required' }, { status: 400 });
  }

  const token = generateFormToken({
    advisorId,
    clientId:   body.clientId,
    clientName: body.clientName,
    month:      body.month,
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://aria-app-liart.vercel.app';

  const formUrl = `${baseUrl}/form/cashflow/${token}`;

  return NextResponse.json({
    url:       formUrl,
    token,
    expiresIn: '7 days',
    clientName: body.clientName,
    month:      body.month,
    advisorName: config.name,
  });
}
