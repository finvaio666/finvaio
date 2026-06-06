import { NextRequest, NextResponse } from 'next/server';
import { getStoredDigest, refreshDigest } from '@/lib/marketDigestStore';

export const dynamic = 'force-dynamic';

// GET — return the latest stored digest. Generates one on first ever call.
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    let digest = await getStoredDigest();
    if (!digest) digest = await refreshDigest(); // cold start — generate once
    return NextResponse.json({ digest });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST — force a refresh now (any signed-in advisor; data source is free).
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const digest = await refreshDigest();
    return NextResponse.json({ digest });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
