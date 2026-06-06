import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getCompanyThemes, setCompanyThemes } from '@/lib/themesStore';
import type { Theme } from '@/lib/emailThemes';

export const dynamic = 'force-dynamic';

// GET — return the company theme list (any signed-in advisor, for display)
export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const themes = await getCompanyThemes();
  return NextResponse.json({ themes });
}

// POST — save the theme list (Admin only)
export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  let body: { themes: Theme[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!Array.isArray(body.themes)) return NextResponse.json({ error: 'themes must be an array' }, { status: 400 });

  // Sanitize: keep known shape, drop empties, slugify ids, cap sizes.
  const seen = new Set<string>();
  const clean: Theme[] = [];
  for (const t of body.themes) {
    const label = String(t.label ?? '').trim().slice(0, 40);
    if (!label && t.id !== 'other') continue;
    let id = String(t.id ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') ||
             label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    if (!id) continue;
    while (seen.has(id)) id = `${id}-1`;
    seen.add(id);
    clean.push({
      id,
      label: label || 'Other',
      emoji: String(t.emoji ?? '🏷️').slice(0, 4),
      color: /^#[0-9a-fA-F]{6}$/.test(String(t.color)) ? String(t.color) : '#9CA3AF',
      keywords: Array.isArray(t.keywords) ? t.keywords.map(k => String(k).trim()).filter(Boolean).slice(0, 40) : [],
      locked: t.id === 'other' || undefined,
    });
  }

  try {
    await setCompanyThemes(advisorId, clean);
    return NextResponse.json({ success: true, themes: await getCompanyThemes() });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
