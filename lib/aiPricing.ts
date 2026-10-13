/**
 * lib/aiPricing.ts
 * List-price estimate for a Gemini call, so the usage log can show money and
 * not only tokens. USD per 1M tokens. These are published list prices as the
 * team understood them in Oct 2026 - verify against the Google billing page
 * before relying on them for anything other than a rough run-rate.
 *
 * "Thinking" tokens are billed as output, and the SDK reports them only inside
 * totalTokenCount (total - prompt - candidates), so output cost uses
 * max(total - input, output).
 */

const PRICES: Record<string, { in: number; out: number }> = {
  'gemini-2.5-flash':      { in: 0.30, out: 2.50 },
  'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
  'gemini-flash-latest':   { in: 0.30, out: 2.50 },
};
const DEFAULT_PRICE = PRICES['gemini-2.5-flash'];

export function estimateCostUsd(model: string | undefined, input: number, output: number, total: number): number {
  const p = (model && PRICES[model]) || DEFAULT_PRICE;
  const billedOutput = Math.max(total - input, output, 0);
  return Math.round(((input * p.in + billedOutput * p.out) / 1_000_000) * 1e6) / 1e6;
}

export function thinkingTokens(input: number, output: number, total: number): number {
  return Math.max(total - input - output, 0);
}
