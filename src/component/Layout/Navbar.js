import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect } from 'react';
import { auth } from '../Auth/firebaseConfig';
import './Navbar.css';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Hide navbar inside dashboard
  if (location.pathname.startsWith('/dashboard')) return null;

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const navLinks = [
    { to: '/about', label: 'About' },
    { to: '/faqs', label: 'FAQs' },
    { to: '/advice', label: 'Resources' },
    { to: '/contact', label: 'Contact' },
  ];

  return (
    <header className="navbar">
      <div className="navbar-container">

        {/* Logo */}
        <div className="navbar-logo" onClick={() => navigate('/')} role="link" tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && navigate('/')}>
          <div className="navbar-logo-mark">N</div>
          <span className="navbar-logo-text">NessaHub</span>
        </div>

        {/* Desktop nav links */}
        <nav className="navbar-links">
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} className="navbar-link" to={to}>{label}</NavLink>
          ))}
        </nav>

        {/* Service pills */}
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

        {/* Auth buttons */}
        <div className="navbar-auth">
          {user ? (
            <>
              <button className="auth-button dashboard" onClick={() => navigate('/dashboard')}>
                Dashboard
              </button>
              <button className="auth-button logout" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink className="auth-button login" to="/login">Log in</NavLink>
              <NavLink className="auth-button signup" to="/login">Get Started</NavLink>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <nav className="navbar-links">
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} className="navbar-link" to={to}>{label}</NavLink>
          ))}
        </nav>
        <div className="navbar-auth">
          {user ? (
            <>
              <button className="auth-button dashboard" onClick={() => navigate('/dashboard')}>Dashboard</button>
              <button className="auth-button logout" onClick={handleLogout}>Sign out</button>
            </>
          ) : (
            <>
              <NavLink className="auth-button login" to="/login">Log in</NavLink>
              <NavLink className="auth-button signup" to="/login">Get Started</NavLink>
            </>
          )}
        </div>
        <div className="navbar-services">
          <span className="navbar-service-pill therapy"><span className="navbar-service-dot" />Therapy</span>
          <span className="navbar-service-pill medical"><span className="navbar-service-dot" />Medical</span>
        </div>
      </div>
    </header>
  );
}
