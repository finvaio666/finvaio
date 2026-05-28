import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import CashflowPage from '@/components/pages/CashflowPage';

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense>
        <CashflowPage />
      </Suspense>
    </DashboardLayout>
  );
}
