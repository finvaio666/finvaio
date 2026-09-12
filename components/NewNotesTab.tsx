'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IntakeCandidate, IntakeQueue } from '@/app/api/note-intake/route';
import ClientSearchCombobox from '@/components/ClientSearchCombobox';

/**
 * The admin review queue for structured notes found in the term-sheet folder
 * but not yet in the book — the entry counterpart to the Needs Action tab,
 * which handles the same notes on their way out.
 *
 * The scanner (scripts/scan-term-sheets.mjs --push) does the finding and a
 * best-effort parse; this screen is where a human turns a candidate into a
 * real holding. Two things are deliberately NOT prefilled, because no term
 * sheet contains them:
 *
 *   · the invested amount, per client — a term sheet states the tranche size,
 *     never one client's slice of it
 *   · the KI/KO barriers as stored levels — these are read off the PDF, since
 *     a misread barrier silently produces wrong KO flags months later
 *
 * Everything the parser did read is shown as an editable draft to check
 * against the PDF, never as settled fact.
 */

interface Allocation { clientId: string; amount: string }

interface FormState {
  holdingName:  string;
  currency:     string;
  institution:  string;
  platform:     string;
  startDate:    string;
  maturityDate: string;
  couponPctPa:  string;
  kiPct:        string;
  koPct:        string;
  allocations:  Allocation[];
}

interface ParsedTerms {
  tradeDate?: string | null;
  issueDate?: string | null;
  maturityDate?: string | null;
  couponPctPa?: number | null;
  /** Barriers as a % of initial, where the issuer's template states them plainly enough to read. */
  kiPct?: number | null;
  koPct?: number | null;
  /** Tranche total and minimum unit — the only figures on a term sheet that can check the amounts a human types. */
  issueAmount?: number | null;
  denomination?: number | null;
  underlyings?: { name?: string; ticker?: string; entry?: number; strike?: number }[];
  schedule?: { n?: number; determinationDate?: string | null; triggerPct?: number | null }[];
  notes_?: string[];
}

/** Short label — the badge and the draft holding name. */
const ISSUER_LABEL: Record<string, string> = {
  nomura: 'Nomura', marex: 'Marex', ubs_vmran: 'UBS', csi: 'CSI', natixis: 'Natixis',
};

/**
 * The exact Institution spelling already used in the book, so an accepted note
 * lands on the existing issuer rather than creating a near-duplicate ("UBS"
 * alongside "UBS AG (London Branch)") that splits it in every breakdown.
 */
const ISSUER_INSTITUTION: Record<string, string> = {
  nomura:    'Nomura',
  marex:     'Marex Financial',
  ubs_vmran: 'UBS AG (London Branch)',
  csi:       "CSI Financial Products Ltd (Guarantor: CITIC Securities Int'l)",
  natixis:   'Natixis',
};

/** A first-draft holding name from what the parser found — always editable. */
function draftName(c: IntakeCandidate, p: ParsedTerms): string {
  const tickers = (p.underlyings ?? []).map(u => u.ticker || u.name).filter(Boolean);
  const issuer = ISSUER_LABEL[c.issuerFamily] ?? '';
  const basket = tickers.length ? tickers.join('/') : c.isin;
  return [issuer, basket, 'FCN'].filter(Boolean).join(' ');
}

