import DashboardLayout from '@/components/DashboardLayout';
import NewNotesTab from '@/components/NewNotesTab';

/**
 * The same New Notes queue an Admin sees under Admin > New Notes, as its own
 * route — for the small named exception in lib/noteIntakeAccess.ts (Tracy
 * Chia, Sky Siew) who aren't Admins and so never land on the Admin dashboard
 * that tab lives inside. The API routes are the actual gate (they 403 anyone
 * else); this page just gives an allowed advisor somewhere to reach it.
 */
export default function Page() {
  return <DashboardLayout><NewNotesTab /></DashboardLayout>;
}
