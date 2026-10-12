import React, { useState, useEffect } from 'react';
import '../Pharmacy/PharmacyDashboard.css';
import { db } from '../../../services/firestoreShim';
import {
  collection, query, getDocs, doc, setDoc,
  serverTimestamp, where,
} from '../../../services/firestoreShim';
import { initializeApp, getApps } from '../../../services/authShim';
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from '../../../services/authShim';

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

function generateUsername(name, type) {
  const prefix = type === 'lab' ? 'labbr_' : 'scanbr_';
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${slug}${rand}`;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

const EMPTY_BRANCH = { branchName: '', address: '', latitude: '', longitude: '', contact: '', email: '' };

export default function AdminLabScanBranches() {
  const [centerType, setCenterType] = useState('lab');
  const [centers, setCenters] = useState([]);
  const [selectedCenter, setSelectedCenter] = useState(null);
  const [branches, setBranches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_BRANCH });
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadCenters(); }, [centerType]);
  useEffect(() => { if (selectedCenter) loadBranches(selectedCenter.id); }, [selectedCenter]);

  const loadCenters = async () => {
    setLoading(true);
    try {
      const col = centerType === 'lab' ? 'labs' : 'scanCenters';
      const snap = await getDocs(collection(db, col));
      setCenters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSelectedCenter(null);
      setBranches([]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadBranches = async (centerId) => {
    try {
      const col = centerType === 'lab' ? 'labBranches' : 'scanBranches';
      const idField = centerType === 'lab' ? 'labId' : 'scanId';
      const snap = await getDocs(query(collection(db, col), where(idField, '==', centerId)));
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const handleAddBranch = async (e) => {
    e.preventDefault();
    if (!form.branchName.trim() || !form.email.trim()) {
      setError('Branch name and email are required.');
      return;
    }
    if (!form.latitude || !form.longitude) {
      setError('Latitude and longitude are required for location awareness.');
      return;
    }
    setError('');
    setSaving(true);

    const col = centerType === 'lab' ? 'labBranches' : 'scanBranches';
    const idField = centerType === 'lab' ? 'labId' : 'scanId';
    const username = generateUsername(form.branchName, centerType);
    const tempPassword = generatePassword();

    try {
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secAuth, form.email.trim(), tempPassword);
      const uid = cred.user.uid;
      await fbSignOut(secAuth);

      await setDoc(doc(db, col, uid), {
        uid,
        [idField]: selectedCenter.id,
        branchName: form.branchName.trim(),
        address: form.address.trim(),
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        contact: form.contact.trim(),
        email: form.email.trim(),
        username,
        status: 'active',
        mustChangePassword: true,
        role: `${centerType}_branch`,
        createdAt: serverTimestamp(),
      });

      setCredentials({ username, tempPassword, email: form.email.trim(), branchName: form.branchName.trim() });
      setForm({ ...EMPTY_BRANCH });
      loadBranches(selectedCenter.id);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else {
        setError('Failed to create branch. Please try again.');
      }
    } finally { setSaving(false); }
  };

  const nameField = centerType === 'lab' ? 'labName' : 'centerName';
  const typeLabel = centerType === 'lab' ? 'Lab' : 'Scan Center';

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Manage Lab / Scan Branches</h1>
        <p className="admin-page-sub">Add and manage branches for onboarded lab and scan centers.</p>
      </div>

      {/* Type toggle */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button className={`btn ${centerType === 'lab' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCenterType('lab')}>Laboratories</button>
        <button className={`btn ${centerType === 'scan' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCenterType('scan')}>Scan Centers</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Center list */}
        <div className="admin-table-card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700 }}>Select {typeLabel}</h3>
          {loading ? <p>Loading…</p> : centers.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No {typeLabel.toLowerCase()}s onboarded yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {centers.map(c => (
                <li key={c.id}>
                  <button
                    style={{
                      width: '100%', textAlign: 'left', padding: '0.75rem', borderRadius: 8,
                      backgroundColor: selectedCenter?.id === c.id ? '#e9f3ec' : 'transparent',
                      border: selectedCenter?.id === c.id ? '1.5px solid #3f7a55' : '1px solid transparent',
                      cursor: 'pointer', fontWeight: selectedCenter?.id === c.id ? 700 : 400,
                      color: '#0f172a', fontSize: '0.875rem',
                    }}
                    onClick={() => setSelectedCenter(c)}
                  >
                    {c[nameField] || 'Center'}
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>{c.address || c.email}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Branches panel */}
        <div>
          {!selectedCenter ? (
            <div className="admin-table-card" style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ color: '#64748b' }}>Select a {typeLabel.toLowerCase()} on the left to manage its branches.</p>
            </div>
          ) : (
            <>
              <div className="admin-table-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                    Branches — {selectedCenter[nameField]}
                  </h3>
                  <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }} onClick={() => { setShowForm(true); setCredentials(null); setError(''); }}>
                    + Add Branch
                  </button>
                </div>

                {branches.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No branches yet. Add the first branch above.</p>
                ) : (
                  <div className="diagnostic-branches-table-wrap parent-branches-table-wrap">
                    <table className="diagnostic-branches-table parent-branches-table">
                      <thead>
                        <tr>
                          <th>Branch Name</th>
                          <th>Address</th>
                          <th>Coordinates</th>
                          <th>Contact</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branches.map(b => (
                          <tr key={b.id} className="diagnostic-branches-row">
                            <td><strong>{b.branchName}</strong></td>
                            <td>{b.address || '—'}</td>
                            <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>
                              {b.latitude != null && b.longitude != null ? `${Number(b.latitude).toFixed(4)}, ${Number(b.longitude).toFixed(4)}` : '—'}
                            </td>
                            <td>{b.contact || '—'}</td>
                            <td>
                              <span className={`diagnostic-branch-status diagnostic-branch-status--${(b.status || 'active') === 'active' ? 'ok' : 'off'}`}>
                                {b.status || 'active'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {showForm && !credentials && (
                <div className="admin-table-card" style={{ padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Add New Branch</h4>
                  {error && <div className="admin-alert admin-alert-danger" style={{ marginBottom: '0.75rem' }}>{error}</div>}
                  <form onSubmit={handleAddBranch}>
                    <div className="admin-form-grid">
                      <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Branch Name *</label>
                        <input placeholder="e.g. Accra Central Branch" value={form.branchName} onChange={e => setForm(p => ({ ...p, branchName: e.target.value }))} required />
                      </div>
                      <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Address (required for map)</label>
                        <input placeholder="Full branch address" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
                      </div>
                      <div className="admin-field">
                        <label>Latitude * <span style={{ color: '#64748b', fontWeight: 400 }}>(from Google Maps)</span></label>
                        <input type="number" step="any" placeholder="e.g. 5.6037" value={form.latitude} onChange={e => setForm(p => ({ ...p, latitude: e.target.value }))} required />
                      </div>
                      <div className="admin-field">
                        <label>Longitude *</label>
                        <input type="number" step="any" placeholder="e.g. -0.1870" value={form.longitude} onChange={e => setForm(p => ({ ...p, longitude: e.target.value }))} required />
                      </div>
                      <div className="admin-field">
                        <label>Email Address (for login) *</label>
                        <input type="email" placeholder="branch@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
                      </div>
                      <div className="admin-field">
                        <label>Contact Phone</label>
                        <input placeholder="+233 XX XXX XXXX" value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} />
                      </div>
                    </div>
                    <div className="admin-alert admin-alert-info" style={{ margin: '0.75rem 0' }}>
                      Latitude/longitude enables proximity-based sorting when doctors select centers. Use Google Maps to get exact coordinates.
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? 'Creating…' : '+ Create Branch'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {credentials && (
                <div className="admin-table-card" style={{ padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#16a34a', fontWeight: 800 }}>Branch Created: {credentials.branchName}</h4>
                  <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.75rem' }}>Share these credentials with the branch staff.</p>
                  <div className="credential-box">
                    <div className="credential-row"><span className="credential-label">Email</span><span className="credential-value">{credentials.email}</span></div>
                    <div className="credential-row"><span className="credential-label">Username</span><span className="credential-value">{credentials.username}</span></div>
                    <div className="credential-row"><span className="credential-label">Temp Password</span><span className="credential-value">{credentials.tempPassword}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(`Username: ${credentials.username}\nPassword: ${credentials.tempPassword}\nEmail: ${credentials.email}`).catch(() => {})}>Copy</button>
                    <button className="btn btn-primary" onClick={() => { setCredentials(null); setShowForm(false); }}>Done</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
