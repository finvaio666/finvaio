// Large Sum Assured (LSA) premium estimator.
// 5-insurer wealth/legacy investment-linked plans, RM1,000,000-class death benefit.
// Data extracted from official sales illustrations (Jun–Jul 2026), ages 20–60 (step 5),
// Male/Female, Non-smoker/Smoker. Premium is estimated by linear interpolation across
// the quoted ages and linear scaling by sum assured. Mirrors lsa_estimator.py.

export type Gender = 'M' | 'F';
export type LsaInsurer = 'AIA' | 'Allianz' | 'GE' | 'HLA' | 'Prudential';

export const LSA_INSURERS: LsaInsurer[] = ['AIA', 'Allianz', 'GE', 'HLA', 'Prudential'];

export const LSA_PRODUCT: Record<LsaInsurer, string> = {
  AIA: 'A-Life Wealth Builder',
  Allianz: 'Allianz EverLink Plus',
  GE: 'SmartProtect Wealth Plus',
  HLA: 'HLA Asset Elite',
  Prudential: 'PRUWealth Enrich 2.0',
};

export const LSA_STRUCTURE: Record<LsaInsurer, 'level' | 'stepped'> = {
  AIA: 'level', Allianz: 'level', GE: 'stepped', HLA: 'level', Prudential: 'level',
};

export const LSA_DEATH_BASIS: Record<LsaInsurer, string> = {
  AIA: 'Higher of Sum Assured or Account Value',
  Allianz: 'Sum Assured + Account Value (full)',
  GE: 'Sum Assured + Additional SA + Investment Value',
  HLA: 'Higher of Sum Assured or Account Value',
  Prudential: 'Higher of (SA + Cover Booster) or units',
};

// Sum-assured scaling exponent k, where monthly ≈ monthly(per RM1m) × (SA/1m)^k.
// Premium is sub-linear in SA (larger cover = lower per-RM cost). Calibrated against
// real M40 NS RM3,000,000 quotes (2026-07-08): Allianz RM2,498, HLA RM1,600,
// Prudential RM1,673 — these exponents reproduce them to the ringgit. AIA and GE keep
// k=1 (linear) until high-SA quotes are available for them.
export const LSA_SA_EXPONENT: Record<LsaInsurer, number> = {
  AIA: 1.0, Allianz: 0.992, GE: 1.0, HLA: 0.939, Prudential: 0.947,
};

// Short caveat shown on each result card.
export const LSA_CAVEAT: Record<LsaInsurer, string> = {
  AIA: 'Level premium to 80, auto-extends to 100. Wealth Booster + Wealth Rewards.',
  Allianz: 'Level premium. Pays SA plus full account value on death/TPD.',
  GE: 'STEPPED premium — low now, rises steeply with age. Female rates only. Booster Reward RM120k at 70.',
  HLA: 'Level to 80. Free Cancer Recovery + Elder Care + RM150k loyalty bonus; no surrender/switch charges.',
  Prudential: 'Level premium. Cover Booster +30–50%, Accidental Death up to +500%, Legacy Settlement Option.',
};

