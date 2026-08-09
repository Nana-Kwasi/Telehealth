import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchNurseById, createBooking, resolveBookingCoords, fetchHomeCarePatientProfile } from '../../services/homeCareService';
import { CARE_TYPES, DURATION_TYPES, BOOKING_FEE_DISCLAIMER, PACKAGE_DURATION_TYPES } from '../../constants/homeCareConstants';
import { feeForDuration, formatGhs, isValidEmergencyPhone } from '../../utils/homeCareUtils';
import HomeCareAddressField from './HomeCareAddressField';
import { auth } from '../../services/firestoreShim';
import './HomeCare.css';

export default function HomeCareBook() {
  const { nurseId } = useParams();
  const navigate = useNavigate();
  const [nurse, setNurse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [durationType, setDurationType] = useState('daily');
  const [careType, setCareType] = useState('general');
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [feeOk, setFeeOk] = useState(false);
  const [cancelOk, setCancelOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setNurse(await fetchNurseById(nurseId));
      } finally {
        setLoading(false);
      }
    })();
  }, [nurseId]);

  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const p = await fetchHomeCarePatientProfile(uid);
        if (p.phone) setPatientPhone(p.phone);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (durationType === 'daily') setEndDate('');
  }, [durationType]);

  const fee = nurse ? feeForDuration(nurse, durationType) : { amount: 0, label: '' };
  const todayStr = new Date().toISOString().split('T')[0];

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!address.trim() || !startDate.trim()) {
      setError('Address and start date are required.');
      return;
    }
    if (PACKAGE_DURATION_TYPES.includes(durationType) && !endDate.trim()) {
      setError('Expected end date is required for packaged care (weekly / monthly / yearly).');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    if (!isValidEmergencyPhone(patientPhone)) {
      setError('Enter a valid phone number (at least 8 digits) so your nurse can reach you.');
      return;
    }
    if (!feeOk || !cancelOk) {
      setError('Please accept the fee and cancellation acknowledgements.');
      return;
    }
    setSaving(true);
    try {
      const coords = await resolveBookingCoords(address.trim(), null);
      const id = await createBooking({
        nurseId: nurse.id,
        nurseName: nurse.fullName,
        durationType,
        careType,
        address: address.trim(),
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        patientLatitude: coords?.latitude ?? null,
        patientLongitude: coords?.longitude ?? null,
        startDate: startDate.trim(),
        endDate: endDate.trim() || null,
        specialNotes: notes.trim(),
        referenceFeeAmount: fee.amount,
        referenceFeeLabel: fee.label,
        feeDisclaimerAccepted: true,
        cancellationPolicyAccepted: true,
        patientPhone: patientPhone.trim(),
      });
      navigate(`/home-care/booking/${id}`);
    } catch (err) {
      setError(err.message || 'Booking failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="hc-empty hc-page">Loading…</p>;
  if (!nurse) return <p className="hc-empty hc-page">Nurse not found.</p>;

  return (
    <div className="hc-page">
      <p><Link to={`/home-care/nurse/${nurseId}`}>← Back</Link></p>
      <h1>Book {nurse.fullName}</h1>
      <form className="hc-form" onSubmit={submit}>
        <label>Duration</label>
        <select value={durationType} onChange={(e) => setDurationType(e.target.value)}>
          {DURATION_TYPES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <p className="hc-disclaimer">Reference: {formatGhs(fee.amount)} {fee.label}. {BOOKING_FEE_DISCLAIMER}</p>

        <label>Care type</label>
        <select value={careType} onChange={(e) => setCareType(e.target.value)}>
          {CARE_TYPES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <label>Your phone *</label>
        <input
          type="tel"
          autoComplete="tel"
          placeholder="Include country code if applicable"
          value={patientPhone}
          onChange={(e) => setPatientPhone(e.target.value)}
          required
        />
        <p className="hc-disclaimer">We share this number with your nurse when they accept the booking.</p>

        <HomeCareAddressField
          address={address}
          onAddressChange={setAddress}
          coords={addressCoords}
          onCoordsChange={setAddressCoords}
          detectOnMount
        />

        <label>Start date *</label>
        <input
          type="date"
          value={startDate}
          min={todayStr}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />

        {(PACKAGE_DURATION_TYPES.includes(durationType)) ? (
          <>
            <label>Expected end date *</label>
            <input
              type="date"
              value={endDate}
              min={startDate || todayStr}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </>
        ) : null}

        <label>Special notes</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <label><input type="checkbox" checked={feeOk} onChange={(e) => setFeeOk(e.target.checked)} /> I understand this is a reference fee only.</label>
        <label><input type="checkbox" checked={cancelOk} onChange={(e) => setCancelOk(e.target.checked)} /> I accept the cancellation policy.</label>

        {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
        <button type="submit" className="hc-btn" disabled={saving} style={{ marginTop: '1rem' }}>
          {saving ? 'Submitting…' : 'Submit booking request'}
        </button>
      </form>
    </div>
  );
}
