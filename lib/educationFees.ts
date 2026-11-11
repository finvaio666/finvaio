// Education Planning fee data — ported from "Education Calculator_2022.xlsm" (Data sheet)
// and refreshed 2026-11-12. All amounts are ANNUAL, in the destination's local currency.
// status: 'verified' = official page, 'indicative' = third-party / derived, 'carried' = 2022 workbook value (no 2026 source).
// Re-check every Oct–Nov (fees publish Jul–Oct). See reference table at the bottom for sources.

export type CountryKey = 'MY' | 'US' | 'UK' | 'AU' | 'NZ' | 'CW';
export type MajorKey =
  | 'Business' | 'Engineering' | 'Computer_Science_IT' | 'Law'
  | 'Pharmacy' | 'Medicine_Dentistry' | 'Undecided';

export const FEES_LAST_UPDATED = '2026-11-12';

export const COUNTRIES: { key: CountryKey; label: string; currency: string }[] = [
  { key: 'MY', label: 'Stay in Malaysia', currency: 'MYR' },
  { key: 'US', label: 'United States', currency: 'USD' },
  { key: 'UK', label: 'United Kingdom', currency: 'GBP' },
  { key: 'AU', label: 'Australia', currency: 'AUD' },
  { key: 'NZ', label: 'New Zealand', currency: 'NZD' },
  { key: 'CW', label: 'Anywhere Commonwealth', currency: 'GBP' },
];

export const MAJORS: { key: MajorKey; label: string }[] = [
  { key: 'Business', label: 'Business' },
  { key: 'Engineering', label: 'Engineering' },
  { key: 'Computer_Science_IT', label: 'Computer Science / IT' },
  { key: 'Law', label: 'Law' },
  { key: 'Pharmacy', label: 'Pharmacy' },
  { key: 'Medicine_Dentistry', label: 'Medicine / Dentistry' },
  { key: 'Undecided', label: 'Undecided' },
];

// Course length in years (Data!F10:F15). Medicine locally = 5.
export const MAX_YEARS: Record<CountryKey, number> = { US: 4, UK: 3, AU: 3, NZ: 3, CW: 3, MY: 4 };
export const MY_MEDICINE_YEARS = 5;

// Currency value in USD per 1 unit (Data!A166:G168 — 2022 rates; editable in the UI)
export const FX_USD: Record<string, number> = {
  USD: 1, GBP: 1.3, MYR: 0.2384, AUD: 0.71, NZD: 0.66,
};
export const BASE_CURRENCIES = ['MYR', 'USD', 'GBP'] as const;

// Education inflation by destination: 10-yr OECD CPI average × education uplift (Data!A96:C101).
// Workbook defaults; OECD series ends 2016 so these under-state recent fee growth — editable in the UI.
export const DEFAULT_INFLATION_PCT: Record<CountryKey, number> = {
  MY: 2.58, US: 2.21, UK: 2.56, AU: 2.75, NZ: 2.01, CW: 2.74,
};

export const DEFAULT_GROWTH_PCT = 6.03; // Dash!C19 = C52/10
export const PRE_U = { tuition: 22500, living: 18000 }; // Data!C51 + D51, MYR

export interface FeeRow {
  median: number | null;   // null = not applicable
  ivy: number | null;      // premium / "Ivy League" tuition (null = N/A)
  living: number;
  livingIvy?: number;      // living cost at the premium tier, if different
}

const NA: FeeRow = { median: null, ivy: null, living: 0 };

function uniform(median: number, ivy: number | null, living: number, livingIvy?: number): Record<MajorKey, FeeRow> {
  const row: FeeRow = { median, ivy, living, livingIvy };
  return {
    Business: row, Engineering: row, Computer_Science_IT: row, Law: row,
    Pharmacy: row, Medicine_Dentistry: row, Undecided: row,
  };
}

