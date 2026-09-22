/**
 * lib/geminiParseTermSheet.ts
 * Reads a structured-note term sheet PDF with Gemini and returns its terms in
 * the same shape scripts/scan-term-sheets.mjs's regex parsers already
 * produce — same field names, same "final observation carries triggerPct:
 * null" convention — so app/api/note-intake/accept/route.ts's
 * buildUnderlyingDetails() and the New Notes review card need no changes to
 * consume either source.
 *
 * Runs inside the upload request, on Vercel — unlike the folder scanner's
 * local pypdf parsers, this needs no machine to be online, and unlike those
 * per-issuer regex parsers it reads templates that were never worth writing
 * a parser for (verified: it extracted a full Marex basket — entry, strike,
 * KI — that the regex parser explicitly gave up on as "too inconsistent to
 * auto-parse reliably").
 *
 * Every field it returns is still shown as an editable draft on the review
 * card and confirmed against the PDF before anything is written. Reading 9
 * fields correctly doesn't make the 10th trustworthy unchecked — verified
 * live before the explicit percentage-not-fraction instruction below was
 * added: it returned a coupon as 0.1477 instead of 14.77. That class of
 * error is exactly why review stays mandatory regardless of which parser
 * produced the draft.
 */

const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

const SCHEMA = {
  type: 'object',
  properties: {
    institution:  { type: 'string', nullable: true, description: 'The note issuer, exactly as stated (e.g. "UBS AG (London Branch)")' },
    tradeDate:    { type: 'string', nullable: true, description: 'MUST be exactly "YYYY-MM-DD" — e.g. "2026-05-12", never "12 May 2026" or any other format.' },
    issueDate:    { type: 'string', nullable: true, description: 'MUST be exactly "YYYY-MM-DD".' },
    maturityDate: { type: 'string', nullable: true, description: 'MUST be exactly "YYYY-MM-DD". AS STATED — never computed. If only relative ("Valuation Date + 2 Business Days"), use the explicit resolved date nearby if the document gives one, else null.' },
    couponPctPa:  { type: 'number', nullable: true, description: 'Annualized coupon AS A PERCENTAGE NUMBER, e.g. 14.77 for "14.77% p.a." — NEVER a fraction (never 0.1477). ONLY fill this from an annualized figure explicitly printed in the document (look for "% p.a.", "% per annum", or an explicit "annualized" label). If the document states only a per-period rate (e.g. "1.00% payable monthly") with NO annualized figure printed anywhere, leave this null and describe the per-period rate and payment frequency in notes_ instead — do not multiply it out yourself. Verified live: asking the model to do that arithmetic produced two different answers (12 and 6) across identical runs on the same document, both confident-looking.' },
    kiPct:        { type: 'number', nullable: true, description: 'Knock-in/conversion/downside barrier as a PERCENTAGE of Initial, e.g. 65 for "65% of Initial Price". Null if the note has none.' },
    koPct:        { type: 'number', nullable: true, description: 'FIRST knock-out/autocall barrier as a percentage of Initial. Null if none.' },
    currency:     { type: 'string', nullable: true, description: 'Three-letter currency code' },
    issueAmount:  { type: 'number', nullable: true, description: 'Total tranche size in `currency`. Null if not stated as a single figure (e.g. "Up to USD 480,000" — flag that in notes_ instead of guessing).' },
    denomination: { type: 'number', nullable: true, description: 'Minimum trading unit in `currency`. Null if not stated.' },
    underlyings: {
      type: 'array',
      items: { type: 'object', properties: {
        name:   { type: 'string', nullable: true },
        ticker: { type: 'string', nullable: true, description: 'The bare exchange ticker ONLY, with every suffix stripped — Reuters ("TSLA.OQ" → "TSLA"), Bloomberg ("AAPL UW Equity" → "AAPL"), or any other convention. No exchange code, no venue, no asset-class word.' },
        entry:  { type: 'number', nullable: true, description: 'The Initial Price / Initial Reference Price / Strike Price of this share — a real traded price in the underlying\'s own currency (e.g. 219.45 for a US stock). NEVER the row/list index — many term sheets print a leading "i" or "No." column numbering the underlyings 1, 2, 3…; that is not a price and must never be returned here even if no other number is nearby. If the document gives only ONE reference price per underlying (commonly labelled "Initial Price" or "Strike Price", with no separate second figure), use that same value for BOTH entry and strike below. Verified live 2026-09-23: a Natixis note\'s "i" column (1, 2, 3) was returned as entry instead of the real Initial Price (219.45, 548.82, 110.19) printed two columns over — silently corrupted every KI/KO level computed from it.' },
        strike: { type: 'number', nullable: true, description: 'The strike/reference price used for physical settlement, if the document states one SEPARATELY from the Initial Price above. If there is only one reference price for the underlying, repeat it here — do not leave this null while entry has a value, and never return a row/list index.' },
      }},
    },
    schedule: {
      type: 'array',
      description: 'EVERY determination/observation/valuation date in order, including the FINAL one even with no barrier.',
      items: { type: 'object', properties: {
        n: { type: 'integer', nullable: true },
        determinationDate: { type: 'string', nullable: true },
        triggerPct: { type: 'number', nullable: true, description: 'null for a date with no autocall barrier (e.g. the final valuation)' },
      }},
    },
    notes_: { type: 'array', items: { type: 'string' }, description: 'Anything a human should double check — an ambiguous field, an unusual structure, low confidence on any value.' },
  },
};

