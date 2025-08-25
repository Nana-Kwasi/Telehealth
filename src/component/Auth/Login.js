import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailOrUsername } from './authService';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailOrUsername(id, password);
      navigate('/dashboard');
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Login</h1>
        <p className="login-subtitle">Welcome back! Please sign in to your account.</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <div className="form-label">Email or Username</div>
            <input className="form-input" value={id} onChange={(e) => setId(e.target.value)} required />
          </div>
          <div className="form-group">
            <div className="form-label">Password</div>
            <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error ? <div className="error-message">{error}</div> : null}
          <button className="login-button" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="login-links">
          <Link to="/" className="login-link">New user? Start with questionnaire</Link>
        </div>
      </div>
    </div>
  );
}


