import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { getForm } from '@/lib/formsLibrary';
import { getClientById } from '@/lib/clients';
import { listPolicies } from '@/lib/insurance';
import { listHoldings } from '@/lib/portfolio';
import { FillBundle, resolvePrefill } from '@/lib/formFill';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/[id]/prefill?clientId=&policyId=&accountId=
 * Resolves the form's mapped fields against the client's data.
 * Returns { values: { pdfField: value } }.
 *
 * All reads go through the data-source abstractions (getForm / getClientById /
 * listPolicies / listHoldings), each honouring its own DATA_SOURCE_* flag — this
 * replaces the old inline Notion point-queries and their page-id coupling.
 * Policies/holdings are joined to the client on clientNotionId (source-agnostic).
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

  const isAdmin = config.role === 'Admin';

  // ── Form field mapping ───────────────────────────────────────────────────────
  const form = await getForm(config, id);
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  const mapping = form.fieldMapping;

  // ── Client record (advisor may only fill their own clients) ──────────────────
  const client = await getClientById(config, clientId);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  if (!isAdmin && client.advisorName && client.advisorName !== config.name) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Policies + holdings for this client (joined on clientNotionId) ────────────
  const cnid = client.notionId;
  const [policies, holdings] = await Promise.all([
    listPolicies(config).catch(() => []),
    listHoldings(config).catch(() => []),
  ]);

  const bundle: FillBundle = {
    client: {
      name:  client.name,
      dob:   client.dob,
      phone: client.phone,
      email: client.email,
    },
    insurance: policies.filter(p => p.clientNotionId === cnid).map(p => ({
      id:           p.id,
      policyName:   p.policyName,
      insurer:      p.insurer,
      policyNumber: p.policyNumber,
      sumAssured:   p.sumAssured || undefined,
    })),
    portfolio: holdings.filter(h => h.clientNotionId === cnid).map(h => ({
      id:   h.id,
      name: h.name,
    })),
    advisorName: config.name,
  };

  const values = resolvePrefill(mapping, bundle, policyId, accountId);
  // Also hand back the policy/account lists so the FA can pick when there's >1.
  return NextResponse.json({
    values,
    policies: bundle.insurance.map(i => ({ id: i.id, label: i.policyName || i.policyNumber || i.insurer || 'Policy' })),
    accounts: bundle.portfolio.map(a => ({ id: a.id, label: a.name || 'Account' })),
  });
}
