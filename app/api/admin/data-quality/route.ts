import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import { listHoldings, isExitedHolding, type PortfolioHolding } from '@/lib/portfolio';
import { getPlatformGroups, derivePlatform } from '@/lib/platformGroups';

export const dynamic = 'force-dynamic';

/**
 * Standing data-quality checks over the whole company book.
 *
 * Every check here is a rule about the DATA, not about the market: it asks
 * whether a row can still be reasoned about, not whether the position is doing
 * well. That distinction is why this lives apart from the Overview tab's
 * "Needs Action" panel — that one surfaces notes the market has flagged
 * (KI/KO), which are real events awaiting a decision. A finding here means
 * FINVA cannot answer a question it should be able to answer.
 *
 * Each check was sized against the live book before being included, and the
 * ones that fired only on legitimate data were dropped rather than shipped as
 * noise an admin would learn to scroll past:
 *   - repeated (product, client) rows are normal — unit trusts are held in
 *     multiple lots and PRS accounts (fund_source "Account A"/"Account B"),
 *     so only an EXACT duplicate (same units and value) is treated as a defect;
 *   - a null fx_rate on a foreign-currency row is fine when value_myr is
 *     already populated, which is how the FAME/Phillip feed writes stocks;
 *   - a blank platform is fine when derivePlatform() resolves it, so the check
 *     asks the question that actually matters — did it land in a real
 *     platform group, or fall out of the AUM breakdown entirely.
 *
 * No rule can catch a holding filed against the WRONG client: the row is
 * internally consistent, so only a custodian statement reveals it. That gap is
 * the reconciliation tool's job, not this panel's.
 */

export type Severity = 'error' | 'warning';

export interface QualityFinding {
  id:         string;
  name:       string;
  advisor:    string;
  clientName: string;
  detail:     string;   // what specifically is wrong with THIS row
}

export interface QualityCheck {
  id:       string;
  title:    string;
  severity: Severity;
  /** What breaks while this is unfixed — shown to the admin, so it says the consequence, not the rule. */
  impact:   string;
  fix:      string;
  findings: QualityFinding[];
}

export interface DataQualityReport {
  checkedAt:      string;
  holdingsScanned: number;
  clientsScanned:  number;
  totalFindings:   number;
  checks:          QualityCheck[];
}

const today = () => new Date().toISOString().slice(0, 10);