// [monthly RM per RM1,000,000, total outlay to age 80 RM] keyed by `${gender}${age}${smoker}`.
export const LSA_DATA: Record<LsaInsurer, Record<string, [number, number]>> = {"AIA":{"F20N":[470.0,338400.0],"F20S":[583.0,419760.0],"F25N":[525.0,346500.0],"F25S":[664.0,438240.0],"F30N":[605.0,363000.0],"F30S":[781.0,468600.0],"F35N":[700.0,378000.0],"F35S":[916.0,494640.0],"F40N":[858.0,411840.0],"F40S":[1157.0,555360.0],"F45N":[1083.0,454860.0],"F45S":[1494.0,627480.0],"F50N":[1358.0,488880.0],"F50S":[1928.0,694080.0],"F55N":[1738.0,521400.0],"F55S":[2578.0,773400.0],"F60N":[2494.0,598560.0],"F60S":[3533.0,847920.0],"M20N":[528.0,380160.0],"M20S":[669.0,481680.0],"M25N":[598.0,394680.0],"M25S":[768.0,506880.0],"M30N":[694.0,416400.0],"M30S":[907.0,544200.0],"M35N":[828.0,447120.0],"M35S":[1092.0,589680.0],"M40N":[1005.0,482400.0],"M40S":[1352.0,648960.0],"M45N":[1246.0,523320.0],"M45S":[1682.0,706440.0],"M50N":[1626.0,585360.0],"M50S":[2250.0,810000.0],"M55N":[2220.0,666000.0],"M55S":[3232.0,969600.0],"M60N":[3345.0,802800.0],"M60S":[4708.0,1129920.0]},"Allianz":{"F20N":[299.0,215280.0],"F20S":[383.0,275760.0],"F25N":[353.0,232980.0],"F25S":[458.0,302280.0],"F30N":[421.0,252600.0],"F30S":[555.0,333000.0],"F35N":[510.0,275400.0],"F35S":[681.0,367740.0],"F40N":[628.0,301440.0],"F40S":[850.0,408000.0],"F45N":[792.0,332640.0],"F45S":[1085.0,455700.0],"F50N":[1018.0,366480.0],"F50S":[1410.0,507600.0],"F55N":[1327.0,398100.0],"F55S":[1872.0,561600.0],"F60N":[1704.0,408960.0],"F60S":[2449.0,587760.0],"M20N":[379.0,272880.0],"M20S":[524.0,377280.0],"M25N":[451.0,297660.0],"M25S":[632.0,417120.0],"M30N":[545.0,327000.0],"M30S":[773.0,463800.0],"M35N":[669.0,361260.0],"M35S":[963.0,520020.0],"M40N":[840.0,403200.0],"M40S":[1222.0,586560.0],"M45N":[1068.0,448560.0],"M45S":[1570.0,659400.0],"M50N":[1359.0,489240.0],"M50S":[2025.0,729000.0],"M55N":[1721.0,516300.0],"M55S":[2622.0,786600.0],"M60N":[2171.0,521040.0],"M60S":[3422.0,821280.0]},"GE":{"F20N":[225.0,303000.0],"F20S":[233.35,360612.0],"F25N":[237.5,314550.0],"F25S":[241.7,382122.0],"F30N":[245.85,349110.0],"F30S":[250.0,394800.0],"F35N":[254.2,357468.0],"F35S":[258.35,403509.0],"F40N":[329.2,362016.0],"F40S":[370.85,416208.0],"F45N":[537.5,458550.0],"F45S":[633.35,534807.0],"F50N":[916.7,525612.0],"F50S":[1083.35,631806.0],"F55N":[1583.35,548805.0],"F55S":[2250.0,719400.0],"F60N":[2916.7,700008.0],"F60S":[4583.35,1100004.0]},"HLA":{"F20N":[250.0,180000.0],"F20S":[300.0,216000.0],"F25N":[330.0,217800.0],"F25S":[360.0,237600.0],"F30N":[360.0,216000.0],"F30S":[400.0,240000.0],"F35N":[430.0,232200.0],"F35S":[460.0,248400.0],"F40N":[460.0,220800.0],"F40S":[510.0,244800.0],"F45N":[490.0,205800.0],"F45S":[620.0,260400.0],"F50N":[700.0,252000.0],"F50S":[865.0,311400.0],"F55N":[950.0,285000.0],"F55S":[1092.0,327600.0],"F60N":[1490.0,357600.0],"F60S":[1950.0,468000.0],"M20N":[275.0,198000.0],"M20S":[342.0,246240.0],"M25N":[342.0,225720.0],"M25S":[400.0,264000.0],"M30N":[400.0,240000.0],"M30S":[480.0,288000.0],"M35N":[480.0,259200.0],"M35S":[570.0,307800.0],"M40N":[570.0,273600.0],"M40S":[697.0,334560.0],"M45N":[697.0,292740.0],"M45S":[855.0,359100.0],"M50N":[930.0,334800.0],"M50S":[1154.0,415440.0],"M55N":[1170.0,351000.0],"M55S":[1500.0,450000.0],"M60N":[1888.0,453120.0],"M60S":[2256.0,541440.0]},"Prudential":{"F20N":[234.0,168480.0],"F20S":[290.0,208800.0],"F25N":[271.0,178860.0],"F25S":[360.0,237600.0],"F30N":[320.0,192000.0],"F30S":[420.0,252000.0],"F35N":[388.0,209520.0],"F35S":[523.0,282420.0],"F40N":[520.0,249600.0],"F40S":[670.0,321600.0],"F45N":[650.0,273000.0],"F45S":[950.0,399000.0],"F50N":[1162.0,418320.0],"F50S":[1550.0,558000.0],"F55N":[1751.0,525300.0],"F55S":[2255.0,676500.0],"F60N":[2300.0,552000.0],"F60S":[2834.0,680160.0],"M20N":[267.0,192240.0],"M20S":[330.0,237600.0],"M25N":[365.0,240900.0],"M25S":[500.0,330000.0],"M30N":[378.0,226800.0],"M30S":[600.0,360000.0],"M35N":[466.0,251640.0],"M35S":[700.0,378000.0],"M40N":[591.0,283680.0],"M40S":[850.0,408000.0],"M45N":[790.0,331800.0],"M45S":[1100.0,462000.0],"M50N":[1353.0,487080.0],"M50S":[1950.0,702000.0],"M55N":[2150.0,645000.0],"M55S":[2800.0,840000.0],"M60N":[2600.0,624000.0],"M60S":[3400.0,816000.0]}};

