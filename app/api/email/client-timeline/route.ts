import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getActive, searchClientEmails } from '@/lib/emailService';
import { domainMatches } from '@/lib/outlook';
import { getCompanyDomains } from '@/lib/institutions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientName = searchParams.get('clientName') ?? '';
  if (!clientName.trim()) return NextResponse.json({ emails: [] });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  if (!getActive(config).connected) {
    return NextResponse.json({ emails: [], connected: false });
  }

  // Company-wide shared whitelist
  const domains = await getCompanyDomains();
  if (domains.length === 0) {
    return NextResponse.json({ emails: [], noWhitelist: true });
  }

  try {
    const candidates = await searchClientEmails(config, domains, clientName);

    // ── Strict re-filter (Gmail/Graph search is fuzzy) ───────────────────────
    // 1. Counterpart must be a whitelisted institution domain
    // 2. The client name must appear in the SUBJECT or PREVIEW (not buried deep
    //    in a bulk body like a commission report listing many clients)
    const parts = clientName.trim().toLowerCase().split(/\s+/);
    const first = parts[0] ?? '';
    const last  = parts.length > 1 ? parts[parts.length - 1] : '';
    const full  = clientName.trim().toLowerCase();

    const emails = candidates.filter(e => {
      // Domain check (brand-based) — inbound: from must be whitelisted; outbound: to must be
      const domainOk = e.direction === 'outbound' ? domainMatches(e.to, domains) : domainMatches(e.from, domains);
      if (!domainOk) return false;

      // Name relevance — full name, or first AND last as whole words in subject/snippet
      // (word boundaries prevent short tokens like "ng" matching inside "Tng")
      const hay = `${e.subject} ${e.snippet}`.toLowerCase();
      const wordIn = (w: string) => w.length > 0 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay);
      const nameOk = hay.includes(full) || (wordIn(first) && wordIn(last));
      return nameOk;
    });

    return NextResponse.json({ emails, connected: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Client timeline error:', msg);
    return NextResponse.json({ error: msg, emails: [] }, { status: 500 });
  }
}
