import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import { listHoldings } from '@/lib/portfolio';
import { listPolicies } from '@/lib/insurance';
import { listAssets } from '@/lib/assets';
import { listCashflow } from '@/lib/cashflow';
import { queryAllPages } from '@/lib/notionQueryAll';
import { DEMO_CLIENTS, DEMO_PORTFOLIO, DEMO_INSURANCE, DEMO_CASHFLOW, DEMO_INSURANCE_PLANS, DEMO_FUNDS } from '@/lib/demoData';

export const dynamic = 'force-dynamic';

// Short server-side cache per advisor+type. Pages (Clients, Investment,
// Insurance, Net Worth, Cashflow) re-fetch from Notion on every load — this
// makes navigating between them near-instant. Mutations are short-lived in the
// cache (60s) and callers can pass ?fresh=1 to bypass.
const dataCache = new Map<string, { ts: number; body: unknown }>();
const DATA_TTL = 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'clients';

  // ── Resolve advisor's own Notion credentials ─────────────────────────────
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  const config    = advisorId ? await getAdvisorConfig(advisorId) : null;

  if (!config?.notionApiKey) {
    return NextResponse.json({ error: 'Advisor configuration not found.', data: null }, { status: 401 });
  }

  // ── Feature-gated types — check before demo check so demo can't bypass ───
  const PRODUCT_TYPES = ['insurance-products', 'funds'];
  if (PRODUCT_TYPES.includes(type)) {
    const hasFeature = config.notionApiKey !== 'DEMO_MODE' && config.features?.includes('products');
    if (!hasFeature) return NextResponse.json({ error: 'Feature not available.', data: [] }, { status: 403 });
  }

  // ── Demo mode — return hardcoded data, skip Notion ───────────────────────
  if (config.notionApiKey === 'DEMO_MODE') {
    if (type === 'clients')   return NextResponse.json({ data: DEMO_CLIENTS });
    if (type === 'portfolio') return NextResponse.json({ data: DEMO_PORTFOLIO });
    if (type === 'insurance') return NextResponse.json({ data: DEMO_INSURANCE });
    if (type === 'cashflow')  return NextResponse.json({ data: DEMO_CASHFLOW });
    return NextResponse.json({ data: [] });
  }

  // ── Cache lookup / writer (keyed by advisor + type) ──────────────────────
  const fresh   = searchParams.get('fresh') === '1';
  const cacheKey = `${advisorId}|${type}`;
  if (!fresh) {
    const c = dataCache.get(cacheKey);
    if (c && Date.now() - c.ts < DATA_TTL) return NextResponse.json(c.body);
  }
  const json = (body: unknown) => { dataCache.set(cacheKey, { ts: Date.now(), body }); return NextResponse.json(body); };

  const notion = new Client({ auth: config.notionApiKey });
  const DB = {
    clients:          config.clientsDbId,
    portfolio:        config.portfolioDbId,
    cashflow:         config.cashflowDbId,
    insurance:        config.insuranceDbId,
    assets:           config.assetsDbId,
    insurancePlans:   config.insurancePlansDbId,
    funds:            config.fundsDbId,
  };

  // ── Centralized multi-advisor scoping ────────────────────────────────────
  // Shared DBs hold every FA's records, tagged with an "Advisor" select.
  // A normal advisor sees only their own rows; Admin sees everything.
  const isAdmin = config.role === 'Admin';
  const advisorFilter = isAdmin
    ? undefined
    : { property: 'Advisor', select: { equals: config.name } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (extra?: any) => {
    if (advisorFilter && extra) return { filter: { and: [advisorFilter, extra] } };
    if (advisorFilter)          return { filter: advisorFilter };
    if (extra)                  return { filter: extra };
    return {};
  };

  try {
    if (type === 'clients') {
      // Clients via the data-source abstraction (Notion or Supabase per flag).
      const data = (await listClients(config))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => ({
          id:         c.id,
          name:       c.name,
          status:     c.status,
          segment:    c.segment,
          aum:        c.aum,
          income:     c.monthlyIncome,
          risk:       c.risk,
          nextReview: c.nextReview,
          lastReview: c.lastReview,
          onboarding: c.onboardingDate,
          goals:      c.financialGoals,
          phone:      c.phone,
          email:      c.email,
          dob:        c.dob,
        }));
      return json({ data });
    }

    if (type === 'portfolio') {
      if (!DB.portfolio) return NextResponse.json({ data: [] });

      // Client ID → name map and holdings are independent queries — run them
      // in parallel instead of one-after-the-other to roughly halve latency.
      // Clients + holdings via the data-source abstraction; join on notion_id so
      // clientId is consistent across Notion (page id) and Supabase (uuid).
      const [clients, holdings] = await Promise.all([listClients(config), listHoldings(config)]);
      const clientMap: Record<string, { id: string; name: string }> = {};
      for (const c of clients) if (c.notionId) clientMap[c.notionId] = { id: c.id, name: c.name };

      const data = holdings
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(h => {
          const value    = h.valueMyr    || h.valueOriginal    * h.fxRate;
          const purchase = h.purchaseMyr || h.purchaseOriginal * h.fxRate;
          const gain     = value - purchase;
          const client   = clientMap[h.clientNotionId];
          return {
            id:            h.id,
            clientId:      client?.id ?? '',
            units:         h.units,
            name:          h.name,
            clientName:    client?.name ?? '',
            assetClass:    h.assetClass,
            institution:   h.institution,
            fameAccountNo: h.fameAccountNo,
            fundSource:    h.fundSource,
            status:        h.status,
            maturity:      h.maturityDate,
            currency:      h.currency || 'MYR',
            valueOrig:     h.valueOriginal,
            purchaseOrig:  h.purchaseOriginal,
            fxRate:        h.fxRate,
            value,
            purchase,
            gain,
            returnPct:     purchase > 0 ? Math.round((gain / purchase) * 100) : 0,
          };
        });
      return json({ data });
    }

    if (type === 'cashflow') {
      if (!DB.cashflow) return NextResponse.json({ data: [] });
      // Cashflow via the data-source abstraction (Notion or Supabase per flag).
      // Already sorted by month desc; surplus/savingsRate/breakdown computed inside.
      return json({ data: await listCashflow(config) });
    }

    if (type === 'insurance') {
      if (!DB.insurance) return NextResponse.json({ data: [] });

      // Clients + policies via the data-source abstraction; join on notion_id.
      const [clients, policies] = await Promise.all([listClients(config), listPolicies(config)]);
      const clientMap: Record<string, { name: string; income: number }> = {};
      for (const c of clients) if (c.notionId) clientMap[c.notionId] = { name: c.name, income: c.monthlyIncome };

      const data = policies
        .slice()
        .sort((a, b) => a.policyName.localeCompare(b.policyName))
        .map(pol => {
          const client = clientMap[pol.clientNotionId];
          return {
            id:               pol.id,
            policyName:       pol.policyName,
            clientName:       client?.name ?? '',
            clientIncome:     client?.income ?? 0,
            insuranceType:    pol.insuranceType,
            benefits:         pol.benefits,
            status:           pol.status,
            insurer:          pol.insurer,
            policyNumber:     pol.policyNumber,
            sumAssured:       pol.sumAssured,
            annualPremium:    pol.annualPremium,
            commencementDate: pol.commencementDate,
            maturityDate:     pol.maturityDate,
            beneficiary:      pol.beneficiary,
            notes:            pol.notes,
            policyOwner:      pol.policyOwner,
            lifeAssured:      pol.lifeAssured,
            lifeCover:        pol.lifeCover,
            ciCover:          pol.ciCover,
            paCover:          pol.paCover,
            tpdCover:         pol.tpdCover,
            medicalClass:     pol.medicalClass,
            medicalCard:      pol.medicalCard,
          };
        });
      return json({ data });
    }

    // ── Assets & Liabilities (net worth) ──────────────────────────────────────
    if (type === 'assets') {
      if (!DB.assets) return NextResponse.json({ data: [] });
      const data = (await listAssets(config)).map(a => ({
        id:       a.id,
        name:     a.name,
        client:   a.client,
        itemType: a.type,
        category: a.category,
        value:    a.valueMyr,
        notes:    a.notes,
      }));
      return json({ data });
    }

    // ── Insurance product catalogue ───────────────────────────────────────────
    if (type === 'insurance-products') {
      if (!DB.insurancePlans) return NextResponse.json({ data: [] });
      const pages = await queryAllPages(notion, {
        database_id: DB.insurancePlans,
        filter: { property: 'Status', select: { equals: 'Active' } },
        sorts: [{ property: 'Insurer', direction: 'ascending' }],
      });
      const data = pages.map((page) => {
        const p = page.properties as Record<string, any>;
        return {
          id:               page.id,
          name:             p['Name']?.title?.[0]?.plain_text ?? '',
          insurer:          p['Insurer']?.select?.name ?? p['Insurer']?.rich_text?.[0]?.plain_text ?? '',
          type:             p['Type']?.select?.name ?? '',
          minAge:           p['Min Age']?.number ?? 0,
          maxAge:           p['Max Age']?.number ?? 99,
          minSumAssured:    p['Min Sum Assured']?.number ?? 0,
          maxSumAssured:    p['Max Sum Assured']?.number ?? 0,
          estMonthlyPremium: p['Est Monthly Premium']?.rich_text?.[0]?.plain_text ?? '',
          keyFeatures:      p['Key Features']?.rich_text?.[0]?.plain_text ?? '',
          epfApproved:      p['EPF Approved']?.checkbox ?? false,
          status:           p['Status']?.select?.name ?? 'Active',
        };
      });
      return json({ data });
    }

    // ── Investment fund catalogue ─────────────────────────────────────────────
    if (type === 'funds') {
      if (!DB.funds) return NextResponse.json({ data: [] });
      const pages = await queryAllPages(notion, {
        database_id: DB.funds,
        filter: { property: 'Status', select: { equals: 'Active' } },
        sorts: [{ property: 'Fund House', direction: 'ascending' }],
      });
      const data = pages.map((page) => {
        const p = page.properties as Record<string, any>;
        return {
          id:            page.id,
          name:          p['Name']?.title?.[0]?.plain_text ?? '',
          fundHouse:     p['Fund House']?.select?.name ?? p['Fund House']?.rich_text?.[0]?.plain_text ?? '',
          assetClass:    p['Asset Class']?.select?.name ?? '',
          region:        p['Region']?.select?.name ?? '',
          riskLevel:     p['Risk Level']?.select?.name ?? '',
          return3Y:      p['3Y Return %']?.number ?? 0,
          minInvestment: p['Min Investment']?.number ?? 1000,
          salesCharge:   p['Sales Charge %']?.number ?? 0,
          epfApproved:   p['EPF Approved']?.checkbox ?? false,
          status:        p['Status']?.select?.name ?? 'Active',
          description:   p['Description']?.rich_text?.[0]?.plain_text ?? '',
        };
      });
      return json({ data });
    }

    return NextResponse.json({ error: 'Unknown type', data: null }, { status: 400 });
  } catch (error) {
    console.error('Notion API error:', error);
    return NextResponse.json({ error: 'Data fetch failed', data: null }, { status: 500 });
  }
}
