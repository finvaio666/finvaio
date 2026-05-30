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

/** Clamp a value to a non-negative number within a reasonable financial range. */
function sanitizeNum(v: unknown, max = 10_000_000): number {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.round(n * 100) / 100, max));
}

/** Strip control characters from free-text fields. */
function sanitizeText(v: unknown, maxLen = 2000): string {
  return String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const raw = rawBody as Record<string, unknown>;

  // Sanitize all fields before processing
  const body: CashflowFormData = {
    token:            sanitizeText(raw.token, 500),
    salary:           sanitizeNum(raw.salary),
    business:         sanitizeNum(raw.business),
    rental:           sanitizeNum(raw.rental),
    investment:       sanitizeNum(raw.investment),
    otherIncome:      sanitizeNum(raw.otherIncome),
    housing:          sanitizeNum(raw.housing),
    carLoan:          sanitizeNum(raw.carLoan),
    insurancePremium: sanitizeNum(raw.insurancePremium),
    education:        sanitizeNum(raw.education),
    internet:         sanitizeNum(raw.internet),
    subscriptions:    sanitizeNum(raw.subscriptions),
    otherFixed:       sanitizeNum(raw.otherFixed),
    food:             sanitizeNum(raw.food),
    diningOut:        sanitizeNum(raw.diningOut),
    transport:        sanitizeNum(raw.transport),
    entertainment:    sanitizeNum(raw.entertainment),
    lifestyle:        sanitizeNum(raw.lifestyle),
    healthcare:       sanitizeNum(raw.healthcare),
    clothing:         sanitizeNum(raw.clothing),
    selfDevelopment:  sanitizeNum(raw.selfDevelopment),
    travel:           sanitizeNum(raw.travel),
    gifts:            sanitizeNum(raw.gifts),
    otherVariable:    sanitizeNum(raw.otherVariable),
    epfEmployee:      sanitizeNum(raw.epfEmployee),
    epfEmployer:      sanitizeNum(raw.epfEmployer),
    otherSavings:     sanitizeNum(raw.otherSavings),
    notes:            sanitizeText(raw.notes),
  };

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
  // Employer EPF is funded by the company — exclude from deduction, record separately in notes only
  const totalEPF      = (body.epfEmployee ?? 0) + (body.otherSavings ?? 0);
  const employerEPF   = (body.epfEmployer ?? 0);

  // 4. Build breakdown — JSON for machine-reading + text for human notes
  const monthLabel = new Date(payload.month + 'T00:00:00').toLocaleString('en-MY', { month: 'long', year: 'numeric' });

  // Structured breakdown stored as JSON (parsed back by the dashboard)
  const breakdown = {
    fixed: {
      housing:          body.housing          ?? 0,
      carLoan:          body.carLoan          ?? 0,
      insurancePremium: body.insurancePremium ?? 0,
      education:        body.education        ?? 0,
      internet:         body.internet         ?? 0,
      subscriptions:    body.subscriptions    ?? 0,
      otherFixed:       body.otherFixed       ?? 0,
    },
    variable: {
      food:            body.food            ?? 0,
      diningOut:       body.diningOut       ?? 0,
      transport:       body.transport       ?? 0,
      entertainment:   body.entertainment   ?? 0,
      healthcare:      body.healthcare      ?? 0,
      clothing:        body.clothing        ?? 0,
      selfDevelopment: body.selfDevelopment ?? 0,
      travel:          body.travel          ?? 0,
      gifts:           body.gifts           ?? 0,
      otherVariable:   body.otherVariable   ?? 0,
    },
    income: {
      salary:      body.salary      ?? 0,
      business:    body.business    ?? 0,
      rental:      body.rental      ?? 0,
      investment:  body.investment  ?? 0,
      otherIncome: body.otherIncome ?? 0,
    },
    epf: {
      epfEmployee:  body.epfEmployee  ?? 0,
      epfEmployer:  body.epfEmployer  ?? 0,
      otherSavings: body.otherSavings ?? 0,
    },
    advisorNotes: body.notes ?? '',
  };

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
    body.epfEmployee     ? `EPF Employee (deducted): RM ${body.epfEmployee.toLocaleString()}`           : '',
    body.otherSavings    ? `Other Savings (deducted): RM ${body.otherSavings.toLocaleString()}`         : '',
    employerEPF          ? `EPF Employer (company contribution, not deducted): RM ${employerEPF.toLocaleString()}` : '',
    body.notes ? `\nNotes: ${body.notes}` : '',
  ].filter(l => l !== '').join('\n');

  const entryTitle = `${payload.clientName} — ${monthLabel}`;

  // 5. Write to Notion (upsert: update existing entry for same client+month, or create new)
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

    // Check for an existing entry with the same title (client + month)
    const existing = await notion.databases.query({
      database_id: config.cashflowDbId,
      filter: {
        property: 'Entry',
        title: { equals: entryTitle },
      },
      page_size: 1,
    });

    let pageId: string;
    if (existing.results.length > 0) {
      // Overwrite the existing record
      pageId = existing.results[0].id;
      await notion.pages.update({
        page_id: pageId,
        properties: properties as never,
      });
    } else {
      // Create a new record
      const page = await notion.pages.create({
        parent: { database_id: config.cashflowDbId },
        properties: properties as never,
      });
      pageId = page.id;
    }

    // Optional enrichment fields — each in its own try/catch so one missing
    // property never breaks the whole submission
    try {
      // Store JSON breakdown so the dashboard can parse individual line items.
      // Falls back gracefully if the Notes column doesn't exist in this DB.
      const breakdownJson = JSON.stringify(breakdown);
      await notion.pages.update({
        page_id: pageId,
        properties: {
          'Notes': { rich_text: [{ text: { content: breakdownJson.substring(0, 2000) } }] },
        } as never,
      });
    } catch { /* Notes column may not exist in this DB */ }

    try {
      await notion.pages.update({
        page_id: pageId,
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
          page_id: pageId,
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
        surplus:  totalIncome - totalFixed - totalVariable - totalEPF, // employer EPF excluded
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
