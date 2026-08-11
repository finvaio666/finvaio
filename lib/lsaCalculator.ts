// Large Sum Assured (LSA) premium estimator.
// 5-insurer wealth/legacy investment-linked plans, RM1,000,000-class death benefit.
// Data extracted from official sales illustrations (Jun–Aug 2026), ages 20–60 (step 5),
// Male/Female, Non-smoker/Smoker. Premium is estimated by log-linear interpolation
// across the quoted ages and a power-law scaling by sum assured. Mirrors
// lsa_estimator.py. The embedded grid below is generated — do not hand-edit it; run
// Insurance_Quotations/LSA/_gen_ts_data.py after re-extracting any insurer.

export type Gender = 'M' | 'F';
export type LsaInsurer = 'AIA' | 'Allianz' | 'GE' | 'HLA' | 'Prudential';

export const LSA_INSURERS: LsaInsurer[] = ['AIA', 'Allianz', 'GE', 'HLA', 'Prudential'];

/** Age the cover runs to. Only 80 and 100 are actually illustrated by the insurers. */
export type CoverageAge = 70 | 80 | 90 | 100;

/**
 * Selectable coverage terms. 70 and 90 are listed but disabled: no insurer prints a
 * premium for those terms in any illustration we hold, and inventing one by
 * extrapolating off the 80/100 pair is not something an FA could defend in front of
 * a client. Pull real 70/90 quotations and they can be switched on here.
 * (Prudential ages 50-60 were quoted to 90 by accident — see PRU_TO90_AGES.)
 */
export const LSA_COVERAGE_AGES: { age: CoverageAge; label: string; enabled: boolean; note?: string }[] = [
  { age: 70, label: 'To age 70', enabled: false, note: 'Not illustrated — needs quotations' },
  { age: 80, label: 'To age 80', enabled: true },
  { age: 90, label: 'To age 90', enabled: false, note: 'Not illustrated — needs quotations' },
  { age: 100, label: 'To age 100', enabled: true },
];

/**
 * Prudential entry ages whose "to age 80" rate is really a to-age-90 quotation
 * (the source illustrations are literally named "Up to Age 90"). Those rows buy ten
 * extra years, so they read high on the to-80 basis. Flagged in the UI until the
 * replacement to-80 illustrations arrive.
 */
export const PRU_TO90_AGES = [50, 55, 60];

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
// real M NS RM3,000,000 quotes (2026-07-08): Allianz RM2,498 (age nearest 40),
// HLA RM1,600 (entry age 40), Prudential RM1,673 — these exponents reproduce them
// to the ringgit at the MATCHED age. Note the age bases: the Prudential quote showed
// "ANB 40" (DOB 01/12/1986), i.e. actual age 39 last birthday, so its exponent is
// calibrated at grid age 39, not 40 (Prudential prices on age NEXT birthday; the grid
// bucket N already corresponds to a true age-N client = ANB N+1). AIA and GE keep
// k=1 (linear) until high-SA quotes are available for them.
// Prudential was refitted 0.9864 -> 0.9904 when interpolation moved from linear to
// log-linear: its anchor sits at age 39, which is OFF-GRID, so the age-39 base premium
// it was calibrated against shifted 566.00 -> 563.57. Allianz and HLA are unchanged —
// their anchors are at grid age 40, where both methods return the quote verbatim.
export const LSA_SA_EXPONENT: Record<LsaInsurer, number> = {
  AIA: 1.0, Allianz: 0.992, GE: 1.0, HLA: 0.939, Prudential: 0.9904,
};

