import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import ClientsPage from '@/components/pages/ClientsPage';

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense>
        <ClientsPage />
      </Suspense>
    </DashboardLayout>
  );
}
