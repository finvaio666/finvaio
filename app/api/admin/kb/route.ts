import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import * as kb from '@/lib/repos/knowledgeEntries';

export const dynamic = 'force-dynamic';

/**
 * Admin > KB Review. GET lists every entry with its review fields; PATCH edits
 * an entry and/or moves it through the review states:
 *   approve   -> published (Ask FINVA starts using it)
 *   reject    -> rejected  (kept for the audit trail, never used)
 *   unpublish -> draft
 *   save      -> edit text only, status unchanged
 */

async function admin(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return null;
  const config = await getAdvisorConfig(advisorId);
  return config?.role === 'Admin' ? config : null;
}

export async function GET(req: NextRequest) {
  if (!(await admin(req))) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  try {
    return NextResponse.json({ entries: await kb.listForReview() });
  } catch (e) {
    console.error('admin kb list failed:', e);
    return NextResponse.json({ error: 'Could not load the knowledge base.' }, { status: 500 });
  }
}

const SOURCES = ['manual', 'fa_suggestion', 'industry_reference', 'ai_synthesis', 'public_regulation', 'product_knowledge'];

export async function PATCH(req: NextRequest) {
  const config = await admin(req);
  if (!config) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  let body: {
    id?: string; action?: 'save' | 'approve' | 'reject' | 'unpublish'; reviewNote?: string;
    fields?: Partial<{ title: string; situation: string; resolution: string; keyTakeaway: string; tags: string[]; category: string; entryType: string; isBigLesson: boolean; source: string }>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body.id || !body.action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 });

  const f = body.fields ?? {};
  if (f.source !== undefined && !SOURCES.includes(f.source)) return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
  if (body.action === 'approve' && f.title !== undefined && !f.title.trim()) return NextResponse.json({ error: 'A title is required to publish.' }, { status: 400 });

  const status = body.action === 'approve' ? 'published' : body.action === 'reject' ? 'rejected' : body.action === 'unpublish' ? 'draft' : undefined;
  try {
    await kb.updateEntry(body.id, {
      ...f,
      ...(f.tags ? { tags: f.tags.map(t => t.trim().toLowerCase()).filter(Boolean) } : {}),
      ...(status ? { status, reviewedBy: config.name } : {}),
      ...(body.reviewNote !== undefined ? { reviewNote: body.reviewNote } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('admin kb update failed:', e);
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }
}
