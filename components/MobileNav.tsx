'use client';

/**
 * MobileNav — bottom navigation for phones (≤768px, hidden on desktop).
 * Four destinations + a raised center action that opens MeetingCapture,
 * so an advisor can log a meeting from anywhere in one tap.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import MeetingCapture, { CaptureClient } from '@/components/MeetingCapture';

const ITEMS = [
  { href: '/',        label: 'Today',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2" fill="currentColor" stroke="none"/></svg> },
  { href: '/clients', label: 'Clients', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  null, // center action slot
  { href: '/tasks',   label: 'Tasks',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
  { href: '/ai',      label: 'Chat',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [showCapture, setShowCapture] = useState(false);
  const [clients, setClients] = useState<CaptureClient[]>([]);

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  // Fetch the roster only when capture opens — this nav is mounted on every
  // page (hidden on desktop), so an eager fetch would tax all page loads.
  function openCapture() {
    setShowCapture(true);
    if (clients.length === 0) {
      fetch('/api/notion?type=clients', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { if (Array.isArray(d.data)) setClients(d.data); })
        .catch(() => {});
    }
  }

  return (
    <>
      <nav className="mobile-nav">
        {ITEMS.map(item =>
          item === null ? (
            <button
              key="log"
              onClick={openCapture}
              aria-label="Log a meeting"
              className="mobile-nav-log"
            >🎙️</button>
          ) : (
            <Link key={item.href} href={item.href} className={`mobile-nav-item ${isActive(item.href) ? 'active' : ''}`}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          )
        )}
      </nav>

      {showCapture && (
        <MeetingCapture
          clients={clients}
          onClose={() => setShowCapture(false)}
        />
      )}
    </>
  );
}
