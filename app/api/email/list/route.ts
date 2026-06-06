import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getActive, listEmails } from '@/lib/emailService';
import { getCompanyInstitutions } from '@/lib/institutions';
import { categorizeEmail } from '@/lib/emailClassifier';
import { getCompanyThemes } from '@/lib/themesStore';

export const dynamic = 'force-dynamic';

// Short server-side cache of the categorized result per advisor. The Email Hub
// and the dashboard "Inbox by Theme" widget both hit this endpoint; caching the
// (slow) Gmail fetch + categorization keeps repeat loads instant. Manual refresh
// (?fresh=1) bypasses it.
type ListPayload = Record<string, unknown>;
const listCache = new Map<string, { ts: number; payload: ListPayload }>();
const LIST_TTL = 90 * 1000;

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  if (!fresh) {
    const cached = listCache.get(advisorId);
    if (cached && Date.now() - cached.ts < LIST_TTL) {
      return NextResponse.json({ ...cached.payload, cached: true });
    }
  }

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  const active = getActive(config);
  if (!active.connected) {
    return NextResponse.json({ error: 'Email not connected', connected: false }, { status: 200 });
  }

  // Company-wide shared whitelist
  const institutions = await getCompanyInstitutions();
  const domains = [...new Set(institutions.map(i => i.domain).filter(Boolean))];
  const advisorEmail = active.address || '';

  // Strict whitelist: if no institutions configured, return empty — never pull all inbox
  if (domains.length === 0) {
    return NextResponse.json({
      connected:    true,
      emails:       [],
      institutions: [],
      advisorEmail,
      noWhitelist:  true,
    });
  }

  try {
    // Emails are already restricted to whitelisted institution domains, so they
    // are work-related by definition. No AI second-pass — it was wrongly dropping
    // legitimate automated notices (e.g. e-statements, transaction confirmations).
    const emails = await listEmails(config, domains, 60);

    // Auto-triage each email into a theme group (company-configurable themes).
    // Keyword rules resolve most instantly; only the unclear ones hit the AI
    // (cached per message), so this stays fast on repeat loads.
    const themes = await getCompanyThemes();
    await Promise.all(emails.map(async (e) => {
      try {
        e.category = await categorizeEmail(themes, e.id, e.from, e.subject, e.snippet);
      } catch {
        e.category = 'other';
      }
    }));

    const payload = { connected: true, emails, institutions, advisorEmail, themes };
    listCache.set(advisorId, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Email list error:', msg);
    return NextResponse.json({ error: `Failed to fetch emails: ${msg}` }, { status: 500 });
  }
}
