'use client';

// Education Planner — ports the mechanism of "Education Calculator_2022.xlsm":
//   fee lookup (country × major × fee tier) → inflate each course year to the intake year (FV)
//   → convert to a base currency → Option 1 lump sum today (PV) / Option 2 monthly plan (PMT, annuity due)
//   → cost of delaying the plan by 2 years.
// Fee data + sources live in lib/educationFees.ts (refresh every Oct–Nov).

import { useMemo, useState } from 'react';
import {
  BASE_CURRENCIES, COUNTRIES, DEFAULT_GROWTH_PCT, DEFAULT_INFLATION_PCT, FEES, FEES_LAST_UPDATED,
  FEE_SOURCES, FX_USD, MAJORS, MAX_YEARS, MY_MEDICINE_YEARS, PRE_U,
  type CountryKey, type MajorKey,
} from '@/lib/educationFees';
import { upperName } from '@/lib/displayName';

interface PDFRow { label: string; value: string; highlight?: 'positive' | 'negative' }
interface PDFSection { title: string; rows: PDFRow[] }
export interface EducationPDFReport {
  reportType: string; clientName: string; subtitle: string; sections: PDFSection[];
  summary: { status: 'positive' | 'negative' | 'warning'; headline: string; detail: string };
  assumptions: string;
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const inp: React.CSSProperties = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const head: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 };

function NumInput({ label, value, onChange, suffix, step = 1, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number; min?: number;
}) {
  void step; void min;
  const [raw, setRaw] = useState<string | null>(null); // text being typed; null = show the controlled value
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        <input type="text" inputMode="decimal" value={raw ?? String(value)}
          onBlur={() => setRaw(null)}
          onFocus={e => e.target.select()}
          onChange={e => {
            const v = e.target.value.replace(/[^0-9.]/g, '');
            setRaw(v);
            const n = parseFloat(v);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          style={{ flex: 1, background: 'transparent', border: 'none', padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none', minWidth: 0 }} />
        {suffix && <span style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text3)', borderLeft: '1px solid var(--border)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Select<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={lbl}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value as T)} style={inp}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'good' | 'bad' }) {
  const c = tone === 'good' ? 'var(--accent)' : tone === 'bad' ? 'var(--red)' : 'var(--text)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 700 : 600, fontFamily: 'var(--font-mono)', color: c }}>{value}</span>
    </div>
  );
}

// ── finance helpers (Excel FV / PV / PMT with type=1 where the workbook uses it) ──
const fv = (pv: number, rate: number, n: number) => pv * Math.pow(1 + rate, n);
const pv = (target: number, rate: number, n: number) => target / Math.pow(1 + rate, n);
function pmtDue(target: number, annualRate: number, years: number) {
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return target / n;
  return (target * r) / (Math.pow(1 + r, n) - 1) / (1 + r);
}

