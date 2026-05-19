'use client';

import { useState, useEffect } from 'react';

export interface Client {
  id: string;
  name: string;
  status: string;
  segment: string;
  aum: number;
  income: number;
  risk: string;
  nextReview: string;
  lastReview: string;
  onboarding: string;
  goals: string[];
  phone: string;
  email: string;
  dob: string;
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch('/api/notion?type=clients', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json.data) setClients(json.data);
        else setError(json.error || 'Failed to load');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [tick]);

  const reload = () => setTick(t => t + 1);

  const totalAum = clients.reduce((sum, c) => sum + (c.aum || 0), 0);
  const activeCount = clients.filter(c => c.status?.includes('Active')).length;
  const prospectCount = clients.filter(c => c.status?.toLowerCase().includes('prospect')).length;

  const reviewsDue = clients.filter(c => {
    if (!c.nextReview) return false;
    const days = Math.ceil((new Date(c.nextReview).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;

  return { clients, loading, error, totalAum, activeCount, prospectCount, reviewsDue, reload };
}

export function formatAUM(n: number) {
  if (n >= 1000000) return `RM ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `RM ${(n / 1000).toFixed(0)}K`;
  return `RM ${n.toLocaleString()}`;
}

export function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function riskClass(risk: string) {
  const r = risk?.toLowerCase();
  if (r?.includes('moderate')) return 'moderate';
  if (r?.includes('conservative')) return 'conservative';
  if (r?.includes('aggressive')) return 'aggressive';
  return 'moderate';
}

export function segmentClass(seg: string) {
  const s = seg?.toLowerCase();
  if (s?.includes('affluent')) return 'affluent';
  if (s?.includes('prospect')) return 'prospect';
  return 'active';
}

export function statusClass(status: string) {
  if (status?.includes('Active')) return 'active';
  if (status?.includes('Prospect')) return 'prospect';
  return 'inactive';
}
