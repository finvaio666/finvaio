'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Institution } from '@/app/api/email/institutions/route';

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        {desc && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3 }}>{desc}</div>}
      </div>
      <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 24 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        padding: '7px 12px', fontSize: 13,
        background: disabled ? 'var(--bg)' : 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 7,
        color: disabled ? 'var(--text3)' : 'var(--text)',
        width: 220, boxSizing: 'border-box',
        fontFamily: 'var(--font-sans)',
      }}
    />
  );
}

function SaveBtn({ onClick, loading, saved }: { onClick: () => void; loading: boolean; saved: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '7px 16px', fontSize: 13, fontWeight: 600,
        background: saved ? '#22c55e' : '#F37338',
        color: '#fff', border: 'none', borderRadius: 99,
        cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
        transition: 'background 0.3s',
        whiteSpace: 'nowrap',
      }}
    >{loading ? 'Saving…' : saved ? '✓ Saved' : 'Save'}</button>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return msg ? <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{msg}</div> : null;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: `${color}18`, color }}>
      {label}
    </span>
  );
}

// ── Tab: Profile ──────────────────────────────────────────────────────────────

function ProfileTab({ advisorId }: { advisorId: string }) {
  const [name,    setName]    = useState('');
  const [gmail,   setGmail]   = useState('');
  const [role,    setRole]    = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    fetch('/api/settings/profile').then(r => r.json()).then(d => {
      setName(d.name ?? ''); setGmail(d.gmailAddress ?? ''); setRole(d.role ?? 'Advisor');
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true); setErr(''); setSaved(false);
    const res  = await fetch('/api/settings/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, gmailAddress: gmail }) });
    const data = await res.json();
    if (data.error) setErr(data.error);
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setSaving(false);
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <Section title="Personal Information" desc="Your display name and contact details shown in ARIA.">
        <Row label="Full Name" desc="Displayed in client reports and the sidebar">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <Input value={name} onChange={setName} placeholder="e.g. Sky Siew" />
            <ErrMsg msg={err} />
          </div>
        </Row>
        <Row label="Gmail Address" desc="Your connected Gmail (used for Email Hub)">
          <Input value={gmail} onChange={setGmail} placeholder="e.g. sky@gmail.com" type="email" />
        </Row>
        <Row label="Role" desc="Your system role — contact admin to change">
          <Badge label={role} color={role === 'Admin' ? '#F37338' : '#818cf8'} />
        </Row>
        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <SaveBtn onClick={save} loading={saving} saved={saved} />
        </div>
      </Section>
    </div>
  );
}

// ── Tab: Security ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const [cur,     setCur]     = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [err,     setErr]     = useState('');

  async function changePassword() {
    setErr(''); setSaved(false);
    if (!cur || !next) { setErr('All fields are required.'); return; }
    if (next !== confirm) { setErr('New passwords do not match.'); return; }
    if (next.length < 8)  { setErr('Password must be at least 8 characters.'); return; }
    setSaving(true);
    const res  = await fetch('/api/settings/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
    const data = await res.json();
    if (data.error) setErr(data.error);
    else { setSaved(true); setCur(''); setNext(''); setConfirm(''); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  }

  return (
    <Section title="Change Password" desc="Choose a strong password with at least 8 characters.">
      <Row label="Current Password" desc="">
        <Input value={cur} onChange={setCur} type="password" placeholder="Current password" />
      </Row>
      <Row label="New Password" desc="Minimum 8 characters">
        <Input value={next} onChange={setNext} type="password" placeholder="New password" />
      </Row>
      <Row label="Confirm New Password" desc="">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Input value={confirm} onChange={setConfirm} type="password" placeholder="Repeat new password" />
          <ErrMsg msg={err} />
          {saved && <div style={{ color: '#22c55e', fontSize: 12 }}>✓ Password changed successfully</div>}
        </div>
      </Row>
      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <SaveBtn onClick={changePassword} loading={saving} saved={saved} />
      </div>
    </Section>
  );
}

// ── Tab: Email ────────────────────────────────────────────────────────────────

const INST_TYPES = ['insurance', 'fund', 'other'] as const;

function EmailTab() {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailAddr,      setGmailAddr]      = useState('');
  const [institutions,   setInstitutions]   = useState<Institution[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [err,            setErr]            = useState('');
  // New institution form
  const [newName,   setNewName]   = useState('');
  const [newEmail,  setNewEmail]  = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newType,   setNewType]   = useState<'insurance' | 'fund' | 'other'>('insurance');
  const [addErr,    setAddErr]    = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/profile').then(r => r.json()),
      fetch('/api/email/institutions').then(r => r.json()),
    ]).then(([profile, inst]) => {
      setGmailConnected(profile.gmailConnected ?? false);
      setGmailAddr(profile.gmailAddress ?? '');
      setInstitutions(inst.institutions ?? []);
      setLoading(false);
    });
  }, []);

  async function connectGmail() {
    const res  = await fetch('/api/email/auth');
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  async function disconnectGmail() {
    if (!confirm('Disconnect Gmail? Email Hub will stop working until reconnected.')) return;
    await fetch('/api/settings/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gmailRefreshToken: '' }) });
    setGmailConnected(false);
  }

  function autofillDomain() {
    if (!newDomain && newEmail.includes('@')) {
      setNewDomain(newEmail.split('@')[1]);
    }
  }

  function addInstitution() {
    setAddErr('');
    if (!newName.trim()) { setAddErr('Name is required.'); return; }
    if (!newEmail.trim() && !newDomain.trim()) { setAddErr('Either email or domain is required.'); return; }
    const domain = newDomain.trim() || (newEmail.includes('@') ? newEmail.split('@')[1] : '');
    setInstitutions(prev => [...prev, { id: Date.now().toString(), name: newName.trim(), email: newEmail.trim(), domain, type: newType }]);
    setNewName(''); setNewEmail(''); setNewDomain(''); setNewType('insurance');
  }

  function removeInstitution(id: string) {
    setInstitutions(prev => prev.filter(i => i.id !== id));
  }

  async function saveInstitutions() {
    setSaving(true); setErr(''); setSaved(false);
    const res  = await fetch('/api/email/institutions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ institutions }) });
    const data = await res.json();
    if (data.error) setErr(data.error);
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setSaving(false);
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      {/* Gmail Connection */}
      <Section title="Gmail Connection" desc="ARIA reads and sends emails on your behalf using your Gmail account.">
        <Row
          label="Gmail Account"
          desc={gmailConnected ? `Connected as ${gmailAddr || 'your account'}` : 'Not connected — Email Hub is inactive'}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {gmailConnected
              ? <Badge label="✓ Connected" color="#22c55e" />
              : <Badge label="Not connected" color="var(--text3)" />
            }
            {gmailConnected
              ? <button onClick={disconnectGmail} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--red)', cursor: 'pointer' }}>Disconnect</button>
              : <button onClick={connectGmail} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer' }}>📧 Connect Gmail</button>
            }
          </div>
        </Row>
      </Section>

      {/* Institution Directory */}
      <Section title="Institution Directory" desc="Emails from these domains are automatically pulled into Email Hub. Add all insurance companies and fund houses you work with.">
        {/* Existing list */}
        {institutions.length === 0 ? (
          <div style={{ padding: '20px 20px', color: 'var(--text3)', fontSize: 13 }}>No institutions added yet. Add your first one below.</div>
        ) : (
          institutions.map(inst => (
            <div key={inst.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{inst.name}</span>
                  <Badge label={inst.type} color={inst.type === 'insurance' ? '#818cf8' : inst.type === 'fund' ? '#F37338' : 'var(--text3)'} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {inst.email && <span>{inst.email}</span>}
                  {inst.email && inst.domain && <span> · </span>}
                  {inst.domain && <span>@{inst.domain}</span>}
                </div>
              </div>
              <button onClick={() => removeInstitution(inst.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}>×</button>
            </div>
          ))
        )}

        {/* Add new */}
        <div style={{ padding: '16px 20px', borderTop: institutions.length > 0 ? '1px solid var(--border)' : 'none', background: 'rgba(243,115,56,0.03)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>+ Add Institution</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Company Name *</div>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Prudential Malaysia" style={{ padding: '7px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', width: 180 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Contact Email</div>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} onBlur={autofillDomain} placeholder="service@company.com" type="email" style={{ padding: '7px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', width: 200 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Domain *</div>
              <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="company.com.my" style={{ padding: '7px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', width: 160 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Type</div>
              <select value={newType} onChange={e => setNewType(e.target.value as typeof newType)} style={{ padding: '7px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
                {INST_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <button onClick={addInstitution} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer', height: 33 }}>+ Add</button>
          </div>
          {addErr && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{addErr}</div>}
        </div>

        {/* Save button */}
        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{institutions.length} institution{institutions.length !== 1 ? 's' : ''} configured</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
            <SaveBtn onClick={saveInstitutions} loading={saving} saved={saved} />
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── Tab: Users ────────────────────────────────────────────────────────────────

interface UserRecord { id: string; name: string; username: string; role: string; active: boolean; hasGmail: boolean; }

function UsersTab() {
  const [users,   setUsers]   = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');
  // New user form
  const [showForm,  setShowForm]  = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newUser,   setNewUser]   = useState('');
  const [newPass,   setNewPass]   = useState('');
  const [newRole,   setNewRole]   = useState('Advisor');
  const [creating,  setCreating]  = useState(false);
  const [createErr, setCreateErr] = useState('');
  // Reset password
  const [resetId,   setResetId]   = useState('');
  const [resetPass, setResetPass] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/settings/users');
    const d   = await res.json();
    if (d.error) setErr(d.error);
    else setUsers(d.users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function toggleActive(userId: string, active: boolean) {
    await fetch('/api/settings/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, active }) });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, active } : u));
  }

  async function createUser() {
    setCreateErr(''); setCreating(true);
    const res  = await fetch('/api/settings/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, username: newUser, password: newPass, role: newRole }) });
    const data = await res.json();
    if (data.error) { setCreateErr(data.error); }
    else { setShowForm(false); setNewName(''); setNewUser(''); setNewPass(''); await loadUsers(); }
    setCreating(false);
  }

  async function resetPassword() {
    if (!resetPass || resetPass.length < 8) { alert('Password must be at least 8 characters.'); return; }
    setResetting(true);
    await fetch('/api/settings/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: resetId, newPassword: resetPass }) });
    setResetId(''); setResetPass(''); setResetting(false);
    alert('Password reset successfully.');
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--text3)', fontSize: 13 }}>Loading users…</div>;
  if (err)     return <div style={{ padding: 32, color: 'var(--red)', fontSize: 13 }}>{err}</div>;

  return (
    <div>
      <Section title="User Accounts" desc="Manage who has access to ARIA. Only Admins can add or deactivate users.">
        {users.map(u => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', opacity: u.active ? 1 : 0.5 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(243,115,56,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#F37338' }}>
                  {u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>@{u.username} · {u.hasGmail ? '📧 Gmail connected' : 'No Gmail'}</div>
                </div>
                <Badge label={u.role} color={u.role === 'Admin' ? '#F37338' : '#818cf8'} />
                {!u.active && <Badge label="Inactive" color="var(--text3)" />}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setResetId(resetId === u.id ? '' : u.id)}
                style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--text2)', cursor: 'pointer' }}
              >Reset PW</button>
              <button
                onClick={() => toggleActive(u.id, !u.active)}
                style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: u.active ? 'var(--red)' : '#22c55e', cursor: 'pointer' }}
              >{u.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </div>
        ))}
        {resetId && (
          <div style={{ padding: '12px 20px', background: 'rgba(243,115,56,0.04)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Reset password for {users.find(u => u.id === resetId)?.name}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={resetPass} onChange={e => setResetPass(e.target.value)} type="password" placeholder="New password (min 8 chars)" style={{ padding: '7px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', width: 220 }} />
              <button onClick={resetPassword} disabled={resetting} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer' }}>
                {resetting ? 'Saving…' : 'Confirm Reset'}
              </button>
              <button onClick={() => setResetId('')} style={{ padding: '7px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 99, background: 'none', color: 'var(--text3)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{ padding: '12px 20px' }}>
          <button onClick={() => setShowForm(!showForm)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer' }}>
            {showForm ? 'Cancel' : '+ Add New User'}
          </button>
        </div>
      </Section>

      {showForm && (
        <Section title="New User" desc="Create a new login account for an advisor.">
          <Row label="Full Name" desc=""><Input value={newName} onChange={setNewName} placeholder="e.g. Alice Tan" /></Row>
          <Row label="Username" desc="Used to log in — lowercase, no spaces"><Input value={newUser} onChange={v => setNewUser(v.toLowerCase().replace(/\s/g, ''))} placeholder="e.g. alice" /></Row>
          <Row label="Initial Password" desc="The user should change this on first login"><Input value={newPass} onChange={setNewPass} type="password" placeholder="Min 8 characters" /></Row>
          <Row label="Role" desc="">
            <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)' }}>
              <option value="Advisor">Advisor</option>
              <option value="Admin">Admin</option>
            </select>
          </Row>
          <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {createErr && <span style={{ color: 'var(--red)', fontSize: 12 }}>{createErr}</span>}
            <div style={{ marginLeft: 'auto' }}>
              <button onClick={createUser} disabled={creating} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, background: '#F37338', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer' }}>
                {creating ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Tab: About ────────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <div>
      <Section title="System Information">
        <Row label="Platform" desc=""><span style={{ fontSize: 13, color: 'var(--text2)' }}>ARIA — Advisor Resource & Intelligence Assistant</span></Row>
        <Row label="Company" desc=""><span style={{ fontSize: 13, color: 'var(--text2)' }}>Bill Morrisons Financial Consulting</span></Row>
        <Row label="Version" desc=""><Badge label="v1.0.0" color="#818cf8" /></Row>
        <Row label="Stack" desc=""><span style={{ fontSize: 12, color: 'var(--text3)' }}>Next.js 16 · Notion · Gemini AI · Vercel</span></Row>
        <Row label="Storage" desc=""><span style={{ fontSize: 12, color: 'var(--text3)' }}>Notion (client data) · Gmail (emails)</span></Row>
      </Section>
      <Section title="Integrations">
        <Row label="Notion" desc="All client data, portfolio, insurance, cashflow">
          <Badge label="✓ Active" color="#22c55e" />
        </Row>
        <Row label="Google Gemini AI" desc="AI reports, summaries, email drafts">
          <Badge label="✓ Active" color="#22c55e" />
        </Row>
        <Row label="Gmail API" desc="Email Hub — read and send work emails">
          <Badge label="OAuth2" color="#818cf8" />
        </Row>
      </Section>
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────

type TabId = 'profile' | 'security' | 'email' | 'users' | 'about';

const TABS: { id: TabId; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'profile',  label: 'Profile',   icon: '👤' },
  { id: 'security', label: 'Security',  icon: '🔒' },
  { id: 'email',    label: 'Email Hub', icon: '📧' },
  { id: 'users',    label: 'Users',     icon: '👥', adminOnly: true },
  { id: 'about',    label: 'About',     icon: 'ℹ️' },
];

export default function SettingsPage() {
  const [tab,       setTab]       = useState<TabId>('profile');
  const [advisorId, setAdvisorId] = useState('');
  const [isAdmin,   setIsAdmin]   = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      setIsAdmin(d.role === 'Admin');
    });
    // Get advisorId from session (we read it via the profile API response)
    fetch('/api/settings/profile').then(r => r.json()).then(() => {
      // advisorId comes from middleware, no need to store client-side
      setAdvisorId('me');
    });
  }, []);

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left nav */}
      <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '24px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingLeft: 8 }}>Settings</div>
        {visibleTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              background: tab === t.id ? 'rgba(243,115,56,0.1)' : 'none',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              color: tab === t.id ? '#F37338' : 'var(--text2)',
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              transition: 'all 0.1s',
            }}
          >
            <span style={{ fontSize: 15 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <div style={{ maxWidth: 680 }}>
          {tab === 'profile'  && <ProfileTab  advisorId={advisorId} />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'email'    && <EmailTab />}
          {tab === 'users'    && <UsersTab />}
          {tab === 'about'    && <AboutTab />}
        </div>
      </div>
    </div>
  );
}
