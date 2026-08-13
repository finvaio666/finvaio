import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import * as sbProducts from '@/lib/repos/products';
import { jwtVerify } from 'jose';

export const dynamic = 'force-dynamic';

const useSupabaseProducts = () => process.env.DATA_SOURCE_PRODUCTS === 'supabase';

/* ── Auth helper ────────────────────────────────────────────────────────── */
async function getSession(req: NextRequest) {
  const token  = req.cookies.get('aria-session')?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as { advisorId: string; username: string; role: string };
  } catch { return null; }
}

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/products
   Body: { action: 'extract' | 'save', ... }
───────────────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(session.advisorId);
  if (!config || !config.features?.includes('products')) {
    return NextResponse.json({ error: 'Feature not available.' }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  /* ── AI EXTRACT ──────────────────────────────────────────────────────── */
  if (action === 'extract') {
    const { text } = body as { text: string };
    if (!text?.trim()) return NextResponse.json({ error: 'No text provided.' }, { status: 400 });

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return NextResponse.json({ error: 'AI service unavailable.' }, { status: 503 });

    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are a financial product data extractor for a Malaysian financial advisory firm.

Extract structured product information from the text below. Determine if it describes an INSURANCE plan or an INVESTMENT FUND.

Return ONLY valid JSON — no markdown, no explanation — in exactly one of these two formats:

For insurance:
{
  "productType": "insurance",
  "name": "full product name",
  "insurer": "insurance company name",
  "type": one of ["Life", "Critical Illness", "Medical", "Investment-Linked", "Takaful", "Personal Accident", "Others"],
  "minAge": number or null,
  "maxAge": number or null,
  "minSumAssured": number in MYR or null,
  "maxSumAssured": number in MYR or null,
  "estMonthlyPremium": "e.g. RM 150–400" or null,
  "keyFeatures": "bullet points joined with · separator, max 6 points",
  "epfApproved": false
}

For fund:
{
  "productType": "fund",
  "name": "full fund name",
  "fundHouse": "fund management company",
  "assetClass": one of ["Equity", "Bond", "Mixed", "Money Market", "Real Estate", "Others"],
  "region": one of ["Malaysia", "Asia Pacific", "Global", "Regional", "Others"],
  "riskLevel": one of ["Conservative", "Moderate", "Aggressive"],
  "return3Y": number (annualised %, e.g. 8.5) or null,
  "minInvestment": number in MYR or null,
  "salesCharge": number (%, e.g. 3.0) or null,
  "epfApproved": true or false,
  "description": "one paragraph summary of the fund's strategy and suitability"
}

If a field is not mentioned in the text, use null. Do not invent numbers.

TEXT TO EXTRACT:
---
${text.slice(0, 8000)}
---`;

    try {
      const result = await model.generateContent(prompt);
      const raw    = result.response.text().trim();
      // Strip any accidental markdown fences
      const clean  = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
      const parsed = JSON.parse(clean);
      return NextResponse.json({ data: parsed });
    } catch (e) {
      console.error('AI extract error:', e);
      return NextResponse.json({ error: 'Could not extract product data. Try pasting cleaner text.' }, { status: 422 });
    }
  }

  /* ── SAVE TO NOTION ──────────────────────────────────────────────────── */
  if (action === 'save') {
    const { productType, product } = body as { productType: 'insurance' | 'fund'; product: Record<string, unknown> };

    if (config.notionApiKey === 'DEMO_MODE') {
      return NextResponse.json({ error: 'Cannot save in Demo mode.' }, { status: 403 });
    }

    // ── Supabase save path (Phase 2.11) — no Notion DB id needed; advisor scoping
    // stamped in the repo. Feature gate already enforced above.
    if (useSupabaseProducts()) {
      try {
        if (productType === 'insurance')  await sbProducts.createPlan(config.name, product);
        else if (productType === 'fund')  await sbProducts.createFund(config.name, product);
        else return NextResponse.json({ error: 'Invalid product type.' }, { status: 400 });
        return NextResponse.json({ success: true });
      } catch (e) {
        console.error('Product save error (supabase):', e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
      }
    }

    const notion = new Client({ auth: config.notionApiKey });

    if (productType === 'insurance') {
      const dbId = config.insurancePlansDbId;
      if (!dbId) return NextResponse.json({ error: 'Insurance Plans DB not configured. Add the DB ID in your FINVA settings.' }, { status: 400 });

      const insProps: Record<string, unknown> = {
        'Name':         { title:   [{ text: { content: String(product.name    ?? '') } }] },
        'Insurer':      { select:  { name: String(product.insurer ?? 'Unknown') } },
        'Type':         { select:  { name: String(product.type    ?? 'Others')  } },
        'EPF Approved': { checkbox: Boolean(product.epfApproved) },
        'Status':       { select:  { name: 'Active' } },
      };
      if (product.minAge      != null) insProps['Min Age']           = { number: Number(product.minAge) };
      if (product.maxAge      != null) insProps['Max Age']           = { number: Number(product.maxAge) };
      if (product.minSumAssured != null) insProps['Min Sum Assured'] = { number: Number(product.minSumAssured) };
      if (product.maxSumAssured != null) insProps['Max Sum Assured'] = { number: Number(product.maxSumAssured) };
      if (product.estMonthlyPremium) insProps['Est Monthly Premium'] = { rich_text: [{ text: { content: String(product.estMonthlyPremium) } }] };
      if (product.keyFeatures)       insProps['Key Features']        = { rich_text: [{ text: { content: String(product.keyFeatures) } }] };

      await notion.pages.create({ parent: { database_id: dbId }, properties: insProps as any });
      return NextResponse.json({ success: true });
    }

    if (productType === 'fund') {
      const dbId = config.fundsDbId;
      if (!dbId) return NextResponse.json({ error: 'Funds DB not configured. Add the DB ID in your FINVA settings.' }, { status: 400 });

      const fundProps: Record<string, unknown> = {
        'Name':         { title:   [{ text: { content: String(product.name       ?? '') } }] },
        'Fund House':   { select:  { name: String(product.fundHouse  ?? 'Unknown') } },
        'Asset Class':  { select:  { name: String(product.assetClass ?? 'Others')  } },
        'Region':       { select:  { name: String(product.region     ?? 'Malaysia') } },
        'Risk Level':   { select:  { name: String(product.riskLevel  ?? 'Moderate') } },
        'EPF Approved': { checkbox: Boolean(product.epfApproved) },
        'Status':       { select:  { name: 'Active' } },
      };
      if (product.return3Y      != null) fundProps['3Y Return %']   = { number: Number(product.return3Y) };
      if (product.minInvestment != null) fundProps['Min Investment'] = { number: Number(product.minInvestment) };
      if (product.salesCharge   != null) fundProps['Sales Charge %'] = { number: Number(product.salesCharge) };
      if (product.description)           fundProps['Description']    = { rich_text: [{ text: { content: String(product.description) } }] };

      await notion.pages.create({ parent: { database_id: dbId }, properties: fundProps as any });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid product type.' }, { status: 400 });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
