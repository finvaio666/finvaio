import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import TasksPage from '@/components/pages/TasksPage';

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense>
        <TasksPage />
      </Suspense>
    </DashboardLayout>
  );
}
