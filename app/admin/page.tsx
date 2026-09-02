import { redirect } from 'next/navigation';

/**
 * The admin dashboard merged into the main dashboard — an admin lands on it at
 * "/" and the nav carries a single Dashboard entry. This route stays as a
 * redirect so bookmarks and older links keep working.
 */
export default function Page() {
  redirect('/');
}
