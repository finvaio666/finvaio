import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getCompanyThemes } from '@/lib/themesStore';
import { categorizeByThemes } from '@/lib/emailThemes';

export const dynamic = 'force-dynamic';

interface Item { id: string; subject: string; snippet: string }

/**
 * Keyword-only categorisation (no AI — conserves Gemini quota). Resolves any
 * leftover emails to a theme via rules, or "Other" if none match.
 */
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  let body: { items: Item[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];

  const themes = await getCompanyThemes();
  const results: Record<string, string> = {};
  for (const it of items) {
    results[it.id] = categorizeByThemes(themes, it.subject, it.snippet) ?? 'other';
  }
  return NextResponse.json({ results });
}
