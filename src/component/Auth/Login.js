import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signInWithEmailOrUsername } from './authService';
import { logAction, A } from '../../utils/auditLogger';
import { ensureHomeCareIntent, homeCarePatientLandingPath } from '../../utils/homeCarePatientIntent';
import { getStoredUserIntent, setUserIntent } from '../../utils/patientSessionIntent';
import { resolveCoupleLandingPath } from '../../services/coupleTherapyService';
import './Login.css';
// NOTE: the assets folder is named "Images " — with a trailing space.
import loginBackground from '../../Images /login.jpg';

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
      // Home-care intent must come from authoritative signals — the flow the user
      // logged in from (returnTo) or the resolved profile — NOT the sticky
      // localStorage flag, which leaks 'homecare' into medical/therapy sessions
      // (a patient who ever opened a home-care link would otherwise be routed to
      // the home-care hub forever). Home-care logins set the flag fresh below.
      const cameFromHomeCare = String(returnTo || '').startsWith('/home-care');
      const profileIntent = String(profile?.userIntent || '').toLowerCase();
      const metaIntent = String(profile?.metadata?.userIntent || '').toLowerCase();
      const homeCare =
        role === 'client' &&
        (cameFromHomeCare || profileIntent === 'homecare' || metaIntent === 'homecare');
      if (homeCare) {
        ensureHomeCareIntent();
      } else if (profileIntent === 'medical' && getStoredUserIntent() === 'homecare') {
        // Authoritatively a medical patient — clear a stale home-care flag so the
        // navbar/dashboard-hub resolver stops routing them to the home-care hub.
        // (Therapy/home-care clients are indistinguishable at the profile level, so
        // we only reconcile when the backend says 'medical' to avoid misrouting them.)
        setUserIntent('medical');
      }
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
      <div
        className="login-brand-panel"
        style={{
          // Scrim layered over the photo in the same background stack: the panel's
          // ::before/::after already draw the decorative glows, so an overlay
          // pseudo-element would collide. Keeps the white copy readable.
          backgroundImage:
            `linear-gradient(165deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.74) 55%, rgba(15,45,74,0.80) 100%), url(${loginBackground})`,
        }}
      >
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
