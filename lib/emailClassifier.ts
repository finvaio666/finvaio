/**
 * lib/emailClassifier.ts
 * Gemini-powered email classification, summarisation, and reply drafting.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Current models with fallback — newest first. Older models (1.5) are being
// retired, so we try modern ones and fall back if a model is unavailable/overloaded.
const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

/**
 * Generate text with automatic model fallback. Throws only if ALL models fail.
 */
async function generateText(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const genAI = new GoogleGenerativeAI(key);

  let lastErr: unknown;
  for (const modelId of MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const res   = await model.generateContent(prompt);
      return res.response.text();
    } catch (err) {
      lastErr = err;
      continue; // try next model
    }
  }
  throw lastErr ?? new Error('All Gemini models failed');
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
    const text = (await generateText(prompt)).trim();
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

/** Strip HTML tags, image references, encoded URLs and boilerplate from email body. */
function cleanEmailBody(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')                          // strip HTML tags
    .replace(/cid:[^\s<>"]+/gi, '')                    // remove inline image CIDs
    .replace(/https?:\/\/[^\s]{60,}/g, '[link]')       // collapse long URLs
    .replace(/https?:\/\/[^\s]+/g, '[link]')           // collapse remaining URLs
    .replace(/=[0-9A-F]{2}/g, '')                      // quoted-printable encoding
    .replace(/&[a-z]+;/gi, ' ')                        // HTML entities
    .replace(/\s{3,}/g, '\n')                          // collapse whitespace
    .replace(/(\n\s*){3,}/g, '\n\n')                   // collapse blank lines
    .trim()
    .slice(0, 3000);
}

export async function summarizeEmail(
  from:    string,
  subject: string,
  body:    string,
): Promise<SummaryResult> {
  const truncatedBody = cleanEmailBody(body); // Clean HTML before sending to AI

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
    const text = (await generateText(prompt)).trim();
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
  const truncatedBody = cleanEmailBody(opts.body).slice(0, 3000);

  const prompt = `You are drafting an email on behalf of ${opts.advisorName}, a licensed financial advisor in Malaysia, who is corresponding with an insurance company or fund house (the recipient).

IMPORTANT CONTEXT:
- The recipient is the INSTITUTION (insurance company / fund house), NOT ${opts.advisorName}.
- Do NOT address the email to ${opts.advisorName}. Do NOT write "Dear ${opts.advisorName}".
- Address the recipient as "Dear Team," unless a specific contact person's name is clearly identifiable.
- This is part of an existing case thread.

Case / email subject: ${opts.subject}
${opts.clientName ? `Client concerned: ${opts.clientName}` : ''}
Reference content from the thread:
${truncatedBody}

${opts.instruction
  ? `THE ADVISOR'S INSTRUCTION (this is the MOST IMPORTANT part — the email must accomplish exactly this):\n"${opts.instruction}"`
  : 'Write a polite, professional follow-up on the matter in the subject.'}

Write a professional, concise email that fulfils the advisor's instruction above.
- Polite Malaysian business tone
- Reference the case/policy/submission number from the subject naturally
- Keep it under 150 words
- Start with "Dear Team," (or a specific contact if obvious)
- End with: "Best regards,\n${opts.advisorName}"
- Output ONLY the email body — no subject line, no markdown.`;

  try {
    return (await generateText(prompt)).trim();
  } catch {
    // Fallback still honours the instruction if the AI is unavailable
    const intent = opts.instruction
      ? opts.instruction.replace(/\.$/, '')
      : `follow up on "${opts.subject}"`;
    return `Dear Team,\n\nI am writing in reference to ${opts.subject}.\n\nKindly ${intent.charAt(0).toLowerCase() + intent.slice(1)}. Your assistance is much appreciated.\n\nBest regards,\n${opts.advisorName}`;
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
    const text = (await generateText(prompt)).trim();
    const json = text.replace(/^```json\s*|```$/g, '').trim();
    return JSON.parse(json) as { subject: string; body: string };
  } catch {
    return {
      subject: `Enquiry — ${opts.purpose}`,
      body:    `Dear ${opts.toName} Team,\n\nI hope this email finds you well. I am writing to ${opts.purpose}.\n\nKindly advise at your earliest convenience.\n\nBest regards,\n${opts.advisorName}`,
    };
  }
}