const BASE_SA = 1_000_000;

export interface LsaResult {
  insurer: LsaInsurer;
  product: string;
  structure: 'level' | 'stepped';
  deathBasis: string;
  caveat: string;
  monthly: number | null;   // null = no quote available (e.g. GE has no male rates)
  annual: number | null;
  outlay80: number | null;  // total premium outlay to age 80 (scaled by SA)
  note?: string;
}

function bracket(age: number): [number, number] {
  const a = Math.max(20, Math.min(60, age));
  const lo = Math.max(20, Math.min(60, Math.floor(a / 5) * 5));
  const hi = Math.min(60, lo + 5);
  return [lo, hi];
}

function interp(rec: Record<string, [number, number]>, g: Gender, sm: string, age: number, idx: number): number | null {
  const [lo, hi] = bracket(age);
  const vlo = rec[`${g}${lo}${sm}`];
  const vhi = rec[`${g}${hi}${sm}`];
  if (!vlo || !vhi) return null;
  if (hi === lo) return vlo[idx];
  return vlo[idx] + (vhi[idx] - vlo[idx]) * (Math.max(20, Math.min(60, age)) - lo) / (hi - lo);
}

/** Estimate one insurer. Returns a result with nulls if no quote exists (GE male). */
export function estimate(
  insurer: LsaInsurer, gender: Gender, smoker: boolean, age: number, sa = BASE_SA,
): LsaResult {
  const sm = smoker ? 'S' : 'N';
  const rec = LSA_DATA[insurer];
  const m = interp(rec, gender, sm, age, 0);
  const o = interp(rec, gender, sm, age, 1);
  const base: LsaResult = {
    insurer, product: LSA_PRODUCT[insurer], structure: LSA_STRUCTURE[insurer],
    deathBasis: LSA_DEATH_BASIS[insurer], caveat: LSA_CAVEAT[insurer],
    monthly: null, annual: null, outlay80: null,
  };
  if (m == null) {
    base.note = insurer === 'GE' && gender === 'M' ? 'No male rates published' : 'No quote available';
    return base;
  }
  // Sub-linear sum-assured scaling: (SA/1m)^k (k=1 at BASE_SA keeps grid exact).
  const saFactor = Math.pow(sa / BASE_SA, LSA_SA_EXPONENT[insurer]);
  const monthly = Math.ceil(m * saFactor);   // round UP to whole ringgit
  base.monthly = monthly;
  base.annual = monthly * 12;
  base.outlay80 = o == null ? null : Math.round(o * saFactor);
  if (insurer === 'GE') base.note = 'Year-1 stepped premium — rises steeply later; see total outlay';
  return base;
}

/** Estimate all insurers, ranked cheapest-first (rows without a quote sink to the bottom). */
export function estimateAll(gender: Gender, smoker: boolean, age: number, sa = BASE_SA): LsaResult[] {
  const rows = LSA_INSURERS.map((ins) => estimate(ins, gender, smoker, age, sa));
  rows.sort((a, b) => {
    if (a.monthly == null && b.monthly == null) return 0;
    if (a.monthly == null) return 1;
    if (b.monthly == null) return -1;
    return a.monthly - b.monthly;
  });
  return rows;
}
