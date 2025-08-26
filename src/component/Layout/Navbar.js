import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import './Navbar.css';
import { useEffect, useState } from 'react';
import { auth } from '../Auth/firebaseConfig';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);
  
  console.log('Navbar - User state:', user); // Debug log
  
  // Hide navbar when user is in dashboard
  const isInDashboard = location.pathname.startsWith('/dashboard');
  if (isInDashboard) {
    return null;
  }
  
  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="navbar-logo" onClick={() => navigate('/')}>NessaHub</div>
        <nav className="navbar-links">
          <NavLink className="navbar-link" to="/about">About</NavLink>
          <NavLink className="navbar-link" to="/contact">Contact</NavLink>
          <NavLink className="navbar-link" to="/faqs">FAQs</NavLink>
          <NavLink className="navbar-link" to="/advice">Advice</NavLink>
        </nav>
        <div className="navbar-auth">
          <NavLink className="auth-button login" to="/login">Login</NavLink>
        </div>
        
        {/* Mobile Menu Button */}
        <button 
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          ☰
        </button>
      </div>
      
      {/* Mobile Menu */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <nav className="navbar-links">
          <NavLink className="navbar-link" to="/about">About</NavLink>
          <NavLink className="navbar-link" to="/contact">Contact</NavLink>
          <NavLink className="navbar-link" to="/faqs">FAQs</NavLink>
          <NavLink className="navbar-link" to="/advice">Advice</NavLink>
        </nav>
        <div className="navbar-auth">
          <NavLink className="auth-button login" to="/login">Login</NavLink>
        </div>
      </div>
    </header>
  );
}


