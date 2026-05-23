'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  {
    group: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
      { id: 'clients', label: 'Clients', href: '/clients', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
      { id: 'portfolio', label: 'Portfolio', href: '/portfolio', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
      { id: 'reviews', label: 'Reviews', href: '/reviews', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
      { id: 'cashflow', label: 'Cash Flow', href: '/cashflow', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
      { id: 'insurance', label: 'Insurance', href: '/insurance', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
    ],
  },
  {
    group: 'Tools',
    items: [
      { id: 'templates', label: 'Templates', href: '/templates', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg> },
      { id: 'knowledge', label: 'Knowledge Base', href: '/knowledge', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
      { id: 'planning', label: 'Planning', href: '/planning', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M6 20V10l6-6 6 6v10"/><path d="M10 20v-5h4v5"/></svg> },
      { id: 'ai', label: 'AI Assistant', href: '/ai', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
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
          <div className="logo-mark">ARIA</div>
          <div className="logo-sub" style={{ lineHeight: 1.5 }}>
            Advisor Resource &amp; Intelligence Assistant
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, opacity: 0.7, letterSpacing: '0.04em' }}>
            Sky Siew Financial Consulting
          </div>
        </div>

        <nav className="nav">
          {navItems.map((group) => (
            <div key={group.group}>
              <div className="nav-label">{group.group}</div>
              {group.items.map((item) => (
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
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="consultant-badge">
            <div className="avatar">SS</div>
            <div style={{ flex: 1 }}>
              <div className="consultant-name">Sky Siew</div>
              <div className="consultant-role">Senior Consultant</div>
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
