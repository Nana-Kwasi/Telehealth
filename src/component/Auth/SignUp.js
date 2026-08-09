import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { auth, db } from '../../services/firestoreShim';
import { createUserWithEmailAndPassword } from '../../services/authShim';
import './SignUp.css';
import { doc, setDoc } from '../../services/firestoreShim';
import { COUPLE_STORAGE_KEYS } from '../../utils/coupleTherapyConfig';
import { materializePendingBooking } from '../../utils/pendingDoctorBooking';
import {
  createPartnerClientRecord,
  linkCouplePartnerAuth,
} from '../../services/coupleTherapyService';

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const clientData = location.state?.clientData;
  const lockEmail = clientData?.lockEmail;
  const coupleInviteSubtitle =
    clientData?.therapyType === 'couples' && clientData?.couplePartnerRole === 'partnerB'
      ? `${clientData?.invitePartnerName || 'Your partner'} invited you to couples therapy. Create your own login — your intake answers stay private.`
      : null;

  const [form, setForm] = useState({
    name: clientData?.name || clientData?.displayName || '',
    email: clientData?.email || '',
    // Collected on every signup so the admin user-detail screen has a phone for
    // each account, and so care staff can reach the person.
    phone: clientData?.phone || clientData?.phoneNumber || '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // Check if we're online
      if (!navigator.onLine) {
        throw new Error('You are currently offline. Please check your internet connection and try again.');
      }

      // Determine user intent BEFORE registering — medical if they came through the
      // doctor booking flow or skipped intake. The backend derives the account's
      // intent from its role (PATIENT → medical, CLIENT → therapy) and resolve-role
      // reports that back to App.js, which picks the dashboard. Registering every
      // signup as CLIENT sent doctor-booking patients to the therapy dashboard.
      const pendingBookingRaw = localStorage.getItem('th.pendingBooking');
      const medicalSkip = localStorage.getItem('th.medicalSkip');
      const homecareIntent = localStorage.getItem('userIntent') === 'homecare';
      const earlyCoupleId = clientData?.coupleId || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
      const isCouple = clientData?.therapyType === 'couples' || !!earlyCoupleId;
      const userIntent = isCouple
        ? 'therapy'
        : homecareIntent
          ? 'homecare'
          : pendingBookingRaw || medicalSkip
            ? 'medical'
            : 'therapy';
      const regRole = userIntent === 'medical' ? 'PATIENT' : 'CLIENT';

      // Create Firebase Auth user
      // 4th/5th args are the shim's displayName + role passthroughs — without them
      // the account is stored under the email's local-part and always as CLIENT.
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password, form.name, regRole, form.phone?.trim());
      const uid = cred.user.uid;

      let clientId = localStorage.getItem('th.clientId');
      const coupleId = earlyCoupleId;
      const couplePartnerRole =
        clientData?.couplePartnerRole || localStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole) || 'partnerA';

      if (isCouple && !clientId && coupleId) {
        clientId = await createPartnerClientRecord(
          coupleId,
          couplePartnerRole,
          form.email.toLowerCase(),
          form.name,
          uid,
        );
        localStorage.setItem('th.clientId', clientId);
      }

      // Create user profile in auth collection
      const userProfile = {
        uid,
        name: form.name,
        email: form.email,
        role: 'client',
        userIntent,
        clientId: clientId,
        coupleId: isCouple ? coupleId : undefined,
        couplePartnerRole: isCouple ? couplePartnerRole : undefined,
        therapyType: isCouple ? 'couples' : undefined,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'auth', uid), userProfile);

      // Create the patient/client profile row. Without it GET /api/v1/patients/{id}
      // answers 400 "Patient not found", which blanks the name/email on the doctor's
      // patient screens and breaks the client dashboard's profile read. The PATCH
      // creates the row when missing. Home care keeps its own onboarding.
      //
      // Always keyed by `uid`, never `clientId`: patients/{id} is addressed by USER
      // id everywhere that reads it (fetchClientData, the doctor's patient screens),
      // whereas th.clientId is a therapy-clients document id from a different
      // namespace — writing under it created no usable profile at all.
      if (!homecareIntent) {
        try {
          await setDoc(doc(db, 'patientProfiles', uid), {
            fullName: form.name,
            email: form.email.toLowerCase(),
            status: 'active',
          }, { merge: true });
        } catch (profileErr) {
          console.warn('Could not create patient profile:', profileErr?.message);
        }
      }

      // Create/refresh the therapy client record. The intake questionnaire runs
      // before the visitor has a token, so its answers were parked in
      // `th.clientIntake`; write them now, keyed by the auth uid.
      //
      // The client profile is addressed by USER id, like patientProfiles. The old
      // code keyed it by `th.clientId`, which the questionnaire had set to a
      // throwaway `tmp_…` value — so this PATCH hit a non-existent record and the
      // admin client screens showed a near-empty profile.
      if (userIntent === 'therapy') {
        let intake = {};
        try { intake = JSON.parse(localStorage.getItem('th.clientIntake') || '{}'); } catch { /* ignore */ }
        const clientDoc = {
          ...intake,
          authUid: uid,
          displayName: form.name,
          clientName: form.name,
          name: form.name,
          email: form.email,
          phone: form.phone?.trim() || intake.phone || '',
          therapyType: isCouple ? 'couples' : (intake.therapyType || undefined),
          coupleId: isCouple ? coupleId : undefined,
          couplePartnerRole: isCouple ? couplePartnerRole : undefined,
          status: 'active',
          updatedAt: new Date().toISOString(),
        };
        try {
          await setDoc(doc(db, 'clients', uid), clientDoc, { merge: true });
          localStorage.setItem('th.clientId', uid);
          localStorage.removeItem('th.clientIntake');
        } catch (clientErr) {
          console.warn('Could not save client intake:', clientErr?.message);
        }
      }

      if (isCouple && coupleId) {
        await linkCouplePartnerAuth(coupleId, couplePartnerRole, {
          authUid: uid,
          clientId: clientId || uid,
          name: form.name,
        });
        localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, coupleId);
        localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, couplePartnerRole);
        localStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, form.name.trim());
        localStorage.setItem('th.clientId', clientId || uid);
        localStorage.setItem(
          'th.onboard',
          JSON.stringify({ therapyType: 'couples', coupleId, startedAt: new Date().toISOString() }),
        );
        navigate('/couple/intake', {
          replace: true,
          state: { coupleId, partnerRole: couplePartnerRole },
        });
        return;
      }
      
      // If there's a pending doctor booking, create it now and go straight to
      // dashboard. `th.pendingBooking` is deliberately NOT cleared here — only
      // materializePendingBooking clears it, and only once the appointment row
      // exists. If this write fails the intent survives and the medical
      // dashboard completes it on mount, instead of the patient silently
      // arriving with no doctor and having to book all over again.
      if (pendingBookingRaw) {
        const booking = JSON.parse(pendingBookingRaw);
        await materializePendingBooking(booking, {
          userId: uid,
          name: form.name,
          email: form.email,
        });
        navigate('/dashboard');
      } else if (medicalSkip) {
        localStorage.removeItem('th.medicalSkip');
        navigate('/dashboard');
      } else if (homecareIntent) {
        navigate('/home-care');
      } else {
        // Therapy clients choose their therapist first, then pay that therapist's
        // session rate on the payment screen.
        navigate('/match-therapist');
      }
    } catch (e) {
      console.error('Sign up error:', e);
      
      // Handle specific Firebase offline errors
      if (e.message.includes('offline') || e.message.includes('Failed to get document')) {
        setError('You are currently offline. Please check your internet connection and try again.');
      } else if (e.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please try logging in instead.');
      } else if (e.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters long.');
      } else {
        setError(e.message || 'Sign up failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page">

      {/* ── Brand panel ── */}
      <div className="signup-brand-panel">
        <div className="signup-brand-content">
          <div className="signup-brand-logo">
            <div className="signup-brand-logo-mark">N</div>
            <span className="signup-brand-logo-name">NessaHub</span>
          </div>
          <h2 className="signup-brand-headline">
            Start your<br />wellness journey.
          </h2>
          <p className="signup-brand-sub">
            Join thousands of people who found the right therapist or doctor through NessaHub.
          </p>
          <div className="signup-checklist">
            {['Matched with a licensed professional in minutes', 'Private & secure sessions', 'Flexible scheduling on your terms', 'Therapy & medical care in one app'].map(item => (
              <div key={item} className="signup-check-item">
                <div className="signup-check-icon">✓</div>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className="signup-form-panel">
        <div className="signup-container">
          <div className="signup-card">

            <div className="signup-card-logo">
              <div className="signup-card-logo-mark">N</div>
              <span className="signup-card-logo-name">NessaHub</span>
            </div>

            <h1 className="signup-title">Create your account</h1>
            <p className="signup-subtitle">
              {coupleInviteSubtitle || 'Complete your profile to get matched with a therapist'}
            </p>

            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label" htmlFor="su-name">Full Name</label>
                <input id="su-name" className="form-input" placeholder="Jane Doe"
                  value={form.name} onChange={e => onChange('name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="su-email">Email</label>
                <input id="su-email" className="form-input" type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => onChange('email', e.target.value)} required readOnly={lockEmail} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="su-phone">Phone Number</label>
                <input id="su-phone" className="form-input" type="tel" placeholder="e.g. 0243899834"
                  value={form.phone} onChange={e => onChange('phone', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="su-password">Password</label>
                <input id="su-password" className="form-input" type="password" placeholder="At least 6 characters"
                  value={form.password} onChange={e => onChange('password', e.target.value)} required />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button className="signup-button" type="submit" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <div className="signup-links">
              <Link to="/login" className="signup-link">Already have an account? Sign in</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


