import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../Auth/firebaseConfig';
import useAddressAutofill from '../../hooks/useAddressAutofill';

function roleTarget(role, profile) {
  const id = profile?.id || auth.currentUser?.uid || null;
  if (!id) return null;
  if (role === 'admin') return { collection: 'admins', id };
  if (role === 'doctor') return { collection: 'doctors', id };
  if (role === 'therapist') return { collection: 'therapists', id };
  if (role === 'pharmacy') return { collection: 'pharmacies', id };
  if (role === 'branch_user') return { collection: 'pharmacyBranches', id };
  if (role === 'lab') return { collection: 'labs', id };
  if (role === 'scan') return { collection: 'scanCenters', id };
  if (role === 'lab_branch') return { collection: 'labBranches', id };
  if (role === 'scan_branch') return { collection: 'scanBranches', id };
  return { collection: 'auth', id: auth.currentUser?.uid || id };
}

function hasLocationData(data) {
  if (!data) return false;
  const lat = Number(data?.latitude ?? data?.locationMeta?.latitude ?? data?.location?.latitude);
  const lng = Number(data?.longitude ?? data?.locationMeta?.longitude ?? data?.location?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return true;
  return !!(data?.country || data?.city || data?.area || data?.region || data?.street);
}

export default function DashboardLocationGate({ role, profile, activePath = '' }) {
  const [checking, setChecking] = useState(true);
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();
  const [form, setForm] = useState({
    country: '', city: '', area: '', region: '', street: '', ghanaDigitalAddress: '', latitude: '', longitude: '',
  });

  const target = useMemo(() => roleTarget(role, profile), [role, profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!role || !activePath.startsWith('/dashboard') || !target) {
        setChecking(false);
        setRequired(false);
        return;
      }
      setChecking(true);
      try {
        const snap = await getDoc(doc(db, target.collection, target.id));
        const data = snap.exists() ? snap.data() : {};
        if (!cancelled) {
          setForm((f) => ({
            ...f,
            country: data?.country || data?.locationMeta?.country || '',
            city: data?.city || data?.locationMeta?.city || '',
            area: data?.area || data?.locationMeta?.area || '',
            region: data?.region || data?.locationMeta?.region || '',
            street: data?.street || data?.locationMeta?.street || '',
            ghanaDigitalAddress: data?.ghanaDigitalAddress || '',
            latitude: data?.latitude ?? data?.locationMeta?.latitude ?? '',
            longitude: data?.longitude ?? data?.locationMeta?.longitude ?? '',
          }));
          setRequired(!hasLocationData(data));
        }
      } catch {
        if (!cancelled) setRequired(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [role, target, activePath]);

  const saveLocation = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      const latitude = Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null;
      const longitude = Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null;
      const payload = {
        country: form.country || null,
        city: form.city || null,
        area: form.area || null,
        region: form.region || null,
        street: form.street || null,
        ghanaDigitalAddress: form.ghanaDigitalAddress || null,
        latitude,
        longitude,
        locationMeta: {
          country: form.country || null,
          city: form.city || null,
          area: form.area || null,
          region: form.region || null,
          street: form.street || null,
          latitude,
          longitude,
        },
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, target.collection, target.id), payload, { merge: true });
      if (role === 'client' || profile?.userIntent === 'medical') {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await setDoc(doc(db, 'auth', uid), payload, { merge: true }).catch(() => {});
          await setDoc(doc(db, 'patientProfiles', uid), payload, { merge: true }).catch(() => {});
        }
      }
      setRequired(false);
    } catch {
      setError('Could not save location now. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (checking || !required) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 620, background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '1rem 1rem 1.1rem' }}>
        <h3 style={{ margin: '0 0 0.35rem', color: '#0f172a' }}>Complete Location Setup</h3>
        <p style={{ margin: '0 0 0.65rem', color: '#64748b', fontSize: '0.85rem' }}>
          Location access helps us provide better services like nearby pharmacies, labs, and doctors. You can continue manually, but some features may be limited.
        </p>
        <div style={{ marginBottom: '0.7rem', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => detectAddress((loc) => {
            setForm((f) => ({
              ...f,
              country: loc.countryCode || f.country,
              city: loc.city || f.city,
              area: loc.area || f.area,
              region: loc.region || f.region,
              street: loc.street || f.street,
              latitude: loc.latitude ?? f.latitude,
              longitude: loc.longitude ?? f.longitude,
            }));
          })}>{locating ? 'Detecting…' : 'Use current location'}</button>
          {locationMsg ? <span style={{ color: '#64748b', fontSize: '0.76rem' }}>{locationMsg}</span> : null}
        </div>
        <div className="admin-form-grid">
          {[
            ['Country', 'country', 'e.g. GH'],
            ['City', 'city', 'e.g. Accra'],
            ['Area / Locality', 'area', 'e.g. East Legon'],
            ['Region / State', 'region', 'e.g. Greater Accra'],
            ['Street', 'street', 'e.g. Liberation Road'],
            ['Ghana Digital Address (optional)', 'ghanaDigitalAddress', 'e.g. GA-123-4567'],
            ['Latitude', 'latitude', 'Auto-detected'],
            ['Longitude', 'longitude', 'Auto-detected'],
          ].map(([label, key, placeholder]) => (
            <label key={key} className="admin-field">
              <span>{label}</span>
              <input value={form[key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} />
            </label>
          ))}
        </div>
        {error ? <p style={{ margin: '0.55rem 0 0', color: '#b91c1c', fontSize: '0.8rem' }}>{error}</p> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.8rem' }}>
          <button className="btn btn-primary" onClick={saveLocation} disabled={saving}>{saving ? 'Saving…' : 'Save Location'}</button>
        </div>
      </div>
    </div>
  );
}
