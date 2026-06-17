import DashboardLayout from '@/components/DashboardLayout';
import ProductsPage from '@/components/pages/ProductsPage';

export const metadata = { title: 'Product Catalogue — FINVA' };

export default function Page() {
  return (
    <DashboardLayout>
      <ProductsPage />
    </DashboardLayout>
  );
}