export default function EducationPlanner({ clientName, onDownload, DownloadButton }: {
  clientName?: string;
  onDownload: (r: EducationPDFReport) => Promise<void>;
  DownloadButton: React.ComponentType<{ onClick: () => void; loading: boolean }>;
}) {
  const thisYear = new Date().getFullYear();
  const [f, setF] = useState({
    client: clientName ?? '', child: '', age: 5, collegeAge: 18,
    major: 'Business' as MajorKey, dest: 'UK' as CountryKey, ivy: false,
    localYears: 2, preU: false, base: 'MYR' as (typeof BASE_CURRENCIES)[number],
    growth: DEFAULT_GROWTH_PCT,
  });
  const [infl, setInfl] = useState<Record<CountryKey, number>>({ ...DEFAULT_INFLATION_PCT });
  const [fx, setFx] = useState<Record<string, number>>({ ...FX_USD });
  const [showSources, setShowSources] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }));

  const isMed = f.major === 'Medicine_Dentistry';
  const localOnly = f.dest === 'MY';
  const fee = FEES[f.dest][f.major];
  const myFee = FEES.MY[f.major];
  const destNA = !localOnly && fee.median === null;
  const ivyAvailable = !localOnly && fee.ivy !== null;
  const ivy = f.ivy && ivyAvailable;
  const years = Math.max(f.collegeAge - f.age, 0);
  const fxTo = (cur: string) => fx[cur] / fx[f.base];
  const destCur = COUNTRIES.find(c => c.key === f.dest)!.currency;

  const calc = useMemo(() => {
    const courseLen = isMed ? MY_MEDICINE_YEARS : MAX_YEARS.MY;
    let local: number, overseas: number;
    if (localOnly) { local = courseLen; overseas = 0; }
    else if (ivy) { local = 0; overseas = MAX_YEARS[f.dest] + (isMed ? 2 : 0); }
    else { local = Math.min(f.localYears, 5); overseas = Math.max(MAX_YEARS[f.dest] - local + (isMed ? 2 : 0), 0); }
    local = Math.max(0, Math.min(local, 5));
    overseas = Math.max(0, Math.min(overseas, 5 - 0));

    const myAnnualToday = myFee.median! + myFee.living;
    const destTuition = destNA ? 0 : (ivy ? fee.ivy! : fee.median!);
    const destLiving = destNA ? 0 : (ivy && fee.livingIvy ? fee.livingIvy : fee.living);
    const destAnnualToday = destTuition + destLiving;
    const myAnnualFuture = fv(myAnnualToday, infl.MY / 100, years);
    const destAnnualFuture = localOnly ? 0 : fv(destAnnualToday, infl[f.dest] / 100, years);

    const rows = [1, 2, 3, 4, 5].map(y => ({
      year: y,
      my: y <= local ? myAnnualFuture : 0,
      os: y > local && y <= local + overseas ? destAnnualFuture : 0,
    }));
    const myTotal = rows.reduce((s, r) => s + r.my, 0) + (f.preU ? PRE_U.tuition + PRE_U.living : 0);
    const osTotal = rows.reduce((s, r) => s + r.os, 0);
    const total = myTotal * fxTo('MYR') + osTotal * fxTo(destCur);
    const g = f.growth / 100;
    const lump = pv(total, g, years);
    const monthly = pmtDue(total, g, years);
    const monthlyLate = years > 2 ? pmtDue(total, g, years - 2) : 0;
    const delayCost = years > 2 ? (monthlyLate - monthly) * years * 12 : 0;
    return { local, overseas, rows, myTotal, osTotal, total, lump, monthly, monthlyLate, delayCost, myAnnualToday, destAnnualToday, myAnnualFuture, destAnnualFuture, destTuition, destLiving };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, infl, fx, years, ivy, isMed, localOnly, destNA, fee, myFee, destCur]);

  const money = (n: number, cur: string = f.base) => `${cur} ${Math.round(n).toLocaleString()}`;

  const destLabel = COUNTRIES.find(c => c.key === f.dest)!.label;
  const majorLabel = MAJORS.find(m => m.key === f.major)!.label;

  const handleDownload = async () => {
    setPdfLoading(true);
    try {
      await onDownload({
        reportType: 'Education Planning Report',
        clientName: upperName(f.client) || 'Client',
        subtitle: `${f.child ? `For ${f.child}  ·  ` : ''}${majorLabel} in ${destLabel}  ·  Funds needed by ${thisYear + years}`,
        sections: [
          { title: 'Student & Plan', rows: [
            { label: "Child's name", value: f.child || '—' },
            { label: 'Age now / age at college', value: `${f.age} / ${f.collegeAge}` },
            { label: 'Intended major', value: majorLabel },
            { label: 'Destination', value: localOnly ? 'Malaysia (local)' : `${f.localYears > 0 && !ivy ? `Malaysia ${calc.local} yr + ` : ''}${destLabel}${ivy ? ' (top-tier university)' : ''}` },
            { label: 'Years in Malaysia / overseas', value: `${calc.local} / ${calc.overseas}` },
            { label: 'Include Pre-U / A-Levels', value: f.preU ? 'Yes' : 'No' },
          ] },
          { title: 'Annual Cost Today (tuition + living)', rows: [
            { label: 'Malaysia', value: money(calc.myAnnualToday, 'MYR') },
            ...(!localOnly && !destNA ? [{ label: destLabel, value: money(calc.destAnnualToday, destCur) }] : []),
            { label: 'Education inflation (MY / dest.)', value: `${infl.MY}% / ${localOnly ? '—' : infl[f.dest] + '%'}` },
          ] },
          { title: `Funds Required by ${thisYear + years}`, rows: [
            { label: `Total in ${f.base}`, value: money(calc.total), highlight: 'negative' },
            ...(f.base !== 'MYR' ? [{ label: 'Equivalent in MYR', value: money(calc.total * fx[f.base] / fx.MYR, 'MYR') }] : []),
          ] },
          { title: 'Funding Options', rows: [
            { label: `Option 1: Lump sum today (${f.growth}% p.a.)`, value: money(calc.lump) },
            { label: `Option 2: Monthly plan starting today`, value: money(calc.monthly) },
            ...(years > 2 ? [
              { label: 'Monthly plan if started 2 years later', value: money(calc.monthlyLate) },
              { label: 'Cost of a 2-year delay', value: money(calc.delayCost), highlight: 'negative' as const },
            ] : []),
          ] },
        ],
        summary: { status: 'warning', headline: `Education fund needed: ${money(calc.total)}`, detail: `Save ${money(calc.monthly)} a month from today, or invest ${money(calc.lump)} now at ${f.growth}% p.a.` },
        assumptions: `Fees: ${FEES_LAST_UPDATED} fee review (see source list in FINVA).  Costs inflated to intake year; in-course increases not compounded.  Growth ${f.growth}% p.a.  ·  FX: ${fx.MYR} USD/MYR, ${fx.GBP} USD/GBP.  Indicative only.`,
      });
    } finally { setPdfLoading(false); }
  };

  const countryOptions = COUNTRIES.map(c => {
    const na = c.key !== 'MY' && FEES[c.key][f.major].median === null;
    return { value: c.key, label: na ? `${c.label} (not applicable)` : c.label };
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 20 }}>
      {/* ── Inputs ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={head}>Client & Child</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={lbl}>Client Name</label>
            <input value={f.client} onChange={e => set('client')(e.target.value)} style={inp} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={lbl}>Child Name</label>
            <input value={f.child} onChange={e => set('child')(e.target.value)} style={inp} />
          </div>
          <NumInput label="Age This Year" value={f.age} onChange={set('age')} suffix="yrs" />
          <NumInput label="Age to College" value={f.collegeAge} onChange={set('collegeAge')} suffix="yrs" />
        </div>

        <div style={head}>Course & Destination</div>
        <Select label="Intended Major" value={f.major} onChange={v => setF(p => ({ ...p, major: v, ivy: false }))} options={MAJORS.map(m => ({ value: m.key, label: m.label }))} />
        <Select label="Preferred Destination" value={f.dest} onChange={v => setF(p => ({ ...p, dest: v, ivy: false }))} options={countryOptions} />
        {!localOnly && (
          <>
            <Select label="Fee Mode" value={ivy ? 'ivy' : 'median'} onChange={v => set('ivy')(v === 'ivy')}
              options={[{ value: 'median', label: 'Median tuition' }, { value: 'ivy', label: ivyAvailable ? 'Top-tier (Ivy League / Oxbridge) tuition' : 'Top-tier — not available here' }]} />
            {!ivy && <NumInput label="Years studied in Malaysia first (twinning)" value={f.localYears} onChange={set('localYears')} suffix="yrs" />}
          </>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)' }}>
          <input type="checkbox" checked={f.preU} onChange={e => set('preU')(e.target.checked)} />
          Include Pre-U / A-Levels in Malaysia ({money(PRE_U.tuition + PRE_U.living, 'MYR')})
        </label>

        <div style={head}>Funding</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select label="Base Currency" value={f.base} onChange={set('base')} options={BASE_CURRENCIES.map(c => ({ value: c, label: c }))} />
          <NumInput label="Est. Growth from Savings" value={f.growth} onChange={set('growth')} suffix="% p.a." step={0.25} />
        </div>

        <button onClick={() => setShowAdv(v => !v)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
          {showAdv ? '▾' : '▸'} Inflation & FX assumptions (editable)
        </button>
        {showAdv && (
          <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 'var(--r-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
              Defaults come from the workbook (10-yr OECD CPI × education uplift; OECD data ends 2016 and FX is 2022). Recent fee rises are higher — adjust if you have a better view.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {COUNTRIES.map(c => (
                <NumInput key={c.key} label={`Infl. ${c.key}`} value={infl[c.key]} suffix="%" step={0.1} onChange={v => setInfl(p => ({ ...p, [c.key]: v }))} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {(['MYR', 'GBP', 'AUD', 'NZD'] as const).map(c => (
                <NumInput key={c} label={`USD per ${c}`} value={fx[c]} step={0.01} onChange={v => setFx(p => ({ ...p, [c]: v }))} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {destNA ? (
          <div style={{ padding: 16, background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--red)' }}>
            {destLabel} is not applicable for {majorLabel} at undergraduate level. Choose another destination.
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 'var(--r)', padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ ...lbl, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 8 }}>Funds required by {thisYear + years}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--accent)', lineHeight: 1 }}>{money(calc.total)}</div>
              {f.base !== 'MYR' && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>≈ {money(calc.total * fx[f.base] / fx.MYR, 'MYR')}</div>}
            </div>

            <div className="section" style={{ margin: 0 }}>
              <div className="section-header">
                <div className="section-title"><span className="section-dot" style={{ background: 'var(--blue)' }} />{f.child ? `${f.child}'s Education Plan` : 'Funding Options'}</div>
                <DownloadButton onClick={handleDownload} loading={pdfLoading} />
              </div>
              <Row label={`Option 1 — Lump sum today (${f.growth}% p.a.)`} value={money(calc.lump)} bold />
              <Row label="Option 2 — Regular monthly savings from today" value={money(calc.monthly)} bold />
              <Row label="  … in MYR per month" value={money(calc.monthly * fx[f.base] / fx.MYR, 'MYR')} />
              {years > 2 && <Row label="Monthly savings if started 2 years later" value={money(calc.monthlyLate)} />}
              {years > 2 && <Row label="⚠ This delay will cost you" value={money(calc.delayCost)} tone="bad" bold />}
            </div>

            <div className="section" style={{ margin: 0 }}>
              <div className="section-header"><div className="section-title"><span className="section-dot" style={{ background: 'var(--gold)' }} />Cost by Year (inflated to intake)</div></div>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr', padding: '8px 16px', ...lbl, borderBottom: '1px solid var(--border)' }}>
                <span>Year</span><span style={{ textAlign: 'right' }}>Malaysia (MYR)</span><span style={{ textAlign: 'right' }}>{localOnly ? '—' : `${destLabel} (${destCur})`}</span>
              </div>
              {calc.rows.filter(r => r.my || r.os).map(r => (
                <div key={r.year} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr', padding: '8px 16px', fontSize: 12, borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--text3)' }}>Year {r.year}</span>
                  <span style={{ textAlign: 'right' }}>{r.my ? Math.round(r.my).toLocaleString() : '—'}</span>
                  <span style={{ textAlign: 'right' }}>{r.os ? Math.round(r.os).toLocaleString() : '—'}</span>
                </div>
              ))}
              <Row label="Total (local currencies)" value={`${Math.round(calc.myTotal).toLocaleString()} MYR${calc.osTotal ? ` + ${Math.round(calc.osTotal).toLocaleString()} ${destCur}` : ''}`} />
              <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                Today: Malaysia {money(calc.myAnnualToday, 'MYR')}/yr{!localOnly && <> · {destLabel} {money(calc.destTuition, destCur)} tuition + {money(calc.destLiving, destCur)} living /yr</>}.
                {' '}Method: each year is inflated to the intake year, in-course increases are not compounded (workbook method).
              </div>
            </div>
          </>
        )}

        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Fees last reviewed {FEES_LAST_UPDATED}.{' '}
          <button onClick={() => setShowSources(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 11, padding: 0 }}>
            {showSources ? 'Hide' : 'Show'} fee sources & links
          </button>
        </div>
        {showSources && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            {FEE_SOURCES.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '34px 1.1fr 1.4fr 1fr 70px', gap: 8, padding: '7px 10px', fontSize: 11, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <span style={{ color: 'var(--text3)' }}>{s.country}</span>
                <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>{s.institution}</a>
                <span style={{ color: 'var(--text2)' }}>{s.item}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{s.value}</span>
                <span style={{ color: s.status === 'verified' ? 'var(--accent)' : s.status === 'indicative' ? 'var(--gold)' : 'var(--text3)', fontWeight: 600 }}>
                  {s.status === 'verified' ? 'Official' : s.status === 'indicative' ? 'Indicative' : '2022 value'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
