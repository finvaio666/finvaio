import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
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
      if (!DB.clients) return NextResponse.json({ data: [] });
      const pages = await queryAllPages(notion, {
        database_id: DB.clients,
        ...scoped(),
        sorts: [{ property: 'Client Name', direction: 'ascending' }],
      });
      const data = pages.map(page => {
        const p = page.properties;
        return {
          id: page.id,
          name:        p['Client Name']?.type === 'title'           ? p['Client Name'].title[0]?.plain_text ?? ''            : '',
          status:      p['Status']?.type === 'select'               ? p['Status'].select?.name ?? ''                         : '',
          segment:     p['Client Segment']?.type === 'select'       ? p['Client Segment'].select?.name ?? ''                 : '',
          aum:         p['AUM (MYR)']?.type === 'number'            ? p['AUM (MYR)'].number ?? 0                             : 0,
          income:      p['Monthly income (MYR)']?.type === 'number' ? p['Monthly income (MYR)'].number ?? 0                  : 0,
          risk:        p['Risk Profile']?.type === 'select'         ? p['Risk Profile'].select?.name ?? ''                   : '',
          nextReview:  p['Next review date']?.type === 'date'       ? p['Next review date'].date?.start ?? ''                : '',
          lastReview:  p['Last review date']?.type === 'date'       ? p['Last review date'].date?.start ?? ''                : '',
          onboarding:  p['Onboarding date']?.type === 'date'        ? p['Onboarding date'].date?.start ?? ''                 : '',
          goals:       p['Financial goals']?.type === 'multi_select'? p['Financial goals'].multi_select.map(g => g.name)    : [],
          phone:       p['Phone']?.type === 'phone_number'          ? p['Phone'].phone_number ?? ''                          : '',
          email:       p['Email']?.type === 'email'                 ? p['Email'].email ?? ''                                 : '',
          dob:         p['Date of Birth']?.type === 'date'          ? p['Date of Birth'].date?.start ?? ''                   : '',
        };
      });
      return json({ data });
    }

    if (type === 'portfolio') {
      if (!DB.portfolio) return NextResponse.json({ data: [] });

      // Build client ID → name map first
      const clientPages = await queryAllPages(notion, { database_id: DB.clients, ...scoped() });
      const clientMap: Record<string, string> = {};
      clientPages.forEach(page => {
        const name = page.properties['Client Name']?.type === 'title'
          ? page.properties['Client Name'].title[0]?.plain_text ?? '' : '';
        if (name) clientMap[page.id] = name;
      });

      const pages = await queryAllPages(notion, {
        database_id: DB.portfolio,
        ...scoped(),
        sorts: [{ property: 'Holding Name', direction: 'ascending' }],
      });
      const data = pages.map(page => {
        const p = page.properties;
        const currency      = p['Currency']?.type === 'select'  ? p['Currency'].select?.name ?? 'MYR'  : 'MYR';
        const valueOrig     = p['Value (Original Currency)']?.type === 'number' ? p['Value (Original Currency)'].number ?? 0 : 0;
        const purchaseOrig  = p['Purchase price (original currency)']?.type === 'number' ? p['Purchase price (original currency)'].number ?? 0 : 0;
        const fxRate        = p['FX Rate to MYR']?.type === 'number' ? p['FX Rate to MYR'].number ?? 1 : 1;
        const value    = p['Value (MYR)']?.type === 'number'          ? p['Value (MYR)'].number ?? (valueOrig * fxRate)           : (valueOrig * fxRate);
        const purchase = p['Purchase price (MYR)']?.type === 'number' ? p['Purchase price (MYR)'].number ?? (purchaseOrig * fxRate) : (purchaseOrig * fxRate);
        const gain     = value - purchase;
        const ret      = purchase > 0 ? Math.round((gain / purchase) * 100) : 0;

        const clientRelIds = p['👥 Clients']?.type === 'relation' ? p['👥 Clients'].relation.map(r => r.id) : [];
        const clientName   = clientRelIds.map(id => clientMap[id] ?? '').filter(Boolean).join(', ');
        const clientId     = clientRelIds[0] ?? '';
        const units        = p['Units']?.type === 'number' ? p['Units'].number ?? 0 : 0;

        return {
          id: page.id,
          clientId,
          units,
          name:          p['Holding Name']?.type === 'title'     ? p['Holding Name'].title[0]?.plain_text ?? ''        : '',
          clientName,
          assetClass:    p['Asset class']?.type === 'select'     ? p['Asset class'].select?.name ?? ''                 : '',
          institution:   p['Institution']?.type === 'rich_text'  ? p['Institution'].rich_text[0]?.plain_text ?? ''     : '',
          fameAccountNo: p['FAME Account No']?.type === 'rich_text' ? p['FAME Account No'].rich_text[0]?.plain_text ?? '' : '',
          fundSource:    p['Fund Source']?.type === 'rich_text'  ? p['Fund Source'].rich_text[0]?.plain_text ?? ''     : '',
          status:      p['Status']?.type === 'select'          ? p['Status'].select?.name ?? ''                      : '',
          maturity:    p['Maturity date']?.type === 'date'     ? p['Maturity date'].date?.start ?? ''                 : '',
          currency,
          valueOrig,
          purchaseOrig,
          fxRate,
          value,
          purchase,
          gain,
          returnPct: ret,
        };
      });
      return json({ data });
    }

    if (type === 'cashflow') {
      if (!DB.cashflow) return NextResponse.json({ data: [] });
      const pages = await queryAllPages(notion, {
        database_id: DB.cashflow,
        ...scoped(),
        sorts: [{ property: 'Month', direction: 'descending' }],
      });
      const data = pages.map(page => {
        const p = page.properties;
        const income   = p['Monthly income (MYR)']?.type === 'number'    ? p['Monthly income (MYR)'].number ?? 0    : 0;
        const fixed    = p['Fixed expenses (MYR)']?.type === 'number'    ? p['Fixed expenses (MYR)'].number ?? 0    : 0;
        const variable = p['Variable expenses (MYR)']?.type === 'number' ? p['Variable expenses (MYR)'].number ?? 0 : 0;
        const epf      = p['EPF contribution (MYR)']?.type === 'number'  ? p['EPF contribution (MYR)'].number ?? 0  : 0;
        const surplus  = income - fixed - variable - epf;
        const savingsRate = income > 0 ? Math.round((surplus / income) * 100) : 0;

        // Parse breakdown JSON stored in Notes field (if present)
        let breakdown: Record<string, Record<string, number>> | null = null;
        try {
          const notesRaw = p['Notes']?.type === 'rich_text'
            ? (p['Notes'] as { type: string; rich_text: { plain_text: string }[] }).rich_text[0]?.plain_text ?? ''
            : '';
          if (notesRaw.startsWith('{')) breakdown = JSON.parse(notesRaw);
        } catch { /* no breakdown stored */ }

        return {
          id:       page.id,
          entry:    p['Entry']?.type === 'title' ? p['Entry'].title[0]?.plain_text ?? '' : '',
          month:    p['Month']?.type === 'date'  ? p['Month'].date?.start ?? ''           : '',
          income, fixed, variable, epf, surplus, savingsRate,
          breakdown,
        };
      });
      return json({ data });
    }

    if (type === 'insurance') {
      if (!DB.insurance) return NextResponse.json({ data: [] });

      const clientPages = await queryAllPages(notion, { database_id: DB.clients, ...scoped() });
      const clientMap: Record<string, { name: string; income: number }> = {};
      clientPages.forEach(page => {
        const name   = page.properties['Client Name']?.type === 'title'  ? page.properties['Client Name'].title[0]?.plain_text ?? ''  : '';
        const income = page.properties['Monthly income (MYR)']?.type === 'number' ? page.properties['Monthly income (MYR)'].number ?? 0 : 0;
        if (name) clientMap[page.id] = { name, income };
      });

      const pages = await queryAllPages(notion, {
        database_id: DB.insurance,
        ...scoped(),
        sorts: [{ property: 'Policy Name', direction: 'ascending' }],
      });
      const data = pages.map(page => {
        const p = page.properties;
        const clientRelIds = p['Clients']?.type === 'relation' ? p['Clients'].relation.map((r: { id: string }) => r.id) : [];
        const clientInfo   = clientRelIds.map((id: string) => clientMap[id]).filter(Boolean)[0];
        return {
          id:               page.id,
          policyName:       p['Policy Name']?.type === 'title'          ? p['Policy Name'].title[0]?.plain_text ?? ''          : '',
          clientName:       clientInfo?.name ?? '',
          clientIncome:     clientInfo?.income ?? 0,
          insuranceType:    p['Insurance Type']?.type === 'select'       ? p['Insurance Type'].select?.name ?? ''               : '',
          benefits:         p['Benefits']?.type === 'multi_select'       ? p['Benefits'].multi_select.map((b: { name: string }) => b.name) : [],
          status:           p['Status']?.type === 'select'               ? p['Status'].select?.name ?? ''                       : '',
          insurer:          p['Insurer']?.type === 'rich_text'           ? p['Insurer'].rich_text[0]?.plain_text ?? ''           : '',
          policyNumber:     p['Policy Number']?.type === 'rich_text'     ? p['Policy Number'].rich_text[0]?.plain_text ?? ''    : '',
          sumAssured:       p['Sum Assured (MYR)']?.type === 'number'    ? p['Sum Assured (MYR)'].number ?? 0                   : 0,
          annualPremium:    p['Annual Premium (MYR)']?.type === 'number' ? p['Annual Premium (MYR)'].number ?? 0                : 0,
          commencementDate: p['Commencement Date']?.type === 'date'      ? p['Commencement Date'].date?.start ?? ''             : '',
          maturityDate:     p['Maturity Date']?.type === 'date'          ? p['Maturity Date'].date?.start ?? ''                 : '',
          beneficiary:      p['Beneficiary']?.type === 'rich_text'       ? p['Beneficiary'].rich_text[0]?.plain_text ?? ''      : '',
          notes:            p['Notes']?.type === 'rich_text'             ? p['Notes'].rich_text[0]?.plain_text ?? ''            : '',
          policyOwner:      p['Policy Owner']?.type === 'rich_text'      ? p['Policy Owner'].rich_text[0]?.plain_text ?? ''     : '',
          lifeAssured:      p['Life Assured']?.type === 'rich_text'      ? p['Life Assured'].rich_text[0]?.plain_text ?? ''     : '',
          lifeCover:        p['Life Cover (MYR)']?.type === 'number'     ? p['Life Cover (MYR)'].number ?? 0                    : 0,
          ciCover:          p['CI Cover (MYR)']?.type === 'number'       ? p['CI Cover (MYR)'].number ?? 0                      : 0,
          paCover:          p['PA Cover (MYR)']?.type === 'number'       ? p['PA Cover (MYR)'].number ?? 0                      : 0,
          tpdCover:         p['TPD Cover (MYR)']?.type === 'number'      ? p['TPD Cover (MYR)'].number ?? 0                     : 0,
          medicalClass:     p['Medical Class']?.type === 'rich_text'     ? p['Medical Class'].rich_text[0]?.plain_text ?? ''    : '',
          medicalCard:      p['Medical Card']?.type === 'rich_text'      ? p['Medical Card'].rich_text[0]?.plain_text ?? ''     : '',
        };
      });
      return json({ data });
    }

    // ── Assets & Liabilities (net worth) ──────────────────────────────────────
    if (type === 'assets') {
      if (!DB.assets) return NextResponse.json({ data: [] });
      const pages = await queryAllPages(notion, {
        database_id: DB.assets,
        ...scoped(),
      });
      const data = pages.map(page => {
        const p = page.properties;
        return {
          id:       page.id,
          name:     p['Name']?.type === 'title'        ? p['Name'].title[0]?.plain_text ?? ''              : '',
          client:   p['Client']?.type === 'rich_text'  ? p['Client'].rich_text[0]?.plain_text ?? ''        : '',
          itemType: p['Type']?.type === 'select'       ? p['Type'].select?.name ?? ''                      : '',
          category: p['Category']?.type === 'select'   ? p['Category'].select?.name ?? ''                  : '',
          value:    p['Value (MYR)']?.type === 'number'? p['Value (MYR)'].number ?? 0                      : 0,
          notes:    p['Notes']?.type === 'rich_text'   ? p['Notes'].rich_text[0]?.plain_text ?? ''         : '',
        };
      });
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
