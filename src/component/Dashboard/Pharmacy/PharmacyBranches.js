import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../services/firestoreShim';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from '../../../services/firestoreShim';
import { initializeApp, getApps } from '../../../services/authShim';
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from '../../../services/authShim';
import useAddressAutofill from '../../../hooks/useAddressAutofill';
import { formatDashboardLocationLine } from '../../Common/LocationSummaryCard';

const firebaseConfig = {
  apiKey: "AIzaSyDHQSUvAww2Z0MMnNJcLyfiEDRgZB_aSpI",
  authDomain: "teleehealth.firebaseapp.com",
  projectId: "teleehealth",
  storageBucket: "teleehealth.firebasestorage.app",
  messagingSenderId: "304333934237",
  appId: "1:304333934237:web:c0a08969be0671d72d0e74",
};

function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === 'branch-creator');
  const app = existing || initializeApp(firebaseConfig, 'branch-creator');
  return getAuth(app);
}

function genUsername(branchName, pharmacyName) {
  const slug = `${pharmacyName}${branchName}`.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  return `br_${slug}${Math.floor(1000 + Math.random() * 9000)}`;
}

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const EMPTY = {
  branchName: '', address: '', contactNumber: '', email: '', tempPassword: '',
  country: '', city: '', area: '', region: '', street: '', ghanaDigitalAddress: '', latitude: null, longitude: null,
};

