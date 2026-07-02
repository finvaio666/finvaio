'use client';

/**
 * ClientSearchCombobox
 * ─────────────────────
 * Type-to-search client selector. Replaces <select> dropdowns.
 * Searches by name, email, and phone simultaneously.
 * Supports keyboard navigation (↑↓ Enter Escape).
 *
 * Props
 * ─────
 * clients      – full client list from useClients()
 * value        – currently selected client id ('' = none)
 * onChange     – called with Client object when selected, null when cleared
 * placeholder  – input placeholder text (default: "Search client…")
 * inputStyle   – optional style overrides for the input element
 * disabled     – disables the input
 */

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { segmentLabel, segmentClass } from '@/components/useClients';

/** Minimal shape the combobox needs — compatible with any Client type in the app */
export interface ComboboxClient {
  id: string;
  name: string;
  segment?: string;
  email?: string;
  phone?: string;
}

interface Props {
  clients: ComboboxClient[];
  value: string;           // selected client id
  onChange: (client: ComboboxClient | null) => void;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  disabled?: boolean;
}

const SEGMENT_COLORS: Record<string, { bg: string; color: string }> = {
  hnw:      { bg: '#7c3aed22', color: '#7c3aed' },
  affluent: { bg: '#0ea5e922', color: '#0ea5e9' },
  mass:     { bg: '#64748b22', color: '#64748b' },
  prospect: { bg: '#f59e0b22', color: '#f59e0b' },
  active:   { bg: '#10b98122', color: '#10b981' },
};

export default function ClientSearchCombobox({
  clients,
  value,
  onChange,
  placeholder = 'Search client…',
  inputStyle,
  disabled,
}: Props) {
  const selected: ComboboxClient | null = clients.find(c => c.id === value) ?? null;

  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLUListElement>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);

  // Filtered list: match name, email, phone
  const filtered = query.trim() === ''
    ? clients
    : clients.filter(c => {
        const q = query.toLowerCase();
        return (
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
        );
      });

  // Reset highlight when list changes
  useEffect(() => { setHighlighted(0); }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
  }

  function handleSelect(client: ComboboxClient) {
    onChange(client);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); return; }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) handleSelect(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const displayValue = open ? query : (selected?.name ?? query);

  const segCls = selected ? segmentClass(selected.segment ?? '') : 'active';
  const segColors = SEGMENT_COLORS[segCls] ?? SEGMENT_COLORS.active;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>

      {/* ── Input ── */}
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 14, color: 'var(--text3)', pointerEvents: 'none', lineHeight: 1,
        }}>
          🔍
        </span>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => { setOpen(true); if (selected) setQuery(''); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          style={{
            width: '100%',
            padding: '10px 36px 10px 34px',
            borderRadius: 'var(--r-pill)',
            border: `1.5px solid ${open || selected ? 'var(--accent2)' : 'var(--border)'}`,
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 14,
            fontFamily: 'var(--font-sans)',
            fontWeight: selected && !open ? 600 : 400,
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
            cursor: disabled ? 'not-allowed' : 'text',
            opacity: disabled ? 0.5 : 1,
            ...inputStyle,
          }}
        />
        {/* Segment badge (shown when a client is selected and dropdown is closed) */}
        {selected && !open && (
          <span style={{
            position: 'absolute', right: selected ? 36 : 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 10, fontWeight: 700, padding: '2px 7px',
            borderRadius: 99, letterSpacing: '0.04em', textTransform: 'uppercase',
            background: segColors.bg, color: segColors.color,
            pointerEvents: 'none',
          }}>
            {segmentLabel(selected.segment ?? '') || selected.segment || 'Client'}
          </span>
        )}
        {/* Clear button */}
        {(selected || query) && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              width: 20, height: 20, borderRadius: '50%',
              border: 'none', background: 'var(--border)', color: 'var(--text3)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0,
            }}
            aria-label="Clear"
          >✕</button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxHeight: 260,
            overflowY: 'auto',
            zIndex: 9999,
            margin: 0, padding: '4px 0',
            listStyle: 'none',
          }}
        >
          {filtered.length === 0 ? (
            <li style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: 13 }}>
              No clients found
            </li>
          ) : (
            filtered.map((c, i) => {
              const cls = segmentClass(c.segment ?? '');
              const clr = SEGMENT_COLORS[cls] ?? SEGMENT_COLORS.active;
              const isHighlighted = i === highlighted;
              const isSelected    = c.id === value;
              return (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={() => handleSelect(c)}
                  style={{
                    padding: '9px 14px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: isHighlighted
                      ? 'var(--surface2)'
                      : isSelected ? 'var(--accent2)12' : 'transparent',
                    borderLeft: isSelected
                      ? '3px solid var(--accent2)'
                      : '3px solid transparent',
                    transition: 'background 0.08s',
                  }}
                >
                  {/* Avatar */}
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: isSelected ? 'var(--accent2)' : 'var(--border)',
                    color: isSelected ? '#fff' : 'var(--text3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, letterSpacing: 0,
                  }}>
                    {c.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                  </span>

                  {/* Name — the priority element: guaranteed room, truncates last.
                      Phone/email stay searchable but are not displayed. */}
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: isSelected ? 'var(--accent2)' : 'var(--text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {highlightMatch(c.name, query)}
                    </div>
                  </div>

                  {/* Segment badge — shrinks/truncates before the name does */}
                  {c.segment && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px',
                      borderRadius: 99, letterSpacing: '0.04em', textTransform: 'uppercase',
                      background: clr.bg, color: clr.color,
                      flexShrink: 1, minWidth: 0, maxWidth: '40%',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {segmentLabel(c.segment ?? '') || c.segment}
                    </span>
                  )}

                  {isSelected && (
                    <span style={{ color: 'var(--accent2)', fontSize: 13, flexShrink: 0 }}>✓</span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

/** Wraps matched portion in a <mark> span */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--accent2)33', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