export const FEES: Record<CountryKey, Record<MajorKey, FeeRow>> = {
  // Malaysia, local private university, Malaysian-citizen rates (Taylor's 2027, Monash 2027, Curtin, IMU, BAC)
  MY: {
    Business:            { median: 45107,  ivy: null, living: 18000 },
    Engineering:         { median: 43451,  ivy: null, living: 18000 },
    Computer_Science_IT: { median: 45143,  ivy: null, living: 18000 },
    Law:                 { median: 33527,  ivy: null, living: 18000 },
    Pharmacy:            { median: 28180,  ivy: null, living: 18000 },
    Medicine_Dentistry:  { median: 119500, ivy: null, living: 18000 },
    Undecided:           { median: 45125,  ivy: null, living: 18000 },
  },
  // US: median = avg(Penn State 44,574 ; Kansas State ~30,126); premium = Harvard 62,226; Law/Medicine/Pharmacy N/A (post-grad in the US)
  US: {
    ...uniform(37350, 62226, 13200, 29408),
    Law: NA, Pharmacy: NA, Medicine_Dentistry: NA,
  },
  // UK: median = Nottingham (arts 24,700 / science-eng 33,000, Med 47,000); premium = Oxford mid 50,100, Medicine = Cambridge 70,554
  UK: {
    Business:            { median: 24700, ivy: 50100, living: 9000, livingIvy: 15795 },
    Engineering:         { median: 33000, ivy: 50100, living: 9000, livingIvy: 15795 },
    Computer_Science_IT: { median: 33000, ivy: 50100, living: 9000, livingIvy: 15795 },
    Law:                 { median: 24700, ivy: 50100, living: 9000, livingIvy: 15795 },
    Pharmacy:            { median: 33000, ivy: 50100, living: 9000, livingIvy: 15795 },
    Medicine_Dentistry:  { median: 47000, ivy: 70554, living: 9000, livingIvy: 15795 },
    Undecided:           { median: 24700, ivy: 50100, living: 9000, livingIvy: 15795 },
  },
  // AU: RMIT / ANU / Adelaide (indicative). No premium tier in the workbook.
  AU: {
    Business:            { median: 49564, ivy: null, living: 20280 },
    Engineering:         { median: 52300, ivy: null, living: 20280 },
    Computer_Science_IT: { median: 51410, ivy: null, living: 20280 },
    Law:                 { median: 51410, ivy: null, living: 20280 },
    Pharmacy:            { median: 51410, ivy: null, living: 20280 },
    Medicine_Dentistry:  { median: 72500, ivy: null, living: 20280 },
    Undecided:           { median: 51410, ivy: null, living: 20280 },
  },
  // NZ: University of Auckland (indicative; Medicine carried from 2022)
  NZ: {
    ...uniform(44500, null, 23500),
    Medicine_Dentistry: { median: 71829, ivy: null, living: 23500 },
  },
  // Anywhere Commonwealth: workbook average of UK/AU/other (carried from 2022)
  CW: {
    ...uniform(17000, 28732, 9133),
    Medicine_Dentistry: { median: 41255, ivy: 70131, living: 9133 },
  },
};

export interface FeeSource {
  country: string; institution: string; item: string; value: string;
  status: 'verified' | 'indicative' | 'carried'; link: string;
}