function initialForm(c: IntakeCandidate): FormState {
  const p = (c.parsed ?? {}) as ParsedTerms;
  return {
    holdingName:  draftName(c, p),
    currency:     'USD',
    institution:  ISSUER_INSTITUTION[c.issuerFamily] ?? '',
    platform:     '',
    startDate:    p.issueDate ?? '',
    // Computed from the final valuation plus the term sheet's stated settlement
    // lag, not equal to the last observation — in this book maturity really is
    // a few days later on almost every note. The parse warnings say it's
    // computed, so it reads as a starting point rather than a fact.
    maturityDate: p.maturityDate ?? '',
    couponPctPa:  p.couponPctPa != null ? String(p.couponPctPa) : '',
    // Prefilled only where the template stated the barrier plainly; otherwise
    // left blank so it is read off the PDF rather than inherited from a guess.
    kiPct:        p.kiPct != null ? String(p.kiPct) : '',
    koPct:        p.koPct != null ? String(p.koPct) : '100',
    // One row prefilled with the folder's client when it matched; otherwise an
    // empty row so the reviewer has to choose one explicitly.
    allocations:  [{ clientId: c.clientId, amount: '' }],
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}{hint && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginLeft: 5, color: 'var(--text3)' }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

/**
 * Drag term sheets in, say which client each belongs to, upload.
 *
 * The client is PICKED here rather than guessed from a folder name, which is
 * the weak point of the folder scanner — it warns loudly when a folder doesn't
 * match a known client, and that warning is the only thing standing between a
 * mis-named folder and a silently skipped note.
 *
 * Terms are not read at upload time (Vercel has no Python, and a JS PDF reader
 * misreads table columns quietly), so a file lands as "awaiting parse" and the
 * card says so until `scan-term-sheets.mjs --parse-queue` has run.
 */
function UploadPanel({ clients, onDone }: {
  clients: IntakeQueue['clients'];
  onDone: () => void;
}) {
  const [picked, setPicked]   = useState<{ file: File; clientId: string }[]>([]);
  const [busy, setBusy]       = useState(false);
  const [results, setResults] = useState<{ fileName: string; ok: boolean; reason?: string }[]>([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const pdfs = [...list].filter(f => /\.pdf$/i.test(f.name));
    setPicked(p => [...p, ...pdfs.map(file => ({ file, clientId: '' }))]);
    setResults([]);
  }

  async function upload() {
    if (!picked.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      // Parallel arrays: the route pairs clientIds[i] with files[i].
      for (const p of picked) { fd.append('files', p.file); fd.append('clientIds', p.clientId); }
      const res = await fetch('/api/note-intake/upload', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error ?? 'Upload failed.'); return; }
      setResults(d.results ?? []);
      // Keep only what was rejected, with its reason — re-uploading the ones
      // that worked would just produce "already in the queue".
      const failedNames = new Set((d.results ?? []).filter((r: { ok: boolean }) => !r.ok).map((r: { fileName: string }) => r.fileName));
      setPicked(p => p.filter(x => failedNames.has(x.file.name)));
      onDone();
    } catch { alert('Upload failed — network error.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="section" style={{ padding: 16, marginBottom: 4 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        style={{
          border: `1.5px dashed ${dragging ? '#F37338' : 'var(--border)'}`,
          background: dragging ? 'rgba(243,115,56,0.06)' : 'transparent',
          borderRadius: 10, padding: '18px 16px', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Upload term sheets</div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>
          Drop PDFs here, or <label style={{ color: '#F37338', cursor: 'pointer', textDecoration: 'underline' }}>
            browse<input type="file" accept="application/pdf" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>. The filename must contain the ISIN.
        </div>
      </div>

      {picked.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {picked.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 2, minWidth: 0, fontSize: 11.5, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.file.name}
              </div>
              <div style={{ flex: 2, minWidth: 0 }}>
                <ClientSearchCombobox
                  clients={clients}
                  value={p.clientId}
                  onChange={cl => setPicked(list => list.map((x, j) => (j === i ? { ...x, clientId: cl?.id ?? '' } : x)))}
                  placeholder="Which client?"
                  inputStyle={{ padding: '6px 32px 6px 30px', fontSize: 12, borderRadius: 6, borderWidth: 1 }}
                />
              </div>
              <button onClick={() => setPicked(list => list.filter((_, j) => j !== i))} title="Remove"
                style={{ padding: '5px 9px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              Leaving a client blank is fine — you&apos;ll pick one before it can be added to the book.
            </span>
            <button onClick={upload} disabled={busy}
              style={{ padding: '7px 18px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #F37338', background: busy ? 'var(--surface)' : '#F37338', color: busy ? 'var(--text3)' : '#fff', cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Uploading…' : `Upload ${picked.length}`}
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {results.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: r.ok ? '#22c55e' : '#d97706' }}>
              {r.ok ? '✓' : '⚠'} {r.fileName}{r.reason ? ` — ${r.reason}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NewNotesTab() {
  const [queue,   setQueue]   = useState<IntakeQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');
  const [openId,  setOpenId]  = useState('');
  const [forms,   setForms]   = useState<Record<string, FormState>>({});
  const [busyId,  setBusyId]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/note-intake');
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? 'Could not load the intake queue.'); setQueue(null); }
      else { setQueue(d); setErr(''); }
    } catch {
      setErr('Could not load the intake queue — network error.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCard(c: IntakeCandidate) {
    if (openId === c.id) { setOpenId(''); return; }
    // Seed the form from the parse the first time only, so a half-filled form
    // survives collapsing and reopening the card.
    setForms(f => (f[c.id] ? f : { ...f, [c.id]: initialForm(c) }));
    setOpenId(c.id);
  }

  const setField = (id: string, k: keyof FormState, v: string) =>
    setForms(f => ({ ...f, [id]: { ...f[id], [k]: v } }));

  const setAlloc = (id: string, i: number, k: keyof Allocation, v: string) =>
    setForms(f => {
      const rows = f[id].allocations.map((a, j) => (j === i ? { ...a, [k]: v } : a));
      return { ...f, [id]: { ...f[id], allocations: rows } };
    });

  const addAlloc = (id: string) =>
    setForms(f => ({ ...f, [id]: { ...f[id], allocations: [...f[id].allocations, { clientId: '', amount: '' }] } }));

  const removeAlloc = (id: string, i: number) =>
    setForms(f => ({ ...f, [id]: { ...f[id], allocations: f[id].allocations.filter((_, j) => j !== i) } }));

  /**
   * Ignore is per DOCUMENT and permanent — the reasons to reject ("superseded
   * draft", "duplicate", "not ours") are facts about the PDF, so one rejection
   * covers every client folder it sits in and the scanner never offers it
   * again. The count is spelled out in the prompt because a shared note can
   * take several pending candidates out at once.
   */
  async function ignore(c: IntakeCandidate) {
    const also = c.siblingCount ? `\n\nThis will also remove ${c.siblingCount} other pending candidate(s) for the same document.` : '';
    if (!confirm(`Ignore this term sheet permanently?\n\n${c.fileName || c.isin}${also}\n\nIt will not be offered again, even if the file is renamed or moved.`)) return;
    setBusyId(c.id);
    try {
      const res = await fetch('/api/note-intake', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error ?? 'Could not ignore this candidate.'); return; }
      await load();
    } catch { alert('Could not ignore this candidate — network error.'); }
    finally { setBusyId(''); }
  }

  async function accept(c: IntakeCandidate) {
    const f = forms[c.id];
    const p = (c.parsed ?? {}) as ParsedTerms;
    const allocations = f.allocations
      .filter(a => a.clientId && Number(a.amount) > 0)
      .map(a => ({ clientId: a.clientId, amount: Number(a.amount) }));

    if (!allocations.length) { alert('Each client needs an invested amount — that figure is never on the term sheet, so it has to come from you.'); return; }
    if (!Number(f.kiPct))  { alert('Read the KI barrier off the term sheet (as a % of initial) — without it, a knock-in can never be flagged.'); return; }

    // Checks against the tranche the term sheet states. Over-allocating is
    // impossible, so it blocks outright; an amount that isn't a whole number of
    // denominations is usually a typo (500,000 for 50,000) but can be
    // legitimate, so it asks rather than refuses.
    const total = allocations.reduce((s, a) => s + a.amount, 0);
    if (p.issueAmount && total > p.issueAmount) {
      alert(`These amounts total ${f.currency} ${total.toLocaleString()}, but the whole tranche is only ${f.currency} ${p.issueAmount.toLocaleString()}.\n\nCheck the figures — you cannot hold more of a note than was issued.`);
      return;
    }
    if (p.denomination) {
      const odd = allocations.filter(a => a.amount % p.denomination! !== 0);
      if (odd.length && !confirm(
        `The term sheet states a denomination of ${f.currency} ${p.denomination.toLocaleString()}, but ${odd.length} amount(s) are not a whole multiple of it:\n\n` +
        odd.map(a => `  ${queue?.clients.find(x => x.id === a.clientId)?.name ?? a.clientId} — ${f.currency} ${a.amount.toLocaleString()}`).join('\n') +
        `\n\nContinue anyway?`
      )) return;
    }

    const names = allocations.map(a => queue?.clients.find(x => x.id === a.clientId)?.name ?? a.clientId);
    if (!confirm(`Add this note to the book?\n\n${f.holdingName}\n${c.isin}\n\n${allocations.map((a, i) => `  ${names[i]} — ${f.currency} ${a.amount.toLocaleString()}`).join('\n')}\n\nThis creates ${allocations.length} live holding(s).`)) return;

    setBusyId(c.id);
    try {
      const res = await fetch('/api/note-intake/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: c.id,
          holdingName:  f.holdingName,
          allocations,
          currency:     f.currency,
          institution:  f.institution,
          platform:     f.platform,
          startDate:    f.startDate,
          maturityDate: f.maturityDate,
          couponPctPa:  Number(f.couponPctPa) || undefined,
          kiPct:        Number(f.kiPct),
          koPct:        Number(f.koPct) || 100,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error ?? 'Could not add this note.'); return; }
      // Say which rate was used: it is fetched live rather than typed here, so
      // this is the only place it's visible before the holding is written.
      alert(`Added ${d.created} holding(s) at ${f.currency}/MYR ${Number(d.fxRate).toFixed(4)}.`);
      setOpenId('');
      await load();
    } catch { alert('Could not add this note — network error.'); }
    finally { setBusyId(''); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading the intake queue…</div>;
  if (err)     return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{err}</div>;
  if (!queue)  return null;

  if (!queue.candidates.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <UploadPanel clients={queue.clients} onDone={load} />
        <div className="section" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>No new term sheets</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 460, margin: '0 auto' }}>
            Everything found so far is either already in the book or was ignored. Upload term sheets above, or
            run <code style={{ fontSize: 12 }}>node scripts/scan-term-sheets.mjs &quot;&lt;folder&gt;&quot; --push</code> to scan a folder.
          </div>
        </div>
      </div>
    );
  }

  const awaiting = queue.candidates.filter(c => c.status === 'awaiting_parse').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <datalist id="intake-issuers">
        {queue.institutions.map(i => <option key={i} value={i} />)}
      </datalist>
      <UploadPanel clients={queue.clients} onDone={load} />

      {awaiting > 0 && (
        <div style={{ fontSize: 11.5, padding: '9px 12px', borderRadius: 8, color: '#d97706', background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.30)' }}>
          {awaiting} uploaded term sheet{awaiting === 1 ? '' : 's'} still need{awaiting === 1 ? 's' : ''} its terms read.
          Reading a PDF needs Python, which the server doesn&apos;t have — run{' '}
          <code style={{ fontSize: 11 }}>node scripts/scan-term-sheets.mjs --parse-queue</code> and refresh.
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
        {queue.candidates.length} term sheet{queue.candidates.length === 1 ? '' : 's'} not in the book.
        The parsed terms below are a <strong>draft to check against the PDF</strong>, not settled fact — and the invested amount is never on a term sheet,
        so it has to come from you.
      </div>

      {queue.candidates.map(c => {
        const p = (c.parsed ?? {}) as ParsedTerms;
        const f = forms[c.id];
        const isOpen = openId === c.id;
        const isBusy = busyId === c.id;
        const unmatched = !c.clientId;

        return (
          <div key={c.id} style={{
            background: 'var(--surface)', borderRadius: 10,
            border: `1px solid ${unmatched ? 'rgba(217,119,6,0.35)' : 'var(--border)'}`,
          }}>
            {/* Summary row — always visible */}
            <div
              onClick={() => openCard(c)}
              style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{c.isin}</span>
                  {c.status === 'awaiting_parse' ? (
                    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)' }}>
                      Terms not read yet
                    </span>
                  ) : c.issuerFamily ? (
                    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', color: 'var(--text2)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      {ISSUER_LABEL[c.issuerFamily] ?? c.issuerFamily}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)' }}>
                      Unrecognised format — read manually
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  {c.clientName
                    ? <>for <strong style={{ color: 'var(--text2)' }}>{c.clientName}</strong> · {c.advisorName || '—'}</>
                    : <span style={{ color: '#d97706', fontWeight: 600 }}>Client not matched — folder &ldquo;{c.clientHint}&rdquo; is not a known client name</span>}
                </div>
                {c.fileUrl ? (
                  // Uploaded: the reviewer can open the actual PDF to check the
                  // parsed terms against it, which is the whole point of showing
                  // them as a draft.
                  <div style={{ fontSize: 10.5, marginTop: 3 }}>
                    <a href={c.fileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ color: '#F37338', textDecoration: 'underline' }}>
                      📄 {c.fileName}
                    </a>
                    {c.uploadedBy && <span style={{ color: 'var(--text3)' }}> · uploaded by {c.uploadedBy}</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, wordBreak: 'break-all' }}>{c.filePath}</div>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{isOpen ? '▲ Close' : '▼ Review'}</span>
            </div>

            {isOpen && f && (
              <div style={{ padding: '0 20px 18px', borderTop: '1px solid var(--border)' }}>
                {/* What the parser read — shown as-is so it can be checked
                    against the PDF before any of it is trusted. */}
                <div style={{ margin: '14px 0', padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 11.5, color: 'var(--text2)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Parsed from the PDF — verify</div>
                  <div>Underlyings: {p.underlyings?.length
                    ? p.underlyings.map(u => `${u.ticker || u.name} @ ${u.entry}`).join(' · ')
                    : <span style={{ color: '#d97706' }}>not parsed — read manually</span>}</div>
                  <div>Observations: {p.schedule?.length
                    ? `${p.schedule.length}, ${p.schedule[0]?.determinationDate} → ${p.schedule[p.schedule.length - 1]?.determinationDate}`
                    : <span style={{ color: '#d97706' }}>not parsed — read manually</span>}</div>
                  {(c.parseWarnings ?? []).map((w, i) => (
                    <div key={i} style={{ marginTop: 4, color: '#d97706' }}>ⓘ {w}</div>
                  ))}
                </div>

                {/* Terms */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
                  <Field label="Holding name"><input style={inputStyle} value={f.holdingName} onChange={e => setField(c.id, 'holdingName', e.target.value)} /></Field>
                  {/* Issuer is a datalist, not a select: the handful of banks
                      already in the book cover almost every note, but a first
                      note from a new issuer must still be typeable. */}
                  <Field label="Issuer">
                    <input style={inputStyle} list="intake-issuers" value={f.institution} onChange={e => setField(c.id, 'institution', e.target.value)} />
                  </Field>
                  {/* Platform is a hard list. A typo here ("Swissquote") creates
                      a platform that groups into Ungrouped and quietly drops the
                      note out of the AUM-by-platform breakdown. */}
                  <Field label="Platform" hint="custodian">
                    <select style={inputStyle} value={f.platform} onChange={e => setField(c.id, 'platform', e.target.value)}>
                      <option value="">Select platform…</option>
                      {queue.platforms.map(pl => <option key={pl} value={pl}>{pl}</option>)}
                    </select>
                  </Field>
                  <Field label="Currency"><input style={inputStyle} value={f.currency} onChange={e => setField(c.id, 'currency', e.target.value.toUpperCase())} /></Field>
                  <Field label="Coupon % p.a."><input style={inputStyle} value={f.couponPctPa} inputMode="decimal" onChange={e => setField(c.id, 'couponPctPa', e.target.value)} /></Field>
                  <Field label="Issue date"><input style={inputStyle} type="date" value={f.startDate} onChange={e => setField(c.id, 'startDate', e.target.value)} /></Field>
                  <Field label="Maturity date"><input style={inputStyle} type="date" value={f.maturityDate} onChange={e => setField(c.id, 'maturityDate', e.target.value)} /></Field>
                  <Field label="KI %" hint="of initial"><input style={inputStyle} value={f.kiPct} placeholder="e.g. 60" inputMode="decimal" onChange={e => setField(c.id, 'kiPct', e.target.value)} /></Field>
                  <Field label="KO %" hint="of initial"><input style={inputStyle} value={f.koPct} inputMode="decimal" onChange={e => setField(c.id, 'koPct', e.target.value)} /></Field>
                </div>

                {/* Allocations — the part no term sheet can fill in. */}
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
                  Who holds it, and how much
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                  A tranche is often split across several clients at different amounts. Add a row per client — they all get the same terms, so the copies can&apos;t drift apart later.
                </div>

                {/* Checks the typed amounts against the tranche the term sheet
                    states. An over-allocation is arithmetically impossible, so
                    it blocks; a short one is normal (the rest of the tranche can
                    sit outside this firm) and only informs. */}
                {(() => {
                  const total = f.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
                  if (!p.issueAmount) {
                    return total > 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                        Allocated <strong>{f.currency} {total.toLocaleString()}</strong> — the tranche size didn&apos;t parse, so there is nothing to check it against.
                      </div>
                    ) : null;
                  }
                  const over = total > p.issueAmount;
                  const left = p.issueAmount - total;
                  return (
                    <div style={{
                      fontSize: 11, marginBottom: 8, padding: '7px 10px', borderRadius: 6,
                      background: over ? 'rgba(239,68,68,0.12)' : 'var(--bg)',
                      border: `1px solid ${over ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
                      color: over ? '#ef4444' : 'var(--text2)',
                    }}>
                      Tranche <strong>{f.currency} {p.issueAmount.toLocaleString()}</strong>
                      {p.denomination ? <> · units of {p.denomination.toLocaleString()}</> : null}
                      {' · '}allocated <strong>{f.currency} {total.toLocaleString()}</strong>
                      {over
                        ? <> · <strong>over by {(-left).toLocaleString()}</strong> — more than the note exists</>
                        : <> · {left.toLocaleString()} unallocated{left === 0 ? ' ✓' : ''}</>}
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {f.allocations.map((a, i) => {
                    // Which FA ends up owning the holding follows the client, so
                    // show it once one is picked — an admin adding a note for
                    // someone else's client should see whose book it lands in.
                    const owner = queue.clients.find(cl => cl.id === a.clientId)?.advisorName;
                    return (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flex: 2, minWidth: 0 }}>
                          {/* Same type-to-search picker as the rest of the app —
                              matches name, email and phone. A plain <select> of
                              ~950 clients is not a realistic way to find one. */}
                          <ClientSearchCombobox
                            clients={queue.clients}
                            value={a.clientId}
                            onChange={cl => setAlloc(c.id, i, 'clientId', cl?.id ?? '')}
                            placeholder="Search client by name…"
                            inputStyle={{ padding: '6px 32px 6px 30px', fontSize: 12, borderRadius: 6, borderWidth: 1 }}
                          />
                          {owner && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, paddingLeft: 4 }}>goes to {owner}&apos;s book</div>}
                        </div>
                        <input
                          style={{ ...inputStyle, flex: 1 }} value={a.amount} inputMode="decimal"
                          placeholder={`Amount (${f.currency})`}
                          onChange={e => setAlloc(c.id, i, 'amount', e.target.value)}
                        />
                        {f.allocations.length > 1 && (
                          <button onClick={() => removeAlloc(c.id, i)} title="Remove this client"
                            style={{ padding: '5px 9px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', cursor: 'pointer' }}>×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => addAlloc(c.id)}
                  style={{ padding: '5px 11px', fontSize: 11.5, fontWeight: 600, borderRadius: 6, border: '1px dashed var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', marginBottom: 16 }}>
                  + Add another client
                </button>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => ignore(c)} disabled={isBusy}
                    title={c.siblingCount ? `Also removes ${c.siblingCount} other pending candidate(s) for this document` : 'Never offer this term sheet again'}
                    style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text3)', cursor: isBusy ? 'wait' : 'pointer' }}>
                    Ignore permanently{c.siblingCount ? ` (${c.siblingCount + 1} copies)` : ''}
                  </button>
                  <button onClick={() => accept(c)} disabled={isBusy}
                    style={{ padding: '7px 18px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #22c55e', background: isBusy ? 'var(--surface)' : '#22c55e', color: isBusy ? 'var(--text3)' : '#fff', cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                    {isBusy ? 'Adding…' : 'Add to book'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
