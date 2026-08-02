import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import {
  getPlatformGroups,
  setPlatformGroups,
  type PlatformGroup,
} from '@/lib/platformGroups';

export const dynamic = 'force-dynamic';

// ── GET — current platform → group mapping ───────────────────────────────────
// Readable by any signed-in advisor: the Investment page needs it to break AUM
// down by group. Only writing is admin-gated.

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  const groups = await getPlatformGroups();
  return NextResponse.json({ groups, isAdmin: config.role === 'Admin' });
}

// ── POST — save the full mapping (admin only) ────────────────────────────────

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') {
    return NextResponse.json({ error: 'Only admins can manage platform groups.' }, { status: 403 });
  }

  let body: { groups: PlatformGroup[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!Array.isArray(body.groups)) {
    return NextResponse.json({ error: 'groups must be an array' }, { status: 400 });
  }

  const clean: PlatformGroup[] = body.groups.map((g, i) => ({
    id:   String(g.id ?? `group-${i}`).slice(0, 64),
    name: String(g.name ?? '').trim().slice(0, 80),
    platforms: Array.isArray(g.platforms)
      ? [...new Set(g.platforms.map(p => String(p).trim()).filter(Boolean))].slice(0, 50)
      : [],
  })).filter(g => g.name);

  // A platform in two groups would double-count AUM, so reject rather than
  // silently pick one.
  const seen = new Map<string, string>();
  for (const g of clean) {
    for (const p of g.platforms) {
      const key = p.toLowerCase();
      const owner = seen.get(key);
      if (owner && owner !== g.name) {
        return NextResponse.json(
          { error: `"${p}" is in both "${owner}" and "${g.name}". A platform can only belong to one group.` },
          { status: 400 },
        );
      }
      seen.set(key, g.name);
    }
  }

  try {
    await setPlatformGroups(advisorId, clean);
  } catch {
    return NextResponse.json({ error: 'Could not save platform groups.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, groups: clean });
}
