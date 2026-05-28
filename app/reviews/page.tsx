import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import ReviewsPage from '@/components/pages/ReviewsPage';

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense>
        <ReviewsPage />
      </Suspense>
    </DashboardLayout>
  );
}
