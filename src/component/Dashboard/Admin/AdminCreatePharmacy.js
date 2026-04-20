import React, { useState } from 'react';
import { db, auth } from '../../Auth/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { SUPPORTED_COUNTRIES } from '../../../utils/featureFlags';

const firebaseConfig = {
  apiKey: "AIzaSyDHQSUvAww2Z0MMnNJcLyfiEDRgZB_aSpI",
  authDomain: "teleehealth.firebaseapp.com",
  projectId: "teleehealth",
  storageBucket: "teleehealth.firebasestorage.app",
  messagingSenderId: "304333934237",
  appId: "1:304333934237:web:c0a08969be0671d72d0e74",
};

function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === 'pharmacy-creator');
  const app = existing || initializeApp(firebaseConfig, 'pharmacy-creator');
  return getAuth(app);
}

function generateUsername(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `pharm_${slug}${rand}`;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

const EMPTY = {
  pharmacyName: '', businessReg: '', email: '', phone: '', address: '', country: 'GH', licenseNote: '',
};

export default function AdminCreatePharmacy() {
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState('');

  const update = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.pharmacyName.trim() || !form.email.trim()) {
      setError('Pharmacy name and email are required.');
      return;
    }
    setError('');
    setSaving(true);

    const username = generateUsername(form.pharmacyName);
    const tempPassword = generatePassword();

    try {
      // Create Firebase Auth user via secondary app (does not sign out admin)
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secAuth, form.email.trim(), tempPassword);
      const uid = cred.user.uid;
      await fbSignOut(secAuth);

      // Store pharmacy profile in Firestore
      await addDoc(collection(db, 'pharmacies'), {
        uid,
        pharmacyName: form.pharmacyName.trim(),
        businessReg: form.businessReg.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        country: form.country,
        licenseNote: form.licenseNote.trim(),
        username,
        status: 'active',
        mustChangePassword: true,
        role: 'pharmacy',
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || 'admin',
        branches: [],
      });

      setCredentials({ username, tempPassword, email: form.email.trim(), pharmacyName: form.pharmacyName.trim() });
      setForm({ ...EMPTY });
    } catch (err) {
      console.error('Create pharmacy error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else {
        setError('Failed to create pharmacy account. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Create Pharmacy Account</h1>
        <p className="admin-page-sub">Onboard a new pharmacy onto the platform. Credentials will be auto-generated.</p>
      </div>

      {credentials ? (
        <div className="admin-table-card" style={{ padding: '1.5rem', maxWidth: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>✅</span>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>
              Pharmacy Created: {credentials.pharmacyName}
            </h2>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem' }}>
            Share these credentials securely with the pharmacy. They will be prompted to change their password on first login.
          </p>

          <div className="credential-box">
            <p>Auto-generated credentials — share securely</p>
            <div className="credential-row">
              <span className="credential-label">Email</span>
              <span className="credential-value">{credentials.email}</span>
            </div>
            <div className="credential-row">
              <span className="credential-label">Username</span>
              <span className="credential-value">{credentials.username}</span>
            </div>
            <div className="credential-row">
              <span className="credential-label">Temp Password</span>
              <span className="credential-value">{credentials.tempPassword}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button className="btn btn-ghost" onClick={() => copyToClipboard(
              `Username: ${credentials.username}\nPassword: ${credentials.tempPassword}\nEmail: ${credentials.email}`
            )}>📋 Copy All</button>
            <button className="btn btn-primary" onClick={() => setCredentials(null)}>+ Create Another</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
          {error && (
            <div className="admin-alert admin-alert-danger" style={{ marginBottom: '1rem' }}>
              🚨 {error}
            </div>
          )}

          <div className="admin-table-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>Pharmacy Details</h3>
            <div className="admin-form-grid">
              <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                <label>Pharmacy Name *</label>
                <input placeholder="e.g. HealthPlus Pharmacy" value={form.pharmacyName} onChange={e => update('pharmacyName', e.target.value)} required />
              </div>
              <div className="admin-field">
                <label>Business Registration Number</label>
                <input placeholder="e.g. BRN-12345" value={form.businessReg} onChange={e => update('businessReg', e.target.value)} />
              </div>
              <div className="admin-field">
                <label>Country *</label>
                <select value={form.country} onChange={e => update('country', e.target.value)} required>
                  {SUPPORTED_COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <label>Email Address *</label>
                <input type="email" placeholder="pharmacy@example.com" value={form.email} onChange={e => update('email', e.target.value)} required />
              </div>
              <div className="admin-field">
                <label>Phone Number</label>
                <input placeholder="+233 XX XXX XXXX" value={form.phone} onChange={e => update('phone', e.target.value)} />
              </div>
              <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                <label>Address</label>
                <input placeholder="Full physical address" value={form.address} onChange={e => update('address', e.target.value)} />
              </div>
              <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                <label>License / Notes</label>
                <textarea placeholder="License number or any notes…" value={form.licenseNote} onChange={e => update('licenseNote', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="admin-alert admin-alert-info" style={{ marginBottom: '1.25rem' }}>
            ℹ️ A username and temporary password will be auto-generated and displayed after submission. The pharmacy must change their password on first login.
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
            {saving ? 'Creating…' : '🏥 Create Pharmacy Account'}
          </button>
        </form>
      )}
    </div>
  );
}
