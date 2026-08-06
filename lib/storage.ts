/**
 * lib/storage.ts
 * Storage chokepoint for Forms Library PDFs — switchable backend.
 *
 *   STORAGE_BACKEND=drive  (default) → Google Drive (company FINVA Drive)
 *   STORAGE_BACKEND=r2               → Cloudflare R2 (S3-compatible)
 *
 * Both are hidden behind uploadPdf / downloadPdf / storageReady so routes never
 * care which is active. To migrate later, flip the env var (the library is
 * re-imported, so old references don't need rewriting). downloadPdf also
 * auto-detects a Drive URL vs an R2 key, so a mixed catalogue still resolves.
 *
 * Drive uses COMPANY_DRIVE_REFRESH_TOKEN (company-wide, app-created files only).
 * R2 requires R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { uploadPdfToDrive, downloadPdfFromDrive } from './drive';
import { driveFileIdFromUrl } from './formsLibrary';

type Backend = 'drive' | 'r2';
function backend(): Backend {
  return process.env.STORAGE_BACKEND === 'r2' ? 'r2' : 'drive';
}

function r2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

/** True when the active backend has what it needs (routes fail cleanly otherwise). */
export function storageReady(): boolean {
  return backend() === 'r2' ? r2Configured() : !!process.env.COMPANY_DRIVE_REFRESH_TOKEN;
}

// ── R2 (Cloudflare) ───────────────────────────────────────────────────────────
let client: S3Client | null = null;
function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

/** Build a stable, collision-safe R2 object key from provider + form name. */
export function makeFormKey(provider: string, name: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 10);
  return `forms/${slug(provider) || 'misc'}/${slug(name) || 'form'}-${rand}.pdf`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload a PDF and return the reference to persist as `pdf_url`:
 *   drive → a `drive.google.com/uc?id=…` URL
 *   r2    → an object key (e.g. `forms/aia/xyz.pdf`)
 */
export async function uploadPdf(provider: string, name: string, buffer: Buffer): Promise<string> {
  if (backend() === 'r2') {
    const key = makeFormKey(provider, name);
    await getClient().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!, Key: key, Body: buffer, ContentType: 'application/pdf',
    }));
    return key;
  }
  const token = process.env.COMPANY_DRIVE_REFRESH_TOKEN;
  if (!token) throw new Error('Company Drive is not connected.');
  const { url } = await uploadPdfToDrive(token, `${provider} - ${name}.pdf`, buffer);
  return url;
}

/** Download a PDF's bytes from its stored reference (auto-detects Drive URL vs R2 key). */
export async function downloadPdf(ref: string): Promise<Buffer> {
  const looksLikeDrive = ref.includes('drive.google.com') || /[?&]id=/.test(ref);
  if (looksLikeDrive) {
    const token = process.env.COMPANY_DRIVE_REFRESH_TOKEN;
    if (!token) throw new Error('Company Drive is not connected.');
    const fileId = driveFileIdFromUrl(ref);
    if (!fileId) throw new Error('Invalid Drive reference.');
    return downloadPdfFromDrive(token, fileId);
  }
  const res = await getClient().send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!, Key: ref,
  }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}
