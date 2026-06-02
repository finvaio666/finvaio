import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getActive, listEmails } from '@/lib/emailService';
import { classifyEmail } from '@/lib/emailClassifier';

export const dynamic = 'force-dynamic';

export interface Institution {
  name:   string;
  email:  string;
  domain: string;
}

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config) return NextResponse.json({ error: 'Advisor not found' }, { status: 401 });

  const active = getActive(config);
  if (!active.connected) {
    return NextResponse.json({ error: 'Email not connected', connected: false }, { status: 200 });
  }

  // Parse institutions for domain whitelist
  let institutions: Institution[] = [];
  if (config.institutionsJson) {
    try { institutions = JSON.parse(config.institutionsJson); } catch { /* ignore */ }
  }
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
    let emails = await listEmails(config, domains, 60);

    // If domains are configured, do AI second-pass classification on borderline emails
    // (skip if no domains — too expensive to classify everything)
    if (domains.length > 0) {
      const classified = await Promise.all(
        emails.map(async email => {
          // Skip AI for emails clearly from whitelisted domains
          const fromDomain = email.from.match(/@([\w.-]+)>/)?.[1] ?? '';
          if (domains.some(d => fromDomain.endsWith(d))) return email;

          const result = await classifyEmail(email.from, email.subject, email.snippet).catch(() => null);
          if (!result?.isWorkRelated) return null;
          return email;
        })
      );
      emails = classified.filter(Boolean) as typeof emails;
    }

    return NextResponse.json({
      connected: true,
      emails,
      institutions,
      advisorEmail,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Email list error:', msg);
    return NextResponse.json({ error: `Failed to fetch emails: ${msg}` }, { status: 500 });
  }
}
