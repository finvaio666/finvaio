import DashboardLayout from '@/components/DashboardLayout';
import LoadingSpinner from '@/components/LoadingSpinner';

// Covers /portfolio AND /portfolio/[group] (loading.tsx wraps page.tsx plus
// nested route segments below it). Without this, Next has no Suspense
// fallback to show while the next route's RSC payload streams in, so it
// just keeps the PREVIOUS page on screen — which is why switching between
// Investment / Local UT / Local EAM / Offshore EAM could briefly show the
// wrong group's platform breakdown (the old page hadn't been replaced yet).
// Same DashboardLayout shell as the real pages so the sidebar/topbar don't
// flicker — only the content area shows this while the next page loads.
export default function Loading() {
  return (
    <DashboardLayout>
      <div style={{ padding: 64, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        <LoadingSpinner />
      </div>
    </DashboardLayout>
  );
}
