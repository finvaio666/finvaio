import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import SettingsPage from '@/components/pages/SettingsPage';

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense>
        <SettingsPage />
      </Suspense>
    </DashboardLayout>
  );
}
