/**
 * lib/fieldCrypto.ts
 * General field-level encryption for sensitive at-rest values other than NRIC —
 * OAuth refresh tokens (Gmail/Outlook/Calendar/Drive) and per-advisor Notion API
 * keys stored in the Users table.
 *
 * Same AES-256-GCM primitive, key (NRIC_ENCRYPTION_KEY) and `enc:v1:` envelope
 * as the NRIC field — re-exported here under neutral names so call sites read
 * clearly. One key protects both NRIC and tokens: an attacker who obtains the
 * server env already has both, so a second key would add ops overhead without
 * real defense. `decryptField` passes non-`enc:v1:` values through unchanged, so
 * the decrypt code can ship before the migration runs (no broken window).
 */
export { encryptNric as encryptField, decryptNric as decryptField, isEncrypted } from './nricCrypto';
