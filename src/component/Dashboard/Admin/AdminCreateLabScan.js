import React, { useState } from 'react';
import { db, auth } from '../../Auth/firebaseConfig';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { SUPPORTED_COUNTRIES, isEnabled } from '../../../utils/featureFlags';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

const firebaseConfig = {
  apiKey: "AIzaSyDHQSUvAww2Z0MMnNJcLyfiEDRgZB_aSpI",
  authDomain: "teleehealth.firebaseapp.com",
  projectId: "teleehealth",
  storageBucket: "teleehealth.firebasestorage.app",
  messagingSenderId: "304333934237",
  appId: "1:304333934237:web:c0a08969be0671d72d0e74",
};

function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === 'diagnostic-creator');
  const app = existing || initializeApp(firebaseConfig, 'diagnostic-creator');
  return getAuth(app);
}

function generateUsername(name, type) {
  const prefix = type === 'lab' ? 'lab_' : 'scan_';
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${slug}${rand}`;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

const EMPTY = {
  centerName: '', licenseNote: '', email: '', phone: '', address: '', country: 'GH', city: '', area: '', region: '', street: '', ghanaDigitalAddress: '', latitude: null, longitude: null, type: 'lab',
};

export default function AdminCreateLabScan() {
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const update = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const featureKey = form.type === 'lab' ? 'labOrdering' : 'scanOrdering';
    if (!isEnabled(form.country, featureKey)) {
      setError(`${form.type === 'lab' ? 'Lab' : 'Scan'} onboarding is disabled for this country by System Config.`);
      return;
    }
    if (!form.centerName.trim() || !form.email.trim()) {
      setError('Center name and email are required.');
      return;
    }
    setError('');
    setSaving(true);

    const username = generateUsername(form.centerName, form.type);
    const tempPassword = generatePassword();
    const collection = form.type === 'lab' ? 'labs' : 'scanCenters';
    const nameField = form.type === 'lab' ? 'labName' : 'centerName';

    try {
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secAuth, form.email.trim(), tempPassword);
      const uid = cred.user.uid;
      await fbSignOut(secAuth);

      await setDoc(doc(db, collection, uid), {
        uid,
        [nameField]: form.centerName.trim(),
        type: form.type,
        licenseNote: form.licenseNote.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        country: form.country,
        city: form.city.trim(),
        area: form.area.trim(),
        region: form.region.trim(),
        street: form.street.trim(),
        ghanaDigitalAddress: form.ghanaDigitalAddress.trim(),
        latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
        longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        location: {
          country: form.country,
          city: form.city.trim(),
          area: form.area.trim(),
          region: form.region.trim(),
          street: form.street.trim(),
          latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
          longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        },
        username,
        status: 'active',
        mustChangePassword: true,
        role: form.type,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || 'admin',
      });

      setCredentials({ username, tempPassword, email: form.email.trim(), centerName: form.centerName.trim(), type: form.type });
      setForm({ ...EMPTY });
    } catch (err) {
      console.error('Create diagnostic center error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else {
        setError('Failed to create account. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const typeLabel = form.type === 'lab' ? 'Laboratory' : 'Scan Center';

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Create Lab / Scan Center Account</h1>
        <p className="admin-page-sub">Onboard a new laboratory or imaging center. Credentials will be auto-generated.</p>
      </div>

      {credentials ? (
        <div className="admin-table-card" style={{ padding: '1.5rem', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>{credentials.type === 'lab' ? '🧪' : '🩻'}</span>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>
              {credentials.type === 'lab' ? 'Lab Center' : 'Scan Center'} Created: {credentials.centerName}
            </h2>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem' }}>
            Share these credentials securely. They must change their password on first login.
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
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '100%' }}>
          {error && (
            <div className="admin-alert admin-alert-danger" style={{ marginBottom: '1rem' }}>
              🚨 {error}
            </div>
          )}

          <div className="admin-table-card" style={{ padding: '1.5rem', marginBottom: '1rem', width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>Center Details</h3>
            <div className="admin-form-grid cols-3">
              <div className="admin-field">
                <label>Center Type *</label>
                <select value={form.type} onChange={e => update('type', e.target.value)} required>
                  <option value="lab">🧪 Laboratory</option>
                  <option value="scan">🩻 Scan / Imaging Center</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Country *</label>
                <select value={form.country} onChange={e => update('country', e.target.value)} required>
                  {SUPPORTED_COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
                  ))}
                </select>
              </div>
              <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                <label>{typeLabel} Name *</label>
                <input
                  placeholder={form.type === 'lab' ? 'e.g. Accra Diagnostic Lab' : 'e.g. CityView Imaging Center'}
                  value={form.centerName}
                  onChange={e => update('centerName', e.target.value)}
                  required
                />
              </div>
              <div className="admin-field">
                <label>Email Address *</label>
                <input type="email" placeholder="center@example.com" value={form.email} onChange={e => update('email', e.target.value)} required />
              </div>
              <div className="admin-field">
                <label>Phone Number</label>
                <input placeholder="+233 XX XXX XXXX" value={form.phone} onChange={e => update('phone', e.target.value)} />
              </div>
              <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                <label>Address</label>
                <input placeholder="Full physical address" value={form.address} onChange={e => update('address', e.target.value)} />
                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => detectAddress((loc) => {
                    update('address', loc.address || form.address);
                    update('city', loc.city || form.city);
                    update('area', loc.area || form.area);
                    update('region', loc.region || form.region);
                    update('street', loc.street || form.street);
                    update('latitude', loc.latitude ?? form.latitude);
                    update('longitude', loc.longitude ?? form.longitude);
                    if (loc.countryCode && SUPPORTED_COUNTRIES.some(c => c.code === loc.countryCode)) update('country', loc.countryCode);
                  })}>
                    {locating ? 'Detecting…' : 'Use current location'}
                  </button>
                  {locationMsg ? <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{locationMsg}</span> : null}
                </div>
              </div>
              <div className="admin-field">
                <label>City</label>
                <input placeholder="e.g. Accra" value={form.city} onChange={e => update('city', e.target.value)} />
              </div>
              <div className="admin-field">
                <label>Area / Locality</label>
                <input placeholder="e.g. East Legon" value={form.area} onChange={e => update('area', e.target.value)} />
              </div>
              <div className="admin-field">
                <label>Region / State</label>
                <input placeholder="e.g. Greater Accra" value={form.region} onChange={e => update('region', e.target.value)} />
              </div>
              <div className="admin-field">
                <label>Street</label>
                <input placeholder="e.g. Liberation Road" value={form.street} onChange={e => update('street', e.target.value)} />
              </div>
              <div className="admin-field">
                <label>Latitude</label>
                <input value={form.latitude ?? ''} onChange={e => update('latitude', e.target.value)} placeholder="Auto-detected" />
              </div>
              <div className="admin-field">
                <label>Longitude</label>
                <input value={form.longitude ?? ''} onChange={e => update('longitude', e.target.value)} placeholder="Auto-detected" />
              </div>
              <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                <label>Ghana Digital Address (optional)</label>
                <input placeholder="e.g. GA-123-4567" value={form.ghanaDigitalAddress} onChange={e => update('ghanaDigitalAddress', e.target.value)} />
              </div>
              <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                <label>License / Notes</label>
                <textarea placeholder="License number, accreditation details, any notes…" value={form.licenseNote} onChange={e => update('licenseNote', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="admin-alert admin-alert-info" style={{ marginBottom: '1.25rem' }}>
            ℹ️ A username and temporary password will be auto-generated and displayed after submission. The center must change their password on first login.
          </div>
          {!isEnabled(form.country, form.type === 'lab' ? 'labOrdering' : 'scanOrdering') && (
            <div className="admin-alert admin-alert-warning" style={{ marginBottom: '1.25rem' }}>
              ⚠️ {form.type === 'lab' ? 'Lab' : 'Scan'} onboarding is disabled for {form.country}. Enable it in System Config → Country Feature Flags.
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={saving || !isEnabled(form.country, form.type === 'lab' ? 'labOrdering' : 'scanOrdering')} style={{ minWidth: 200 }}>
            {saving ? 'Creating…' : `${form.type === 'lab' ? '🧪' : '🩻'} Create ${typeLabel} Account`}
          </button>
        </form>
      )}
    </div>
  );
}
