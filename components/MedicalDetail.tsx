import React from 'react';

/**
 * Renders a packed medical-benefit string as stacked, labelled rows.
 *
 * Expected format (produced by the Allianz sync into the "Medical Class" field):
 *   "HealthAssured (15% Co-Ins) · Room & Board: RM200/day · Annual Limit: RM3,000,000 · Lifetime Limit: Unlimited"
 *
 * The first " · "-separated segment is treated as the plan name (shown as a
 * header); each remaining "Label: Value" segment becomes its own labelled line.
 * A segment without a ": " is shown as a plain line. Renders "—" when empty, so
 * it is safe to use for any policy (non-medical policies just show a dash).
 */
export function MedicalDetail({ value, align = 'left' }: { value?: string; align?: 'left' | 'right' }) {
  const text = (value ?? '').trim();
  if (!text) return <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>;

  const [plan, ...rest] = text.split(' · ');
  const rows = rest.map((seg) => {
    const i = seg.indexOf(': ');
    return i === -1 ? { label: '', val: seg } : { label: seg.slice(0, i), val: seg.slice(i + 2) };
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align,
        lineHeight: 1.35,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>🏥 {plan}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ fontSize: 10.5, color: 'var(--text2)' }}>
          {r.label && <span style={{ color: 'var(--text3)' }}>{r.label}: </span>}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{r.val}</span>
        </div>
      ))}
    </div>
  );
}

export default MedicalDetail;
