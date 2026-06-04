import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getUpcomingEvents } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  if (!config.calendarRefreshToken) {
    return NextResponse.json({ events: [], connected: false });
  }

  try {
    const events = await getUpcomingEvents(config);
    return NextResponse.json({
      events,
      connected: true,
      provider:  config.calendarProvider,
      address:   config.calendarAddress,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), events: [] }, { status: 500 });
  }
}
