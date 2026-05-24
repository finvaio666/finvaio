import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';

export async function GET(req: NextRequest) {
  const token  = req.cookies.get('aria-session')?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return NextResponse.json({ name: 'Advisor', role: 'Consultant', initials: 'FA' });

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const advisorId   = (payload.advisorId as string) ?? '';
    const username    = (payload.username  as string) ?? '';
    const role        = (payload.role      as string) ?? 'Advisor';

    // Try to get display name from Notion config
    let displayName = username;
    if (advisorId) {
      const config = await getAdvisorConfig(advisorId);
      if (config?.name) displayName = config.name;
    }

    // Build initials from display name
    const initials = displayName.split(' ').filter(Boolean).slice(0, 2)
      .map((w: string) => w[0].toUpperCase()).join('');

    return NextResponse.json({ name: displayName, role, initials, username });
  } catch {
    return NextResponse.json({ name: 'Advisor', role: 'Consultant', initials: 'FA' });
  }
}
