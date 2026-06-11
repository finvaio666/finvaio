/**
 * lib/drive.ts
 * Google Drive wrapper — OAuth2 auth (drive.file scope) + PDF storage for the
 * Forms Library (Form Finder feature). Uses the same Google OAuth client as
 * Gmail/Calendar but with a narrower, file-scoped permission: the app can only
 * access files it created itself.
 */

import { google } from 'googleapis';
import { Readable } from 'stream';

const FOLDER_NAME = 'ARIA Forms Library';

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

/** Generate the Google OAuth2 URL the admin visits to authorise Drive storage. */
export function getDriveAuthUrl(advisorId: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: `drive:${advisorId}`,
    prompt: 'consent', // ensure refresh_token is always returned
  });
}

function getDriveClient(refreshToken: string) {
  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
}

let cachedFolderId: string | null = null;

/** Find or create the "ARIA Forms Library" folder in the connected Drive. */
async function getOrCreateFolder(refreshToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const drive = getDriveClient(refreshToken);

  const existing = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  if (existing.data.files?.length) {
    cachedFolderId = existing.data.files[0].id!;
    return cachedFolderId;
  }

  const created = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  cachedFolderId = created.data.id!;
  return cachedFolderId;
}

/** Upload a PDF buffer to Drive, make it link-viewable, and return its file id + view URL. */
export async function uploadPdfToDrive(
  refreshToken: string,
  filename: string,
  buffer: Buffer,
): Promise<{ fileId: string; url: string }> {
  const drive = getDriveClient(refreshToken);
  const folderId = await getOrCreateFolder(refreshToken);

  const file = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });

  const fileId = file.data.id!;

  // Make link-viewable so FAs (without their own Drive connection) can fetch it.
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return { fileId, url: `https://drive.google.com/uc?id=${fileId}` };
}

/** Download a PDF's raw bytes from Drive (for reading AcroForm fields server-side). */
export async function downloadPdfFromDrive(refreshToken: string, fileId: string): Promise<Buffer> {
  const drive = getDriveClient(refreshToken);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data as ArrayBuffer);
}
