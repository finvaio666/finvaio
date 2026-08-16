import DashboardLayout from '@/components/DashboardLayout';
// Templates tentatively disabled — restore the import above and the render
// below (and the nav entry in components/Sidebar.tsx) to re-enable.
// import TemplatesPage from '@/components/pages/TemplatesPage';

export default function Page() {
  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text2)' }}>Templates is temporarily unavailable</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>This feature has been paused. Check back later.</div>
      </div>
    </DashboardLayout>
  );
}
