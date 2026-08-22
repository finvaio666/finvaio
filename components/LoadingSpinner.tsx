// A plain "Loading…" text block gives no visual cue that something is in
// progress — on a slow fetch (Notion reads especially) that reads as frozen
// or broken rather than working, particularly to an FA looking at a page
// with a lot of data. This pairs the existing spinner look (already used for
// "Syncing…"/"Saving…" states around the app) with the loading label.
export default function LoadingSpinner({ label = 'Loading…', size = 13 }: { label?: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          width: size, height: size, borderRadius: '50%',
          border: '2px solid var(--border)', borderTopColor: 'var(--text3)',
          display: 'inline-block', flexShrink: 0,
          animation: 'spin 0.7s linear infinite',
        }}
      />
      {label}
    </span>
  );
}