export const FEE_SOURCES: FeeSource[] = [
  { country: 'US', institution: 'Harvard College', item: 'Tuition 2026-27 (premium tier)', value: 'USD 62,226', status: 'verified', link: 'https://registrar.fas.harvard.edu/tuition-and-fees' },
  { country: 'US', institution: 'Harvard College', item: 'Living (COA 91,634 less tuition)', value: 'USD 29,408', status: 'indicative', link: 'https://www.thecrimson.com/article/2026/6/29/harvard-sticker-price-inflation/' },
  { country: 'US', institution: 'Penn State', item: 'Out-of-state tuition 2026-27', value: 'USD 44,574', status: 'verified', link: 'https://www.psu.edu/news/administration/story/board-trustees-approves-2026-27-operating-budget-tuition-schedules' },
  { country: 'US', institution: 'Kansas State', item: 'Nonresident $1,004.19 × 30 credits', value: 'USD 30,126', status: 'indicative', link: 'https://www.k-state.edu/finsvcs/cashiers/costs/manhattan-tuition-fees/' },
  { country: 'UK', institution: 'Oxford', item: 'Overseas course fee 2026-27', value: 'GBP 37,380 – 62,820', status: 'verified', link: 'https://assets-oxweb.admin.ox.ac.uk/2026-08/Undergraduate%20Fees%20and%20Funding%20booklet%202026.WEB_.pdf' },
  { country: 'UK', institution: 'Oxford', item: 'Living, 9 months', value: 'GBP 12,645 – 18,945', status: 'verified', link: 'https://ox.ac.uk/admissions/undergraduate/fees-and-funding/living-costs' },
  { country: 'UK', institution: 'Cambridge', item: 'Medicine 2026-27 (+ college fee ~12.5–16k)', value: 'GBP 70,554', status: 'verified', link: 'https://www.undergraduate.study.cam.ac.uk/files/publications/undergraduate_tuition_fees_2026-27.pdf' },
  { country: 'UK', institution: 'Nottingham', item: 'Arts 24,700 / Science-Eng 33,000 / Medicine 47,000', value: 'GBP', status: 'indicative', link: 'https://www.nottingham.ac.uk/fees/tuitionfees/202627/index.aspx' },
  { country: 'AU', institution: 'RMIT', item: 'Engineering', value: 'AUD 47,040 – 49,920', status: 'indicative', link: 'https://www.rmit.edu.au/study-with-us/levels-of-study/undergraduate-study/honours-degrees/bh070/apply-now' },
  { country: 'AU', institution: 'ANU', item: 'International UG range', value: 'AUD 46,700 – 56,120', status: 'indicative', link: 'https://www.anu.edu.au/students/program-administration/fees-payments/international-tuition-fees' },
  { country: 'AU', institution: 'Adelaide University', item: 'Medicine (MBBS)', value: 'AUD 70,000 – 75,000', status: 'indicative', link: 'https://adelaide.edu.au/degree-finder/bmbbs_bmbbs.html' },
  { country: 'NZ', institution: 'University of Auckland', item: 'Undergraduate (international)', value: 'NZD 37,000 – 52,000', status: 'indicative', link: 'https://www.auckland.ac.nz/en/study/fees-and-money-matters/tuition-fees/undergraduate-international-fees.html' },
  { country: 'MY', institution: 'Monash Malaysia', item: 'Business / Engineering / CS (2027, Malaysian)', value: 'RM 45,600 / 56,160 / 48,480', status: 'verified', link: 'https://www.monash.edu.my/study/undergraduate/fees' },
  { country: 'MY', institution: 'Monash Malaysia', item: 'Doctor of Medicine (2027, Malaysian)', value: 'RM 120,960', status: 'verified', link: 'https://www.monash.edu.my/study/undergraduate/fees' },
  { country: 'MY', institution: "Taylor's University", item: 'Business / Engineering / CS / Law (2027, per year)', value: 'RM 44,613 / 43,451 / 41,805 / 45,333', status: 'verified', link: 'https://university.taylors.edu.my/en/study/scholarships-and-financial-aid/fees-schedules.html' },
  { country: 'MY', institution: "Taylor's University", item: 'Medicine (MBBS)', value: 'RM 79,950', status: 'carried', link: 'https://university.taylors.edu.my/en/study/scholarships-and-financial-aid/fees-schedules.html' },
  { country: 'MY', institution: 'Curtin Malaysia', item: 'Business 81,900/3 ; Engineering 145,200/4', value: 'RM 27,300 / 36,300', status: 'indicative', link: 'https://articles.unienrol.com/curtin-university-malaysia-fees-courses/' },
  { country: 'MY', institution: 'IMU', item: 'MBBS RM597,500 over 5 years', value: 'RM 119,500', status: 'indicative', link: 'https://www.easyuni.com/malaysia/international-medical-university-imu-10211/bachelor-of-medicine-bachelor-of-surgery-mbbs-243111/' },
  { country: 'MY', institution: 'INTI / Brickfields Asia College', item: 'Foundation / Business / Law', value: 'RM 19,091 / 24,297 / 21,720', status: 'carried', link: 'https://newinti.edu.my' },
];
