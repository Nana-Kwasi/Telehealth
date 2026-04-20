import React, { useState, useEffect } from 'react';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';

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

const EMPTY = { branchName: '', address: '', lat: '', lng: '', contactNumber: '', email: '' };

export default function PharmacyBranches({ profile }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [newCreds, setNewCreds] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { loadBranches(); }, []);

  const loadBranches = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'pharmacyBranches'), where('pharmacyId', '==', profile.id)));
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
    const tempPassword = genPassword();

    try {
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secAuth, form.email.trim(), tempPassword);
      const uid = cred.user.uid;
      await fbSignOut(secAuth);

      const branchData = {
        uid,
        pharmacyId: profile.id,
        pharmacyName: profile.pharmacyName || '',
        branchName: form.branchName.trim(),
        address: form.address.trim(),
        lat: parseFloat(form.lat) || null,
        lng: parseFloat(form.lng) || null,
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
      setBranches(prev => [newBranch, ...prev]);
      setNewCreds({ username, tempPassword, email: form.email.trim(), branchName: form.branchName.trim() });
      setForm({ ...EMPTY });
      setShowForm(false);
    } catch (err) {
      console.error('Create branch error:', err);
      setError(err.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists.'
        : 'Failed to create branch. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const copyAll = (c) => navigator.clipboard.writeText(
    `Branch: ${c.branchName}\nUsername: ${c.username}\nPassword: ${c.tempPassword}\nEmail: ${c.email}`
  ).catch(() => {});

  return (
    <div className="pharmacy-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h1 className="pharmacy-page-title">Manage Branches</h1>
        <button style={{ padding: '0.55rem 1.1rem', borderRadius: 8, background: '#0ea5e9', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}
          onClick={() => { setShowForm(v => !v); setError(''); setNewCreds(null); }}>
          {showForm ? '✕ Cancel' : '+ New Branch'}
        </button>
      </div>
      <p className="pharmacy-page-sub">Each branch gets its own login credentials and sees only its assigned prescriptions.</p>

      {/* New branch form */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #bae6fd', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 700, color: '#0c4a6e' }}>New Branch Details</h3>
          {error && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '0.75rem', color: '#be123c', fontSize: '0.85rem', marginBottom: '1rem' }}>🚨 {error}</div>}
          <form onSubmit={handleCreateBranch}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Branch Name *</label>
                <input placeholder="e.g. Accra Central Branch" value={form.branchName} onChange={e => update('branchName', e.target.value)}
                  required style={{ padding: '0.6rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Branch Email * (used for login)</label>
                <input type="email" placeholder="branch@pharmacy.com" value={form.email} onChange={e => update('email', e.target.value)}
                  required style={{ padding: '0.6rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Address</label>
                <input placeholder="Full street address" value={form.address} onChange={e => update('address', e.target.value)}
                  style={{ padding: '0.6rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Latitude (GPS)</label>
                <input type="number" step="any" placeholder="e.g. 5.6037" value={form.lat} onChange={e => update('lat', e.target.value)}
                  style={{ padding: '0.6rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Longitude (GPS)</label>
                <input type="number" step="any" placeholder="e.g. -0.1870" value={form.lng} onChange={e => update('lng', e.target.value)}
                  style={{ padding: '0.6rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Contact Number</label>
                <input placeholder="+233 XX XXX XXXX" value={form.contactNumber} onChange={e => update('contactNumber', e.target.value)}
                  style={{ padding: '0.6rem 0.875rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
              </div>
            </div>
            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '0.75rem', fontSize: '0.8rem', color: '#0369a1', marginBottom: '1rem' }}>
              ℹ️ A username and temporary password will be generated automatically. The branch operator must change it on first login.
            </div>
            <button type="submit" disabled={saving}
              style={{ padding: '0.6rem 1.5rem', borderRadius: 8, background: '#0c4a6e', color: '#fff', border: 'none', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : '🏪 Create Branch'}
            </button>
          </form>
        </div>
      )}

      {/* New credentials display */}
      {newCreds && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ color: '#7dd3fc', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            ✅ Branch created: {newCreds.branchName}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {[['Email', newCreds.email], ['Username', newCreds.username], ['Temp Password', newCreds.tempPassword]].map(([l, v]) => (
              <div key={l} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '0.6rem 0.875rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#93c5fd', fontFamily: 'monospace' }}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={() => copyAll(newCreds)}
            style={{ padding: '0.45rem 1rem', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}>
            📋 Copy All
          </button>
        </div>
      )}

      {/* Branch list */}
      {loading ? (
        <div style={{ color: '#64748b', padding: '1rem' }}>Loading branches…</div>
      ) : branches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px solid #e0f2fe' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏪</div>
          <p style={{ margin: 0 }}>No branches yet. Click "+ New Branch" to add your first one.</p>
        </div>
      ) : (
        <div className="branch-grid">
          {branches.map(b => (
            <div key={b.id} className="branch-card">
              <p className="branch-name">{b.branchName}</p>
              <p className="branch-addr">{b.address || 'No address provided'}</p>
              <div className="branch-meta">
                {b.lat && b.lng && (
                  <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                    📍 GPS set
                  </span>
                )}
                <span style={{ fontSize: '0.72rem', background: b.status === 'active' ? '#dcfce7' : '#f1f5f9', color: b.status === 'active' ? '#16a34a' : '#64748b', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                  {b.status || 'active'}
                </span>
              </div>
              {b.contactNumber && <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.5rem' }}>📞 {b.contactNumber}</div>}
              <div className="branch-cred-box">
                <div className="branch-cred-row"><span className="branch-cred-label">Username</span><span className="branch-cred-val">{b.username}</span></div>
                <div className="branch-cred-row"><span className="branch-cred-label">Email</span><span className="branch-cred-val" style={{ fontSize: '0.72rem' }}>{b.email}</span></div>
                <div className="branch-cred-row"><span className="branch-cred-label">Pw Reset</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: b.mustChangePassword ? '#dc2626' : '#16a34a' }}>
                    {b.mustChangePassword ? 'Required' : 'Done'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
