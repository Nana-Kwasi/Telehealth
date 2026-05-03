import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import { signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut as fbSignOut } from 'firebase/auth';
import { auth, db } from '../../Auth/firebaseConfig';
import GlobalReportForm from '../Common/GlobalReportForm';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

const firebaseConfig = {
  apiKey: 'AIzaSyDHQSUvAww2Z0MMnNJcLyfiEDRgZB_aSpI',
  authDomain: 'teleehealth.firebaseapp.com',
  projectId: 'teleehealth',
  storageBucket: 'teleehealth.firebasestorage.app',
  messagingSenderId: '304333934237',
  appId: '1:304333934237:web:c0a08969be0671d72d0e74',
};

function getSecondaryAuth(type) {
  const appName = `diag-${type}-branch-creator`;
  const existing = getApps().find(a => a.name === appName);
  const app = existing || initializeApp(firebaseConfig, appName);
  return getAuth(app);
}

function makeUsername(type, branchName) {
  const prefix = type === 'lab' ? 'labbr_' : 'scanbr_';
  const slug = (branchName || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return `${prefix}${slug}${Math.floor(1000 + Math.random() * 9000)}`;
}

function makePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 12; i += 1) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

function ParentOverview({ type, profile }) {
  const [stats, setStats] = useState({ branches: 0, active: 0, suspended: 0, orders: 0, completed: 0, rejected: 0, inProgress: 0 });
  const [recentEvents, setRecentEvents] = useState([]);
  const branchCollection = type === 'lab' ? 'labBranches' : 'scanBranches';
  const parentIdField = type === 'lab' ? 'labId' : 'scanId';
  const orderType = type === 'lab' ? 'lab' : 'scan';

  useEffect(() => {
    (async () => {
      const [branchesSnap, ordersSnap, eventsSnap] = await Promise.all([
        getDocs(query(collection(db, branchCollection), where(parentIdField, '==', profile?.id || ''))),
        getDocs(query(collection(db, 'diagnosticOrders'), where('centerType', '==', orderType))),
        getDocs(query(collection(db, 'diagnosticBranchEvents'), where('centerType', '==', orderType))),
      ]);
      const branches = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const branchIds = new Set(branches.map(b => b.id));
      const orders = ordersSnap.docs.map(d => d.data()).filter((o) => branchIds.has(o.branchId || ''));
      const events = eventsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => branchIds.has(e.branchId || ''))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setStats({
        branches: branches.length,
        active: branches.filter(b => (b.status || 'active') === 'active').length,
        suspended: branches.filter(b => (b.status || '') === 'suspended').length,
        orders: orders.length,
        completed: orders.filter(o => (o.status || '') === 'COMPLETED').length,
        rejected: orders.filter(o => (o.status || '') === 'REJECTED').length,
        inProgress: orders.filter(o => (o.status || '') === 'IN_PROGRESS').length,
      });
      setRecentEvents(events.slice(0, 8));
    })();
  }, [branchCollection, orderType, parentIdField, profile?.id]);

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">{type === 'lab' ? 'Lab Parent Overview' : 'Scan Parent Overview'}</h1>
      <p className="pharmacy-page-sub">Manage your network and monitor branch operations.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 12 }}>
        {[
          ['Branches', stats.branches, '#1d4ed8'],
          ['Active', stats.active, '#16a34a'],
          ['Suspended', stats.suspended, '#dc2626'],
          ['Orders', stats.orders, '#7c3aed'],
          ['In Progress', stats.inProgress, '#2563eb'],
          ['Completed', stats.completed, '#15803d'],
          ['Rejected', stats.rejected, '#be123c'],
          ['Completion Rate', stats.orders ? `${Math.round((stats.completed / stats.orders) * 100)}%` : '0%', '#0f766e'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: '0.9rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>{label}</div>
            <div style={{ color, fontSize: '1.45rem', fontWeight: 800 }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
        <h3 style={{ marginTop: 0, fontSize: '0.88rem' }}>Recent Branch Activity</h3>
        {recentEvents.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>No recent branch events.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {recentEvents.map(e => (
              <div key={e.id} style={{ border: '1px solid #f1f5f9', borderRadius: 8, padding: '0.55rem 0.65rem', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: '0.78rem', color: '#0f172a' }}>{e.action || 'EVENT'}</b>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{e.createdAt?.seconds ? new Date(e.createdAt.seconds * 1000).toLocaleString() : '—'}</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                  {e.branchName || 'Branch'} · {e.patientName || 'Patient'} · {(e.fromStatus || '—')} → {(e.toStatus || '—')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ParentBranches({ type, profile }) {
  const navigate = useNavigate();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branchName: '',
    email: '',
    address: '',
    country: '',
    city: '',
    area: '',
    region: '',
    street: '',
    ghanaDigitalAddress: '',
    latitude: '',
    longitude: '',
    contact: '',
  });
  const [creds, setCreds] = useState(null);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();
  const branchCollection = type === 'lab' ? 'labBranches' : 'scanBranches';
  const parentIdField = type === 'lab' ? 'labId' : 'scanId';
  const parentLabel = type === 'lab' ? 'Lab' : 'Scan Center';

  const loadBranches = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, branchCollection), where(parentIdField, '==', profile?.id || '')));
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setBranches(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, [profile?.id, type]);

  const createBranch = async (e) => {
    e.preventDefault();
    if (!form.branchName.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      const username = makeUsername(type, form.branchName);
      const tempPassword = makePassword();
      const secAuth = getSecondaryAuth(type);
      const cred = await createUserWithEmailAndPassword(secAuth, form.email.trim(), tempPassword);
      await fbSignOut(secAuth);
      await setDoc(doc(db, branchCollection, cred.user.uid), {
        uid: cred.user.uid,
        [parentIdField]: profile?.id || null,
        branchName: form.branchName.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        country: (form.country || '').trim(),
        city: (form.city || '').trim(),
        area: (form.area || '').trim(),
        region: (form.region || '').trim(),
        street: (form.street || '').trim(),
        ghanaDigitalAddress: (form.ghanaDigitalAddress || '').trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        location: {
          country: (form.country || '').trim(),
          city: (form.city || '').trim(),
          area: (form.area || '').trim(),
          region: (form.region || '').trim(),
          street: (form.street || '').trim(),
          latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null,
        },
        contact: form.contact.trim(),
        username,
        status: 'active',
        mustChangePassword: true,
        role: `${type}_branch`,
        createdAt: serverTimestamp(),
      });
      setCreds({ username, tempPassword, email: form.email.trim(), branchName: form.branchName.trim() });
      setForm({
        branchName: '',
        email: '',
        address: '',
        country: '',
        city: '',
        area: '',
        region: '',
        street: '',
        ghanaDigitalAddress: '',
        latitude: '',
        longitude: '',
        contact: '',
      });
      await loadBranches();
    } catch {
      alert('Could not create branch. Check email and try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (branch) => {
    const next = (branch.status || 'active') === 'active' ? 'suspended' : 'active';
    await updateDoc(doc(db, branchCollection, branch.id), { status: next, updatedAt: serverTimestamp() });
    await loadBranches();
  };

  const deleteBranch = async (branch) => {
    if (!window.confirm(`Delete branch "${branch.branchName}"?`)) return;
    await deleteDoc(doc(db, branchCollection, branch.id));
    await loadBranches();
  };

  const resetPassword = async (branch) => {
    if (!branch.email) return alert('No email set for this branch.');
    await sendPasswordResetEmail(auth, branch.email);
    await updateDoc(doc(db, branchCollection, branch.id), { mustChangePassword: true, updatedAt: serverTimestamp() });
    alert('Password reset email sent.');
  };

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">{parentLabel} Branches</h1>
      <p className="pharmacy-page-sub">Add and manage branches directly from the parent dashboard.</p>

      <div className="pharmacy-card" style={{ marginBottom: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
        <h3 style={{ marginTop: 0, fontSize: '0.92rem' }}>Create Branch</h3>
        <form onSubmit={createBranch} className="admin-form-grid">
          <div className="admin-field"><label>Branch Name *</label><input value={form.branchName} onChange={e => setForm(p => ({ ...p, branchName: e.target.value }))} required /></div>
          <div className="admin-field"><label>Email *</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required /></div>
          <div className="admin-field"><label>Address</label><input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
          <div className="admin-field">
            <label>Location assist</label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => detectAddress((loc) => {
                setForm(p => ({
                  ...p,
                  address: loc.address || p.address || '',
                  country: loc.countryCode || p.country || '',
                  city: loc.city || p.city || '',
                  area: loc.area || p.area || '',
                  region: loc.region || p.region || '',
                  street: loc.street || p.street || '',
                  latitude: loc.latitude ?? p.latitude ?? '',
                  longitude: loc.longitude ?? p.longitude ?? '',
                }));
              })}
              disabled={locating}
            >
              {locating ? 'Detecting...' : 'Use current location'}
            </button>
            {locationMsg ? <small style={{ display: 'block', marginTop: 6, color: '#64748b' }}>{locationMsg}</small> : null}
          </div>
          <div className="admin-field"><label>Country</label><input value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} /></div>
          <div className="admin-field"><label>City</label><input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
          <div className="admin-field"><label>Area / locality</label><input value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} /></div>
          <div className="admin-field"><label>Region / state</label><input value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} /></div>
          <div className="admin-field"><label>Street</label><input value={form.street} onChange={e => setForm(p => ({ ...p, street: e.target.value }))} /></div>
          <div className="admin-field"><label>Contact</label><input value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} /></div>
          <div className="admin-field"><label>Latitude</label><input type="number" step="any" value={form.latitude} onChange={e => setForm(p => ({ ...p, latitude: e.target.value }))} /></div>
          <div className="admin-field"><label>Longitude</label><input type="number" step="any" value={form.longitude} onChange={e => setForm(p => ({ ...p, longitude: e.target.value }))} /></div>
          <div className="admin-field"><label>Ghana digital address (optional)</label><input value={form.ghanaDigitalAddress} onChange={e => setForm(p => ({ ...p, ghanaDigitalAddress: e.target.value }))} /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Branch'}</button>
          </div>
        </form>
        {creds && (
          <div className="credential-box" style={{ marginTop: 10 }}>
            <p>New branch credentials</p>
            <div className="credential-row"><span className="credential-label">Email</span><span className="credential-value">{creds.email}</span></div>
            <div className="credential-row"><span className="credential-label">Username</span><span className="credential-value">{creds.username}</span></div>
            <div className="credential-row"><span className="credential-label">Temp Password</span><span className="credential-value">{creds.tempPassword}</span></div>
          </div>
        )}
      </div>

      <div className="pharmacy-card diagnostic-branches-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
        <h3 style={{ marginTop: 0, fontSize: '0.92rem' }}>Branch Directory</h3>
        {loading ? <p>Loading...</p> : branches.length === 0 ? <p style={{ color: '#64748b' }}>No branches yet.</p> : (
          <div className="diagnostic-branches-table-wrap">
            <table className="diagnostic-branches-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th style={{ width: 1 }} className="parent-branches-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(b => (
                  <tr
                    key={b.id}
                    className="diagnostic-branches-row"
                    onClick={() => navigate(`/dashboard/branches/${b.id}`)}
                    title="Open branch detail"
                  >
                    <td><strong>{b.branchName || 'Branch'}</strong></td>
                    <td>{b.email || '—'}</td>
                    <td>{b.city || b.address || '—'}</td>
                    <td>
                      <span className={`diagnostic-branch-status diagnostic-branch-status--${(b.status || 'active') === 'active' ? 'ok' : 'off'}`}>
                        {b.status || 'active'}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }} className="parent-branches-actions-col">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => resetPassword(b)}>Reset PW</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleStatus(b)}>{(b.status || 'active') === 'active' ? 'Disable' : 'Enable'}</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteBranch(b)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function branchDocToEditForm(b) {
  if (!b) return null;
  const lat = b.latitude ?? b.location?.latitude;
  const lng = b.longitude ?? b.location?.longitude;
  return {
    branchName: b.branchName || '',
    contact: b.contact || '',
    address: b.address || '',
    country: (b.country || b.location?.country || '').trim(),
    city: (b.city || b.location?.city || '').trim(),
    area: (b.area || b.location?.area || '').trim(),
    region: (b.region || b.location?.region || '').trim(),
    street: (b.street || b.location?.street || '').trim(),
    ghanaDigitalAddress: (b.ghanaDigitalAddress || '').trim(),
    latitude: lat != null && lat !== '' ? String(lat) : '',
    longitude: lng != null && lng !== '' ? String(lng) : '',
  };
}

function ParentBranchDetail({ type, profile }) {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const branchCollection = type === 'lab' ? 'labBranches' : 'scanBranches';
  const parentIdField = type === 'lab' ? 'labId' : 'scanId';
  const parentLabel = type === 'lab' ? 'Lab' : 'Scan Center';
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saveErr, setSaveErr] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  const loadOne = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, branchCollection, branchId));
      if (!snap.exists()) {
        setBranch(null);
        setEditForm(null);
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      if (data[parentIdField] !== profile?.id) {
        setBranch(null);
        setEditForm(null);
        return;
      }
      setBranch(data);
      setEditForm(branchDocToEditForm(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOne();
  }, [branchId, branchCollection, parentIdField, profile?.id]);

  useEffect(() => {
    if (!branch) return;
    if (!editOpen) setEditForm(branchDocToEditForm(branch));
  }, [branch, editOpen]);

  const toggleStatus = async () => {
    if (!branch) return;
    const next = (branch.status || 'active') === 'active' ? 'suspended' : 'active';
    await updateDoc(doc(db, branchCollection, branch.id), { status: next, updatedAt: serverTimestamp() });
    await loadOne();
  };

  const deleteBranch = async () => {
    if (!branch) return;
    if (!window.confirm(`Delete branch "${branch.branchName}"?`)) return;
    await deleteDoc(doc(db, branchCollection, branch.id));
    navigate('/dashboard/branches');
  };

  const resetPassword = async () => {
    if (!branch?.email) return alert('No email set for this branch.');
    await sendPasswordResetEmail(auth, branch.email);
    await updateDoc(doc(db, branchCollection, branch.id), { mustChangePassword: true, updatedAt: serverTimestamp() });
    alert('Password reset email sent. Branch must set a new password on next login.');
  };

  const cancelEdit = () => {
    setSaveErr('');
    setEditForm(branchDocToEditForm(branch));
    setEditOpen(false);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!branch || !editForm) return;
    if (!editForm.branchName.trim()) {
      setSaveErr('Branch name is required.');
      return;
    }
    setSavingEdit(true);
    setSaveErr('');
    try {
      await updateDoc(doc(db, branchCollection, branch.id), {
        branchName: editForm.branchName.trim(),
        address: editForm.address.trim(),
        country: editForm.country.trim(),
        city: editForm.city.trim(),
        area: editForm.area.trim(),
        region: editForm.region.trim(),
        street: editForm.street.trim(),
        ghanaDigitalAddress: editForm.ghanaDigitalAddress.trim(),
        latitude: editForm.latitude ? Number(editForm.latitude) : null,
        longitude: editForm.longitude ? Number(editForm.longitude) : null,
        location: {
          country: editForm.country.trim(),
          city: editForm.city.trim(),
          area: editForm.area.trim(),
          region: editForm.region.trim(),
          street: editForm.street.trim(),
          latitude: editForm.latitude ? Number(editForm.latitude) : null,
          longitude: editForm.longitude ? Number(editForm.longitude) : null,
        },
        contact: editForm.contact.trim(),
        updatedAt: serverTimestamp(),
      });
      await loadOne();
      setEditOpen(false);
    } catch {
      setSaveErr('Could not save changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="pharmacy-page">
        <p>Loading branch…</p>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="pharmacy-page">
        <p style={{ color: '#b91c1c' }}>Branch not found or access denied.</p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/dashboard/branches')}>Back to branches</button>
      </div>
    );
  }

  if (!editForm) {
    return (
      <div className="pharmacy-page">
        <p>Loading branch…</p>
      </div>
    );
  }

  const locLine = [branch.area || branch.street, branch.city, branch.country].filter(Boolean).join(', ') || branch.address || '—';

  return (
    <div className="pharmacy-page diagnostic-branch-detail-page">
      <button type="button" className="btn btn-ghost btn-sm diagnostic-branch-back" onClick={() => navigate('/dashboard/branches')}>← Branches</button>
      <div className="diagnostic-branch-detail-hero">
        <div>
          <h1 className="pharmacy-page-title" style={{ marginBottom: 4 }}>{branch.branchName || 'Branch'}</h1>
          <p className="pharmacy-page-sub" style={{ margin: 0 }}>{parentLabel} branch · {branch.email || '—'}</p>
        </div>
        <span className={`diagnostic-branch-status diagnostic-branch-status--${(branch.status || 'active') === 'active' ? 'ok' : 'off'}`}>
          {branch.status || 'active'}
        </span>
      </div>

      {!editOpen ? (
        <div className="diagnostic-detail-grid">
          <div className="diagnostic-settings-card">
            <h3 style={{ marginTop: 0 }}>Contact</h3>
            <p style={{ margin: '0.35rem 0' }}><strong>Email</strong><br />{branch.email || '—'} <span style={{ fontSize: '0.72rem', color: '#64748b' }}>(login)</span></p>
            <p style={{ margin: '0.35rem 0' }}><strong>Username</strong><br />{branch.username || '—'}</p>
            <p style={{ margin: '0.35rem 0' }}><strong>Phone / contact</strong><br />{branch.contact || '—'}</p>
          </div>
          <div className="diagnostic-settings-card">
            <h3 style={{ marginTop: 0 }}>Location</h3>
            <p style={{ margin: '0.35rem 0', color: '#475569', fontSize: '0.9rem' }}>{locLine}</p>
            {branch.ghanaDigitalAddress ? (
              <p style={{ margin: '0.35rem 0', fontSize: '0.82rem', color: '#0369a1' }}>Ghana digital: {branch.ghanaDigitalAddress}</p>
            ) : null}
          </div>
          <div className="diagnostic-settings-card">
            <h3 style={{ marginTop: 0 }}>Security</h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 0 }}>
              Password change {(branch.mustChangePassword ? 'still required' : 'completed')} for next login policy.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={saveEdit} className="diagnostic-branch-edit-form pharmacy-card" style={{ marginTop: '1rem', padding: '1.15rem', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
          <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Edit branch</h3>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 0 }}>Login email is fixed; contact parent support to change operator email.</p>
          {saveErr ? <div className="branch-detail-alert branch-detail-alert--error" style={{ marginBottom: 10 }}>{saveErr}</div> : null}
          <div className="admin-form-grid">
            <div className="admin-field"><label>Branch name *</label><input value={editForm.branchName} onChange={(e) => setEditForm((p) => ({ ...p, branchName: e.target.value }))} required /></div>
            <div className="admin-field"><label>Contact phone</label><input value={editForm.contact} onChange={(e) => setEditForm((p) => ({ ...p, contact: e.target.value }))} /></div>
            <div className="admin-field"><label>Address (line)</label><input value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div className="admin-field">
              <label>Location assist</label>
              <button type="button" className="btn btn-ghost" disabled={locating} onClick={() => detectAddress((loc) => {
                setEditForm((p) => ({
                  ...p,
                  address: loc.address || p.address || '',
                  country: loc.countryCode || p.country || '',
                  city: loc.city || p.city || '',
                  area: loc.area || p.area || '',
                  region: loc.region || p.region || '',
                  street: loc.street || p.street || '',
                  latitude: loc.latitude != null ? String(loc.latitude) : p.latitude,
                  longitude: loc.longitude != null ? String(loc.longitude) : p.longitude,
                }));
              })}>
                {locating ? 'Detecting…' : 'Use current location'}
              </button>
              {locationMsg ? <small style={{ display: 'block', marginTop: 6, color: '#64748b' }}>{locationMsg}</small> : null}
            </div>
            <div className="admin-field"><label>Country</label><input value={editForm.country} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))} /></div>
            <div className="admin-field"><label>City</label><input value={editForm.city} onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))} /></div>
            <div className="admin-field"><label>Area</label><input value={editForm.area} onChange={(e) => setEditForm((p) => ({ ...p, area: e.target.value }))} /></div>
            <div className="admin-field"><label>Region</label><input value={editForm.region} onChange={(e) => setEditForm((p) => ({ ...p, region: e.target.value }))} /></div>
            <div className="admin-field"><label>Street</label><input value={editForm.street} onChange={(e) => setEditForm((p) => ({ ...p, street: e.target.value }))} /></div>
            <div className="admin-field"><label>Latitude</label><input type="number" step="any" value={editForm.latitude} onChange={(e) => setEditForm((p) => ({ ...p, latitude: e.target.value }))} /></div>
            <div className="admin-field"><label>Longitude</label><input type="number" step="any" value={editForm.longitude} onChange={(e) => setEditForm((p) => ({ ...p, longitude: e.target.value }))} /></div>
            <div className="admin-field"><label>Ghana digital address</label><input value={editForm.ghanaDigitalAddress} onChange={(e) => setEditForm((p) => ({ ...p, ghanaDigitalAddress: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save changes'}</button>
            <button type="button" className="btn btn-ghost" onClick={cancelEdit} disabled={savingEdit}>Cancel</button>
          </div>
        </form>
      )}

      <div className="diagnostic-branch-actions">
        {!editOpen ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => { setSaveErr(''); setEditForm(branchDocToEditForm(branch)); setEditOpen(true); }}>Edit details</button>
            <button type="button" className="btn btn-ghost" onClick={resetPassword}>Email password reset</button>
            <button type="button" className="btn btn-ghost" onClick={toggleStatus}>{(branch.status || 'active') === 'active' ? 'Suspend branch' : 'Activate branch'}</button>
            <button type="button" className="btn btn-danger" onClick={deleteBranch}>Delete branch</button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ParentSettings({ type, profile }) {
  const [msg, setMsg] = useState('');
  const title = type === 'lab' ? 'Lab Settings' : 'Scan Center Settings';
  const displayName = type === 'lab' ? (profile?.labName || profile?.name || '—') : (profile?.centerName || profile?.name || '—');

  const sendResetToSelf = async () => {
    if (!profile?.email) {
      setMsg('No email on file.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, profile.email);
      setMsg('Password reset email sent.');
    } catch {
      setMsg('Could not send reset email.');
    }
  };

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">{title}</h1>
      <p className="pharmacy-page-sub">Account profile and safe actions you can perform as {type === 'lab' ? 'lab parent' : 'scan parent'}.</p>

      <div className="diagnostic-detail-grid">
        <div className="diagnostic-settings-card">
          <h3 style={{ marginTop: 0 }}>Organization</h3>
          <p style={{ margin: '0.35rem 0' }}><strong>Name</strong><br />{displayName}</p>
          <p style={{ margin: '0.35rem 0' }}><strong>Email</strong><br />{profile?.email || '—'}</p>
          <p style={{ margin: '0.35rem 0' }}><strong>Username</strong><br />{profile?.username || '—'}</p>
          <p style={{ margin: '0.35rem 0' }}><strong>Account status</strong><br />{profile?.status || 'active'}</p>
        </div>
        <div className="diagnostic-settings-card">
          <h3 style={{ marginTop: 0 }}>Password</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 0 }}>Send a reset link to your login email (same as pharmacy parent flow).</p>
          <button type="button" className="btn btn-primary" onClick={sendResetToSelf}>Email password reset</button>
        </div>
        <div className="diagnostic-settings-card">
          <h3 style={{ marginTop: 0 }}>Branches</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 0 }}>Add branches, open a branch row for full tools, or use Reports from navigation where available.</p>
        </div>
      </div>
      {msg ? <p style={{ marginTop: 14, color: '#0369a1', fontSize: '0.88rem' }}>{msg}</p> : null}
    </div>
  );
}

