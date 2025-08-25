import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from './firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import './SignUp.css';
import { doc, setDoc } from 'firebase/firestore';

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
      // Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid = cred.user.uid;
      
      // Get the client ID from localStorage (set during questionnaire completion)
      const clientId = localStorage.getItem('th.clientId');
      
      // Create user profile in auth collection
      const userProfile = { 
        uid, 
        name: form.name, 
        email: form.email, 
        role: 'client',
        clientId: clientId, // Link to the client document
        createdAt: new Date().toISOString() 
      };
      
      await setDoc(doc(db, 'auth', uid), userProfile);
      
      // Navigate to payment
      navigate('/payment');
    } catch (e) {
      setError(e.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <h1 className="signup-title">Create your account</h1>
        <p className="signup-subtitle">Complete your profile to get matched with a therapist</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <div className="form-label">Full name</div>
            <input className="form-input" value={form.name} onChange={(e) => onChange('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <div className="form-label">Email</div>
            <input className="form-input" type="email" value={form.email} onChange={(e) => onChange('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <div className="form-label">Password</div>
            <input className="form-input" type="password" value={form.password} onChange={(e) => onChange('password', e.target.value)} required />
          </div>
          {error ? <div className="error-message">{error}</div> : null}
          <button className="signup-button" type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>
        <div className="signup-links">
          <Link to="/login" className="signup-link">Already have an account? Sign in</Link>
        </div>
      </div>
    </div>
  );
}


