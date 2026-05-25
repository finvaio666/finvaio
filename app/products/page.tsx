import DashboardLayout from '@/components/DashboardLayout';
import ProductsPage from '@/components/pages/ProductsPage';

export const metadata = { title: 'Product Catalogue — ARIA' };

export default function Page() {
  return (
    <DashboardLayout>
      <ProductsPage />
    </DashboardLayout>
  );
}
