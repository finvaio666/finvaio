import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import ClientDetailPage from '@/components/pages/ClientDetailPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardLayout>
      <Suspense>
        <ClientDetailPage clientId={decodeURIComponent(id)} />
      </Suspense>
    </DashboardLayout>
  );
}