// ── Coverage basis ──────────────────────────────────────────────────────────
// EVERY rate in LSA_DATA is the "coverage to age 80" quotation, EXCEPT GE, whose
// SmartProtect Wealth Plus is only sold on a 64-year term running to age 100.
// That difference is not cosmetic — quoting the same client to age 100 instead of
// 80 changes the premium a lot (from the RM1m M35 NS illustrations):
//     AIA        RM828  ->  RM828   (same monthly, but payable to 100, not 80)
//     Allianz    RM669  ->  RM1,593 (x2.38)
//     HLA        RM480  ->  RM819   (x1.71)
//     Prudential RM466  ->  RM1,049 (x2.25; the RM583 on the sheet is only the
//                                    recommended TOP-UP, 466 + 583 = the 1,049 total)
//     GE                     natively to 100 (stepped throughout)
// A real HLA "Full Pay" (to-100) quote for M58 NS SA2m came in at RM4,910/mo
// against RM2,990 from this to-80 grid — a 39% gap that is entirely the term,
// not a modelling error. Hence the loud basis banner in the UI: an FA holding a
// to-100 illustration must not read these numbers as comparable.
//
// Because GE keeps charging past 80, its monthly is NOT like-for-like with the
// others. outlay80 is: it counts only the premiums paid up to age 80 for every
// insurer, so it is the honest cross-insurer comparator on this page.
export const LSA_COVERAGE_BASIS: Record<LsaInsurer, string> = {
  AIA: 'Quoted to age 80 (auto-extends to 100, no further premium)',
  Allianz: 'Quoted to age 80 (renewable to 100 at a higher premium)',
  GE: 'Sold only to age 100 — premiums continue past 80, so compare total outlay',
  HLA: 'Quoted to age 80 (auto-extends to 100 at a higher premium)',
  Prudential: 'Quoted to ANB 80 (extendable to 101 at a higher premium)',
};

/** True where the insurer's own quote basis is NOT coverage-to-80. */
export const LSA_BASIS_IS_TO_100: Record<LsaInsurer, boolean> = {
  AIA: false, Allianz: false, GE: true, HLA: false, Prudential: false,
};

// Short caveat shown on each result card.
export const LSA_CAVEAT: Record<LsaInsurer, string> = {
  AIA: 'Level premium to 80, auto-extends to 100. Wealth Booster + Wealth Rewards.',
  Allianz: 'Level premium. Pays SA plus full account value on death/TPD.',
  GE: 'STEPPED premium — low now, rises steeply with age. Booster Reward RM120k at 70.',
  HLA: 'Level to 80. Free Cancer Recovery + Elder Care + RM150k loyalty bonus; no surrender/switch charges.',
  Prudential: 'Level premium. Cover Booster +30–50%, Accidental Death up to +500%, Legacy Settlement Option.',
};

