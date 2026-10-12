import React, { useEffect, useState } from 'react';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Emergency contacts — the same list the app's Emergency Contacts screen
 * edits (patient profile `emergencyContacts`). The web had no way to add one,
 * which mattered most for therapy clients: it is who the therapist can reach
 * if someone is at risk.
 */
export default function EmergencyContactsEditor({ accent = 'var(--nh-accent, #2563eb)' }) {
  const [contacts, setContacts] = useState(null);
  const [form, setForm] = useState({ name: '', relationship: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const uid = getStoredUserId();

  useEffect(() => {
    if (!uid) return;
    api(`/api/v1/patients/${uid}`)
      .then((d) => setContacts(Array.isArray(d?.emergencyContacts) ? d.emergencyContacts : []))
      .catch(() => setContacts([]));
  }, [uid]);

  const save = async (next) => {
    setBusy(true); setMsg('');
    try {
      await api(`/api/v1/patients/${uid}`, { method: 'PATCH', body: { emergencyContacts: next } });
      setContacts(next);
      return true;
    } catch (e) {
      setMsg(e?.message || 'Could not save. Please try again.');
      return false;
    } finally { setBusy(false); }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setMsg('Enter a name and a phone number.'); return; }
    const next = [...(contacts || []), { id: `c${Date.now()}`, name: form.name.trim(), relationship: form.relationship.trim(), phone: form.phone.trim() }];
    if (await save(next)) setForm({ name: '', relationship: '', phone: '' });
  };

  return (
    <div style={S.card}>
      <h3 style={S.h3}>Emergency contacts</h3>
      <p style={S.desc}>Someone we can reach if you are unwell or at risk.</p>
      {contacts === null ? <p style={S.desc}>Loading…</p> : null}
      {contacts?.length === 0 ? <p style={S.desc}>No emergency contact yet — please add one.</p> : null}
      {(contacts || []).map((c) => (
        <div key={c.id || c.phone} style={S.row}>
          <div style={{ flex: 1 }}>
            <strong style={S.name}>{c.name}</strong>
            <span style={S.meta}>{[c.relationship, c.phone].filter(Boolean).join(' · ')}</span>
          </div>
          <button type="button" style={S.remove} disabled={busy}
            onClick={() => save(contacts.filter((x) => x !== c))}>Remove</button>
        </div>
      ))}
      <form onSubmit={add} style={S.form}>
        <input style={S.input} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input style={S.input} placeholder="Relationship (e.g. sister)" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
        <input style={S.input} placeholder="Phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button type="submit" style={{ ...S.add, background: accent }} disabled={busy}>{busy ? 'Saving…' : 'Add contact'}</button>
      </form>
      {msg ? <p style={S.err}>{msg}</p> : null}
    </div>
  );
}

const S = {
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1rem 1.1rem' },
  h3: { margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' },
  desc: { margin: '0 0 0.6rem', fontSize: '0.82rem', color: '#64748b' },
  row: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderTop: '1px solid #f1f5f9' },
  name: { display: 'block', fontSize: '0.9rem', color: '#0f172a' },
  meta: { fontSize: '0.8rem', color: '#64748b' },
  remove: { border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 8, padding: '0.35rem 0.7rem', fontWeight: 600, cursor: 'pointer' },
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginTop: '0.75rem' },
  input: { padding: '0.6rem 0.75rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', minWidth: 0 },
  add: { border: 'none', color: '#fff', borderRadius: 10, padding: '0.6rem 0.9rem', fontWeight: 700, cursor: 'pointer' },
  err: { color: '#b91c1c', fontSize: '0.85rem', margin: '0.5rem 0 0' },
};
