import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import AdminPage from '@/components/pages/AdminPage';

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense>
        <AdminPage />
      </Suspense>
    </DashboardLayout>
  );
}
