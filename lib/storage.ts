/**
 * lib/storage.ts
 * Storage chokepoint for Forms Library PDFs — switchable backend.
 *
 *   STORAGE_BACKEND=supabase (default) → Supabase Storage (reuses SUPABASE_* creds)
 *   STORAGE_BACKEND=drive              → Google Drive (company FINVA Drive)
 *   STORAGE_BACKEND=r2                 → Cloudflare R2 (S3-compatible)
 *
 * All are hidden behind uploadPdf / downloadPdf / storageReady so routes never
 * care which is active. To migrate later, flip the env var (the library is
 * re-imported, so old references don't need rewriting). downloadPdf auto-detects
 * a Drive URL vs an object key, so a mixed catalogue still resolves.
 *
 * Supabase uses the existing service-role client (private bucket, name from
 * SUPABASE_FORMS_BUCKET, default "forms").
 * Drive uses COMPANY_DRIVE_REFRESH_TOKEN (company-wide, app-created files only).
 * R2 requires R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { uploadPdfToDrive, downloadPdfFromDrive } from './drive';
import { driveFileIdFromUrl } from './formsLibrary';
import { getSupabase } from './supabase';

type Backend = 'supabase' | 'drive' | 'r2';
function backend(): Backend {
  const b = process.env.STORAGE_BACKEND;
  return b === 'drive' || b === 'r2' ? b : 'supabase';
}

const SB_BUCKET = process.env.SUPABASE_FORMS_BUCKET || 'forms';

function r2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

/** True when the active backend has what it needs (routes fail cleanly otherwise). */
export function storageReady(): boolean {
  switch (backend()) {
    case 'r2':    return r2Configured();
    case 'drive': return !!process.env.COMPANY_DRIVE_REFRESH_TOKEN;
    default:      return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
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
  const b = backend();
  if (b === 'drive') {
    const token = process.env.COMPANY_DRIVE_REFRESH_TOKEN;
    if (!token) throw new Error('Company Drive is not connected.');
    const { url } = await uploadPdfToDrive(token, `${provider} - ${name}.pdf`, buffer);
    return url;
  }
  const key = makeFormKey(provider, name);
  if (b === 'r2') {
    await getClient().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!, Key: key, Body: buffer, ContentType: 'application/pdf',
    }));
    return key;
  }
  // supabase
  const { error } = await getSupabase().storage.from(SB_BUCKET)
    .upload(key, buffer, { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
  return key;
}

/** Download a PDF's bytes from its stored reference (auto-detects Drive URL vs object key). */
export async function downloadPdf(ref: string): Promise<Buffer> {
  const looksLikeDrive = ref.includes('drive.google.com') || /[?&]id=/.test(ref);
  if (looksLikeDrive) {
    const token = process.env.COMPANY_DRIVE_REFRESH_TOKEN;
    if (!token) throw new Error('Company Drive is not connected.');
    const fileId = driveFileIdFromUrl(ref);
    if (!fileId) throw new Error('Invalid Drive reference.');
    return downloadPdfFromDrive(token, fileId);
  }
  if (backend() === 'r2') {
    const res = await getClient().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!, Key: ref,
    }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  // supabase
  const { data, error } = await getSupabase().storage.from(SB_BUCKET).download(ref);
  if (error || !data) throw new Error(`Supabase storage download failed: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}
