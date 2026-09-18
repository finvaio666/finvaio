import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import { listHoldings } from '@/lib/portfolio';
import { makeTermSheetKey, uploadTermSheet } from '@/lib/storage';
import { parseTermSheetWithGemini } from '@/lib/geminiParseTermSheet';
import { canUseNoteIntake } from '@/lib/noteIntakeAccess';
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
 * Terms are read inline, here, with Gemini (lib/geminiParseTermSheet.ts) —
 * not with a hand-written JS PDF-table parser, which is what silently
 * misreads a column and already stored wrong observation dates on 5 live
 * notes once before. A row lands 'pending' — reviewable immediately — the
 * moment the read succeeds. If it fails (network hiccup, quota, malformed
 * model output), the row falls back to 'awaiting_parse' exactly as before,
 * and `node scripts/scan-term-sheets.mjs --parse-queue` (pypdf, local) is
 * still there as a working second attempt.
 *
 * Every field Gemini returns is still shown as an editable draft the
 * reviewer confirms against the PDF before Add to book — reading most fields
 * correctly doesn't make the one wrong field trustworthy unchecked.
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
  if (!canUseNoteIntake(config)) return NextResponse.json({ error: 'Not available for this account.' }, { status: 403 });

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'No files received.' }, { status: 400 });

  // clientIds[i] pairs with files[i]; '' means "I don't know yet", which is
  // allowed — the review card makes the reviewer pick before it can be accepted.
  const clientIds = form.getAll('clientIds').map(v => String(v));

  // Admin sees every client here; a non-Admin (the Tracy Chia / Sky Siew
  // exception — see lib/noteIntakeAccess.ts) is scoped to their own, same as
  // every other route that calls listClients with a non-Admin config.
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
          reason: sameClient.status === 'inserted' ? 'Already exists in the system' : 'Already in the queue',
        });
        continue;
      }

      const key = makeTermSheetKey(isin, name);
      await uploadTermSheet(key, buffer);

      // Read the terms now, in this request, rather than leaving the row for
      // a later worker to find. A failure here is not fatal to the upload —
      // it only means this candidate falls back to the slower path.
      let parsed: Record<string, unknown> | null = null;
      let issuerFamily = '';
      let parseWarnings: string[] = [];
      try {
        const g = await parseTermSheetWithGemini(buffer);
        issuerFamily = g.institution ?? '';
        parseWarnings = g.notes_;
        parsed = { ...g, institution: undefined };   // institution lives in issuer_family, not duplicated inside parsed
      } catch (e: unknown) {
        parseWarnings = [`Automatic read failed (${e instanceof Error ? e.message : String(e)}) — will be retried, or key the terms in by hand.`];
      }

      await sbIntake.createUpload({
        fileHash, fileName: name, isin, storageKey: key,
        clientNotionId: clientId, uploadedBy: config.name,
        parsed, issuerFamily, parseWarnings,
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
