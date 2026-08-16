import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import NetworthPage from '@/components/pages/NetworthPage';

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense>
        <NetworthPage />
      </Suspense>
    </DashboardLayout>
  );
}
