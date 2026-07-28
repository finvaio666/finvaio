import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for the "NRIC / Reg No" Notion property.
 *
 * Stored format: `enc:v1:<base64(iv ‖ ciphertext ‖ authTag)>` — the prefix lets
 * readers (and the migration script) distinguish encrypted values from legacy
 * plaintext still awaiting migration, and versions the scheme for future
 * key/algorithm rotation.
 *
 * Key: NRIC_ENCRYPTION_KEY env var, 32 bytes base64. Losing the key makes every
 * encrypted value unrecoverable (Notion page history is the only fallback).
 */

const PREFIX = 'enc:v1:';
const IV_LEN = 12;  // GCM standard nonce size
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.NRIC_ENCRYPTION_KEY ?? '';
  if (!raw) throw new Error('NRIC_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('NRIC_ENCRYPTION_KEY must be 32 bytes base64');
  return key;
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function encryptNric(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64');
}

/**
 * Decrypts an `enc:v1:` value; passes through anything else unchanged so
 * not-yet-migrated plaintext keeps displaying. Tampered or wrong-key
 * ciphertext throws (GCM auth failure).
 */
export function decryptNric(stored: string): string {
  if (!stored || !isEncrypted(stored)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Masks all but the last 4 characters, preserving dashes: `••••••-••-5866`. */
export function maskNric(plain: string): string {
  if (!plain) return '';
  const chars = plain.split('');
  let toMask = chars.filter(c => c !== '-').length - 4;
  return chars.map(c => {
    if (c === '-') return c;
    if (toMask > 0) { toMask--; return '•'; }
    return c;
  }).join('');
}
