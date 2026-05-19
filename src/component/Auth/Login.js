import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signInWithEmailOrUsername } from './authService';
import { logAction, A } from '../../utils/auditLogger';
import { ensureHomeCareIntent, homeCarePatientLandingPath, isHomeCarePatientIntent } from '../../utils/homeCarePatientIntent';
import { resolveCoupleLandingPath } from '../../services/coupleTherapyService';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { role, profile } = await signInWithEmailOrUsername(id, password);
      await logAction(A.LOGIN_SUCCESS, { role, identifier: id }, role);
      const returnTo = location.state?.returnTo;
      const homeCare = isHomeCarePatientIntent(profile);
      if (homeCare) ensureHomeCareIntent();
      if (role === 'homecare_nurse') {
        navigate('/dashboard', { replace: true });
      } else if (role === 'client' && homeCare) {
        navigate(returnTo || homeCarePatientLandingPath(), { replace: true });
      } else if (role === 'client') {
        const coupleLanding = await resolveCoupleLandingPath(profile);
        if (coupleLanding) {
          navigate(coupleLanding.path, { replace: true, state: coupleLanding.state });
        } else if (returnTo && returnTo !== '/dashboard') {
          navigate(returnTo, { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } else if (returnTo) {
        navigate(returnTo, { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      await logAction(A.LOGIN_FAILED, { error: err.message, identifier: id });
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">

      {/* ── Brand panel (visible ≥ 900px) ── */}
      <div className="login-brand-panel">
        <div className="login-brand-content">
          <div className="login-brand-logo">
            <div className="login-brand-logo-mark">N</div>
            <span className="login-brand-logo-name">NessaHub</span>
          </div>
          <h2 className="login-brand-headline">
            Your health,<br />on your terms.
          </h2>
          <p className="login-brand-sub">
            Connect with licensed therapists and medical doctors online.
            Private, secure, and available whenever you need it.
          </p>
          <div className="login-brand-pills">
            <span className="login-brand-pill therapy">
              <span className="login-brand-pill-dot" />
              Mental Health Therapy
            </span>
            <span className="login-brand-pill medical">
              <span className="login-brand-pill-dot" />
              Medical Consultations
            </span>
          </div>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className="login-form-panel">
        <div className="login-container">
          <div className="login-card">

            <div className="login-card-logo">
              <div className="login-card-logo-mark">N</div>
              <span className="login-card-logo-name">NessaHub</span>
            </div>

            <h1 className="login-title">Welcome back</h1>
            <p className="login-subtitle">Sign in to your account to continue.</p>

            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label" htmlFor="login-id">Email or Username</label>
                <input
                  id="login-id"
                  className="form-input"
                  placeholder="you@example.com"
                  value={id}
                  onChange={e => setId(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  className="form-input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button className="login-button" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="login-links">
              <Link to="/" className="login-link">New user? Start the questionnaire</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
