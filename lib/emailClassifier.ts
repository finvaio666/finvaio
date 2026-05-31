/**
 * lib/emailClassifier.ts
 * Gemini-powered email classification, summarisation, and reply drafting.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

function getGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-1.5-flash' });
}

// ── Classification ────────────────────────────────────────────────────────────

export interface ClassifyResult {
  isWorkRelated: boolean;
  confidence:    'high' | 'medium' | 'low';
  category:      string;   // e.g. 'policy_renewal', 'statement', 'fund_update', 'other'
  reason:        string;
}

export async function classifyEmail(
  from:    string,
  subject: string,
  snippet: string,
): Promise<ClassifyResult> {
  const model = getGemini();

  const prompt = `You are an assistant for a Malaysian licensed financial advisor.
Determine if the following email is work-related — meaning it is from an insurance company, unit trust / investment fund house, or financial regulator, and relates to client policies, funds, transactions, or compliance.

From: ${from}
Subject: ${subject}
Snippet: ${snippet}

Respond ONLY in this exact JSON format (no markdown, no explanation):
{
  "isWorkRelated": true,
  "confidence": "high",
  "category": "policy_renewal",
  "reason": "one sentence"
}

Categories: policy_renewal, policy_lapse, fund_statement, fund_update, transaction_confirmation, client_document, compliance, general_work, spam, personal`;

  try {
    const res  = await model.generateContent(prompt);
    const text = res.response.text().trim();
    const json = text.replace(/^```json\s*|```$/g, '').trim();
    return JSON.parse(json) as ClassifyResult;
  } catch {
    return { isWorkRelated: false, confidence: 'low', category: 'other', reason: 'Classification failed' };
  }
}

// ── Summarisation ─────────────────────────────────────────────────────────────

export interface SummaryResult {
  summary:    string;   // 2-4 sentence plain English summary
  actionItems: string[]; // list of required actions
  urgency:    'high' | 'medium' | 'low';
  clientHint: string;   // any client name or policy number mentioned
}

export async function summarizeEmail(
  from:    string,
  subject: string,
  body:    string,
): Promise<SummaryResult> {
  const model = getGemini();

  const truncatedBody = body.slice(0, 3000); // Gemini token safety

  const prompt = `You are an assistant for a Malaysian licensed financial advisor. Analyse this email and extract key information.

From: ${from}
Subject: ${subject}
Body:
${truncatedBody}

Respond ONLY in this exact JSON format (no markdown):
{
  "summary": "2-4 sentence plain English summary of what this email is about",
  "actionItems": ["action 1", "action 2"],
  "urgency": "medium",
  "clientHint": "any client name, policy number, or account number mentioned, or empty string"
}`;

  try {
    const res  = await model.generateContent(prompt);
    const text = res.response.text().trim();
    const json = text.replace(/^```json\s*|```$/g, '').trim();
    return JSON.parse(json) as SummaryResult;
  } catch {
    return {
      summary:     'Unable to summarise this email.',
      actionItems: [],
      urgency:     'low',
      clientHint:  '',
    };
  }
}

// ── Reply Draft ───────────────────────────────────────────────────────────────

/**
 * Draft a professional reply to an incoming email.
 * The advisor's name is injected so the sign-off is personalised.
 */
export async function draftReply(opts: {
  from:        string;
  subject:     string;
  body:        string;
  advisorName: string;
  clientName?: string;
  instruction?: string; // optional specific guidance from advisor
}): Promise<string> {
  const model = getGemini();

  const truncatedBody = opts.body.slice(0, 3000);

  const prompt = `You are drafting a professional reply on behalf of ${opts.advisorName}, a licensed financial advisor in Malaysia.

Original email:
From: ${opts.from}
Subject: ${opts.subject}
Body:
${truncatedBody}
${opts.clientName ? `\nThis email relates to client: ${opts.clientName}` : ''}
${opts.instruction ? `\nAdvisor's instruction: ${opts.instruction}` : ''}

Write a professional, concise reply email.
- Use a polite Malaysian business tone
- Be specific about the subject matter
- Keep it under 200 words
- End with: "Best regards,\n${opts.advisorName}"
- Do NOT include a Subject line in the output — only write the email body
- Do NOT wrap in markdown code blocks`;

  try {
    const res  = await model.generateContent(prompt);
    return res.response.text().trim();
  } catch {
    return `Dear ${opts.from.split('<')[0].trim() || 'Team'},\n\nThank you for your email regarding "${opts.subject}". I will review this and get back to you shortly.\n\nBest regards,\n${opts.advisorName}`;
  }
}

// ── New Email Draft ───────────────────────────────────────────────────────────

/**
 * Draft a new outbound email to an institution on behalf of the advisor.
 */
export async function draftNewEmail(opts: {
  toName:      string;   // institution name, e.g. "Prudential Malaysia"
  purpose:     string;   // what the email is about, e.g. "request policy surrender value for client Karen Chew"
  advisorName: string;
  clientName?: string;
}): Promise<{ subject: string; body: string }> {
  const model = getGemini();

  const prompt = `You are drafting a professional outbound email on behalf of ${opts.advisorName}, a licensed financial advisor in Malaysia.

Send to: ${opts.toName}
Purpose: ${opts.purpose}
${opts.clientName ? `Client concerned: ${opts.clientName}` : ''}

Write a professional email to ${opts.toName}.
- Use a formal Malaysian business tone
- Be clear and specific
- Include all relevant context
- Keep it concise (under 200 words)
- End with: "Best regards,\n${opts.advisorName}"

Respond ONLY in this exact JSON format (no markdown):
{
  "subject": "clear subject line here",
  "body": "full email body here (use \\n for line breaks)"
}`;

  try {
    const res  = await model.generateContent(prompt);
    const text = res.response.text().trim();
    const json = text.replace(/^```json\s*|```$/g, '').trim();
    return JSON.parse(json) as { subject: string; body: string };
  } catch {
    return {
      subject: `Enquiry — ${opts.purpose}`,
      body:    `Dear ${opts.toName} Team,\n\nI hope this email finds you well. I am writing to ${opts.purpose}.\n\nKindly advise at your earliest convenience.\n\nBest regards,\n${opts.advisorName}`,
    };
  }
}
