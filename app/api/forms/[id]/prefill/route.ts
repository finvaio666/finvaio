import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { FieldMapping } from '@/lib/formsLibrary';
import { FillBundle, resolvePrefill } from '@/lib/formFill';

export const dynamic = 'force-dynamic';

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}

/**
 * GET /api/forms/[id]/prefill?clientId=&policyId=&accountId=
 * Resolves the form's mapped fields against the client's data.
 * Returns { values: { pdfField: value } }.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (!config?.notionApiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId  = req.nextUrl.searchParams.get('clientId') ?? '';
  const policyId  = req.nextUrl.searchParams.get('policyId')  ?? undefined;
  const accountId = req.nextUrl.searchParams.get('accountId') ?? undefined;
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const notion = new Client({ auth: config.notionApiKey });
  const isAdmin = config.role === 'Admin';

  // ── Form field mapping ───────────────────────────────────────────────────────
  const formPage = await notion.pages.retrieve({ page_id: id });
  if (!isFullPage(formPage)) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  const mappingRaw = rt(formPage.properties as Record<string, unknown>, 'Field Mapping');
  let mapping: FieldMapping | null = null;
  if (mappingRaw) { try { mapping = JSON.parse(mappingRaw); } catch { /* ignore */ } }

  // ── Client record (advisor may only fill their own clients) ──────────────────
  const clientPage = await notion.pages.retrieve({ page_id: clientId });
  if (!isFullPage(clientPage)) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  const cp = clientPage.properties as Record<string, unknown>;
  const owner = (cp['Advisor'] as { select?: { name: string } })?.select?.name ?? '';
  if (!isAdmin && owner && owner !== config.name) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const title = (k: string) => (cp[k] as { title?: { plain_text: string }[] })?.title?.[0]?.plain_text ?? '';
  const dt = (k: string) => (cp[k] as { date?: { start: string } })?.date?.start ?? '';
  const ph = (k: string) => (cp[k] as { phone_number?: string })?.phone_number ?? '';
  const em = (k: string) => (cp[k] as { email?: string })?.email ?? '';

  const bundle: FillBundle = {
    client: {
      name:  title('Client Name'),
      dob:   dt('Date of Birth'),
      phone: ph('Phone'),
      email: em('Email'),
    },
    insurance: [],
    portfolio: [],
    advisorName: config.name,
  };

  // ── Policies (insurance) for policy.* keys ────────────────────────────────────
  if (config.insuranceDbId) {
    try {
      const res = await notion.databases.query({
        database_id: config.insuranceDbId,
        filter: { property: 'Clients', relation: { contains: clientId } },
        page_size: 100,
      });
      res.results.filter(isFullPage).forEach(pg => {
        const p = pg.properties as Record<string, unknown>;
        bundle.insurance.push({
          id: pg.id,
          policyName:   (p['Policy Name'] as { title?: { plain_text: string }[] })?.title?.[0]?.plain_text ?? '',
          insurer:      (p['Insurer'] as { rich_text?: { plain_text: string }[] })?.rich_text?.[0]?.plain_text ?? '',
          policyNumber: (p['Policy Number'] as { rich_text?: { plain_text: string }[] })?.rich_text?.[0]?.plain_text ?? '',
          sumAssured:   (p['Sum Assured (MYR)'] as { number?: number })?.number ?? undefined,
        });
      });
    } catch { /* db not configured */ }
  }

  // ── Accounts (portfolio holdings) for account.* keys ──────────────────────────
  if (config.portfolioDbId) {
    try {
      const res = await notion.databases.query({
        database_id: config.portfolioDbId,
        filter: { property: '👥 Clients', relation: { contains: clientId } },
        page_size: 100,
      });
      res.results.filter(isFullPage).forEach(pg => {
        const p = pg.properties as Record<string, unknown>;
        bundle.portfolio.push({
          id: pg.id,
          name: (p['Holding Name'] as { title?: { plain_text: string }[] })?.title?.[0]?.plain_text ?? '',
        });
      });
    } catch { /* db not configured */ }
  }

  const values = resolvePrefill(mapping, bundle, policyId, accountId);
  // Also hand back the policy/account lists so the FA can pick when there's >1.
  return NextResponse.json({
    values,
    policies: bundle.insurance.map(i => ({ id: i.id, label: i.policyName || i.policyNumber || i.insurer || 'Policy' })),
    accounts: bundle.portfolio.map(a => ({ id: a.id, label: a.name || 'Account' })),
  });
}
