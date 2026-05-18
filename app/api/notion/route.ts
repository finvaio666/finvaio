import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';

export const dynamic = 'force-dynamic';

const DB = {
  clients:   '362de6dd-1dfe-80e5-9275-e4ce2fc046b2',
  portfolio: '363de6dd-1dfe-8058-b73e-c7fa8bb431fb',
  cashflow:  '363de6dd-1dfe-8008-a6d7-f12c1c59d4cd',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'clients';

  if (!process.env.NOTION_API_KEY) {
    return NextResponse.json({ error: 'NOTION_API_KEY not set.', data: null }, { status: 200 });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  try {
    if (type === 'clients') {
      const res = await notion.databases.query({
        database_id: DB.clients,
        sorts: [{ property: 'Client Name', direction: 'ascending' }],
      });
      const data = res.results.filter(isFullPage).map(page => {
        const p = page.properties;
        return {
          id: page.id,
          name:        p['Client Name']?.type === 'title'        ? p['Client Name'].title[0]?.plain_text ?? ''        : '',
          status:      p['Status']?.type === 'select'            ? p['Status'].select?.name ?? ''                    : '',
          segment:     p['Client Segment']?.type === 'select'    ? p['Client Segment'].select?.name ?? ''            : '',
          aum:         p['AUM (MYR)']?.type === 'number'         ? p['AUM (MYR)'].number ?? 0                        : 0,
          income:      p['Monthly income (MYR)']?.type === 'number' ? p['Monthly income (MYR)'].number ?? 0          : 0,
          risk:        p['Risk Profile']?.type === 'select'      ? p['Risk Profile'].select?.name ?? ''              : '',
          nextReview:  p['Next review date']?.type === 'date'    ? p['Next review date'].date?.start ?? ''           : '',
          lastReview:  p['Last review date']?.type === 'date'    ? p['Last review date'].date?.start ?? ''           : '',
          onboarding:  p['Onboarding date']?.type === 'date'     ? p['Onboarding date'].date?.start ?? ''            : '',
          goals:       p['Financial goals']?.type === 'multi_select' ? p['Financial goals'].multi_select.map(g => g.name) : [],
          phone:       p['Phone']?.type === 'phone_number'       ? p['Phone'].phone_number ?? ''                     : '',
          email:       p['Email']?.type === 'email'              ? p['Email'].email ?? ''                            : '',
          dob:         p['Date of Birth']?.type === 'date'       ? p['Date of Birth'].date?.start ?? ''              : '',
        };
      });
      return NextResponse.json({ data });
    }

    if (type === 'portfolio') {
      const res = await notion.databases.query({
        database_id: DB.portfolio,
        sorts: [{ property: 'Holding Name', direction: 'ascending' }],
      });
      const data = res.results.filter(isFullPage).map(page => {
        const p = page.properties;
        const value    = p['Value (MYR)']?.type === 'number'         ? p['Value (MYR)'].number ?? 0         : 0;
        const purchase = p['Purchase price (MYR)']?.type === 'number' ? p['Purchase price (MYR)'].number ?? 0 : 0;
        const gain     = value - purchase;
        const ret      = purchase > 0 ? Math.round((gain / purchase) * 100) : 0;
        return {
          id:          page.id,
          name:        p['Holding Name']?.type === 'title'    ? p['Holding Name'].title[0]?.plain_text ?? '' : '',
          assetClass:  p['Asset class']?.type === 'select'    ? p['Asset class'].select?.name ?? ''          : '',
          institution: p['Institution']?.type === 'select'    ? p['Institution'].select?.name ?? ''          : '',
          status:      p['Status']?.type === 'select'         ? p['Status'].select?.name ?? ''               : '',
          maturity:    p['Maturity date']?.type === 'date'    ? p['Maturity date'].date?.start ?? ''         : '',
          value,
          purchase,
          gain,
          returnPct: ret,
        };
      });
      return NextResponse.json({ data });
    }

    if (type === 'cashflow') {
      const res = await notion.databases.query({
        database_id: DB.cashflow,
        sorts: [{ property: 'Month', direction: 'descending' }],
      });
      const data = res.results.filter(isFullPage).map(page => {
        const p = page.properties;
        const income   = p['Monthly income (MYR)']?.type === 'number'    ? p['Monthly income (MYR)'].number ?? 0    : 0;
        const fixed    = p['Fixed expenses (MYR)']?.type === 'number'    ? p['Fixed expenses (MYR)'].number ?? 0    : 0;
        const variable = p['Variable expenses (MYR)']?.type === 'number' ? p['Variable expenses (MYR)'].number ?? 0 : 0;
        const epf      = p['EPF contribution (MYR)']?.type === 'number'  ? p['EPF contribution (MYR)'].number ?? 0  : 0;
        const surplus  = income - fixed - variable - epf;
        const savingsRate = income > 0 ? Math.round((surplus / income) * 100) : 0;
        return {
          id:       page.id,
          entry:    p['Entry']?.type === 'title' ? p['Entry'].title[0]?.plain_text ?? '' : '',
          month:    p['Month']?.type === 'date'  ? p['Month'].date?.start ?? ''           : '',
          income, fixed, variable, epf, surplus, savingsRate,
        };
      });
      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'Unknown type', data: null }, { status: 400 });
  } catch (error) {
    console.error('Notion API error:', error);
    return NextResponse.json({ error: 'Notion fetch failed', data: null }, { status: 500 });
  }
}
