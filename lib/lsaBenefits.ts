// Benefit & feature comparison for the 5-insurer Large Sum Assured wealth ILPs.
// Sourced from each insurer's sales illustration + product disclosure sheet (Jun–Jul 2026).
import type { LsaInsurer } from '@/lib/lsaCalculator';

export interface LsaBenefitRow {
  benefit: string;
  AIA: string;
  Allianz: string;
  GE: string;
  HLA: string;
  Prudential: string;
}
export interface LsaBenefitSection {
  section: string;
  rows: LsaBenefitRow[];
}

export const LSA_PLAN_LABEL: Record<LsaInsurer, string> = {
  AIA: 'A-Life Wealth Builder',
  Allianz: 'Allianz EverLink Plus',
  GE: 'SmartProtect Wealth Plus',
  HLA: 'HLA Asset Elite',
  Prudential: 'PRUWealth Enrich 2.0',
};

export const LSA_BENEFITS: LsaBenefitSection[] = [
  {
    section: 'Plan',
    rows: [
      { benefit: 'Insurer', AIA: 'AIA Bhd.', Allianz: 'Allianz Life', GE: 'Great Eastern Life', HLA: 'Hong Leong Assurance', Prudential: 'Prudential Assurance' },
      { benefit: 'Policy type', AIA: 'Regular-premium ILP (non-par)', Allianz: 'Regular-premium ILP (non-par)', GE: 'Regular-premium ILP (non-par)', HLA: 'Regular-premium ILP (non-par)', Prudential: 'Regular-premium ILP (non-par)' },
      { benefit: 'Default fund', AIA: 'AIA Balanced Fund', Allianz: 'Allianz Life Managed Fund', GE: 'Lion Balanced Fund', HLA: 'HLA Balanced Fund', Prudential: 'PRULink Managed Fund II' },
    ],
  },
  {
    section: 'Death / TPD',
    rows: [
      { benefit: 'Death benefit basis', AIA: 'HIGHER of Sum Assured or Account Value', Allianz: 'Sum Assured PLUS Account Value (full)', GE: 'Sum Assured + Additional SA + Investment Value', HLA: 'HIGHER of Sum Assured or Account Value', Prudential: 'HIGHER of (SA + Cover Booster) or units' },
      { benefit: 'Guaranteed extra death SA (free)', AIA: 'Wealth Booster 10% of SA at maturity/after 80', Allianz: 'None (SA + AV only)', GE: '+1% of SA per year, up to +40%', HLA: 'None on basic (see free riders)', Prudential: 'Cover Booster +30% (SA<2m) / +50% (SA≥2m)' },
      { benefit: 'TPD benefit', AIA: 'Yes, to age 70 (A-Plus Disability Care)', Allianz: 'SA + AV, before age 71, max RM8m/life', GE: 'SA + Additional SA, before age 75, max RM10m', HLA: 'Disability Lump Sum rider, before age 65', Prudential: 'SA + Cover Booster, before ANB 71' },
      { benefit: 'Accidental death benefit', AIA: '—', Allianz: '—', GE: '+100% to +200% of SA (before 70), max RM24m', HLA: '—', Prudential: '+100% to +500% of SA (before ANB 71), max RM25m' },
    ],
  },
  {
    section: 'Free / value-added benefits',
    rows: [
      { benefit: 'Critical-illness / cancer extra', AIA: '—', Allianz: 'PayorCover waives premium on 36 CIs', GE: 'Waiver rider covers CIs', HLA: 'FREE Cancer Recovery: 2%→30% of SA, max RM4m', Prudential: 'Payor waives premium on 42 CIs' },
      { benefit: 'Other free living benefit', AIA: 'Wealth Rewards 5% of AV at 65 & every 10 yrs', Allianz: 'Conditional In-Force Guarantee (6 yrs)', GE: 'Booster Reward 12% of SA (RM120k) at 70', HLA: 'FREE Elder Care: RM500k in 5 instalments (60–80)', Prudential: 'Accidental Death up to +500%; Legacy Settlement' },
      { benefit: 'Loyalty / persistency bonus', AIA: 'Vitality Wealth Booster up to 20% SA', Allianz: 'None', GE: 'Booster Reward RM120k at 70', HLA: '5% of SA at ages 65, 70, 75 (RM150k total)', Prudential: 'Loyalty Bonus 5% at 65+; Loyalty Booster 10% at 80' },
      { benefit: 'Estate / legacy feature', AIA: 'Wealth Booster + Savings Account', Allianz: '—', GE: '—', HLA: '—', Prudential: 'Legacy Settlement Option: lump / instalment / milestone' },
    ],
  },
  {
    section: 'Term & premium',
    rows: [
      { benefit: 'Coverage term', AIA: 'To age 80, auto-extend to 100', Allianz: 'To age 80, auto-renew to 100', GE: 'To age 100', HLA: 'To age 80, auto-extend to 100', Prudential: 'To ANB 80, extend to ANB 101' },
      { benefit: 'Premium structure', AIA: 'LEVEL to 80', Allianz: 'LEVEL to 79', GE: 'STEPPED — rises steeply with age', HLA: 'LEVEL to 79 (steps only in extension)', Prudential: 'LEVEL to 79' },
      { benefit: 'Premium payment term', AIA: 'To age 80', Allianz: 'To age 79', GE: 'To age 100 (64 yrs)', HLA: '45 yrs then extension', Prudential: '44 yrs (Full Pay)' },
    ],
  },
  {
    section: 'Charges',
    rows: [
      { benefit: 'Premium allocation (yr1/4/7/final)', AIA: '60/80/95/100% (yr10+)', Allianz: '60/80/95/100% (yr11+)', GE: '60/80/95/100% (yr9+)', HLA: '60/80/95/100% (yr10+)', Prudential: '60/80/95/100% (yr8+)' },
      { benefit: 'Monthly policy/service fee', AIA: 'RM8/mo', Allianz: 'RM8/mo', GE: 'RM6/mo', HLA: 'RM8/mo', Prudential: 'RM5/mo card, RM12/mo cash' },
      { benefit: 'Fund management charge', AIA: '1.5% p.a.', Allianz: '0.75–1.5% p.a.', GE: '1.0% p.a.', HLA: '~1.3–1.5% p.a.', Prudential: '~1.3–1.5% p.a.' },
      { benefit: 'Surrender / withdrawal charge', AIA: '20% yr1, 10% yr2, 0% after', Allianz: '20% of AV yr1–2', GE: 'No-Lapse Guarantee 6 yrs', HLA: 'NONE (no surrender/switch/top-up charge)', Prudential: 'Partial withdrawal RM25; switch RM50 (waived)' },
      { benefit: 'No-lapse / in-force guarantee', AIA: '—', Allianz: '6 policy years', GE: '6 policy years', HLA: '—', Prudential: '72 months' },
    ],
  },
  {
    section: 'Rider (waiver / payor)',
    rows: [
      { benefit: 'Waiver / payor rider', AIA: 'A-Plus Waiver (unit-deducting)', Allianz: 'PayorCover — 36 CIs + ETPD', GE: 'IL Premium Waiver Extra — TPD + CIs', HLA: 'Enhanced TPD Payor Benefit', Prudential: 'Payor Basic — TPD + 42 CIs' },
    ],
  },
];
