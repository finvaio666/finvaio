import crypto from 'crypto';

// Uses AUTH_SECRET as the signing key (must be set in Vercel env)
function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET environment variable is not set');
  return s;
}

export interface FormTokenPayload {
  advisorId:  string;
  clientId:   string;
  clientName: string;
  month:      string; // YYYY-MM-DD (first of month)
  nonce:      string; // random bytes to make each token unique
  exp:        number; // Unix ms expiry timestamp
}

/** Generate a signed, URL-safe form token. Default: 7 days expiry. */
export function generateFormToken(
  payload: Omit<FormTokenPayload, 'nonce' | 'exp'>,
  expiryDays = 7,
): string {
  const full: FormTokenPayload = {
    ...payload,
    nonce: crypto.randomBytes(8).toString('hex'),
    exp:   Date.now() + expiryDays * 24 * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig  = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Verify token signature and expiry. Returns payload or null if invalid/expired. */
export function verifyFormToken(token: string): FormTokenPayload | null {
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx < 0) return null;
    const data = token.slice(0, dotIdx);
    const sig  = token.slice(dotIdx + 1);
    const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
    if (sig !== expected) return null;
    const payload: FormTokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (!payload.advisorId || !payload.clientId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null; // expired
    return payload;
  } catch {
    return null;
  }
}
