import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getDriveAuthUrl } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin' && config?.name !== 'Sky Siew') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to your environment variables.' },
      { status: 500 }
    );
  }

  const url = getDriveAuthUrl(advisorId);
  return NextResponse.json({ url });
}
