import React, { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';

/**
 * Sign-in security, shared by every role's web Settings → Security (the web
 * counterpart of the app's SecuritySettingsSection).
 *
 * TwoStepSignIn calls the real endpoint (/api/v1/auth/2fa). The patient web
 * screen's old toggle only saved a flag on the profile, so turning it on
 * changed nothing about signing in.
 */
export function TwoStepSignIn() {
  const [enabled, setEnabled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/api/v1/auth/2fa').then((d) => setEnabled(!!d?.enabled)).catch(() => setEnabled(false));
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setBusy(true); setMsg('');
    try {
      await api('/api/v1/auth/2fa', { method: 'PUT', body: { enabled: next } });
      setEnabled(next);
      setMsg(next ? 'On. Next time you sign in we will email you a code.' : 'Off.');
    } catch (e) {
      setMsg(e?.message || 'Could not update. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div style={S.card}>
      <div style={S.row}>
        <div style={{ flex: 1 }}>
          <p style={S.title}>Two-step sign-in</p>
          <p style={S.desc}>Require a code emailed to you each time you sign in, as well as your password.</p>
        </div>
        <button type="button" role="switch" aria-checked={!!enabled} aria-label="Two-step sign-in"
          disabled={enabled === null || busy} onClick={toggle}
          style={{ ...S.switch, background: enabled ? 'var(--nh-accent, #2563eb)' : '#cbd5e1' }}>
          <span style={{ ...S.knob, transform: enabled ? 'translateX(20px)' : 'translateX(0)' }} />
        </button>
      </div>
      {msg ? <p style={S.note}>{msg}</p> : null}
    </div>
  );
}

/** Change password (current + new), for any signed-in role. */
export function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 8) { setMsg({ ok: false, text: 'Choose a password of at least 8 characters.' }); return; }
    if (next !== again) { setMsg({ ok: false, text: 'The new passwords do not match.' }); return; }
    setBusy(true); setMsg({ ok: false, text: '' });
    try {
      await api('/api/v1/auth/password-change', { method: 'POST', body: { currentPassword: cur, newPassword: next } });
      setMsg({ ok: true, text: 'Password changed.' });
      setCur(''); setNext(''); setAgain(''); setOpen(false);
    } catch (err) {
      setMsg({ ok: false, text: err?.message || 'Could not change the password.' });
    } finally { setBusy(false); }
  };

  return (
    <div style={S.card}>
      <p style={S.title}>Password</p>
      {!open ? (
        <button type="button" style={S.ghost} onClick={() => { setOpen(true); setMsg({ ok: false, text: '' }); }}>Change password</button>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: '0.5rem', maxWidth: 360 }}>
          <input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} style={S.input} autoComplete="current-password" required />
          <input type="password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} style={S.input} autoComplete="new-password" required />
          <input type="password" placeholder="Repeat new password" value={again} onChange={(e) => setAgain(e.target.value)} style={S.input} autoComplete="new-password" required />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" style={S.primary} disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
            <button type="button" style={S.ghost} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {msg.text ? <p style={{ ...S.note, color: msg.ok ? '#166534' : '#b91c1c' }}>{msg.text}</p> : null}
    </div>
  );
}

/** Clinician accounts are closed by the admin team, not self-service. */
export function ClinicianAccountNote() {
  return (
    <div style={S.card}>
      <p style={S.title}>Closing your account</p>
      <p style={S.desc}>
        Clinician accounts are closed by the NessaHub admin team so that your patients' care can be
        handed over safely. Contact admin through Support to start this.
      </p>
    </div>
  );
}

const S = {
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '1rem' },
  row: { display: 'flex', alignItems: 'center', gap: '1rem' },
  title: { margin: '0 0 0.25rem', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' },
  desc: { margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 },
  note: { margin: '0.6rem 0 0', fontSize: '0.85rem', color: '#334155' },
  switch: { position: 'relative', width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 },
  knob: { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s' },
  input: { padding: '0.6rem 0.8rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.9rem' },
  primary: { padding: '0.6rem 1rem', borderRadius: 10, border: 'none', background: 'var(--nh-accent, #2563eb)', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  ghost: { padding: '0.55rem 1rem', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 700, cursor: 'pointer' },
};