// [monthly RM per RM1,000,000, total outlay to age 80 RM] keyed by `${gender}${age}${smoker}`.
export const LSA_DATA: Record<LsaInsurer, Record<string, [number, number]>> = {"AIA":{"F20N":[470.0,338400.0],"F20S":[583.0,419760.0],"F25N":[525.0,346500.0],"F25S":[664.0,438240.0],"F30N":[605.0,363000.0],"F30S":[781.0,468600.0],"F35N":[700.0,378000.0],"F35S":[916.0,494640.0],"F40N":[858.0,411840.0],"F40S":[1157.0,555360.0],"F45N":[1083.0,454860.0],"F45S":[1494.0,627480.0],"F50N":[1358.0,488880.0],"F50S":[1928.0,694080.0],"F55N":[1738.0,521400.0],"F55S":[2578.0,773400.0],"F60N":[2494.0,598560.0],"F60S":[3533.0,847920.0],"M20N":[528.0,380160.0],"M20S":[669.0,481680.0],"M25N":[598.0,394680.0],"M25S":[768.0,506880.0],"M30N":[694.0,416400.0],"M30S":[907.0,544200.0],"M35N":[828.0,447120.0],"M35S":[1092.0,589680.0],"M40N":[1005.0,482400.0],"M40S":[1352.0,648960.0],"M45N":[1246.0,523320.0],"M45S":[1682.0,706440.0],"M50N":[1626.0,585360.0],"M50S":[2250.0,810000.0],"M55N":[2220.0,666000.0],"M55S":[3232.0,969600.0],"M60N":[3345.0,802800.0],"M60S":[4708.0,1129920.0]},"Allianz":{"F20N":[299.0,215280.0],"F20S":[383.0,275760.0],"F25N":[353.0,232980.0],"F25S":[458.0,302280.0],"F30N":[421.0,252600.0],"F30S":[555.0,333000.0],"F35N":[510.0,275400.0],"F35S":[681.0,367740.0],"F40N":[628.0,301440.0],"F40S":[850.0,408000.0],"F45N":[792.0,332640.0],"F45S":[1085.0,455700.0],"F50N":[1018.0,366480.0],"F50S":[1410.0,507600.0],"F55N":[1327.0,398100.0],"F55S":[1872.0,561600.0],"F60N":[1704.0,408960.0],"F60S":[2449.0,587760.0],"M20N":[379.0,272880.0],"M20S":[524.0,377280.0],"M25N":[451.0,297660.0],"M25S":[632.0,417120.0],"M30N":[545.0,327000.0],"M30S":[773.0,463800.0],"M35N":[669.0,361260.0],"M35S":[963.0,520020.0],"M40N":[840.0,403200.0],"M40S":[1222.0,586560.0],"M45N":[1068.0,448560.0],"M45S":[1570.0,659400.0],"M50N":[1359.0,489240.0],"M50S":[2025.0,729000.0],"M55N":[1721.0,516300.0],"M55S":[2622.0,786600.0],"M60N":[2171.0,521040.0],"M60S":[3422.0,821280.0]},"GE":{"F20N":[225.0,303000.0],"F20S":[233.35,360612.0],"F25N":[237.5,314550.0],"F25S":[241.7,382122.0],"F30N":[245.85,349110.0],"F30S":[250.0,394800.0],"F35N":[254.2,357468.0],"F35S":[258.35,403509.0],"F40N":[329.2,362016.0],"F40S":[370.85,416208.0],"F45N":[537.5,458550.0],"F45S":[633.35,534807.0],"F50N":[916.7,525612.0],"F50S":[1083.35,631806.0],"F55N":[1583.35,548805.0],"F55S":[2250.0,719400.0],"F60N":[2916.7,700008.0],"F60S":[4583.35,1100004.0],"M20N":[225.0,475800.0],"M20S":[233.35,558612.0],"M25N":[237.5,489750.0],"M25S":[241.7,574722.0],"M30N":[241.7,500220.0],"M30S":[250.0,584400.0],"M35N":[258.35,506709.0],"M35S":[300.0,596400.0],"M40N":[458.35,530808.0],"M40S":[525.0,642000.0],"M45N":[750.0,639600.0],"M45S":[1000.0,792000.0],"M50N":[1375.0,759000.0],"M50S":[2083.35,1043406.0],"M55N":[2500.0,853800.0],"M55S":[4166.7,1392810.0],"M60N":[4916.7,1180008.0]},"HLA":{"F20N":[250.0,180000.0],"F20S":[300.0,216000.0],"F25N":[330.0,217800.0],"F25S":[360.0,237600.0],"F30N":[360.0,216000.0],"F30S":[400.0,240000.0],"F35N":[430.0,232200.0],"F35S":[460.0,248400.0],"F40N":[460.0,220800.0],"F40S":[510.0,244800.0],"F45N":[490.0,205800.0],"F45S":[620.0,260400.0],"F50N":[700.0,252000.0],"F50S":[865.0,311400.0],"F55N":[950.0,285000.0],"F55S":[1092.0,327600.0],"F60N":[1490.0,357600.0],"F60S":[1950.0,468000.0],"M20N":[275.0,198000.0],"M20S":[342.0,246240.0],"M25N":[342.0,225720.0],"M25S":[400.0,264000.0],"M30N":[400.0,240000.0],"M30S":[480.0,288000.0],"M35N":[480.0,259200.0],"M35S":[570.0,307800.0],"M40N":[570.0,273600.0],"M40S":[697.0,334560.0],"M45N":[697.0,292740.0],"M45S":[855.0,359100.0],"M50N":[930.0,334800.0],"M50S":[1154.0,415440.0],"M55N":[1170.0,351000.0],"M55S":[1500.0,450000.0],"M60N":[1888.0,453120.0],"M60S":[2256.0,541440.0]},"Prudential":{"F20N":[234.0,168480.0],"F20S":[290.0,208800.0],"F25N":[271.0,178860.0],"F25S":[360.0,237600.0],"F30N":[320.0,192000.0],"F30S":[420.0,252000.0],"F35N":[388.0,209520.0],"F35S":[523.0,282420.0],"F40N":[520.0,249600.0],"F40S":[670.0,321600.0],"F45N":[650.0,273000.0],"F45S":[950.0,399000.0],"F50N":[1162.0,418320.0],"F50S":[1550.0,558000.0],"F55N":[1751.0,525300.0],"F55S":[2255.0,676500.0],"F60N":[2300.0,552000.0],"F60S":[2834.0,680160.0],"M20N":[267.0,192240.0],"M20S":[330.0,237600.0],"M25N":[365.0,240900.0],"M25S":[500.0,330000.0],"M30N":[378.0,226800.0],"M30S":[600.0,360000.0],"M35N":[466.0,251640.0],"M35S":[700.0,378000.0],"M40N":[591.0,283680.0],"M40S":[850.0,408000.0],"M45N":[790.0,331800.0],"M45S":[1100.0,462000.0],"M50N":[1353.0,487080.0],"M50S":[1950.0,702000.0],"M55N":[2150.0,645000.0],"M55S":[2800.0,840000.0],"M60N":[2600.0,624000.0],"M60S":[3400.0,816000.0]}};

