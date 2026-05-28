import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { verifyFormToken } from '@/lib/formToken';

export const dynamic = 'force-dynamic';

export interface CashflowFormData {
  token: string;
  // Income
  salary:           number;
  business:         number;
  rental:           number;
  investment:       number;
  otherIncome:      number;
  // Fixed expenses
  housing:          number;
  carLoan:          number;
  insurancePremium: number;
  education:        number;
  internet:         number;
  subscriptions:    number;
  otherFixed:       number;
  // Variable expenses
  food:             number;
  diningOut:        number;
  transport:        number;
  entertainment:    number;
  lifestyle:        number; // legacy — kept for old submissions
  healthcare:       number;
  clothing:         number;
  selfDevelopment:  number;
  travel:           number;
  gifts:            number;
  otherVariable:    number;
  // EPF / savings
  epfEmployee:      number;
  epfEmployer:      number;
  otherSavings:     number;
  // Meta
  notes:            string;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as CashflowFormData;

  // 1. Verify token
  const payload = verifyFormToken(body.token);
  if (!payload) {
    return NextResponse.json({ error: 'This link has expired or is invalid.' }, { status: 400 });
  }

  // 2. Load advisor config
  const config = await getAdvisorConfig(payload.advisorId);
  if (!config?.notionApiKey || !config.cashflowDbId) {
    return NextResponse.json({ error: 'Advisor configuration not found.' }, { status: 500 });
  }

  // 3. Aggregate totals
  const totalIncome   = (body.salary ?? 0) + (body.business ?? 0) + (body.rental ?? 0) + (body.investment ?? 0) + (body.otherIncome ?? 0);
  const totalFixed    = (body.housing ?? 0) + (body.carLoan ?? 0) + (body.insurancePremium ?? 0) + (body.education ?? 0) + (body.internet ?? 0) + (body.subscriptions ?? 0) + (body.otherFixed ?? 0);
  const totalVariable = (body.food ?? 0) + (body.diningOut ?? 0) + (body.transport ?? 0) + (body.entertainment ?? 0) + (body.lifestyle ?? 0) + (body.healthcare ?? 0) + (body.clothing ?? 0) + (body.selfDevelopment ?? 0) + (body.travel ?? 0) + (body.gifts ?? 0) + (body.otherVariable ?? 0);
  const totalEPF      = (body.epfEmployee ?? 0) + (body.epfEmployer ?? 0) + (body.otherSavings ?? 0);

