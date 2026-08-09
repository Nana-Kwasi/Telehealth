import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createUserWithEmailAndPassword } from '../../services/authShim';
import { doc, setDoc } from '../../services/firestoreShim';
import { auth, db } from '../../services/firestoreShim';
import { isValidEmergencyPhone } from '../../utils/homeCareUtils';
import './HomeCare.css';

export default function HomeCareSignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || '/home-care';
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Full name, email, and password are required.');
      return;
    }
    if (!isValidEmergencyPhone(form.phone)) {
      setError('Enter a valid phone number (at least 8 digits) so nurses can reach you.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      const uid = cred.user.uid;
      const clientId = localStorage.getItem('th.clientId') || uid;
      const phone = form.phone.trim();
      await setDoc(doc(db, 'auth', uid), {
        uid,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone,
        phoneNumber: phone,
        role: 'client',
        userIntent: 'homecare',
        clientId: uid,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'clients', uid), {
        authUid: uid,
        displayName: form.name.trim(),
        clientName: form.name.trim(),
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone,
        phoneNumber: phone,
        role: 'client',
        userIntent: 'homecare',
        status: 'active',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      localStorage.setItem('userIntent', 'homecare');
      navigate(returnTo);
    } catch (err) {
      setError(err.code === 'auth/email-already-in-use' ? 'Email already registered. Sign in instead.' : err.message || 'Sign up failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hc-page hc-signup-overlay">
      <div className="hc-signup-modal hc-card">
        <h1>Sign up for Home Care</h1>
        <p className="hc-card-meta">Create an account to book nurses and track visits.</p>
        <form className="hc-form" onSubmit={submit}>
          <label>Full name</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          <label>Phone *</label>
          <input
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Digits only ok — at least 8 digits"
            required
          />
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
          <button type="submit" className="hc-btn" disabled={loading} style={{ marginTop: '1rem' }}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p style={{ marginTop: '1rem' }}>
          <Link
            to="/login"
            state={{ returnTo }}
            onClick={() => localStorage.setItem('userIntent', 'homecare')}
          >
            Already have an account? Sign in
          </Link>
          {' · '}
          <Link to={returnTo}>Cancel</Link>
        </p>
      </div>
    </div>
  );
}
