import React, { useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../Auth/firebaseConfig';
import {
  NURSE_ACCOUNT_STATUS,
  NURSE_PRESENCE,
  HOME_CARE_SPECIALTIES,
} from '../../../constants/homeCareConstants';
import './AdminOnboardHomeCareNurse.css';

const _firebaseConfig = {
  apiKey: 'AIzaSyDHQSUvAww2Z0MMnNJcLyfiEDRgZB_aSpI',
  authDomain: 'teleehealth.firebaseapp.com',
  projectId: 'teleehealth',
  storageBucket: 'teleehealth.firebasestorage.app',
  messagingSenderId: '304333934237',
  appId: '1:304333934237:web:c0a08969be0671d72d0e74',
};
const secondaryApp = getApps().find((a) => a.name === 'secondary') || initializeApp(_firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

const INITIAL = {
  fullName: '',
  email: '',
  username: '',
  phone: '',
  password: '',
  specialty: 'General Nursing',
  licenseNumber: '',
  gender: '',
  feesDaily: '150',
  feesWeekly: '900',
  feesMonthly: '3200',
  approveNow: true,
};

export default function AdminOnboardHomeCareNurse() {
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [form, setForm] = useState(INITIAL);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || !form.password || !form.username.trim()) {
      setErrorMsg('Full name, email, username, and password are required.');
      return;
    }
    if (form.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
      const uid = cred.user.uid;

      await setDoc(doc(db, 'homeCareNurses', uid), {
        uid,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        phone: form.phone.trim(),
        specialty: form.specialty.trim(),
        specialties: [form.specialty.trim()],
        licenseNumber: form.licenseNumber.trim(),
        gender: form.gender,
        languages: ['English'],
        bio: '',
        fees: {
          daily: Number(form.feesDaily) || 0,
          weekly: Number(form.feesWeekly) || 0,
          monthly: Number(form.feesMonthly) || 0,
        },
        accountStatus: form.approveNow ? NURSE_ACCOUNT_STATUS.APPROVED : NURSE_ACCOUNT_STATUS.PENDING,
        presenceStatus: form.approveNow ? NURSE_PRESENCE.ONLINE : NURSE_PRESENCE.OFFLINE,
        ratingAvg: 0,
        ratingCount: 0,
        completedVisits: 0,
        mustChangePassword: true,
        availability: {
          workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          startHour: '08:00',
          endHour: '17:00',
        },
        role: 'homecare_nurse',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccessMsg(`Nurse account created. UID: ${uid}. They can sign in with email or username and will be prompted to change their password.`);
      setForm(INITIAL);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('This email is already registered.');
      } else {
        setErrorMsg(err.message || 'Failed to create nurse.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hc-onboard">
      <header className="hc-onboard-hero">
        <h1>Onboard Home-Care Nurse</h1>
        <p>
          Creates a Firebase Auth user and a <code>homeCareNurses</code> document (ID = UID).
          Approved nurses appear in patient browse when their status is online.
        </p>
      </header>

      {successMsg ? <div className="hc-onboard-alert hc-onboard-alert--success">{successMsg}</div> : null}
      {errorMsg ? <div className="hc-onboard-alert hc-onboard-alert--error">{errorMsg}</div> : null}

      <form className="hc-onboard-form" onSubmit={submit}>
        <div className="hc-onboard-sections">
          <section className="hc-onboard-section">
            <h2>Account credentials</h2>
            <div className="hc-onboard-grid">
              <div className="hc-onboard-field hc-onboard-field--full">
                <label>Full name <span className="req">*</span></label>
                <input
                  placeholder="e.g. Akosua Mensah"
                  value={form.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                  required
                />
              </div>
              <div className="hc-onboard-field">
                <label>Email <span className="req">*</span></label>
                <input
                  type="email"
                  placeholder="nurse@example.com"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  required
                />
              </div>
              <div className="hc-onboard-field">
                <label>Username <span className="req">*</span></label>
                <input
                  placeholder="login username"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                  required
                />
                <span className="hc-onboard-hint">Used for mobile / web login</span>
              </div>
              <div className="hc-onboard-field">
                <label>Phone</label>
                <input
                  placeholder="+233 …"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </div>
              <div className="hc-onboard-field">
                <label>Password <span className="req">*</span></label>
                <input
                  type="password"
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  required
                />
                <span className="hc-onboard-hint">Nurse must change on first login</span>
              </div>
            </div>
          </section>

          <section className="hc-onboard-section">
            <h2>Professional details</h2>
            <div className="hc-onboard-grid">
              <div className="hc-onboard-field">
                <label>Specialty</label>
                <select value={form.specialty} onChange={(e) => set('specialty', e.target.value)}>
                  {HOME_CARE_SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="hc-onboard-field">
                <label>Gender</label>
                <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="hc-onboard-field hc-onboard-field--full">
                <label>License number</label>
                <input
                  placeholder="Nursing council license ID"
                  value={form.licenseNumber}
                  onChange={(e) => set('licenseNumber', e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="hc-onboard-section">
            <h2>Reference fees (GHS)</h2>
            <p className="hc-onboard-hint" style={{ margin: '0 0 1rem' }}>
              Flat reference rates shown to patients; final payment is agreed with the nurse.
            </p>
            <div className="hc-onboard-grid hc-onboard-grid--3">
              <div className="hc-onboard-field">
                <label>Daily (per visit)</label>
                <input
                  type="number"
                  min="0"
                  value={form.feesDaily}
                  onChange={(e) => set('feesDaily', e.target.value)}
                />
              </div>
              <div className="hc-onboard-field">
                <label>Weekly</label>
                <input
                  type="number"
                  min="0"
                  value={form.feesWeekly}
                  onChange={(e) => set('feesWeekly', e.target.value)}
                />
              </div>
              <div className="hc-onboard-field">
                <label>Monthly</label>
                <input
                  type="number"
                  min="0"
                  value={form.feesMonthly}
                  onChange={(e) => set('feesMonthly', e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="hc-onboard-section">
            <h2>Visibility</h2>
            <label className="hc-onboard-check">
              <input
                type="checkbox"
                checked={form.approveNow}
                onChange={(e) => set('approveNow', e.target.checked)}
              />
              <div>
                <strong>Approve & set online immediately</strong>
                <span>Nurse appears in patient search right away. Uncheck to leave as pending review.</span>
              </div>
            </label>
          </section>
        </div>

        <div className="hc-onboard-actions">
          <button
            type="submit"
            className="hc-onboard-btn hc-onboard-btn--primary"
            disabled={saving}
          >
            {saving ? 'Creating account…' : 'Create nurse account'}
          </button>
        </div>
      </form>
    </div>
  );
}
