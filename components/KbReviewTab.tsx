'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReviewEntry } from '@/lib/repos/knowledgeEntries';

/**
 * Admin > KB Review. The approval gate for the self-learning knowledge base:
 * FA suggestions (and any other draft) wait here, and nothing reaches Ask FINVA
 * until an Admin approves it. Admins can also edit, unpublish or reject any
 * entry. Rejected entries are kept for the record.
 */

type Filter = 'pending' | 'published' | 'rejected' | 'all';

const SOURCE_LABEL: Record<string, string> = {
  fa_suggestion: 'FA suggestion', manual: 'Firm experience', industry_reference: 'Industry technique',
  ai_synthesis: 'AI synthesis', public_regulation: 'Public rules', product_knowledge: 'Product knowledge',
};
const CATEGORIES = ['client_objection', 'product_regulatory', 'operations', 'insurance', 'investment'];

const ctl: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' };
const pill = (on: boolean): React.CSSProperties => ({ padding: '5px 12px', fontSize: 12, borderRadius: 99, cursor: 'pointer', border: '1px solid var(--border)', background: on ? '#F37338' : 'none', color: on ? '#fff' : 'var(--text2)' });
const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }) : '');

function StatusBadge({ status }: { status: string }) {
  const c = status === 'published' ? ['var(--green)', 'Published'] : status === 'rejected' ? ['var(--red)', 'Rejected'] : ['#D97706', 'Waiting for review'];
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: c[0], border: `1px solid ${c[0]}`, borderRadius: 99, padding: '1px 8px', whiteSpace: 'nowrap' }}>{c[1]}</span>;
}