const PROMPT = 'You are reading a structured note (autocallable / FCN / ELN / range-accrual) term sheet PDF for a wealth management back office. Extract the terms exactly as stated — never estimate, never compute a value the document does not print directly, never fill a gap with a plausible-sounding guess. If a field genuinely is not stated, return null for it and say so in notes_ — a null with an explanation is far more useful than a confident-looking number arrived at by your own arithmetic, which is exactly the failure mode this instruction exists to prevent. All dates must be exactly "YYYY-MM-DD" — never a written-out format like "12 May 2026". All tickers must have every exchange/venue suffix stripped, whatever convention the document uses (Reuters, Bloomberg, or otherwise) — the bare symbol only.';

export interface GeminiTermSheetResult {
  institution:  string | null;
  tradeDate:    string | null;
  issueDate:    string | null;
  maturityDate: string | null;
  couponPctPa:  number | null;
  kiPct:        number | null;
  koPct:        number | null;
  currency:     string | null;
  issueAmount:  number | null;
  denomination: number | null;
  underlyings:  { name?: string; ticker?: string; entry?: number; strike?: number }[];
  schedule:     { n?: number; determinationDate?: string; triggerPct?: number | null }[];
  notes_:       string[];
}

/**
 * Throws on total failure (network error, no configured key, every model
 * fallback exhausted) — the caller is expected to fall back the intake row
 * to 'awaiting_parse' so it can still be picked up by the local pypdf worker
 * later, rather than losing the candidate.
 */
export async function parseTermSheetWithGemini(pdf: Buffer): Promise<GeminiTermSheetResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const b64 = pdf.toString('base64');

  let lastErr: unknown;
  for (const model of MODEL_FALLBACKS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: 'application/pdf', data: b64 } },
            { text: PROMPT },
          ] }],
          // temperature: 0 — this reads figures off a document, not composing
          // text; there is no reason for two reads of the same PDF to differ.
          // Verified live before this was set: the same term sheet came back
          // with the coupon computed once and left null the next run, and
          // dates as ISO once and "12 May 2026" the next — pinning this
          // measurably tightens run-to-run consistency, though it does not
          // make the model deterministic outright.
          generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
        }),
      });
      if (!res.ok) { lastErr = new Error(`Gemini ${model} returned ${res.status}: ${(await res.text()).slice(0, 500)}`); continue; }
      const body = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { lastErr = new Error(`Gemini ${model} returned no content`); continue; }
      const parsed = JSON.parse(text) as Partial<GeminiTermSheetResult>;
      return {
        institution:  parsed.institution  ?? null,
        tradeDate:    parsed.tradeDate    ?? null,
        issueDate:    parsed.issueDate    ?? null,
        maturityDate: parsed.maturityDate ?? null,
        couponPctPa:  parsed.couponPctPa  ?? null,
        kiPct:        parsed.kiPct        ?? null,
        koPct:        parsed.koPct        ?? null,
        currency:     parsed.currency     ?? null,
        issueAmount:  parsed.issueAmount  ?? null,
        denomination: parsed.denomination ?? null,
        underlyings:  parsed.underlyings  ?? [],
        schedule:     parsed.schedule     ?? [],
        notes_:       parsed.notes_       ?? [],
      };
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('All Gemini models failed');
}