export default function DiagnosticParentDashboard({ profile, type = 'lab' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const title = type === 'lab' ? 'Lab Parent' : 'Scan Parent';

  const nav = useMemo(() => ([
    { path: '/dashboard', label: 'Overview', icon: '📊' },
    { path: '/dashboard/branches', label: 'Branches', icon: '🏪' },
    { path: '/dashboard/report-issue', label: 'Report Issue', icon: '📩' },
    { path: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  ]), []);

  const isActive = (path) => (path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path));
  const logout = async () => { try { await signOut(auth); navigate('/'); } catch (_) {} };

  return (
    <div className="pharmacy-dashboard">
      <aside className="pharmacy-sidebar">
        <div className="pharmacy-sidebar-header">
          <div className="pharmacy-logo">
            <span>{type === 'lab' ? '🧪' : '🩻'}</span>
            <h2>NessaHub</h2>
            <span className="pharmacy-logo-badge">{title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="pharmacy-avatar">{(profile?.name || profile?.labName || profile?.centerName || 'D')[0].toUpperCase()}</div>
            <div>
              <p className="pharmacy-user-name">{profile?.labName || profile?.centerName || profile?.name || title}</p>
              <p className="pharmacy-user-role">Parent Account</p>
            </div>
          </div>
        </div>
        <nav className="pharmacy-nav">
          <div className="pharmacy-nav-section">
            <h3>Navigation</h3>
            <ul className="pharmacy-nav-list">
              {nav.map(item => (
                <li key={item.path}>
                  <button className={`pharmacy-nav-item ${isActive(item.path) ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                    <span>{item.icon}</span><span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="pharmacy-sidebar-footer">
          <button className="pharmacy-logout-btn" onClick={logout}>🚪 Logout</button>
        </div>
      </aside>

      <main className="pharmacy-main">
        <ForcedPasswordChangeOverlay
          profile={profile}
          firestoreCollection={type === 'lab' ? 'labs' : 'scanCenters'}
        />
        <Routes>
          <Route path="/" element={<ParentOverview type={type} profile={profile} />} />
          <Route path="/branches/:branchId" element={<ParentBranchDetail type={type} profile={profile} />} />
          <Route path="/branches" element={<ParentBranches type={type} profile={profile} />} />
          <Route path="/report-issue" element={<GlobalReportForm profile={profile} reporterType={type} />} />
          <Route path="/settings" element={<ParentSettings type={type} profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
