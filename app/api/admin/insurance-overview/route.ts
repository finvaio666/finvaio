import { NextRequest, NextResponse } from 'next/server';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listPolicies } from '@/lib/insurance';
import type { Slice } from '@/app/api/admin/overview/route';

export const dynamic = 'force-dynamic';

/**
 * Company-wide insurance position, the counterpart to /api/admin/overview.
 *
 * Split from that route rather than folded into it because the two answer
 * different questions and the Admin page loads them in parallel — an admin
 * opening the Investment tab shouldn't wait on a 1,100-row policy scan.
 *
 * Everything headline is measured IN FORCE (status Active). A lapsed policy
 * still carries its original premium and sum assured on the record, so summing
 * the table unfiltered would report cover the firm no longer provides and
 * revenue it no longer earns — on the current book that overstates premium by
 * about 20%. Lapsed and surrendered are reported separately, as what was lost.
 */

export interface InsurerStat {
  name:       string;
  policies:   number;
  premium:    number;
  sumAssured: number;
}

export interface AdvisorInsuranceStat {
  name:       string;
  policies:   number;
  premium:    number;
  sumAssured: number;
  lapsed:     number;
  lapseRate:  number;   // % of that advisor's policies, 0 when they have none
}

export interface InsuranceOverview {
  totalPolicies:      number;
  inForceCount:       number;
  inForcePremium:     number;
  inForceSumAssured:  number;
  lapsedCount:        number;
  lapsedPremium:      number;
  surrenderedCount:   number;
  surrenderedPremium: number;
  lapseRate:          number;
  clientsCovered:     number;
  coverMix:           Slice[];   // life / CI / TPD / PA, in force
  byInsurer:          Slice[];   // premium by insurer, in force
  byType:             Slice[];   // premium by policy type, in force
  insurers:           InsurerStat[];
  advisors:           AdvisorInsuranceStat[];
  newByYear:          { year: string; count: number }[];
}

const ACTIVE      = 'Active';
const LAPSED      = 'Lapsed';
const SURRENDERED = 'Surrendered';

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const policies = await listPolicies(config);   // Admin — unscoped, whole company

  const inForce     = policies.filter(p => p.status === ACTIVE);
  const lapsed      = policies.filter(p => p.status === LAPSED);
  const surrendered = policies.filter(p => p.status === SURRENDERED);

  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((n, r) => n + pick(r), 0);

  // Per-advisor, counting lapses against the advisor who wrote the policy.
  const byAdvisor = new Map<string, { policies: number; premium: number; sumAssured: number; lapsed: number; total: number }>();
  const advisorAgg = (name: string) => {
    let a = byAdvisor.get(name);
    if (!a) { a = { policies: 0, premium: 0, sumAssured: 0, lapsed: 0, total: 0 }; byAdvisor.set(name, a); }
    return a;
  };
  for (const p of policies) {
    if (!p.advisorName) continue;
    const a = advisorAgg(p.advisorName);
    a.total += 1;
    if (p.status === LAPSED) a.lapsed += 1;
    if (p.status !== ACTIVE) continue;
    a.policies   += 1;
    a.premium    += p.annualPremium;
    a.sumAssured += p.sumAssured;
  }

  const byInsurerMap = new Map<string, { policies: number; premium: number; sumAssured: number }>();
  const byTypeMap    = new Map<string, number>();
  for (const p of inForce) {
    const ins = p.insurer || 'Unspecified';
    const e = byInsurerMap.get(ins) ?? { policies: 0, premium: 0, sumAssured: 0 };
    e.policies += 1; e.premium += p.annualPremium; e.sumAssured += p.sumAssured;
    byInsurerMap.set(ins, e);

    const t = p.insuranceType || 'Unspecified';
    byTypeMap.set(t, (byTypeMap.get(t) ?? 0) + p.annualPremium);
  }

  // Policies written per year, from the commencement date — the closest thing
  // the record holds to a new-business trend.
  const yearMap = new Map<string, number>();
  for (const p of policies) {
    if (!p.commencementDate) continue;
    const y = p.commencementDate.slice(0, 4);
    yearMap.set(y, (yearMap.get(y) ?? 0) + 1);
  }
  const newByYear = [...yearMap.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year.localeCompare(b.year))
    .slice(-6);

  const insurers: InsurerStat[] = [...byInsurerMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.premium - a.premium);

  const advisors: AdvisorInsuranceStat[] = [...byAdvisor.entries()]
    .map(([name, v]) => ({
      name, policies: v.policies, premium: v.premium, sumAssured: v.sumAssured,
      lapsed: v.lapsed,
      lapseRate: v.total ? (v.lapsed / v.total) * 100 : 0,
    }))
    .sort((a, b) => b.premium - a.premium);

  return NextResponse.json({
    totalPolicies:      policies.length,
    inForceCount:       inForce.length,
    inForcePremium:     sum(inForce, p => p.annualPremium),
    inForceSumAssured:  sum(inForce, p => p.sumAssured),
    lapsedCount:        lapsed.length,
    lapsedPremium:      sum(lapsed, p => p.annualPremium),
    surrenderedCount:   surrendered.length,
    surrenderedPremium: sum(surrendered, p => p.annualPremium),
    lapseRate:          policies.length ? (lapsed.length / policies.length) * 100 : 0,
    clientsCovered:     new Set(inForce.map(p => p.clientNotionId).filter(Boolean)).size,
    coverMix: [
      { name: 'Life', value: sum(inForce, p => p.lifeCover) },
      { name: 'TPD',  value: sum(inForce, p => p.tpdCover)  },
      { name: 'CI',   value: sum(inForce, p => p.ciCover)   },
      { name: 'PA',   value: sum(inForce, p => p.paCover)   },
    ].filter(s => s.value > 0),
    byInsurer: insurers.map(i => ({ name: i.name, value: i.premium })),
    byType:    [...byTypeMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    insurers,
    advisors,
    newByYear,
  } as InsuranceOverview);
}
