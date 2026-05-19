import React, { useCallback, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../Auth/firebaseConfig';
import {
  createEmergencyBooking,
  getCurrentLocationMobile,
  resolveBookingCoords,
  reverseGeocodeMobile,
} from '../../services/homeCareService';
import { CARE_TYPES, EMERGENCY_DISCLAIMER, BOOKING_FEE_DISCLAIMER } from '../../constants/homeCareConstants';
import { requireHomeCarePatient } from '../../utils/homeCarePatientAuth';
import { isValidEmergencyPhone } from '../../utils/homeCareUtils';
import './HomeCare.css';

export default function HomeCareEmergency() {
  const navigate = useNavigate();
  const [careType, setCareType] = useState('general');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [coords, setCoords] = useState(null);
  const [locLoading, setLocLoading] = useState(true);
  const [locFailed, setLocFailed] = useState(false);

  const detectLocation = useCallback(async () => {
    setLocLoading(true);
    setLocFailed(false);
    try {
      const loc = await getCurrentLocationMobile();
      if (!loc) {
        setLocFailed(true);
        return;
      }
      setCoords(loc);
      const label = await reverseGeocodeMobile(loc.latitude, loc.longitude);
      if (label) setAddress(label);
      else setLocFailed(true);
    } catch {
      setLocFailed(true);
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'auth', uid));
        if (snap.exists()) {
          const d = snap.data();
          const p = d.phone || d.phoneNumber || '';
          if (p) setPhone(String(p));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!requireHomeCarePatient(navigate, { returnTo: '/home-care/emergency' })) return;
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }
    const phoneTrim = phone.trim();
    if (!phoneTrim) {
      setError('Phone number is required so the nurse can reach you.');
      return;
    }
    if (!isValidEmergencyPhone(phoneTrim)) {
      setError('Enter a valid phone number (at least 8 digits).');
      return;
    }
    setSaving(true);
    try {
      const resolved = coords || (await resolveBookingCoords(address.trim(), null));
      const id = await createEmergencyBooking({
        careType,
        address: address.trim(),
        patientPhone: phoneTrim,
        latitude: resolved?.latitude ?? null,
        longitude: resolved?.longitude ?? null,
        patientLatitude: resolved?.latitude ?? null,
        patientLongitude: resolved?.longitude ?? null,
        specialNotes: notes.trim(),
        referenceFeeAmount: 0,
        referenceFeeLabel: 'Emergency (agreed with nurse)',
        feeDisclaimerAccepted: true,
      });
      navigate(`/home-care/booking/${id}`);
    } catch (err) {
      setError(err.message || 'Request failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hc-page">
      <p><Link to="/home-care">← Home Care</Link></p>
      <h1>Emergency request</h1>
      <p className="hc-card-meta">{EMERGENCY_DISCLAIMER}</p>
      <div className="hc-card hc-emergency" style={{ marginBottom: '1rem' }}>
        <strong>Urgent at-home care</strong>
        <p className="hc-card-meta" style={{ marginTop: 6 }}>
          Sent to approved online nurses within ~25 km. The first nurse to accept is assigned.
        </p>
      </div>
      <form className="hc-form hc-card" onSubmit={submit}>
        <label>Care type</label>
        <select value={careType} onChange={(e) => setCareType(e.target.value)}>
          {CARE_TYPES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <label>Your location *</label>
        {locLoading ? <p className="hc-loc-hint">Detecting your location…</p> : null}
        {!locLoading && locFailed ? (
          <p className="hc-loc-hint" style={{ color: '#b45309' }}>
            Could not detect location. Enter your address manually or click retry.
          </p>
        ) : null}
        {!locLoading && !locFailed && address ? (
          <p className="hc-loc-hint">Location detected — edit if needed.</p>
        ) : null}
        <input value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="Full address" />
        <div className="hc-loc-row">
          <button type="button" className="hc-btn hc-btn-outline" onClick={detectLocation} disabled={locLoading}>
            {locLoading ? 'Detecting…' : 'Use my location'}
          </button>
        </div>
        <label>Your phone number *</label>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="e.g. +233 24 000 0000"
        />
        <p className="hc-card-meta" style={{ marginTop: -6, marginBottom: 8 }}>
          Required for emergencies so an assigned nurse can call you.
        </p>
        <label>Details</label>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <p className="hc-disclaimer">{BOOKING_FEE_DISCLAIMER}</p>
        {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
        <button type="submit" className="hc-btn" style={{ background: '#b91c1c' }} disabled={saving}>
          {saving ? 'Sending…' : 'Send emergency request'}
        </button>
      </form>
    </div>
  );
}
