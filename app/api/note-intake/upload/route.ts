import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import { listHoldings } from '@/lib/portfolio';
import { makeTermSheetKey, uploadTermSheet } from '@/lib/storage';
import * as sbIntake from '@/lib/repos/noteIntake';

export const dynamic = 'force-dynamic';

/**
 * Upload term sheets straight into the intake queue.
 *
 * The folder scanner needs the PDFs to sit on one particular PC; this doesn't.
 * It also removes the weakest part of that path: the scanner infers the client
 * from a folder name and warns loudly when it can't match one, whereas here the
 * uploader simply says which client a note belongs to.
 *
 * Storing the PDF in Supabase rather than reading it from Google Drive is the
 * whole point — FINVA can only read files it put there itself, which is exactly
 * why a hand-populated Drive folder is invisible to it (that token is scoped
 * `drive.file`, app-created files only).
 *
 * Nothing is parsed here: Vercel has no Python, and reading a term sheet's
 * tables with a JS PDF library is what silently misreads a column — it already
 * stored wrong observation dates on 5 live notes. Rows land as 'awaiting_parse'
 * and `node scripts/scan-term-sheets.mjs --parse-queue` fills in the terms.
 */

const MAX_BYTES = 15 * 1024 * 1024;   // a term sheet is tens of pages; well clear of this

export interface UploadResult {
  fileName: string;
  ok:       boolean;
  isin?:    string;
  reason?:  string;   // why it was rejected, in words a reviewer can act on
}

/** Same rule as the scanner: the ISIN is in the filename on every term sheet in this book. */
function isinFromFilename(fileName: string): string | null {
  const m = fileName.match(/(?:^|[^A-Za-z0-9])([A-Z]{2}[A-Z0-9]{9}\d)(?:$|[^A-Za-z0-9])/);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'No files received.' }, { status: 400 });

  // clientIds[i] pairs with files[i]; '' means "I don't know yet", which is
  // allowed — the review card makes the reviewer pick before it can be accepted.
  const clientIds = form.getAll('clientIds').map(v => String(v));

  const [clients, holdings] = await Promise.all([listClients(config), listHoldings(config)]);
  const validClient = new Set(clients.map(c => c.notionId));
  // Already in the book for this client? Then it's not a candidate — the same
  // (ISIN, client) check the scanner does, so both intake paths agree.
  const held = new Set(holdings.filter(h => h.productName).map(h => `${h.productName}__${h.clientNotionId}`));

  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const clientId = clientIds[i] ?? '';
    const name = file.name;

    try {
      if (!/\.pdf$/i.test(name))       { results.push({ fileName: name, ok: false, reason: 'Not a PDF' }); continue; }
      if (file.size > MAX_BYTES)       { results.push({ fileName: name, ok: false, reason: `Too large (${(file.size / 1048576).toFixed(1)} MB, limit 15 MB)` }); continue; }
      if (clientId && !validClient.has(clientId)) { results.push({ fileName: name, ok: false, reason: 'Unknown client' }); continue; }

      const isin = isinFromFilename(name);
      if (!isin) {
        results.push({ fileName: name, ok: false, reason: 'No ISIN in the filename — rename it to include the ISIN (e.g. ..._XS3479300751_...)' });
        continue;
      }
      if (clientId && held.has(`${isin}__${clientId}`)) {
        results.push({ fileName: name, ok: false, isin, reason: 'This client already holds this note' });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Hashing the bytes means a renamed or re-downloaded copy of a document
      // that was already rejected stays rejected, and re-uploading the same
      // file for the same client doesn't create a duplicate candidate.
      const existing = await sbIntake.findByHash(fileHash);
      if (existing.some(r => r.status === 'ignored')) {
        results.push({ fileName: name, ok: false, isin, reason: 'This document was ignored permanently' });
        continue;
      }
      const sameClient = existing.find(r => r.clientNotionId === clientId);
      if (sameClient) {
        results.push({
          fileName: name, ok: false, isin,
          reason: sameClient.status === 'inserted' ? 'Already added to the book' : 'Already in the queue',
        });
        continue;
      }

      const key = makeTermSheetKey(isin, name);
      await uploadTermSheet(key, buffer);
      await sbIntake.createUpload({
        fileHash, fileName: name, isin, storageKey: key,
        clientNotionId: clientId, uploadedBy: config.name,
      });
      results.push({ fileName: name, ok: true, isin });
    } catch (e: unknown) {
      // Per-file, so one bad PDF in a drag-and-drop of twenty doesn't discard
      // the other nineteen.
      results.push({ fileName: name, ok: false, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    uploaded: results.filter(r => r.ok).length,
    results,
  });
}