// Coverage-to-age-100 grid, read from the SAME illustrations (AIA 'Alternative 2',
// Allianz's '<age> to 99' row, HLA's 'recommended from age N to age 99', Prudential's
// 'Total premium payable' under sustainability-to-ANB-101). GE appears unchanged
// because its plan is only ever sold to 100. Second element is the premium outlay to
// age 100, or null where the schedule steps in a way we cannot total reliably
// (Prudential tops up again at 80). Cross-check: HLA M35 NS gives RM638,820, the exact
// total printed in its own illustration.
export const LSA_DATA_100: Record<LsaInsurer, Record<string, [number, number | null]>> = {"AIA":{"F20N":[470.0,451200.0],"F20S":[583.0,559680.0],"F25N":[525.0,472500.0],"F25S":[664.0,597600.0],"F30N":[605.0,508200.0],"F30S":[781.0,656040.0],"F35N":[700.0,546000.0],"F35S":[916.0,714480.0],"F40N":[858.0,617760.0],"F40S":[1157.0,833040.0],"F45N":[1083.0,714780.0],"F45S":[1494.0,986040.0],"F50N":[1358.0,814800.0],"F50S":[1928.0,1156800.0],"F55N":[1750.0,945000.0],"F55S":[2578.0,1392120.0],"F60N":[2692.0,1292160.0],"F60S":[3684.0,1768320.0],"M20N":[528.0,506880.0],"M20S":[669.0,642240.0],"M25N":[598.0,538200.0],"M25S":[768.0,691200.0],"M30N":[694.0,582960.0],"M30S":[907.0,761880.0],"M35N":[828.0,645840.0],"M35S":[1092.0,851760.0],"M40N":[1005.0,723600.0],"M40S":[1352.0,973440.0],"M45N":[1246.0,822360.0],"M45S":[1682.0,1110120.0],"M50N":[1717.0,1030200.0],"M50S":[2367.0,1420200.0],"M55N":[2400.0,1296000.0],"M55S":[3534.0,1908360.0],"M60N":[3875.0,1860000.0],"M60S":[6075.0,2916000.0]},"Allianz":{"F20N":[705.0,676800.0],"F20S":[976.0,936960.0],"F25N":[847.0,762300.0],"F25S":[1186.0,1067400.0],"F30N":[1025.0,861000.0],"F30S":[1453.0,1220520.0],"F35N":[1249.0,974220.0],"F35S":[1791.0,1396980.0],"F40N":[1535.0,1105200.0],"F40S":[2227.0,1603440.0],"F45N":[1908.0,1259280.0],"F45S":[2803.0,1849980.0],"F50N":[2394.0,1436400.0],"F50S":[3561.0,2136600.0],"F55N":[3026.0,1634040.0],"F55S":[4560.0,2462400.0],"F60N":[3795.0,1821600.0],"F60S":[5766.0,2767680.0],"M20N":[876.0,840960.0],"M20S":[1194.0,1146240.0],"M25N":[1059.0,953100.0],"M25S":[1458.0,1312200.0],"M30N":[1292.0,1085280.0],"M30S":[1796.0,1508640.0],"M35N":[1593.0,1242540.0],"M35S":[2234.0,1742520.0],"M40N":[1987.0,1430640.0],"M40S":[2825.0,2034000.0],"M45N":[2499.0,1649340.0],"M45S":[3576.0,2360160.0],"M50N":[3148.0,1888800.0],"M50S":[4565.0,2739000.0],"M55N":[3964.0,2140560.0],"M55S":[5779.0,3120660.0],"M60N":[4990.0,2395200.0],"M60S":[7392.0,3548160.0]},"GE":{"F20N":[225.0,2162820.0],"F20S":[233.35,2362975.8],"F25N":[237.5,2164860.0],"F25S":[241.7,2363109.6],"F30N":[245.85,2185123.8],"F30S":[250.0,2393280.0],"F35N":[254.2,2195505.6],"F35S":[258.35,2401612.8],"F40N":[329.2,2214993.6],"F40S":[370.85,2435041.8],"F45N":[537.5,2250660.0],"F45S":[633.35,2494450.8],"F50N":[916.7,2313939.6],"F50S":[1083.35,2602489.8],"F55N":[1583.35,2407168.8],"F55S":[2250.0,2837760.0],"F60N":[2916.7,2564295.6],"F60S":[4583.35,3277807.8],"M20N":[225.0,2768460.0],"M20S":[233.35,3010135.8],"M25N":[237.5,2784180.0],"M25S":[241.7,3027669.6],"M30N":[241.7,2795127.6],"M30S":[250.0,3039360.0],"M35N":[258.35,2804212.8],"M35S":[300.0,3060240.0],"M40N":[458.35,2856151.8],"M40S":[525.0,3145500.0],"M45N":[750.0,2928600.0],"M45S":[1000.0,3310800.0],"M50N":[1375.0,3083940.0],"M50S":[2083.35,3691369.8],"M55N":[2500.0,3337920.0],"M55S":[4166.7,4409937.6],"M60N":[4916.7,3868095.6]},"HLA":{"F20N":[403.0,386880.0],"F20S":[476.0,456960.0],"F25N":[475.0,427500.0],"F25S":[564.0,507600.0],"F30N":[564.0,473760.0],"F30S":[672.0,564480.0],"F35N":[679.0,529620.0],"F35S":[812.0,633360.0],"F40N":[826.0,594720.0],"F40S":[988.0,711360.0],"F45N":[1016.0,670560.0],"F45S":[1219.0,804540.0],"F50N":[1333.0,799800.0],"F50S":[1609.0,965400.0],"F55N":[1682.0,908280.0],"F55S":[2038.0,1100520.0],"F60N":[2278.0,1093440.0],"F60S":[2774.0,1331520.0],"M20N":[476.0,456960.0],"M20S":[551.0,528960.0],"M25N":[563.0,506700.0],"M25S":[650.0,585000.0],"M30N":[675.0,567000.0],"M30S":[774.0,650160.0],"M35N":[819.0,638820.0],"M35S":[945.0,737100.0],"M40N":[1000.0,720000.0],"M40S":[1187.0,854640.0],"M45N":[1239.0,817740.0],"M45S":[1479.0,976140.0],"M50N":[1629.0,977400.0],"M50S":[1947.0,1168200.0],"M55N":[2051.0,1107540.0],"M55S":[2466.0,1331640.0],"M60N":[2811.0,1349280.0],"M60S":[3396.0,1630080.0]},"Prudential":{"F20N":[474.0,null],"F20S":[598.0,null],"F25N":[573.0,null],"F25S":[721.0,null],"F30N":[701.0,null],"F30S":[907.0,null],"F35N":[868.0,null],"F35S":[1135.0,null],"F40N":[1073.0,null],"F40S":[1438.0,null],"F45N":[1374.0,null],"F45S":[1811.0,null],"F50N":[1627.0,null],"F50S":[2112.0,null],"F55N":[2311.0,null],"F55S":[2959.0,null],"F60N":[2830.0,null],"F60S":[3780.0,null],"M20N":[559.0,null],"M20S":[810.0,null],"M25N":[637.0,null],"M25S":[711.0,null],"M30N":[841.0,null],"M30S":[1048.0,null],"M35N":[1049.0,null],"M35S":[1489.0,null],"M40N":[1323.0,null],"M40S":[1972.0,null],"M45N":[1681.0,null],"M45S":[2540.0,null],"M50N":[1981.0,null],"M50S":[1950.0,null],"M55N":[2740.0,null],"M55S":[2800.0,null],"M60N":[3262.0,null],"M60S":[4813.0,null]}};

