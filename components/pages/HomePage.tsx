'use client';

import { useState, useEffect } from 'react';
import DashboardPage from './DashboardPage';
import AdminHomePage from './AdminHomePage';

export default function HomePage() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setRole(d.role ?? 'Advisor'))
      .catch(() => setRole('Advisor'));
  }, []);

  if (role === null) return null;
  return role === 'Admin' ? <AdminHomePage /> : <DashboardPage />;
}
