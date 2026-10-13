import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/apiClient';

/**
 * Super admins: who can run NessaHub. Adding one gives a temporary password,
 * shown once, which they must replace at first sign-in. Every change here is
 * emailed to the other super admins. You cannot act on yourself here (use
 * Settings), and the last active super admin cannot be suspended.
 */
const TEAM = '/api/v1/admin/team';
const when = (v) => (v ? new Date(v).toLocaleString() : 'Never');

function TempPassword({ title, who, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select it by hand */ }
  };
  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="admin-modal">
        <div className="admin-modal-header"><h2 className="admin-modal-title">{title}</h2></div>
        <div className="admin-alert admin-alert-warn">This password is shown <b>only now</b>. Give it to {who.fullName} in person or by phone, not by email. They choose their own at first sign-in.</div>
        <div className="credential-box">
          <p>Sign in at nessahub.com with:</p>
          <div className="credential-row"><span className="credential-label">Email</span><span className="credential-value">{who.email}</span></div>
          <div className="credential-row"><span className="credential-label">Temporary password</span><span className="credential-value">{password}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy password'}</button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTeam() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null);
  const [suspending, setSuspending] = useState(null);
  const [shown, setShown] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => api(TEAM).then((r) => { setRows(r || []); setError(''); }).catch((e) => setError(e?.message || 'Could not load')), []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, done) => {
    setBusy(true);
    setNote('');
    try { const r = await fn(); if (done) done(r); await load(); } catch (e) { setNote(e?.message || 'That did not work'); } finally { setBusy(false); }
  };

  const add = () => run(() => api(TEAM, { method: 'POST', body: adding }), (r) => {
    setAdding(null);
    setShown({ title: 'Super admin added', who: { fullName: r.fullName, email: r.email }, password: r.temporaryPassword });
  });
  const reset = (a) => {
    if (!window.confirm(`Give ${a.fullName} a new temporary password? Their current password stops working and they are signed out everywhere.`)) return;
    run(() => api(`${TEAM}/${a.id}/reset-password`, { method: 'POST' }), (r) => setShown({ title: 'New temporary password', who: a, password: r.temporaryPassword }));
  };
  const suspend = () => run(() => api(`${TEAM}/${suspending.id}/suspend`, { method: 'POST', body: { reason: suspending.reason } }), () => setSuspending(null));
  const reactivate = (a) => run(() => api(`${TEAM}/${a.id}/reactivate`, { method: 'POST' }));
  const signOut = (a) => {
    if (!window.confirm(`Sign ${a.fullName} out of every device now?`)) return;
    run(() => api(`${TEAM}/${a.id}/sign-out`, { method: 'POST' }), () => setNote(`${a.fullName} has been signed out everywhere.`));
  };

  const active = (rows || []).filter((r) => r.status === 'active').length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Super admins</h1>
          <p className="admin-page-sub">People who can see and run all of NessaHub. Keep this list short: every super admin can reach every account.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding({ fullName: '', email: '', phone: '' })}>+ Add super admin</button>
      </div>

      {error && <div className="admin-alert admin-alert-danger">{error}</div>}
      {note && <div className={`admin-alert ${/signed out/.test(note) ? 'admin-alert-success' : 'admin-alert-danger'}`}>{note}</div>}

      <div className="admin-stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="admin-stat-card"><div className="admin-stat-label">Active super admins</div><div className="admin-stat-value">{rows ? active : '—'}</div></div>
        <div className="admin-stat-card"><div className="admin-stat-label">Using two-step sign-in</div><div className="admin-stat-value">{rows ? rows.filter((r) => r.twoStepOn).length : '—'}</div></div>
        <div className="admin-stat-card"><div className="admin-stat-label">Waiting to set a password</div><div className="admin-stat-value">{rows ? rows.filter((r) => r.mustChangePassword).length : '—'}</div></div>
      </div>

      <div className="admin-table-card">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Status</th><th>Last sign-in</th><th>Signed in on</th><th>Added</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {!rows ? <tr><td colSpan={6}><div className="admin-empty" style={{ padding: '1.5rem' }}><p>Loading…</p></div></td></tr>
              : rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.fullName}</b>{a.isYou && <span className="badge badge-blue" style={{ marginLeft: 6 }}>You</span>}
                    <div className="toggle-desc">{a.email}{a.phone ? ` · ${a.phone}` : ''}</div>
                  </td>
                  <td>
                    {a.status === 'active' ? <span className="badge badge-green">Active</span> : <span className="badge badge-red" title={a.statusReason || ''}>Suspended</span>}
                    {a.mustChangePassword && <div className="toggle-desc">Must set a password</div>}
                    {a.status !== 'active' && a.statusReason && <div className="toggle-desc">{a.statusReason}</div>}
                  </td>
                  <td>{when(a.lastSignIn)}</td>
                  <td>{a.openSessions} device{Number(a.openSessions) === 1 ? '' : 's'}</td>
                  <td><div>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</div>{a.addedBy && <div className="toggle-desc">by {a.addedBy}</div>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {a.isYou ? <span className="toggle-desc">Manage in Settings</span> : (
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => reset(a)}>Reset password</button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !Number(a.openSessions)} onClick={() => signOut(a)}>Sign out</button>
                        {a.status === 'active'
                          ? <button type="button" className="btn btn-danger btn-sm" disabled={busy || active <= 1} title={active <= 1 ? 'NessaHub must keep one active super admin' : ''}
                              onClick={() => setSuspending({ id: a.id, fullName: a.fullName, reason: '' })}>Suspend</button>
                          : <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => reactivate(a)}>Reactivate</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label="Add super admin">
          <div className="admin-modal">
            <div className="admin-modal-header"><h2 className="admin-modal-title">Add a super admin</h2></div>
            <p className="toggle-desc" style={{ marginTop: 0 }}>They get a temporary password (shown to you once) and must choose their own at first sign-in. They are emailed that their account exists, and the other super admins are told.</p>
            <div className="admin-form-grid cols-1">
              <div className="admin-field"><label htmlFor="ta-name">Full name</label><input id="ta-name" type="text" value={adding.fullName} onChange={(e) => setAdding({ ...adding, fullName: e.target.value })} /></div>
              <div className="admin-field"><label htmlFor="ta-email">Work email (their own, new account)</label><input id="ta-email" type="email" value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} /></div>
              <div className="admin-field"><label htmlFor="ta-phone">Phone (optional)</label><input id="ta-phone" type="tel" value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} /></div>
            </div>
            {note && <div className="admin-alert admin-alert-danger" style={{ marginTop: '1rem' }}>{note}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setAdding(null); setNote(''); }}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy || !adding.fullName.trim() || !adding.email.trim()} onClick={add}>{busy ? 'Adding…' : 'Add super admin'}</button>
            </div>
          </div>
        </div>
      )}

      {suspending && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label="Suspend super admin">
          <div className="admin-modal">
            <div className="admin-modal-header"><h2 className="admin-modal-title">Suspend {suspending.fullName}?</h2></div>
            <p className="toggle-desc" style={{ marginTop: 0 }}>They are signed out of every device at once and cannot sign in until reactivated. The other super admins are told.</p>
            <div className="admin-field"><label htmlFor="ta-reason">Reason</label>
              <textarea id="ta-reason" value={suspending.reason} onChange={(e) => setSuspending({ ...suspending, reason: e.target.value })} placeholder="e.g. Left the company" /></div>
            {note && <div className="admin-alert admin-alert-danger" style={{ marginTop: '1rem' }}>{note}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setSuspending(null); setNote(''); }}>Cancel</button>
              <button type="button" className="btn btn-danger" disabled={busy || !suspending.reason.trim()} onClick={suspend}>{busy ? 'Suspending…' : 'Suspend'}</button>
            </div>
          </div>
        </div>
      )}

      {shown && <TempPassword {...shown} onClose={() => setShown(null)} />}
    </div>
  );
}