const BASE_SA = 1_000_000;

export interface LsaResult {
  insurer: LsaInsurer;
  product: string;
  structure: 'level' | 'stepped';
  deathBasis: string;
  caveat: string;
  coverageBasis: string;    // the term this insurer's own quotation is written on
  basisIsTo100: boolean;    // true = quoted to 100, so the monthly is not like-for-like
  monthly: number | null;   // null = no quote for this age/gender/smoker
  annual: number | null;
  outlay80: number | null;  // premiums paid to the selected coverage age (name kept for callers)
  coverageAge: CoverageAge; // the term these figures are quoted on
  basisWarning?: string;    // set when this row's own quote basis differs from the selection
  note?: string;
}

function bracket(age: number): [number, number] {
  const a = Math.max(20, Math.min(60, age));
  const lo = Math.max(20, Math.min(60, Math.floor(a / 5) * 5));
  const hi = Math.min(60, lo + 5);
  return [lo, hi];
}

// Log-linear interpolation: premium grows roughly exponentially with age, so a
// straight line between two grid points always sits ABOVE the true curve. Measured
// by hiding each interior grid age and predicting it from its neighbours, across all
// 179 quotes: mean error 7.53% (linear) vs 3.94% (log) on monthly, 3.69% vs 3.48%
// on outlay — log is better for every insurer on both fields. The old linear form
// over-stated off-grid ages by up to 6.9% (GE), 4.2% (HLA/Prudential).
function interp(rec: Record<string, [number, number]>, g: Gender, sm: string, age: number, idx: number): number | null {
  const [lo, hi] = bracket(age);
  const vlo = rec[`${g}${lo}${sm}`];
  const vhi = rec[`${g}${hi}${sm}`];
  if (hi === lo) return vlo ? vlo[idx] : null;
  const t = (Math.max(20, Math.min(60, age)) - lo) / (hi - lo);
  // Landing exactly on a grid age needs only that endpoint. Requiring both would
  // blank out a real quote just because its neighbour is missing — GE M55S is a
  // published rate, but GE M60S has not been run, and the pair-check hid both.
  if (t <= 0) return vlo ? vlo[idx] : null;
  if (t >= 1) return vhi ? vhi[idx] : null;
  if (!vlo || !vhi) return null;
  const y0 = vlo[idx];
  const y1 = vhi[idx];
  // (Endpoints are returned above, verbatim: Math.exp(Math.log(x)) drifts by ~1 ULP
  // and premiums round UP, so 470 -> 470.00000000000006 -> ceil 471 would have added
  // RM1 to 60 grid ages, which ARE the insurers' official quoted figures.)
  // log() needs strictly positive endpoints; fall back to linear if that ever fails.
  if (y0 <= 0 || y1 <= 0) return y0 + (y1 - y0) * t;
  return Math.exp(Math.log(y0) + (Math.log(y1) - Math.log(y0)) * t);
}

