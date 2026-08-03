import DashboardLayout from '@/components/DashboardLayout';
import PortfolioPage from '@/components/pages/PortfolioPage';

/**
 * Investment sub-menu page — one per admin-defined platform group
 * (/portfolio/local-ut, /portfolio/offshore-eam, …). The slug is the group's
 * id; PortfolioPage resolves it against the saved groups and scopes itself to
 * that group's platforms, falling back to the full book if the id is unknown.
 */
export default async function Page({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  return (
    <DashboardLayout>
      <PortfolioPage groupSlug={group} />
    </DashboardLayout>
  );
}