function Editor({ entry, onDone }: { entry: ReviewEntry; onDone: () => void }) {
  const [f, setF] = useState({
    title: entry.title, situation: entry.situation, resolution: entry.resolution, keyTakeaway: entry.keyTakeaway,
    tags: entry.tags.join(', '), category: entry.category || 'operations', entryType: entry.entryType,
    source: entry.source, isBigLesson: entry.isBigLesson,
  });
  const [reviewNote, setReviewNote] = useState(entry.reviewNote);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }));

  async function act(action: 'save' | 'approve' | 'reject' | 'unpublish') {
    if (action === 'reject' && !confirm('Reject this entry? It is kept for the record but FINVA will never use it.')) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/admin/kb', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, action, reviewNote, fields: { ...f, tags: f.tags.split(',').map(t => t.trim()).filter(Boolean) } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  }

  const label = (t: string) => <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', margin: '10px 0 3px' }}>{t}</div>;
  const hasOriginal = !!(entry.originalQuestion || entry.originalAnswer || entry.faNote);

  return (
    <div style={{ padding: '4px 14px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
      {entry.similarEntryTitle && (
        <div style={{ marginTop: 10, fontSize: 12, padding: '6px 10px', borderRadius: 6, background: 'rgba(217,119,6,0.1)', color: 'var(--text)' }}>
          ⚠️ Similar to an existing entry: <b>{entry.similarEntryTitle}</b> — consider merging the useful part into it and rejecting this one.
        </div>
      )}
      {hasOriginal && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--text2)' }}>What the FA asked, FINVA&apos;s answer and the FA&apos;s note (de-identified)</summary>
          {entry.faNote && <>{label("FA's note")}<div style={{ fontSize: 12, whiteSpace: 'pre-wrap', padding: '6px 8px', borderLeft: '3px solid #F37338', background: 'var(--surface)' }}>{entry.faNote}</div></>}
          {entry.originalQuestion && <>{label('Question')}<div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{entry.originalQuestion}</div></>}
          {entry.originalAnswer && <>{label("FINVA's answer")}<div style={{ fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto', padding: '6px 8px', background: 'var(--surface)', borderRadius: 6 }}>{entry.originalAnswer}</div></>}
        </details>
      )}

      {label('Title (the question an FA would ask)')}
      <input value={f.title} onChange={e => set({ title: e.target.value })} style={ctl} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 150 }}>{label('Category')}
          <select value={f.category} onChange={e => set({ category: e.target.value })} style={ctl}>
            {[...new Set([...CATEGORIES, f.category])].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>{label('Type')}
          <select value={f.entryType} onChange={e => set({ entryType: e.target.value as 'faq' | 'case_study' })} style={ctl}>
            <option value="faq">FAQ / how-to</option><option value="case_study">Case study</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 170 }}>{label('How FINVA presents it')}
          <select value={f.source} onChange={e => set({ source: e.target.value })} style={ctl}>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {label('Situation')}
      <textarea value={f.situation} onChange={e => set({ situation: e.target.value })} rows={3} style={ctl} />
      {label('What to do (resolution)')}
      <textarea value={f.resolution} onChange={e => set({ resolution: e.target.value })} rows={8} style={ctl} />
      {label('Key takeaway (one sentence FINVA quotes first)')}
      <input value={f.keyTakeaway} onChange={e => set({ keyTakeaway: e.target.value })} style={ctl} />
      {label('Search tags (comma separated)')}
      <input value={f.tags} onChange={e => set({ tags: e.target.value })} style={ctl} />
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
        <input type="checkbox" checked={f.isBigLesson} onChange={e => set({ isBigLesson: e.target.checked })} />
        Big lesson (FINVA includes it in every advice answer — use sparingly)
      </label>
      {label('Review note (internal)')}
      <input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Optional: why approved / rejected / what was changed" style={ctl} />

      {msg && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {entry.status !== 'published' && (
          <button disabled={busy} onClick={() => act('approve')} style={{ ...pill(true), fontWeight: 700 }}>✓ Approve &amp; publish</button>
        )}
        <button disabled={busy} onClick={() => act('save')} style={pill(false)}>Save changes</button>
        {entry.status === 'published' && <button disabled={busy} onClick={() => act('unpublish')} style={pill(false)}>Unpublish</button>}
        {entry.status !== 'rejected' && <button disabled={busy} onClick={() => act('reject')} style={{ ...pill(false), color: 'var(--red)' }}>✕ Reject</button>}
      </div>
    </div>
  );
}

export default function KbReviewTab() {
  const [entries, setEntries] = useState<ReviewEntry[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/kb', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setEntries(json.entries); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error && !entries) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{error}</div>;
  if (!entries) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading knowledge base…</div>;

  const count = (s: string) => entries.filter(e => (s === 'pending' ? e.status === 'draft' : e.status === s)).length;
  const q = search.trim().toLowerCase();
  const shown = entries
    .filter(e => filter === 'all' || (filter === 'pending' ? e.status === 'draft' : e.status === filter))
    .filter(e => !q || `${e.title} ${e.tags.join(' ')} ${e.resolution} ${e.suggestedBy}`.toLowerCase().includes(q))
    // FA suggestions first in the queue, then newest.
    .sort((a, b) => (a.source === 'fa_suggestion' ? 0 : 1) - (b.source === 'fa_suggestion' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
        FINVA only ever uses <b>published</b> entries. FA suggestions arrive here as drafts with client details already removed — check the wording, then approve, edit or reject.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={pill(filter === 'pending')} onClick={() => setFilter('pending')}>Waiting for review ({count('pending')})</button>
        <button style={pill(filter === 'published')} onClick={() => setFilter('published')}>Published ({count('published')})</button>
        <button style={pill(filter === 'rejected')} onClick={() => setFilter('rejected')}>Rejected ({count('rejected')})</button>
        <button style={pill(filter === 'all')} onClick={() => setFilter('all')}>All ({entries.length})</button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries…" style={{ ...ctl, width: 'auto', flex: 1, minWidth: 160 }} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {shown.length === 0 && (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
            {filter === 'pending' ? 'Nothing waiting for review. FAs can suggest an answer with “💡 Suggest to KB” under any Ask FINVA answer.' : 'No entries.'}
          </div>
        )}
        {shown.map(e => (
          <div key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setOpen(open === e.id ? null : e.id)}
              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: open === e.id ? 'rgba(243,115,56,0.06)' : 'none', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', color: 'var(--text)' }}>
              <StatusBadge status={e.status} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 200 }}>{e.isBigLesson ? '⭐ ' : ''}{e.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {SOURCE_LABEL[e.source] ?? e.source}{e.suggestedBy ? ` · by ${e.suggestedBy}` : ''} · {fmtDate(e.createdAt)}
                {e.similarEntryTitle && e.status === 'draft' ? ' · ⚠️ similar exists' : ''}
              </span>
            </button>
            {open === e.id && <Editor key={e.id + e.updatedAt} entry={e} onDone={() => { setOpen(null); load(); }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
