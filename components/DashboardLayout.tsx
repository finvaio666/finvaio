'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import SessionTimeout from './SessionTimeout';
import InstallPrompt from './InstallPrompt';
import MobileNav from './MobileNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <SessionTimeout />
      <InstallPrompt />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <div className="page-content">{children}</div>
      </div>
      <MobileNav />
    </>
  );
}
