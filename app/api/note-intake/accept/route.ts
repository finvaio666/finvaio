import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import { buildPortfolioPatch, type PortfolioHolding } from '@/lib/portfolio';
import * as sbPortfolio from '@/lib/repos/portfolio';
import * as sbIntake from '@/lib/repos/noteIntake';

export const dynamic = 'force-dynamic';

/**
 * Accept a reviewed term sheet into the live book: create one holding per
 * client allocation, then close out the intake candidate.
 *
 * Allocations are a LIST because a tranche is routinely split across several
 * clients at different amounts — the same shared-note case the Needs Action
 * page exists to handle at the other end of the note's life. One accept
 * creates all of them, so the copies can't drift apart from the moment they
 * enter (mismatched terms on siblings is exactly what makes a shared note
 * hard to reason about later).
 *
 * Everything here comes from the reviewer's confirmed form, not from the
 * parser: the parse is a draft to check against the PDF, and the invested
 * amount was never in the PDF at all.
 */

interface Allocation { clientId: string; amount: number }

interface Body {
  id:           string;
  holdingName:  string;
  allocations:  Allocation[];
  currency:     string;
  fxRate:       number;
  institution?: string;
  platform?:    string;
  startDate?:   string;
  maturityDate?: string;
  couponPctPa?: number;
  /** KI / KO barriers as a % of each underlying's initial fixing level — read off the PDF, never parsed. */
  kiPct?:       number;
  koPct?:       number;
}

interface ParsedUnderlying { name?: string; ticker?: string; entry?: number; strike?: number }
interface ParsedObs { n?: number; determinationDate?: string | null; triggerPct?: number | null }

/**
 * Map the scanner's parse + the reviewer's barriers into the underlying_details
 * shape the rest of the app reads (see PortfolioHolding.underlyingDetails).
 *
 * This is what makes an accepted note join the live loop: update-underlying-prices
 * fills in `today` and resolves each KO observation against its actual historical
 * close, and deriveNoteFlag then surfaces the note on the admin's Needs Action
 * page when it knocks out or matures.
 *
 * Barriers are stored as absolute price levels (entry × pct), not percentages,
 * because that is what the flag logic compares a close against.
 */
function buildUnderlyingDetails(
  parsed: Record<string, unknown> | null,
  b: Body,
): PortfolioHolding['underlyingDetails'] {
  const p = (parsed ?? {}) as { underlyings?: ParsedUnderlying[]; schedule?: ParsedObs[] };
  const kiPct = b.kiPct ?? 0;
  const koPct = b.koPct ?? 100;

  const underlyings = (p.underlyings ?? []).map(u => {
    const entry = Number(u.entry) || 0;
    return {
      name:   u.ticker || u.name || '',
      entry,
      strike: Number(u.strike) || entry,
      ki:     +(entry * kiPct / 100).toFixed(4),
      ko:     +(entry * koPct / 100).toFixed(4),
    };
  });

  // Labelled 'KO obs N' / 'Final' because that is what the flag derivation
  // matches on (deriveNoteFlag in PortfolioPage and the admin overview both
  // do startsWith). `resolved`/`cleared` are deliberately left unset — an
  // observation is only ever resolved from a real historical close, never
  // assumed at insert time.
  const obs = (p.schedule ?? []).filter(s => s.determinationDate);
  const schedule = obs.map((s, i) => ({
    date:  String(s.determinationDate),
    label: `KO obs ${s.n ?? i + 1}`,
    ...(s.triggerPct != null ? { triggerPct: Number(s.triggerPct) } : {}),
  }));

  // The final observation doubles as the maturity check. Prefer the reviewer's
  // maturity date; fall back to the last observation so a note without one
  // still ages out of the book instead of sitting live forever.
  const finalDate = b.maturityDate || (obs.length ? String(obs[obs.length - 1].determinationDate) : '');
  if (finalDate) schedule.push({ date: finalDate, label: 'Final' });

  if (!underlyings.length && !schedule.length) return null;
  return {
    ...(b.couponPctPa ? { couponRatePa: b.couponPctPa } : {}),
    underlyings,
    schedule,
  };
}

export async function POST(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const b = await req.json() as Body;
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!b.holdingName?.trim()) return NextResponse.json({ error: 'Holding name is required' }, { status: 400 });

  const allocations = (b.allocations ?? []).filter(a => a.clientId && Number(a.amount) > 0);
  if (!allocations.length) {
    // The amount is the whole reason a human is in this loop — a term sheet
    // states the tranche size, never this client's slice of it.
    return NextResponse.json({ error: 'Each client needs an invested amount before this can be added.' }, { status: 400 });
  }

  try {
    const row = await sbIntake.getById(b.id);
    if (!row) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    // Guards a double submit and a second admin reviewing the same queue —
    // without it, accepting twice would create two sets of holdings.
    if (row.status !== 'pending') return NextResponse.json({ error: `Already ${row.status}` }, { status: 409 });

    const clients = await listClients(config);
    const clientById = new Map(clients.map(c => [c.notionId, c]));
    const unknown = allocations.find(a => !clientById.has(a.clientId));
    if (unknown) return NextResponse.json({ error: `Unknown client: ${unknown.clientId}` }, { status: 400 });

    const underlyingDetails = buildUnderlyingDetails(row.parsed, b);
    const fxRate = Number(b.fxRate) || 1;

    const holdingIds: string[] = [];
    for (const a of allocations) {
      const client = clientById.get(a.clientId)!;
      const amount = Number(a.amount);
      // A note is carried at par: purchase and value are the same at entry,
      // and holdingValueMyr marks structured products at purchase thereafter.
      const patch = buildPortfolioPatch({
        holdingName:  b.holdingName,
        assetClass:   'Structured Product',
        productName:  row.isin,
        institution:  b.institution ?? '',
        platform:     b.platform ?? '',
        status:       'Active',
        currency:     b.currency || 'USD',
        fxRate,
        valueOrig:    amount,
        purchaseOrig: amount,
        valueMyr:     +(amount * fxRate).toFixed(2),
        purchaseMyr:  +(amount * fxRate).toFixed(2),
        startDate:    b.startDate ?? '',
        maturityDate: b.maturityDate ?? '',
        underlyingDetails,
      // The holding belongs to whichever FA owns the client, not to the admin
      // clicking accept — same rule as POST /api/portfolio. Stamping the admin
      // here would hide the note from the FA whose client actually holds it.
      }, client.advisorName || config.name, true);
      patch.client_notion_id = a.clientId;

      const { id } = await sbPortfolio.createHolding(patch);
      holdingIds.push(id);
    }

    await sbIntake.markInserted(b.id, holdingIds, config.name);
    return NextResponse.json({ success: true, created: holdingIds.length, holdingIds });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
