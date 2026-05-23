import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

// Temporary debug endpoint — remove after fixing portfolio issue
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';

  if (!advisorId) {
    return NextResponse.json({ error: 'No x-advisor-id header — not logged in or middleware not running' });
  }

  const config = await getAdvisorConfig(advisorId);

  if (!config) {
    return NextResponse.json({ error: 'getAdvisorConfig returned null', advisorId });
  }

  return NextResponse.json({
    advisorId,
    name:          config.name,
    role:          config.role,
    notionApiKey:  config.notionApiKey ? '✅ set (' + config.notionApiKey.slice(0, 8) + '...)' : '❌ empty',
    clientsDbId:   config.clientsDbId  || '❌ empty',
    portfolioDbId: config.portfolioDbId || '❌ empty',
    insuranceDbId: config.insuranceDbId || '❌ empty',
    cashflowDbId:  config.cashflowDbId  || '❌ empty',
  });
}