  // 4. Build detailed notes as formatted text
  const monthLabel = new Date(payload.month + 'T00:00:00').toLocaleString('en-MY', { month: 'long', year: 'numeric' });
  const details = [
    `=== INCOME (RM ${totalIncome.toLocaleString()}) ===`,
    body.salary          ? `Salary: RM ${body.salary.toLocaleString()}`                   : '',
    body.business        ? `Business: RM ${body.business.toLocaleString()}`               : '',
    body.rental          ? `Rental: RM ${body.rental.toLocaleString()}`                   : '',
    body.investment      ? `Investment: RM ${body.investment.toLocaleString()}`           : '',
    body.otherIncome     ? `Other Income: RM ${body.otherIncome.toLocaleString()}`        : '',
    '',
    `=== FIXED EXPENSES (RM ${totalFixed.toLocaleString()}) ===`,
    body.housing          ? `Housing/Mortgage: RM ${body.housing.toLocaleString()}`            : '',
    body.carLoan          ? `Car Loan: RM ${body.carLoan.toLocaleString()}`                    : '',
    body.insurancePremium ? `Insurance Premiums: RM ${body.insurancePremium.toLocaleString()}` : '',
    body.education        ? `Education: RM ${body.education.toLocaleString()}`                 : '',
    body.internet         ? `Internet & Phone Bills: RM ${body.internet.toLocaleString()}`     : '',
    body.subscriptions    ? `Subscriptions: RM ${body.subscriptions.toLocaleString()}`         : '',
    body.otherFixed       ? `Other Fixed: RM ${body.otherFixed.toLocaleString()}`              : '',
    '',
    `=== VARIABLE EXPENSES (RM ${totalVariable.toLocaleString()}) ===`,
    body.food             ? `Food & Groceries: RM ${body.food.toLocaleString()}`               : '',
    body.diningOut        ? `Dining Out / Food Delivery: RM ${body.diningOut.toLocaleString()}`: '',
    body.transport        ? `Transport: RM ${body.transport.toLocaleString()}`                 : '',
    body.entertainment    ? `Entertainment: RM ${body.entertainment.toLocaleString()}`         : '',
    body.healthcare       ? `Healthcare: RM ${body.healthcare.toLocaleString()}`               : '',
    body.clothing         ? `Clothing & Personal Care: RM ${body.clothing.toLocaleString()}`   : '',
    body.selfDevelopment  ? `Education / Books / Courses: RM ${body.selfDevelopment.toLocaleString()}` : '',
    body.travel           ? `Travel & Holidays: RM ${body.travel.toLocaleString()}`            : '',
    body.gifts            ? `Gifts & Donations: RM ${body.gifts.toLocaleString()}`             : '',
    body.otherVariable    ? `Other Variable: RM ${body.otherVariable.toLocaleString()}`        : '',
    '',
    `=== EPF & SAVINGS (RM ${totalEPF.toLocaleString()}) ===`,
    body.epfEmployee     ? `EPF Employee: RM ${body.epfEmployee.toLocaleString()}`        : '',
    body.epfEmployer     ? `EPF Employer: RM ${body.epfEmployer.toLocaleString()}`        : '',
    body.otherSavings    ? `Other Savings: RM ${body.otherSavings.toLocaleString()}`      : '',
    body.notes ? `\nNotes: ${body.notes}` : '',
  ].filter(l => l !== '').join('\n');

  const entryTitle = `${payload.clientName} — ${monthLabel}`;

  // 5. Write to Notion
  const notion = new Client({ auth: config.notionApiKey });

  try {
    const properties: Record<string, unknown> = {
      'Entry': {
        title: [{ text: { content: entryTitle } }],
      },
      'Month': {
        date: { start: payload.month },
      },
      'Monthly income (MYR)': {
        number: totalIncome,
      },
      'Fixed expenses (MYR)': {
        number: totalFixed,
      },
      'Variable expenses (MYR)': {
        number: totalVariable,
      },
      'EPF contribution (MYR)': {
        number: totalEPF,
      },
    };

    const page = await notion.pages.create({
      parent: { database_id: config.cashflowDbId },
      properties: properties as never,
    });

    // Optional enrichment fields — each in its own try/catch so one missing
    // property never breaks the whole submission
    try {
      await notion.pages.update({
        page_id: page.id,
        properties: {
          'Notes': { rich_text: [{ text: { content: details.substring(0, 2000) } }] },
        } as never,
      });
    } catch { /* Notes column may not exist in this DB */ }

    try {
      await notion.pages.update({
        page_id: page.id,
        properties: {
          'Submitted Via Form': { checkbox: true },
          'Submission Date': { date: { start: new Date().toISOString().split('T')[0] } },
        } as never,
      });
    } catch { /* optional fields — ignore if not present */ }

    // Try to link client relation if DB has it
    if (payload.clientId) {
      try {
        await notion.pages.update({
          page_id: page.id,
          properties: {
            '👥 Client': { relation: [{ id: payload.clientId }] },
          } as never,
        });
      } catch { /* relation may not exist */ }
    }

    return NextResponse.json({
      success: true,
      entry: entryTitle,
      summary: {
        income:   totalIncome,
        expenses: totalFixed + totalVariable,
        epf:      totalEPF,
        surplus:  totalIncome - totalFixed - totalVariable - totalEPF,
      },
    });
  } catch (e: unknown) {
    console.error('Cashflow submit error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Failed to save to database: ${msg}` },
      { status: 500 }
    );
  }
}
