/**
 * lib/evalTag.ts
 * Marks a request as an eval/test run so its AI cost is logged separately from
 * real advisor use. The marker is an HMAC of AUTH_SECRET, so an advisor cannot
 * just add a header to hide their own usage - only a process that already holds
 * the signing secret (the eval harness) can produce a valid one.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export const EVAL_HEADER = 'x-eval-run';

export function evalSignature(secret: string | undefined = process.env.AUTH_SECRET): string {
  return secret ? createHmac('sha256', secret).update('finva-eval-run').digest('hex') : '';
}

export function isEvalRequest(req: { headers: { get(name: string): string | null } }): boolean {
  const sent = req.headers.get(EVAL_HEADER);
  const want = evalSignature();
  if (!sent || !want || sent.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(sent), Buffer.from(want));
}
