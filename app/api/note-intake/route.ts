import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import * as sbIntake from '@/lib/repos/noteIntake';

export const dynamic = 'force-dynamic';

/**
 * The structured-note intake queue — term sheets found in the folder tree that
 * aren't in the book yet, waiting for an admin to confirm the terms and supply
 * the one thing a term sheet never states: this client's invested amount.
 *
 * Admin-only, matching PATCH /api/portfolio: FAs raise investment-record
 * changes with the company admin rather than writing them themselves, and
 * accepting a candidate creates a live holding, so the same gate applies.
 */

export interface IntakeCandidate {
  id:            string;
  isin:          string;
  fileName:      string;
  filePath:      string;
  fileHash:      string;
  issuerFamily:  string;
  clientId:      string;   // '' when the folder matched no known client
  clientName:    string;
  advisorName:   string;
  clientHint:    string;
  parseWarnings: string[];
  parsed:        Record<string, unknown> | null;
  firstSeenAt:   string;
  /**
   * How many OTHER pending candidates share this file. Ignoring is per
   * document, so a shared note filed under several clients takes all of them
   * out at once — the reviewer sees that on the button before clicking, rather
   * than discovering it when the siblings vanish.
   */
  siblingCount:  number;
}

export interface IntakeQueue {
  candidates: IntakeCandidate[];
  /** Every client, for the "which client is this actually for?" dropdown on an unmatched candidate. */
  clients: { id: string; name: string; advisorName: string }[];
}

async function requireAdmin(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return { error: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  return { config };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;

  try {
    const [rows, clients] = await Promise.all([
      sbIntake.listPending(),
      listClients(gate.config!),   // Admin here, so unscoped — a candidate can belong to any FA's client
    ]);

    const clientById = new Map(clients.map(c => [c.notionId, c]));
    const perHash = new Map<string, number>();
    for (const r of rows) perHash.set(r.fileHash, (perHash.get(r.fileHash) ?? 0) + 1);

    const candidates: IntakeCandidate[] = rows.map(r => {
      const c = r.clientNotionId ? clientById.get(r.clientNotionId) : undefined;
      return {
        id:            r.id,
        isin:          r.isin,
        fileName:      r.fileName,
        filePath:      r.filePath,
        fileHash:      r.fileHash,
        issuerFamily:  r.issuerFamily,
        clientId:      c ? r.clientNotionId : '',   // a stale id whose client is gone reads as unmatched, not as a broken name
        clientName:    c?.name ?? '',
        advisorName:   c?.advisorName ?? '',
        clientHint:    r.clientHint,
        parseWarnings: r.parseWarnings,
        parsed:        r.parsed,
        firstSeenAt:   r.firstSeenAt,
        siblingCount:  (perHash.get(r.fileHash) ?? 1) - 1,
      };
    });

    return NextResponse.json({
      candidates,
      clients: clients.map(c => ({ id: c.notionId, name: c.name, advisorName: c.advisorName })).sort((a, b) => a.name.localeCompare(b.name)),
    } as IntakeQueue);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // The table ships in a migration that has to be run by hand against the
    // Supabase project. Until it is, PostgREST's "relation does not exist" /
    // "schema cache" wording tells an admin nothing about what to do — so say
    // the actual next step instead of leaking the raw error.
    if (msg.includes('note_intake') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
      return NextResponse.json({ error: 'The intake queue table has not been created yet — run db/migrations/2026-09-09-create-note-intake.sql against Supabase.' }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Ignore a candidate — permanently, for every copy of that document.
 *
 * Per file hash rather than per row because the reasons to reject ("superseded
 * draft", "duplicate", "not ours") are facts about the PDF itself; a per-row
 * ignore would leave the same rejected document reappearing every scan under
 * its other client folders. Keyed on content, so renaming or moving the file
 * doesn't resurrect it either.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;

  const { id } = await req.json() as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const row = await sbIntake.getById(id);
    if (!row) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    if (row.status !== 'pending') return NextResponse.json({ error: `Already ${row.status}` }, { status: 409 });

    const ignored = await sbIntake.ignoreByHash(row.fileHash, gate.config!.name);
    return NextResponse.json({ success: true, ignored });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
