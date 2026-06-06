import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getCompanyThemes } from '@/lib/themesStore';
import { categorizeEmail } from '@/lib/emailClassifier';

export const dynamic = 'force-dynamic';

interface Item { id: string; from: string; subject: string; snippet: string }

/**
 * Background categorisation — resolves the theme of emails that the instant
 * keyword rules couldn't decide, using the AI (cached per message id). The
 * client calls this in small batches after first paint so theme counts tick up.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  let body: { items: Item[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];

  const themes = await getCompanyThemes();
  const results: Record<string, string> = {};
  await Promise.all(items.map(async (it) => {
    try {
      results[it.id] = await categorizeEmail(themes, it.id, it.from, it.subject, it.snippet);
    } catch {
      results[it.id] = 'other';
    }
  }));

  return NextResponse.json({ results });
}
