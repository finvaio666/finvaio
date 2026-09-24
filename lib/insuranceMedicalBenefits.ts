// Medical card full benefit comparison (Plan 200), sourced from each insurer's
// full benefit schedule incl. HLA MediShield Pro Product Information Sheet and, for
// Prudential, the PRUMillion Med 2.0 Plan 200 appendix printed in its Sep-2026 SIs.
// "-" = not offered / not separately listed. Estimates for advisory use only.

import type { Insurer } from './insuranceCalculator';

export interface BenefitRow { benefit: string; AIA: string; GE: string; Allianz: string; HLA: string; Prudential: string; }
export interface BenefitSection { section: string; rows: BenefitRow[]; }

export const MEDICAL_PLAN_LABEL: Record<Insurer, string> = {
  AIA: 'A-Plus Health 2 (200)',
  GE: 'Smart Health Protector (200-500-3M)',
  Allianz: 'HealthAssured (200)',
  HLA: 'MediShield Pro (200)',
  Prudential: 'PRUMillion Med 2.0 (200)',
};

const AC = 'As charged';

export const MEDICAL_BENEFITS: BenefitSection[] = [
  { section: 'Plan basics', rows: [
    { benefit: 'Overall annual limit', AIA: 'RM1,500,000', GE: 'RM3,000,000', Allianz: 'RM3,000,000', HLA: 'RM2,000,000 (RM4m w/ DoublePro)' , Prudential: 'RM2,000,000' },
    { benefit: 'Lifetime limit', AIA: 'No limit', GE: 'No limit', Allianz: 'No limit', HLA: 'No limit' , Prudential: 'No limit' },
    { benefit: 'Cost-sharing', AIA: 'RM500 deductible', GE: 'RM500 deductible (2.5k/5k/20k options)', Allianz: 'Co-insurance 5% (cap RM1k/yr) or 15% (cap RM2.5k/yr)', HLA: 'RM500 deductible' , Prudential: 'RM500 deductible (not on OP cancer/dialysis, accident, govt hospital)' },
    { benefit: 'Medical coverage to', AIA: 'Age 80', GE: 'Age 80', Allianz: 'Age 100', HLA: 'Age 100 (renewable)' , Prudential: 'ANB 80 (auto-extends to ANB 101)' },
    { benefit: 'Cashless facility', AIA: 'Yes (panel)', GE: 'Yes (panel)', Allianz: 'Yes (panel)', HLA: 'Pay-first; cashless via Guarantee Letter' , Prudential: 'Yes (panel)' },
  ]},
  { section: 'In-patient (hospitalisation & surgical)', rows: [
    { benefit: 'Hospital Room & Board (per day)', AIA: 'RM200, no day limit', GE: 'RM200, no day limit', Allianz: 'RM200, no day limit', HLA: 'RM200, no day limit' , Prudential: 'RM200, 150 days/yr' },
    { benefit: 'Room rate auto-increase', AIA: '-', GE: '+RM50 every 5 yrs (up to +100%)', Allianz: '-', HLA: '+RM50 every 10 yrs (up to 3x)' , Prudential: '-' },
    { benefit: 'Unutilised room cash refund', AIA: '-', GE: '-', Allianz: '-', HLA: '80% of unused R&B as daily cash' , Prudential: '-' },
    { benefit: 'Intensive Care Unit (ICU)', AIA: AC, GE: AC + ' (max 200 days/yr)', Allianz: AC, HLA: AC + ' (unlimited days)' , Prudential: AC + ' (150 days/yr)' },
    { benefit: 'Hospital supplies & services', AIA: AC, GE: AC, Allianz: AC, HLA: AC , Prudential: AC },
    { benefit: 'Surgical fees', AIA: AC, GE: AC, Allianz: AC, HLA: AC , Prudential: AC },
    { benefit: 'Operating theatre', AIA: AC, GE: AC, Allianz: AC, HLA: AC , Prudential: AC },
    { benefit: 'Anaesthetist fees', AIA: AC, GE: AC, Allianz: AC, HLA: AC , Prudential: AC },
    { benefit: 'In-hospital physician visit', AIA: AC + ' (2/day)', GE: AC + ' (2/day)', Allianz: AC + ' (2/day)', HLA: AC , Prudential: AC + ' (2/day)' },
    { benefit: 'In-hospital physiotherapy', AIA: '(within fees)', GE: '(within fees)', Allianz: '(within fees)', HLA: AC , Prudential: '(within fees)' },
    { benefit: 'Organ transplant', AIA: '(within surgical)', GE: AC, Allianz: AC, HLA: AC , Prudential: AC + ' (once per lifetime)' },
    { benefit: 'Ambulance fees', AIA: '(within fees)', GE: AC, Allianz: AC, HLA: AC , Prudential: '(within fees, ground)' },
    { benefit: 'Day care / day surgery', AIA: AC, GE: AC, Allianz: AC, HLA: AC , Prudential: AC },
    { benefit: 'Lodger / daily guardian', AIA: 'Daily Guardian (within fees)', GE: 'RM150/day (180 days/yr)', Allianz: 'Lodger RM100/day', HLA: 'Lodger ' + AC , Prudential: 'Lodger ' + AC + ' (child <=15 / adult 60+, 150 days/yr)' },
  ]},
  { section: 'Pre & post-hospitalisation', rows: [
    { benefit: 'Pre-hospitalisation', AIA: '90 days', GE: '90 days (+2nd opinion)', Allianz: '90 days (consult max 3)', HLA: '90 days' , Prudential: '90 days' },
    { benefit: 'Post-hospitalisation treatment', AIA: '180 days (365 serious)', GE: '200 days', Allianz: '180 days', HLA: '180 days (incl. CI)' , Prudential: '180 days' },
    { benefit: 'Post-hosp home nursing', AIA: 'RM4,000/confinement', GE: 'RM8,000/disability', Allianz: 'RM10,000/yr', HLA: 'RM12,000/disability' , Prudential: 'RM4,000/confinement (200 days/lifetime)' },
    { benefit: 'Post-hosp physiotherapy', AIA: 'Incl. (serious 365d)', GE: '-', Allianz: 'RM6,000/yr', HLA: AC + ' (180 days)' , Prudential: AC + ' (180d; RM6,000/yr rehab cap)' },
    { benefit: 'Post-hosp TCM / chiro / alt.', AIA: '-', GE: 'TCM + chiro/speech RM150/visit (10 ea)', Allianz: 'Chiro/homeo/osteo/acupuncture RM2,000/yr', HLA: 'TCM + chiropractic RM200/visit, RM12,000/yr' , Prudential: '- (Plan 300 and above only)' },
  ]},
  { section: 'Out-patient', rows: [
    { benefit: 'Out-patient cancer treatment', AIA: AC, GE: AC, Allianz: AC, HLA: AC + ' (or Alt. Cancer RM3,000/mo x12)' , Prudential: AC + ' (+ recurrence monitoring 5 yrs)' },
    { benefit: 'Out-patient kidney dialysis', AIA: AC, GE: AC, Allianz: AC, HLA: AC , Prudential: AC },
    { benefit: 'Out-patient imaging (MRI/PET)', AIA: '(within limit)', GE: 'RM5,000/yr', Allianz: AC, HLA: '(within limit)' , Prudential: '-' },
    { benefit: 'Genomic test for cancer', AIA: '-', GE: AC, Allianz: AC, HLA: 'RM15,000/lifetime' , Prudential: '-' },
    { benefit: 'Emergency accidental out-patient', AIA: 'AC + 30d (incl dental)', GE: 'AC, 30 days', Allianz: 'RM2,000/yr + 30d', HLA: 'AC, 30d + accidental dental' , Prudential: AC },
    { benefit: 'Out-patient infectious illness', AIA: 'Bronchitis/dengue/flu/pneumonia RM2,000/disability', GE: '7 conditions, 5% co-ins RM500/yr', Allianz: 'Dengue/enteric AC', HLA: 'Dengue/Zika/pneumonia RM2,000/yr' , Prudential: 'Bronchitis/dengue/flu/pneumonia RM2,000/diagnosis' },
  ]},
  { section: 'Other & wellness', rows: [
    { benefit: 'Intraocular lens / optical', AIA: 'RM7,000/lifetime', GE: 'RM8,000/lifetime', Allianz: AC, HLA: 'RM10,000/lifetime (incl multifocal)' , Prudential: 'RM8,000/lifetime' },
    { benefit: 'Daily cash (govt hospital)', AIA: '-', GE: 'RM200/day (120 days/yr)', Allianz: '-', HLA: 'RM200/day (180 days/yr)' , Prudential: '-' },
    { benefit: 'Medical report fees', AIA: '-', GE: 'RM200/admission', Allianz: 'RM500/yr', HLA: '-' , Prudential: '-' },
    { benefit: 'Second medical opinion', AIA: '-', GE: '(within pre-hosp)', Allianz: 'RM2,000/yr', HLA: '-' , Prudential: 'Expert Medical Opinion' },
    { benefit: 'Maternity complications', AIA: 'RM10,000/lifetime', GE: '-', Allianz: '-', HLA: '-' , Prudential: '-' },
    { benefit: 'Mental health', AIA: 'RM1,500/yr (Health Wallet)', GE: '-', Allianz: '-', HLA: 'In-patient RM50,000/yr + psych RM5,000/life' , Prudential: '-' },
    { benefit: 'Medical implants', AIA: '-', GE: '-', Allianz: '-', HLA: 'Pacemaker/ICD/cochlear RM20,000; breast/dental RM5,000' , Prudential: '-' },
    { benefit: 'Congenital conditions', AIA: 'AC (Health Wallet)', GE: '-', Allianz: 'AC (after age 17)', HLA: '-' , Prudential: '-' },
    { benefit: 'Health screening / prevention', AIA: 'RM500/yr + vaccination', GE: '-', Allianz: '-', HLA: '-' , Prudential: '-' },
    { benefit: 'Recovery support (limb/hearing)', AIA: 'AC (Health Wallet)', GE: '-', Allianz: '-', HLA: '(see Medical implants)' , Prudential: '-' },
    { benefit: 'Emergency medical evacuation', AIA: 'USD 1,000,000/event', GE: '(Supreme Assist)', Allianz: '-', HLA: 'RM1,000,000/event' , Prudential: 'Emergency Medical Assistance' },
    { benefit: 'Accidental death / bereavement', AIA: 'Protect Boost (death 2x SA)', GE: 'RM20,000', Allianz: 'RM50,000', HLA: '-' , Prudential: '-' },
    { benefit: 'Value-added assistance', AIA: 'Intl/domestic medical, car, home', GE: 'Supreme Assist + Car', Allianz: 'Allianz Care@Home', HLA: '-' , Prudential: 'Emergency Medical Assistance + Expert Medical Opinion' },
    { benefit: 'No-claim feature', AIA: 'Health Wallet RM1,500/yr bonus', GE: '-', Allianz: '20% COI discount', HLA: 'No-Claims Reward: 20% of annual charge to cash' , Prudential: '-' },
    { benefit: 'Top-up option', AIA: '-', GE: '-', Allianz: '-', HLA: 'DoublePro doubles annual limit to RM4m' , Prudential: 'PRUMillion Med Booster 3.0 rider' },
  ]},
];
