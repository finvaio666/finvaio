import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import EmailHubPage from '@/components/pages/EmailHubPage';

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense>
        <EmailHubPage />
      </Suspense>
    </DashboardLayout>
  );
}
