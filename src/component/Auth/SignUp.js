import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from './firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import './SignUp.css';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
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

      // Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid = cred.user.uid;

      // Get the client ID from localStorage (set during questionnaire completion)
      const clientId = localStorage.getItem('th.clientId');

      // Determine user intent — medical if they came through doctor booking flow or skipped intake
      const pendingBookingRaw = localStorage.getItem('th.pendingBooking');
      const medicalSkip = localStorage.getItem('th.medicalSkip');
      const userIntent = (pendingBookingRaw || medicalSkip) ? 'medical' : 'therapy';

      // Create user profile in auth collection
      const userProfile = {
        uid,
        name: form.name,
        email: form.email,
        role: 'client',
        userIntent,
        clientId: clientId,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'auth', uid), userProfile);
      
      // Update the client document with the auth UID and proper name
      if (clientId) {
        await setDoc(doc(db, 'clients', clientId), {
          authUid: uid,
          displayName: form.name,
          clientName: form.name,
          status: 'pending',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      
      // If there's a pending doctor booking, create it now and go straight to dashboard
      if (pendingBookingRaw) {
        const booking = JSON.parse(pendingBookingRaw);
        const apptData = {
          doctorId: booking.doctorId,
          doctorName: booking.doctorName || 'Doctor',
          doctorSpecialization: booking.doctorSpecialization || '',
          clientId: uid,
          clientName: form.name,
          clientEmail: form.email,
          date: booking.date || '',
          time: booking.time || '',
          consultationType: booking.consultationType || 'video',
          reason: booking.reason || '',
          status: 'pending',
          sourceSlot: 'pre-signup',
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'doctorAppointments'), apptData);
        // Register patient in doctor's subcollection
        await setDoc(doc(db, 'doctors', booking.doctorId, 'patients', uid), {
          patientId: uid,
          name: form.name,
          email: form.email,
          addedAt: serverTimestamp(),
        }, { merge: true });
        // Store doctor info for immediate display on dashboard home
        sessionStorage.setItem('th.lastBookedDoctor', JSON.stringify({
          doctorName: booking.doctorName,
          specialization: booking.doctorSpecialization || '',
          date: booking.date,
          time: booking.time,
        }));
        localStorage.removeItem('th.pendingBooking');
        navigate('/dashboard');
      } else if (medicalSkip) {
        localStorage.removeItem('th.medicalSkip');
        navigate('/dashboard');
      } else {
        navigate('/payment');
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
            <p className="signup-subtitle">Complete your profile to get matched with a therapist</p>

            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label" htmlFor="su-name">Full Name</label>
                <input id="su-name" className="form-input" placeholder="Jane Doe"
                  value={form.name} onChange={e => onChange('name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="su-email">Email</label>
                <input id="su-email" className="form-input" type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => onChange('email', e.target.value)} required />
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