export default function PharmacyBranches({ profile }) {
  const navigate = useNavigate();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  useEffect(() => { loadBranches(); }, []);

  // Branches are stored under the organization id. For self-registered pharmacies
  // that equals the user id, but admin-onboarded ones differ — so prefer the org id
  // and fall back to the user id. Using the wrong key returns an empty list (the
  // "branches vanish on reload" bug).
  const orgId = profile.organizationId || profile.id;

  const loadBranches = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'pharmacyBranches'), where('pharmacyId', '==', orgId)));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.branchName || '').localeCompare(b.branchName || ''));
      setBranches(list);
    } catch (e) {
      console.error('Branches load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!form.branchName.trim() || !form.email.trim()) {
      setError('Branch name and email are required.');
      return;
    }
    setError('');
    setSaving(true);

    const username = genUsername(form.branchName, profile.pharmacyName || 'pharm');
    const tempPassword = form.tempPassword.trim() || genPassword();

    try {
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secAuth, form.email.trim(), tempPassword);
      const uid = cred.user.uid;
      await fbSignOut(secAuth);

      const branchData = {
        uid,
        pharmacyId: orgId,
        pharmacyName: profile.pharmacyName || '',
        branchName: form.branchName.trim(),
        address: form.address.trim(),
        country: (form.country || profile.country || '').trim(),
        city: form.city.trim(),
        area: form.area.trim(),
        region: form.region.trim(),
        street: form.street.trim(),
        ghanaDigitalAddress: form.ghanaDigitalAddress.trim(),
        latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
        longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        location: {
          country: (form.country || profile.country || '').trim(),
          city: form.city.trim(),
          area: form.area.trim(),
          region: form.region.trim(),
          street: form.street.trim(),
          latitude: Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null,
          longitude: Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null,
        },
        contactNumber: form.contactNumber.trim(),
        email: form.email.trim(),
        username,
        role: 'branch_user',
        mustChangePassword: true,
        status: 'active',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'pharmacyBranches'), branchData);
      const newBranch = { id: docRef.id, ...branchData };
      setBranches(prev => [...prev, newBranch].sort((a, b) => (a.branchName || '').localeCompare(b.branchName || '')));
      setForm({ ...EMPTY });
      setShowForm(false);
      navigate(`/dashboard/branches/${docRef.id}`, {
        state: {
          newCreds: {
            username,
            tempPassword,
            email: form.email.trim(),
            branchName: form.branchName.trim(),
          },
        },
      });
    } catch (err) {
      console.error('Create branch error:', err);
      setError(err.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists.'
        : 'Failed to create branch. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pharmacy-page pharmacy-branches-page">
      <div className="pharmacy-branches-toolbar">
        <div>
          <h1 className="pharmacy-page-title">Manage Branches</h1>
          <p className="pharmacy-page-sub pharmacy-branches-sub">Each branch has its own login and sees only prescriptions assigned to that branch. Click a row to manage.</p>
        </div>
        <button
          type="button"
          className="pharmacy-branches-new-btn"
          onClick={() => { setShowForm(v => !v); setError(''); }}
        >
          {showForm ? '✕ Cancel' : '+ New Branch'}
        </button>
      </div>

      {error && <div className="branch-detail-alert branch-detail-alert--error pharmacy-branches-banner">{error}</div>}

      {showForm && (
        <div className="pharmacy-branches-form-card">
          <h3 className="pharmacy-branches-form-title">New branch details</h3>
          <form onSubmit={handleCreateBranch}>
            <div className="pharmacy-branches-form-grid">
              <label className="branch-detail-field">
                <span>Branch name *</span>
                <input placeholder="e.g. Accra Central Branch" value={form.branchName} onChange={e => update('branchName', e.target.value)} required />
              </label>
              <label className="branch-detail-field">
                <span>Branch email * (login)</span>
                <input type="email" placeholder="branch@pharmacy.com" value={form.email} onChange={e => update('email', e.target.value)} required />
              </label>
              <label className="branch-detail-field pharmacy-branches-field-full">
                <span>Address</span>
                <input placeholder="Full street address" value={form.address} onChange={e => update('address', e.target.value)} />
                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => detectAddress((loc) => {
                    update('address', loc.address || form.address);
                    update('city', loc.city || form.city);
                    update('area', loc.area || form.area);
                    update('region', loc.region || form.region);
                    update('street', loc.street || form.street);
                    update('latitude', loc.latitude ?? form.latitude);
                    update('longitude', loc.longitude ?? form.longitude);
                    update('country', loc.countryCode || form.country);
                  })}>
                    {locating ? 'Detecting…' : 'Use current location'}
                  </button>
                  {locationMsg ? <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{locationMsg}</span> : null}
                </div>
              </label>
              <label className="branch-detail-field">
                <span>City</span>
                <input placeholder="e.g. Accra" value={form.city} onChange={e => update('city', e.target.value)} />
              </label>
              <label className="branch-detail-field">
                <span>Area / Locality</span>
                <input placeholder="e.g. East Legon" value={form.area} onChange={e => update('area', e.target.value)} />
              </label>
              <label className="branch-detail-field">
                <span>Region / State</span>
                <input placeholder="e.g. Greater Accra" value={form.region} onChange={e => update('region', e.target.value)} />
              </label>
              <label className="branch-detail-field">
                <span>Street</span>
                <input placeholder="e.g. Liberation Road" value={form.street} onChange={e => update('street', e.target.value)} />
              </label>
              <label className="branch-detail-field">
                <span>Latitude</span>
                <input placeholder="Auto-detected" value={form.latitude ?? ''} onChange={e => update('latitude', e.target.value)} />
              </label>
              <label className="branch-detail-field">
                <span>Longitude</span>
                <input placeholder="Auto-detected" value={form.longitude ?? ''} onChange={e => update('longitude', e.target.value)} />
              </label>
              <label className="branch-detail-field pharmacy-branches-field-full">
                <span>Ghana Digital Address (optional)</span>
                <input placeholder="e.g. GA-123-4567" value={form.ghanaDigitalAddress} onChange={e => update('ghanaDigitalAddress', e.target.value)} />
              </label>
              <label className="branch-detail-field">
                <span>Temporary password</span>
                <input type="text" placeholder="Leave blank to auto-generate" value={form.tempPassword} onChange={e => update('tempPassword', e.target.value)} />
              </label>
              <label className="branch-detail-field">
                <span>Contact number</span>
                <input placeholder="+233 XX XXX XXXX" value={form.contactNumber} onChange={e => update('contactNumber', e.target.value)} />
              </label>
            </div>
            <p className="pharmacy-branches-form-hint">
              Username is auto-generated. Optional password or auto-generated. Branch operator must change password on first login.
            </p>
            <button type="submit" disabled={saving} className="branch-detail-btn branch-detail-btn--primary pharmacy-branches-submit">
              {saving ? 'Creating…' : 'Create branch'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <p className="branch-detail-muted">Loading branches…</p>
      ) : branches.length === 0 ? (
        <div className="pharmacy-branches-empty">
          <div className="pharmacy-branches-empty-icon">🏪</div>
          <p>No branches yet. Use &quot;+ New Branch&quot; to add one.</p>
        </div>
      ) : (
        <div className="pharmacy-card diagnostic-branches-card" style={{ padding: '1rem', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
        <div className="diagnostic-branches-table-wrap parent-branches-table-wrap">
          <table className="diagnostic-branches-table parent-branches-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Email</th>
                <th>Location</th>
                <th>Username</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Pw reset</th>
                <th className="parent-branches-chevron-col" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr
                  key={b.id}
                  className="diagnostic-branches-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/dashboard/branches/${b.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/dashboard/branches/${b.id}`); } }}
                >
                  <td><strong>{b.branchName}</strong></td>
                  <td style={{ color: '#64748b' }}>{b.email}</td>
                  <td style={{ color: '#475569', fontSize: '0.78rem', maxWidth: 220 }} title={formatDashboardLocationLine(b) || undefined}>
                    {formatDashboardLocationLine(b) || '—'}
                  </td>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>{b.username}</td>
                  <td>{b.contactNumber || '—'}</td>
                  <td>
                    <span className={`diagnostic-branch-status diagnostic-branch-status--${(b.status || 'active') === 'active' ? 'ok' : 'off'}`}>
                      {b.status || 'active'}
                    </span>
                  </td>
                  <td>
                    <span className={b.mustChangePassword ? 'pharmacy-table-warn' : 'pharmacy-table-ok'} style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                      {b.mustChangePassword ? 'Required' : 'Done'}
                    </span>
                  </td>
                  <td className="parent-branches-chevron-col" style={{ color: '#94a3b8', fontWeight: 700 }}>→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}
