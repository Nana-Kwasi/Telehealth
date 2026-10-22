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
import {
  findUserByUsernameOrEmail,
  signInWithEmailOrUsername,
  completeTwoFactorSignIn,
  performLogout,
  refreshSession,
} from './authService';
import { getStoredUserId } from '../../services/apiClient';
import { chooseService, markContinuingJourney } from '../../utils/careServices';

const EXISTS_RE = /already (exists|registered|in use)/i;

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
    email: location.state?.email || clientData?.email || '',
    // Collected on every signup so the admin user-detail screen has a phone for
    // each account, and so care staff can reach the person.
    phone: clientData?.phone || clientData?.phoneNumber || '',
    password: '',
  });
  // One account covers medical care and therapy. When the email already has an
  // account the form turns into a sign-in, and the journey (intake, couples
  // link, doctor booking) is attached to that account instead of a new one.
  const [mode, setMode] = useState('create'); // 'create' | 'login'
  const [challenge, setChallenge] = useState(null); // two-step sign-in in progress
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const switchToLogin = () => {
    setMode('login');
    setError('');
    setForm((f) => ({ ...f, password: '' }));
  };

  // Spot an existing account as soon as the email is typed, before they fill in
  // a name and password for an account that cannot be created.
  const checkEmail = async () => {
    const email = form.email.trim().toLowerCase();
    if (mode !== 'create' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    const found = await findUserByUsernameOrEmail(email);
    if (String(found?.email || '').toLowerCase() === email) switchToLogin();
  };

  // Which service this sign-up is for — medical if they came through the doctor
  // booking flow or skipped intake. The backend derives a NEW account's role from
  // it (PATIENT → medical, CLIENT → therapy). Registering every signup as CLIENT
  // sent doctor-booking patients to the therapy dashboard.
  const journey = () => {
    const pendingBookingRaw = localStorage.getItem('th.pendingBooking');
    const medicalSkip = localStorage.getItem('th.medicalSkip');
    const homecareIntent = localStorage.getItem('userIntent') === 'homecare';
    const coupleId = clientData?.coupleId || localStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
    const isCouple = clientData?.therapyType === 'couples' || !!coupleId;
    const userIntent = isCouple
      ? 'therapy'
      : homecareIntent
        ? 'homecare'
        : pendingBookingRaw || medicalSkip
          ? 'medical'
          : 'therapy';
    return {
      pendingBookingRaw, medicalSkip, homecareIntent, coupleId, isCouple, userIntent,
      couplePartnerRole:
        clientData?.couplePartnerRole || localStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole) || 'partnerA',
      // Read before any sign-in: signing in clears the previous user's th.clientId.
      clientId: localStorage.getItem('th.clientId'),
    };
  };

  const createAccount = async (j) => {
    const regRole = j.userIntent === 'medical' ? 'PATIENT' : 'CLIENT';
    // 4th/5th args are the shim's displayName + role passthroughs — without them
    // the account is stored under the email's local-part and always as CLIENT.
    const cred = await createUserWithEmailAndPassword(auth, form.email, form.password, form.name, regRole, form.phone?.trim());
    const uid = cred.user.uid;

    // Create user profile in auth collection
    await setDoc(doc(db, 'auth', uid), {
      uid,
      name: form.name,
      email: form.email,
      role: 'client',
      userIntent: j.userIntent,
      clientId: j.clientId,
      coupleId: j.isCouple ? j.coupleId : undefined,
      couplePartnerRole: j.isCouple ? j.couplePartnerRole : undefined,
      therapyType: j.isCouple ? 'couples' : undefined,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    // Create the patient/client profile row. Without it GET /api/v1/patients/{id}
    // answers 400 "Patient not found", which blanks the name/email on the doctor's
    // patient screens and breaks the client dashboard's profile read. The PATCH
    // creates the row when missing. Home care keeps its own onboarding.
    //
    // Always keyed by `uid`, never `clientId`: patients/{id} is addressed by USER
    // id everywhere that reads it (fetchClientData, the doctor's patient screens),
    // whereas th.clientId is a therapy-clients document id from a different
    // namespace — writing under it created no usable profile at all.
    if (!j.homecareIntent) {
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
    return { uid, name: form.name, email: form.email, phone: form.phone?.trim() };
  };

  // Signed in to an existing account from the account step.
  const existingAccount = ({ role, profile }) => {
    if (role !== 'client') {
      // A doctor/therapist/staff login is not a patient account; don't attach
      // someone's therapy intake or booking to it.
      performLogout().catch(() => {});
      throw new Error('This email belongs to a NessaHub staff account. Please use a different email for your own care.');
    }
    return {
      uid: getStoredUserId() || profile?.id || profile?.uid,
      name: profile?.fullName || profile?.name || form.name,
      email: profile?.email || form.email,
      // Only overwrite the stored phone when they typed one.
      phone: form.phone?.trim() || undefined,
    };
  };

  // Everything after the account exists — the same for a new account and an
  // existing one: save the therapy intake, link the couple, create the doctor
  // booking, then land in the flow they started.
  const continueJourney = async (j, person) => {
    const { uid } = person;
    let clientId = j.clientId;
    const { coupleId, isCouple, couplePartnerRole, userIntent } = j;

    // Open the dashboard for the service they just used, and refresh the
    // session so it reflects that (an existing account was resolved before).
    if (userIntent === 'medical' || userIntent === 'therapy') {
      chooseService(uid, userIntent);
      refreshSession();
    }

    if (isCouple && !clientId && coupleId) {
      clientId = await createPartnerClientRecord(
        coupleId,
        couplePartnerRole,
        person.email.toLowerCase(),
        person.name,
        uid,
      );
      localStorage.setItem('th.clientId', clientId);
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
      const phone = person.phone || intake.phone;
      const clientDoc = {
        ...intake,
        authUid: uid,
        displayName: person.name,
        clientName: person.name,
        name: person.name,
        email: person.email,
        ...(phone ? { phone } : {}),
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
        name: person.name,
      });
      localStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, coupleId);
      localStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, couplePartnerRole);
      localStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, person.name.trim());
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
    if (j.pendingBookingRaw) {
      const booking = JSON.parse(j.pendingBookingRaw);
      await materializePendingBooking(booking, {
        userId: uid,
        name: person.name,
        email: person.email,
      });
      navigate('/dashboard');
    } else if (j.medicalSkip) {
      localStorage.removeItem('th.medicalSkip');
      navigate('/dashboard');
    } else if (j.homecareIntent) {
      navigate('/home-care');
    } else {
      // Therapy clients choose their therapist first, then pay that therapist's
      // session rate on the payment screen.
      navigate('/match-therapist');
    }
  };

  const fail = (e) => {
    console.error('Sign up error:', e);
    const msg = String(e?.message || '');
    // Handle specific Firebase offline errors
    if (msg.includes('offline') || msg.includes('Failed to get document')) {
      setError('You are currently offline. Please check your internet connection and try again.');
    } else if (e.code === 'auth/weak-password') {
      setError('Password should be at least 6 characters long.');
    } else {
      setError(msg || (mode === 'login' ? 'Sign in failed' : 'Sign up failed'));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    markContinuingJourney(true);
    try {
      // Check if we're online
      if (!navigator.onLine) {
        throw new Error('You are currently offline. Please check your internet connection and try again.');
      }
      const j = journey();
      if (mode === 'login') {
        const result = await signInWithEmailOrUsername(form.email.trim(), form.password);
        if (result?.twoFactorRequired) {
          setChallenge({ ...result, journey: j });
          setCode('');
          return;
        }
        await continueJourney(j, existingAccount(result));
        return;
      }
      let person;
      try {
        person = await createAccount(j);
      } catch (err) {
        if (EXISTS_RE.test(String(err?.message || ''))) { switchToLogin(); return; }
        throw err;
      }
      await continueJourney(j, person);
    } catch (err) {
      fail(err);
    } finally {
      markContinuingJourney(false);
      setLoading(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    markContinuingJourney(true);
    try {
      const result = await completeTwoFactorSignIn(challenge.challengeId, code);
      await continueJourney(challenge.journey, existingAccount(result));
    } catch (err) {
      setError(err.message || 'That code did not work. Check it and try again.');
    } finally {
      markContinuingJourney(false);
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

            <h1 className="signup-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="signup-subtitle">
              {mode === 'login'
                ? 'You already have a NessaHub account with this email. Sign in to continue — your medical and therapy care share one account.'
                : coupleInviteSubtitle || 'Complete your profile to get matched with a therapist'}
            </p>

            {challenge ? (
              <form onSubmit={submitCode}>
                <p className="signup-subtitle">
                  Two-step sign-in is on. We sent a 6-digit code to <strong>{challenge.email}</strong>.
                </p>
                <div className="form-group">
                  <label className="form-label" htmlFor="su-code">Verification code</label>
                  <input id="su-code" className="form-input" inputMode="numeric" autoComplete="one-time-code"
                    placeholder="123456" maxLength={8} value={code} autoFocus required
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
                </div>
                {error && <div className="error-message">{error}</div>}
                <button className="signup-button" type="submit" disabled={loading || code.length < 4}>
                  {loading ? 'Verifying…' : 'Verify and continue'}
                </button>
              </form>
            ) : (
            <form onSubmit={submit}>
              {mode === 'create' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="su-name">Full Name</label>
                  <input id="su-name" className="form-input" placeholder="Jane Doe"
                    value={form.name} onChange={e => onChange('name', e.target.value)} required />
                </div>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="su-email">Email</label>
                <input id="su-email" className="form-input" type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => onChange('email', e.target.value)} onBlur={checkEmail}
                  required readOnly={lockEmail} />
              </div>
              {mode === 'create' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="su-phone">Phone Number</label>
                  <input id="su-phone" className="form-input" type="tel" placeholder="e.g. 0243899834"
                    value={form.phone} onChange={e => onChange('phone', e.target.value)} required />
                </div>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="su-password">Password</label>
                <input id="su-password" className="form-input" type="password"
                  placeholder={mode === 'login' ? 'Your NessaHub password' : 'At least 6 characters'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  autoFocus={mode === 'login'}
                  value={form.password} onChange={e => onChange('password', e.target.value)} required />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button className="signup-button" type="submit" disabled={loading}>
                {mode === 'login'
                  ? (loading ? 'Signing in…' : 'Sign in and continue')
                  : (loading ? 'Creating account…' : 'Create account')}
              </button>
            </form>
            )}

            <div className="signup-links">
              {mode === 'login' ? (
                <>
                  <Link to="/reset-password" className="signup-link">Forgot password?</Link>
                  {!lockEmail && (
                    <>
                      {' · '}
                      <button type="button" className="signup-link"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
                        onClick={() => { setMode('create'); setChallenge(null); setError(''); }}>
                        Use a different email
                      </button>
                    </>
                  )}
                </>
              ) : (
                <button type="button" className="signup-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
                  onClick={switchToLogin}>
                  Already have an account? Sign in
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


