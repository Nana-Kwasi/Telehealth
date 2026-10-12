import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../services/apiClient';

/**
 * Forgot password, both halves:
 *  - no token: ask for the email; the backend emails a single-use link
 *    (it answers the same whether or not the account exists);
 *  - ?token=…: choose a new password (link valid 30 minutes, works once).
 * The web had no reset at all, and the backend used to send nothing.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  const request = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/v1/auth/password-reset', { method: 'POST', authenticated: false, body: { email: email.trim() } });
      setDone('If an account uses that email, we have sent a link to reset your password. It expires in 30 minutes — check your spam folder too.');
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  };

  const confirm = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { setError('Choose a password of at least 8 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      await api('/api/v1/auth/password-reset/confirm', { method: 'POST', authenticated: false, body: { token, newPassword: pw } });
      setDone('Your password has been changed. You can sign in with it now.');
    } catch (err) {
      setError(err?.message || 'This link could not be used. Request a new one.');
    } finally { setBusy(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h1 style={S.title}>{token ? 'Choose a new password' : 'Reset your password'}</h1>
        {done ? (
          <>
            <p style={S.ok}>{done}</p>
            <Link to="/login" style={S.link}>Back to sign in</Link>
          </>
        ) : token ? (
          <form onSubmit={confirm}>
            <label style={S.label} htmlFor="rp-new">New password</label>
            <input id="rp-new" type="password" style={S.input} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
            <label style={S.label} htmlFor="rp-again">Repeat new password</label>
            <input id="rp-again" type="password" style={S.input} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
            {error ? <p style={S.err}>{error}</p> : null}
            <button type="submit" style={S.btn} disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
          </form>
        ) : (
          <form onSubmit={request}>
            <p style={S.text}>Enter the email you sign in with and we will send you a link to choose a new password.</p>
            <label style={S.label} htmlFor="rp-email">Email</label>
            <input id="rp-email" type="email" style={S.input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            {error ? <p style={S.err}>{error}</p> : null}
            <button type="submit" style={S.btn} disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <Link to="/login" style={S.link}>Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#f1f5f9', boxSizing: 'border-box' },
  card: { width: '100%', maxWidth: 420, background: '#fff', borderRadius: 18, padding: '1.75rem 1.5rem', boxShadow: '0 10px 40px rgba(15,23,42,0.12)', boxSizing: 'border-box' },
  title: { margin: '0 0 0.75rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' },
  text: { margin: '0 0 1rem', color: '#475569', lineHeight: 1.5, fontSize: '0.95rem' },
  label: { display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', margin: '0.6rem 0 0.3rem' },
  input: { width: '100%', padding: '0.7rem 0.85rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.95rem', boxSizing: 'border-box' },
  btn: { width: '100%', marginTop: '1rem', padding: '0.8rem', border: 'none', borderRadius: 12, background: '#2b5ce6', color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' },
  link: { display: 'block', textAlign: 'center', marginTop: '1rem', color: '#2b5ce6', fontWeight: 700, textDecoration: 'none' },
  ok: { color: '#166534', background: '#dcfce7', borderRadius: 10, padding: '0.75rem', lineHeight: 1.5 },
  err: { color: '#b91c1c', fontSize: '0.9rem', margin: '0.6rem 0 0' },
};