/** Estimate one insurer. Returns a result with nulls if no quote exists (GE male). */
export function estimate(
  insurer: LsaInsurer, gender: Gender, smoker: boolean, age: number, sa = BASE_SA,
  coverageAge: CoverageAge = 80,
): LsaResult {
  const sm = smoker ? 'S' : 'N';
  const to100 = coverageAge === 100;
  const rec = to100 ? LSA_DATA_100[insurer] : LSA_DATA[insurer];
  const m = interp(rec as Record<string, [number, number]>, gender, sm, age, 0);
  const o = interp(rec as Record<string, [number, number]>, gender, sm, age, 1);
  const base: LsaResult = {
    insurer, product: LSA_PRODUCT[insurer], structure: LSA_STRUCTURE[insurer],
    deathBasis: LSA_DEATH_BASIS[insurer], caveat: LSA_CAVEAT[insurer],
    coverageBasis: LSA_COVERAGE_BASIS[insurer], basisIsTo100: LSA_BASIS_IS_TO_100[insurer],
    monthly: null, annual: null, outlay80: null, coverageAge,
  };
  // GE is sold only to age 100, so on a to-80 selection its row is not like-for-like.
  if (!to100 && LSA_BASIS_IS_TO_100[insurer]) {
    base.basisWarning = 'Sold only to age 100 — premiums continue past 80';
  }
  // Prudential's 50/55/60 rows are to-age-90 illustrations sitting in the to-80 grid.
  if (!to100 && insurer === 'Prudential' && PRU_TO90_AGES.some((a) => Math.abs(a - age) < 5)) {
    base.basisWarning = 'Quoted to age 90 at this entry age — buys 10 extra years; awaiting re-quote';
  }
  if (m == null) {
    base.note = 'No quote available for this age/gender/smoker combination';
    return base;
  }
  // Sub-linear sum-assured scaling: (SA/1m)^k (k=1 at BASE_SA keeps grid exact).
  const saFactor = Math.pow(sa / BASE_SA, LSA_SA_EXPONENT[insurer]);
  const monthly = Math.ceil(m * saFactor);   // round UP to whole ringgit
  base.monthly = monthly;
  base.annual = monthly * 12;
  base.outlay80 = o == null ? null : Math.round(o * saFactor);
  if (insurer === 'GE') base.note = 'Year-1 stepped premium — rises steeply later; see total outlay';
  if (to100 && insurer === 'Prudential') base.note = 'Steps up again at 80 — lifetime total not shown';
  return base;
}

/** Estimate all insurers, ranked cheapest-first (rows without a quote sink to the bottom). */
export function estimateAll(
  gender: Gender, smoker: boolean, age: number, sa = BASE_SA, coverageAge: CoverageAge = 80,
): LsaResult[] {
  const rows = LSA_INSURERS.map((ins) => estimate(ins, gender, smoker, age, sa, coverageAge));
  rows.sort((a, b) => {
    if (a.monthly == null && b.monthly == null) return 0;
    if (a.monthly == null) return 1;
    if (b.monthly == null) return -1;
    return a.monthly - b.monthly;
  });
  return rows;
}
