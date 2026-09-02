'use client';

import { useState, useEffect } from 'react';
import DashboardPage from './DashboardPage';
import AdminPage from './AdminPage';

export default function HomePage() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setRole(d.role ?? 'Advisor'))
      .catch(() => setRole('Advisor'));
  }, []);

  if (role === null) return null;
  // An admin's dashboard is the admin dashboard — one page, one nav entry.
  // /admin redirects here so existing links still land somewhere sensible.
  return role === 'Admin' ? <AdminPage /> : <DashboardPage />;
}
