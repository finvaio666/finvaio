/**
 * lib/storage.ts
 * Object storage for Forms Library PDFs — Cloudflare R2 (S3-compatible).
 *
 * Replaces the earlier Google Drive storage: R2 gives us a bucket we fully own,
 * so we can upload AND read any object (no drive.file "app-created only" limit),
 * with a static token (no OAuth refresh-token expiry). The bucket is PRIVATE —
 * PDFs are read server-side with credentials (admin upload + fill routes). We
 * store the object KEY in the forms metadata (`pdf_url`), not a public URL.
 *
 * Required env (server-only):
 *   R2_ACCOUNT_ID          Cloudflare account id (for the S3 endpoint)
 *   R2_ACCESS_KEY_ID       R2 API token access key id
 *   R2_SECRET_ACCESS_KEY   R2 API token secret
 *   R2_BUCKET              bucket name (e.g. "finva-forms")
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

/** True when all R2 env vars are present (so routes can fail cleanly if not). */
export function storageReady(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

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

/** Build a stable, collision-safe object key from provider + form name. */
export function makeFormKey(provider: string, name: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 10);
  return `forms/${slug(provider) || 'misc'}/${slug(name) || 'form'}-${rand}.pdf`;
}

/** Upload a PDF buffer to R2 under `key`. Returns the key (stored as pdf_url). */
export async function uploadPdf(key: string, buffer: Buffer): Promise<string> {
  await getClient().send(new PutObjectCommand({
    Bucket:      process.env.R2_BUCKET!,
    Key:         key,
    Body:        buffer,
    ContentType: 'application/pdf',
  }));
  return key;
}

/** Download a PDF's raw bytes from R2 by key. */
export async function downloadPdf(key: string): Promise<Buffer> {
  const res = await getClient().send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key:    key,
  }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}
