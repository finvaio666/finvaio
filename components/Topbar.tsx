'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/clients': 'Clients',
  '/portfolio': 'Investment',
  '/reviews': 'Meetings',
  '/tasks': 'Tasks',
  '/cashflow': 'Cash Flow',
  '/insurance': 'Insurance',
  '/templates': 'Templates',
  '/knowledge': 'Knowledge Base',
  '/planning': 'Planning',
  '/ai': 'AI Assistant',
  '/emails': 'Email Hub',
  '/settings': 'Settings',
  '/admin': 'Admin Dashboard',
  '/products': 'Products',
  '/premium-calculator': 'Premium Calculator',
};

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const [dateStr, setDateStr] = useState('');
  // Investment sub-pages (/portfolio/local-ut) are titled with their group name,
  // read from the same cache the sidebar populates.
  const groupTitle = (() => {
    const slug = pathname.startsWith('/portfolio/') ? pathname.slice('/portfolio/'.length) : '';
    if (!slug || typeof window === 'undefined') return '';
    try {
      const groups = JSON.parse(sessionStorage.getItem('aria-platform-groups') ?? '[]') as { id: string; name: string }[];
      return groups.find(g => g.id === slug)?.name ?? '';
    } catch { return ''; }
  })();
  const title = groupTitle || pageTitles[pathname] || (pathname.startsWith('/portfolio') ? 'Investment' : 'Dashboard');

  useEffect(() => {
    setDateStr(new Date().toLocaleDateString('en-MY', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }));
  }, []);

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="hamburger" onClick={onMenuClick} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
        <div className="page-title">{title}</div>
      </div>
      <div className="topbar-right">
        <div className="date-badge">{dateStr}</div>
        <div className="notion-badge">
          <div className="pulse" />
          Live Data
        </div>
      </div>
    </div>
  );
}