/** Days between an ISO date and today; negative when the date is in the past. */
function daysFromToday(dateStr: string): number {
  const ms = new Date(`${dateStr}T00:00:00Z`).getTime() - new Date(`${today()}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000);
}

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // config is Admin, so both reads are unscoped — the whole company.
  const [clients, allHoldings, platformGroups] = await Promise.all([
    listClients(config),
    listHoldings(config),
    getPlatformGroups(),
  ]);

  const holdings = allHoldings.filter(h => !isExitedHolding(h));
  const clientById   = new Map(clients.map(c => [c.notionId, c]));
  const clientNameOf = (h: PortfolioHolding) => clientById.get(h.clientNotionId)?.name ?? '';

  const f = (h: PortfolioHolding, detail: string): QualityFinding => ({
    id: h.id, name: h.name, advisor: h.advisorName, clientName: clientNameOf(h), detail,
  });

  const notes    = holdings.filter(h => h.assetClass === 'Structured Product');
  const maturing = holdings.filter(h => h.assetClass === 'Structured Product' || h.assetClass === 'Bonds');

  // ── Errors: something is already wrong ──────────────────────────────────

  const pastMaturity = maturing
    .filter(h => h.maturityDate && h.maturityDate < today())
    .map(h => f(h, `Matured ${h.maturityDate} (${Math.abs(daysFromToday(h.maturityDate))} days ago) — still Active`));

  // Same product, same client, same units AND same value. Distinct lots differ
  // in at least one of those, so this only fires on a genuine double-entry.
  const exactDupes: QualityFinding[] = [];
  const byIdentity = new Map<string, PortfolioHolding[]>();
  for (const h of holdings) {
    if (!h.productName || !h.clientNotionId) continue;
    const key = [h.productName, h.clientNotionId, h.units, h.valueMyr].join('|');
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), h]);
  }
  for (const rows of byIdentity.values()) {
    if (rows.length < 2) continue;
    for (const h of rows) exactDupes.push(f(h, `${rows.length} identical rows — same units (${h.units}) and value`));
  }

  // An advisor moved book but only one of the two records followed, so the
  // holding shows on one FA's AUM while the client sits in another's list.
  const advisorMismatch = holdings
    .filter(h => {
      const c = clientById.get(h.clientNotionId);
      return c && c.advisorName && h.advisorName && c.advisorName !== h.advisorName;
    })
    .map(h => f(h, `Holding is ${h.advisorName}'s, client belongs to ${clientById.get(h.clientNotionId)!.advisorName}`));

  // Falls outside every configured platform group, so its value is missing
  // from the "AUM by platform group" breakdown even though it counts in total.
  const ungrouped = holdings
    .filter(h => {
      const p = h.platform || derivePlatform(h.institution, h.fameAccountNo);
      return !platformGroups.some(g => g.platforms.some(x => x.toLowerCase() === p.toLowerCase()));
    })
    .map(h => f(h, h.platform || h.institution
      ? `Platform "${h.platform || h.institution}" is in no group`
      : 'No platform or institution recorded'));

  // ── Warnings: a question FINVA cannot answer yet ────────────────────────

  // "Bonds" is the stored asset-class label; the detail line reads as prose
  // about one row, so it needs the singular.
  const noMaturity = maturing
    .filter(h => !h.maturityDate)
    .map(h => f(h, `${h.assetClass === 'Bonds' ? 'Bond' : 'Note'} with no maturity date recorded`));

  const noTerms = notes
    .filter(h => !h.underlyingDetails?.underlyings?.length)
    .map(h => f(h, 'No underlyings recorded — no KI/KO monitoring possible'));

  const noCoupon = notes
    .filter(h => h.underlyingDetails?.underlyings?.length && typeof h.underlyingDetails.couponRatePa !== 'number')
    .map(h => f(h, 'Underlyings recorded but no coupon rate'));

  const noStart = notes
    .filter(h => !h.startDate)
    .map(h => f(h, 'No start date — tenure and accrued coupon cannot be derived'));

  // Marks older than a week mean the KI/KO badges are reading stale prices.
  const staleCut = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const stalePrices = notes
    .filter(h => h.underlyingDetails?.priceAsOf && h.underlyingDetails.priceAsOf < staleCut)
    .map(h => f(h, `Underlying prices last refreshed ${h.underlyingDetails!.priceAsOf}`));

  const clientNoAdvisor: QualityFinding[] = clients
    .filter(c => !c.advisorName)
    .map(c => ({ id: c.id, name: c.name, advisor: '', clientName: c.name, detail: 'Client has no advisor assigned' }));

  const checks: QualityCheck[] = [
    {
      id: 'past-maturity', title: 'Matured but still Active', severity: 'error',
      impact: 'Counted in live AUM and in the advisor\'s book as though still held.',
      fix: 'Confirm the exit on the Investment page to mark it Redeemed.',
      findings: pastMaturity,
    },
    {
      id: 'advisor-mismatch', title: 'Holding and client disagree on advisor', severity: 'error',
      impact: 'The value lands in one advisor\'s AUM while the client sits in another\'s list, so neither book is right.',
      fix: 'Set both records to the advisor who actually owns the relationship.',
      findings: advisorMismatch,
    },
    {
      id: 'exact-dupe', title: 'Identical duplicate rows', severity: 'error',
      impact: 'The position is double-counted in AUM.',
      fix: 'Delete the extra row, keeping one.',
      findings: exactDupes,
    },
    {
      id: 'ungrouped', title: 'Platform in no group', severity: 'error',
      impact: 'Missing from the AUM-by-platform-group breakdown, so that chart understates the firm.',
      fix: 'Add the platform to a group on the Platforms tab.',
      findings: ungrouped,
    },
    {
      id: 'no-maturity', title: 'Bond or note with no maturity date', severity: 'warning',
      impact: 'It can never be flagged as maturing — a matured position would sit in AUM unnoticed.',
      fix: 'Add the maturity date from the term sheet or bond name.',
      findings: noMaturity,
    },
    {
      id: 'no-terms', title: 'Structured note with no underlyings', severity: 'warning',
      impact: 'No KI/KO monitoring at all — a knock-in on this note would never raise a flag.',
      fix: 'Add the underlyings and barriers from the term sheet.',
      findings: noTerms,
    },
    {
      id: 'no-coupon', title: 'Structured note with no coupon rate', severity: 'warning',
      impact: 'Coupon income cannot be projected or reported for this note.',
      fix: 'Add the coupon rate from the term sheet.',
      findings: noCoupon,
    },
    {
      id: 'no-start', title: 'Structured note with no start date', severity: 'warning',
      impact: 'Tenure and accrued coupon cannot be derived.',
      fix: 'Add the trade date from the term sheet.',
      findings: noStart,
    },
    {
      id: 'stale-prices', title: 'Underlying prices over a week old', severity: 'warning',
      impact: 'KI/KO badges on these notes are reading stale marks.',
      fix: 'Run "Update prices" on the Investment page.',
      findings: stalePrices,
    },
    {
      id: 'client-no-advisor', title: 'Client with no advisor', severity: 'warning',
      impact: 'Appears in no advisor\'s book and is missed by every per-advisor review.',
      fix: 'Assign the client to an advisor.',
      findings: clientNoAdvisor,
    },
  ];

  return NextResponse.json({
    checkedAt:       new Date().toISOString(),
    holdingsScanned: holdings.length,
    clientsScanned:  clients.length,
    totalFindings:   checks.reduce((n, c) => n + c.findings.length, 0),
    checks,
  } as DataQualityReport);
}
