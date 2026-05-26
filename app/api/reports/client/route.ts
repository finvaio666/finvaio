import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { jwtVerify } from 'jose';

export const dynamic = 'force-dynamic';

async function getSession(req: NextRequest) {
  const token  = req.cookies.get('aria-session')?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as { advisorId: string; username: string; role: string };
  } catch { return null; }
}

/**
 * GET /api/reports/client?clientId=<notionPageId>
 * Returns { client, portfolio, insurance } for PDF generation.
 */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(session.advisorId);
  if (!config) return NextResponse.json({ error: 'Config not found' }, { status: 403 });

  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  // ── Demo mode: return placeholder data ─────────────────────────────────────
  if (config.notionApiKey === 'DEMO_MODE') {
    return NextResponse.json({
      client:    { name: 'Demo Client', status: 'Active', segment: 'Affluent', risk: 'Moderate', aum: 250000, income: 8000, goals: ['Retirement', 'Education'] },
      portfolio: [],
      insurance: [],
    });
  }

  const notion = new Client({ auth: config.notionApiKey });

  // ── 1. Fetch client ─────────────────────────────────────────────────────────
  let clientData = null;
  try {
    const page = await notion.pages.retrieve({ page_id: clientId });
    if (isFullPage(page)) {
      const p = page.properties as Record<string, unknown>;
      const rt = (key: string) => (p[key] as { rich_text?: Array<{ plain_text: string }> })?.rich_text?.[0]?.plain_text ?? '';
      const sel = (key: string) => (p[key] as { select?: { name: string } })?.select?.name ?? '';
      const num = (key: string) => (p[key] as { number?: number })?.number ?? 0;
      const title = (key: string) => (p[key] as { title?: Array<{ plain_text: string }> })?.title?.[0]?.plain_text ?? '';
      const ms  = (key: string) => ((p[key] as { multi_select?: Array<{ name: string }> })?.multi_select ?? []).map((x: { name: string }) => x.name);
      const dt  = (key: string) => (p[key] as { date?: { start: string } })?.date?.start ?? '';
      const ph  = (key: string) => (p[key] as { phone_number?: string })?.phone_number ?? '';
      const em  = (key: string) => (p[key] as { email?: string })?.email ?? '';
      clientData = {
        id:          clientId,
        name:        title('Client Name'),
        status:      sel('Status'),
        segment:     sel('Client Segment'),
        risk:        sel('Risk Profile'),
        aum:         num('AUM (MYR)'),
        income:      num('Monthly income (MYR)'),
        goals:       ms('Financial goals'),
        phone:       ph('Phone'),
        email:       em('Email'),
        dob:         dt('Date of Birth'),
        onboarding:  dt('Onboarding date'),
        nextReview:  dt('Next review date'),
        lastReview:  dt('Last review date'),
      };
    }
  } catch { /* page not found */ }

  if (!clientData) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // ── 2. Fetch portfolio (filter by client relation) ──────────────────────────
  const portfolioItems: unknown[] = [];
  if (config.portfolioDbId) {
    try {
      const res = await notion.databases.query({
        database_id: config.portfolioDbId,
        filter: { property: '👥 Clients', relation: { contains: clientId } },
        page_size: 100,
      });
      res.results.filter(isFullPage).forEach(page => {
        const p = page.properties as Record<string, unknown>;
        const title = (key: string) => (p[key] as { title?: Array<{ plain_text: string }> })?.title?.[0]?.plain_text ?? '';
        const sel   = (key: string) => (p[key] as { select?: { name: string } })?.select?.name ?? '';
        const rt    = (key: string) => (p[key] as { rich_text?: Array<{ plain_text: string }> })?.rich_text?.[0]?.plain_text ?? '';
        const num   = (key: string) => (p[key] as { number?: number })?.number ?? 0;
        portfolioItems.push({
          id:           page.id,
          name:         title('Holding Name'),
          assetClass:   sel('Asset class'),
          institution:  rt('Institution'),
          currency:     sel('Currency') || 'MYR',
          valueOrig:    num('Value (Original Currency)'),
          valueMYR:     num('Value (MYR)'),
          purchaseOrig: num('Purchase price (original currency)'),
          purchaseMYR:  num('Purchase price (MYR)'),
          fxRate:       num('FX Rate to MYR'),
          status:       sel('Status'),
          maturityDate: (p['Maturity date'] as { date?: { start: string } })?.date?.start ?? '',
        });
      });
    } catch { /* db not configured */ }
  }

  // ── 3. Fetch insurance (filter by client relation) ──────────────────────────
  const insuranceItems: unknown[] = [];
  if (config.insuranceDbId) {
    try {
      const res = await notion.databases.query({
        database_id: config.insuranceDbId,
        filter: { property: 'Clients', relation: { contains: clientId } },
        page_size: 100,
      });
      res.results.filter(isFullPage).forEach(page => {
        const p = page.properties as Record<string, unknown>;
        const title = (key: string) => (p[key] as { title?: Array<{ plain_text: string }> })?.title?.[0]?.plain_text ?? '';
        const sel   = (key: string) => (p[key] as { select?: { name: string } })?.select?.name ?? '';
        const rt    = (key: string) => (p[key] as { rich_text?: Array<{ plain_text: string }> })?.rich_text?.[0]?.plain_text ?? '';
        const num   = (key: string) => (p[key] as { number?: number })?.number ?? 0;
        const ms    = (key: string) => ((p[key] as { multi_select?: Array<{ name: string }> })?.multi_select ?? []).map((x: { name: string }) => x.name);
        insuranceItems.push({
          id:               page.id,
          policyName:       title('Policy Name'),
          insuranceType:    sel('Insurance Type'),
          benefits:         ms('Benefits'),
          status:           sel('Status'),
          insurer:          rt('Insurer'),
          policyNumber:     rt('Policy Number'),
          sumAssured:       num('Sum Assured (MYR)'),
          lifeCover:        num('Life Cover (MYR)'),
          ciCover:          num('CI Cover (MYR)'),
          paCover:          num('PA Cover (MYR)'),
          tpdCover:         num('TPD Cover (MYR)'),
          medicalClass:     rt('Medical Class'),
          annualPremium:    num('Annual Premium (MYR)'),
          commencementDate: (p['Commencement Date'] as { date?: { start: string } })?.date?.start ?? '',
          maturityDate:     (p['Maturity Date'] as { date?: { start: string } })?.date?.start ?? '',
          beneficiary:      rt('Beneficiary'),
          policyOwner:      rt('Policy Owner'),
          lifeAssured:      rt('Life Assured'),
        });
      });
    } catch { /* db not configured */ }
  }

  return NextResponse.json({
    client:    clientData,
    portfolio: portfolioItems,
    insurance: insuranceItems,
    generatedAt: new Date().toISOString(),
  });
}
