import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../Auth/firebaseConfig';
import { performLogout } from '../Auth/authService';
import './Navbar.css';
import { clearPatientSessionIntent } from '../../utils/patientSessionIntent';
import {
  isNavbarHiddenPath,
  isOnboardingPath,
  resolveNavbarHubAction,
  shouldShowMarketingNavLinks,
} from '../../utils/dashboardHub';

export default function Navbar({ session }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = session?.role ?? null;
  const profile = session?.profile ?? null;
  const pathname = location.pathname;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (isNavbarHiddenPath(pathname)) {
    return null;
  }

  const isAuthenticated = !!(user && role);
  const onboarding = isAuthenticated && isOnboardingPath(pathname);
  const showMarketingLinks = shouldShowMarketingNavLinks(pathname, isAuthenticated);
  const hub = isAuthenticated
    ? resolveNavbarHubAction({ role, profile, pathname })
    : null;

  const hideAuthChrome = pathname === '/login' || pathname === '/signup';

  const handleLogout = async () => {
    clearPatientSessionIntent();
    await performLogout({ userId: user?.uid, role, profile, clearCoupleKeys: true });
    navigate('/');
  };

  const navLinks = [
    { to: '/about', label: 'About' },
    { to: '/faqs', label: 'FAQs' },
    { to: '/advice', label: 'Resources' },
    { to: '/help', label: 'Help' },
    { to: '/contact', label: 'Contact' },
  ];

  const authButtons = () => {
    if (hideAuthChrome) return null;

    if (isAuthenticated) {
      return (
        <>
          {hub ? (
            <button type="button" className="auth-button dashboard" onClick={() => navigate(hub.path)}>
              {hub.label}
            </button>
          ) : null}
          <button type="button" className="auth-button logout" onClick={handleLogout}>
            Sign out
          </button>
        </>
      );
    }

    return (
      <>
        <NavLink className="auth-button login" to="/login">
          Log in
        </NavLink>
        <NavLink className="auth-button signup" to="/login">
          Get Started
        </NavLink>
      </>
    );
  };

  return (
    <header className={`navbar${onboarding ? ' navbar--onboarding' : ''}`}>
      <div className="navbar-container">
        <div
          className="navbar-logo"
          onClick={() => navigate('/')}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
        >
          <div className="navbar-logo-mark">N</div>
          <span className="navbar-logo-text">NessaHub</span>
        </div>

        {showMarketingLinks ? (
          <nav className="navbar-links">
            {navLinks.map(({ to, label }) => (
              <NavLink key={to} className="navbar-link" to={to}>
                {label}
              </NavLink>
            ))}
          </nav>
        ) : onboarding ? (
          <p className="navbar-onboarding-hint">Complete your intake — your progress is saved.</p>
        ) : null}

        {showMarketingLinks ? (
          <div className="navbar-services">
            <span className="navbar-service-pill therapy">
              <span className="navbar-service-dot" />
              Therapy
            </span>
            <span className="navbar-service-pill medical">
              <span className="navbar-service-dot" />
              Medical
            </span>
          </div>
        ) : null}

        <div className="navbar-auth">{authButtons()}</div>

        {showMarketingLinks ? (
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        ) : null}
      </div>

      {showMarketingLinks && mobileMenuOpen ? (
        <div className="mobile-menu open">
          <nav className="navbar-links">
            {navLinks.map(({ to, label }) => (
              <NavLink key={to} className="navbar-link" to={to}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="navbar-auth">{authButtons()}</div>
          <div className="navbar-services">
            <span className="navbar-service-pill therapy">
              <span className="navbar-service-dot" />
              Therapy
            </span>
            <span className="navbar-service-pill medical">
              <span className="navbar-service-dot" />
              Medical
            </span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
