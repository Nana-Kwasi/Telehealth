import React, { useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../Auth/firebaseConfig';
import useAddressAutofill from '../../../hooks/useAddressAutofill';

export default function DiagnosticBranchSettings({ profile, type = 'lab' }) {
  const collectionName = type === 'lab' ? 'labBranches' : 'scanBranches';
  const parentCollection = type === 'lab' ? 'labs' : 'scanCenters';
  const parentIdField = type === 'lab' ? 'labId' : 'scanId';
  const [parentName, setParentName] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branchName: '',
    contact: '',
    address: '',
    country: '',
    city: '',
    area: '',
    region: '',
    street: '',
    ghanaDigitalAddress: '',
    latitude: '',
    longitude: '',
  });

  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  useEffect(() => {
    const pid = profile?.[parentIdField];
    if (!pid) return;
    getDoc(doc(db, parentCollection, pid))
      .then((snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setParentName(type === 'lab' ? (d.labName || d.name || '') : (d.centerName || d.name || ''));
      })
      .catch(() => {});
  }, [parentCollection, parentIdField, type, profile?.labId, profile?.scanId]);

  useEffect(() => {
    setForm({
      branchName: profile?.branchName || '',
      contact: profile?.contact || '',
      address: profile?.address || '',
      country: profile?.country || profile?.location?.country || '',
      city: profile?.city || profile?.location?.city || '',
      area: profile?.area || profile?.location?.area || '',
      region: profile?.region || profile?.location?.region || '',
      street: profile?.street || profile?.location?.street || '',
      ghanaDigitalAddress: profile?.ghanaDigitalAddress || '',
      latitude: profile?.latitude != null ? String(profile.latitude) : profile?.location?.latitude != null ? String(profile.location.latitude) : '',
      longitude: profile?.longitude != null ? String(profile.longitude) : profile?.location?.longitude != null ? String(profile.location.longitude) : '',
    });
  }, [profile?.id]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profile?.id) return;
    setSaving(true);
    setMsg('');
    try {
      await updateDoc(doc(db, collectionName, profile.id), {
        branchName: form.branchName.trim(),
        contact: form.contact.trim(),
        address: form.address.trim(),
        country: form.country.trim(),
        city: form.city.trim(),
        area: form.area.trim(),
        region: form.region.trim(),
        street: form.street.trim(),
        ghanaDigitalAddress: form.ghanaDigitalAddress.trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        location: {
          country: form.country.trim(),
          city: form.city.trim(),
          area: form.area.trim(),
          region: form.region.trim(),
          street: form.street.trim(),
          latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null,
        },
        updatedAt: serverTimestamp(),
      });
      setMsg('Saved.');
    } catch {
      setMsg('Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const emailReset = async () => {
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

  const title = type === 'lab' ? 'Lab Branch Settings' : 'Scan Branch Settings';

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">{title}</h1>
      <p className="pharmacy-page-sub">Update your branch profile and location. Login email is managed by your parent organization.</p>

      <div className="diagnostic-detail-grid">
        <div className="diagnostic-settings-card">
          <h3>Account</h3>
          <p style={{ margin: '0.35rem 0', fontSize: '0.88rem' }}><strong>Login email</strong><br />{profile?.email || '—'}</p>
          <p style={{ margin: '0.35rem 0', fontSize: '0.88rem' }}><strong>Username</strong><br />{profile?.username || '—'}</p>
          <p style={{ margin: '0.35rem 0', fontSize: '0.88rem' }}><strong>Parent {type === 'lab' ? 'lab' : 'center'}</strong><br />{parentName || '—'}</p>
          <p style={{ margin: '0.35rem 0', fontSize: '0.88rem' }}><strong>Status</strong><br />{profile?.status || 'active'}</p>
        </div>
        <div className="diagnostic-settings-card">
          <h3>Password</h3>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 0 }}>Receive a reset link at your branch login email.</p>
          <button type="button" className="btn btn-primary" onClick={emailReset}>Email password reset</button>
        </div>
      </div>

      <form onSubmit={saveProfile} className="pharmacy-card" style={{ marginTop: '1rem', padding: '1rem', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
        <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Branch profile & location</h3>
        <div className="admin-form-grid">
          <div className="admin-field"><label>Branch name *</label><input value={form.branchName} onChange={(e) => setForm((p) => ({ ...p, branchName: e.target.value }))} required /></div>
          <div className="admin-field"><label>Contact</label><input value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} /></div>
          <div className="admin-field"><label>Address (line)</label><input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
          <div className="admin-field">
            <label>Location assist</label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => detectAddress((loc) => {
                setForm((p) => ({
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
          <div className="admin-field"><label>Country</label><input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} /></div>
          <div className="admin-field"><label>City</label><input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
          <div className="admin-field"><label>Area</label><input value={form.area} onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))} /></div>
          <div className="admin-field"><label>Region</label><input value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} /></div>
          <div className="admin-field"><label>Street</label><input value={form.street} onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))} /></div>
          <div className="admin-field"><label>Latitude</label><input type="number" step="any" value={form.latitude} onChange={(e) => setForm((p) => ({ ...p, latitude: e.target.value }))} /></div>
          <div className="admin-field"><label>Longitude</label><input type="number" step="any" value={form.longitude} onChange={(e) => setForm((p) => ({ ...p, longitude: e.target.value }))} /></div>
          <div className="admin-field"><label>Ghana digital address</label><input value={form.ghanaDigitalAddress} onChange={(e) => setForm((p) => ({ ...p, ghanaDigitalAddress: e.target.value }))} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>

      {msg ? <p style={{ marginTop: 12, color: msg.startsWith('Could') ? '#b91c1c' : '#0369a1', fontSize: '0.88rem' }}>{msg}</p> : null}
    </div>
  );
}
