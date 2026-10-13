import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../services/apiClient';

/**
 * Confirm-your-email, both halves:
 *  - /verify-email?token=… : the link from the email confirms the address.
 *  - <VerifyEmailGate/>     : a signed-in account that still needs to confirm sees
 *    this instead of its dashboard (System Config → Sign-in security).
 */
const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#f1f5f9', boxSizing: 'border-box' },
  card: { width: '100%', maxWidth: 440, background: '#fff', borderRadius: 18, padding: '1.75rem 1.5rem', boxShadow: '0 10px 40px rgba(15,23,42,0.12)', boxSizing: 'border-box', textAlign: 'center' },
  title: { margin: '0 0 0.75rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' },
  text: { margin: '0 0 1rem', color: '#475569', lineHeight: 1.5, fontSize: '0.95rem' },
  btn: { width: '100%', marginTop: '0.75rem', padding: '0.8rem', border: 'none', borderRadius: 12, background: '#0f766e', color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' },
  ghost: { width: '100%', marginTop: '0.6rem', padding: '0.75rem', borderRadius: 12, background: '#fff', color: '#0f172a', border: '1.5px solid #e2e8f0', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' },
  link: { display: 'block', marginTop: '1rem', color: '#0f766e', fontWeight: 700, textDecoration: 'none' },
  ok: { color: '#166534', background: '#dcfce7', borderRadius: 10, padding: '0.75rem', lineHeight: 1.5, marginBottom: '0.5rem' },
  err: { color: '#b91c1c', background: '#fee2e2', borderRadius: 10, padding: '0.75rem', lineHeight: 1.5, marginBottom: '0.5rem' },
};

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState(token ? 'working' : 'missing');
  const [error, setError] = useState('');
  const once = useRef(false);

  useEffect(() => {
    if (!token || once.current) return;
    once.current = true;
    api('/api/v1/auth/verify-email', { method: 'POST', authenticated: false, body: { token } })
      .then(() => setState('done'))
      .catch((e) => { setError(e?.message || 'This link could not be used.'); setState('failed'); });
  }, [token]);

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: '2.2rem' }} aria-hidden="true">{state === 'done' ? '✅' : '✉️'}</div>
        <h1 style={S.title}>{state === 'done' ? 'Email confirmed' : 'Confirm your email'}</h1>
        {state === 'working' && <p style={S.text}>Confirming…</p>}
        {state === 'done' && <p style={S.ok}>Thank you. Your account is ready to use.</p>}
        {state === 'failed' && <p style={S.err}>{error}</p>}
        {state === 'missing' && <p style={S.text}>Open the link in the email we sent you.</p>}
        <Link to="/dashboard" style={S.link}>{state === 'done' ? 'Go to my dashboard' : 'Back to NessaHub'}</Link>
      </div>
    </div>
  );
}

export function VerifyEmailGate({ email, onConfirmed, onSignOut }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/v1/auth/verify-email/resend', { method: 'POST' });
      setMsg({ ok: true, text: 'A new link is on its way. Check your inbox and spam folder.' });
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not send a new link.' });
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const me = await api('/api/v1/auth/me');
      if (me?.emailVerified) onConfirmed();
      else setMsg({ ok: false, text: 'Not confirmed yet. Open the link in the email first.' });
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Could not check.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: '2.2rem' }} aria-hidden="true">✉️</div>
        <h1 style={S.title}>Confirm your email</h1>
        <p style={S.text}>We sent a link to <b>{email || 'your email address'}</b>. Open it to start using NessaHub.</p>
        {msg && <p style={msg.ok ? S.ok : S.err}>{msg.text}</p>}
        <button type="button" style={S.btn} disabled={busy} onClick={check}>I've confirmed it</button>
        <button type="button" style={S.ghost} disabled={busy} onClick={resend}>Send the link again</button>
        <button type="button" style={S.ghost} onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}
