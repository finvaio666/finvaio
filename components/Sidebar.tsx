'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LogoD1Icon } from '@/components/LogoVariants';

const navItems = [
  {
    group: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/',          feature: undefined, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
      { id: 'clients',   label: 'Clients',   href: '/clients',   feature: undefined, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
      { id: 'portfolio', label: 'Portfolio', href: '/portfolio',  feature: undefined, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
      { id: 'reviews',   label: 'Reviews',   href: '/reviews',    feature: undefined, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
      { id: 'cashflow',  label: 'Cash Flow', href: '/cashflow',   feature: undefined, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
      { id: 'insurance', label: 'Insurance', href: '/insurance',  feature: undefined, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
      { id: 'emails',    label: 'Email Hub', href: '/emails',     feature: undefined, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
    ],
  },
  {
    group: 'Tools',
    items: [
      { id: 'products',  label: 'Products',       href: '/products',  feature: 'products', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
      { id: 'templates', label: 'Templates',      href: '/templates', feature: undefined,   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg> },
      { id: 'knowledge', label: 'Knowledge Base', href: '/knowledge', feature: undefined,   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
      { id: 'planning',  label: 'Planning',       href: '/planning',  feature: undefined,   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M6 20V10l6-6 6 6v10"/><path d="M10 20v-5h4v5"/></svg> },
      { id: 'ai',        label: 'AI Assistant',   href: '/ai',        feature: undefined,   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [advisor, setAdvisor]   = useState({ name: 'Sky Siew', role: 'Senior Consultant', initials: 'SS' });
  const [features, setFeatures] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.name) setAdvisor({
          name:     d.name,
          role:     d.role === 'Admin' ? 'Senior Consultant' : 'Financial Advisor',
          initials: d.initials || d.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
        });
        if (d.features) setFeatures(d.features);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <LogoD1Icon size={30} />
            <div className="logo-mark">ARIA</div>
          </div>
          <div className="logo-sub" style={{ lineHeight: 1.5 }}>
            Advisor Resource &amp; Intelligence Assistant
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, opacity: 0.7, letterSpacing: '0.04em' }}>
            Bill Morrisons Financial Consulting
          </div>
        </div>

        <nav className="nav">
          {navItems.map((group) => {
            // Filter items that require a feature flag
            const visibleItems = group.items.filter(item =>
              !item.feature || features.includes(item.feature)
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.group}>
                <div className="nav-label">{group.group}</div>
                {visibleItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="consultant-badge">
            <div className="avatar">{advisor.initials}</div>
            <div style={{ flex: 1 }}>
              <div className="consultant-name">{advisor.name}</div>
              <div className="consultant-role">{advisor.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              marginTop: 12, width: '100%',
              padding: '8px 12px',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)',
              color: 'var(--text3)',
              fontSize: 12, fontFamily: 'var(--font-sans)',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'var(--red-dim)';
              e.currentTarget.style.color = 'var(--red)';
              e.currentTarget.style.borderColor = 'rgba(235,0,27,0.3)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = 'var(--text3)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
