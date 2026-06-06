import { NextRequest, NextResponse } from 'next/server';
import { refreshDigest } from '@/lib/marketDigestStore';

export const dynamic = 'force-dynamic';

/**
 * Daily Vercel Cron — regenerates the Market Digest from live BNM data.
 * If CRON_SECRET is configured, require it (Vercel sends it as a Bearer token).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  try {
    const digest = await refreshDigest();
    return NextResponse.json({ ok: true, dataDate: digest.dataDate, generatedAt: digest.generatedAt });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
