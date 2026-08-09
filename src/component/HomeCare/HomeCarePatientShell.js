import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  Siren,
  Calendar,
  ClipboardList,
  LogOut,
  HeartPulse,
  Shield,
} from 'lucide-react';
import { signOut } from '../../services/authShim';
import { auth } from '../../services/firestoreShim';
import { fetchHomeCarePatientProfile, fetchPatientActiveBookings } from '../../services/homeCareService';
import '../Dashboard/HomeCare/HomeCareNurseDashboard.css';
import './HomeCarePatientShell.css';

const NAV = [
  { path: '/home-care', label: 'Dashboard', icon: LayoutDashboard, exact: true, countKey: 'active' },
  { path: '/home-care/browse', label: 'Find nurses', icon: Search },
  { path: '/home-care/emergency', label: 'Emergency', icon: Siren, danger: true },
  { path: '/home-care/ongoing', label: 'Ongoing care', icon: Calendar },
  { path: '/home-care/history', label: 'Visit history', icon: ClipboardList },
];

function patientInitials(name) {
  return String(name || 'U')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function HomeCarePatientShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;
  const [profile, setProfile] = useState({ name: '', location: '' });
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setProfile({ name: '', location: '' });
      setActiveCount(0);
      return;
    }
    (async () => {
      try {
        const [p, active] = await Promise.all([
          fetchHomeCarePatientProfile(uid),
          fetchPatientActiveBookings(uid),
        ]);
        setProfile(p);
        setActiveCount(active.length);
      } catch {
        setProfile({ name: '', location: '' });
        setActiveCount(0);
      }
    })();
  }, [uid, location.pathname]);

  const isActive = (path, exact) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (e) {
      console.error(e);
    }
  };

  const displayName = profile?.name && profile.name !== 'Guest' ? profile.name : null;

  return (
    <div className="hcn-dashboard hcp-dashboard">
      <aside className="hcn-sidebar">
        <div className="hcn-sidebar-header">
          <div className="hcn-logo">
            <HeartPulse size={24} />
            <h2>NessaHub</h2>
            <span className="hcn-logo-badge">Home Care</span>
          </div>

          {uid && displayName ? (
            <div className="hcn-user-card">
              <div className="hcn-avatar hcn-avatar-initials">{patientInitials(displayName)}</div>
              <div className="hcn-user-info">
                <p className="hcn-user-name">{displayName}</p>
                <p className="hcn-user-role">Patient</p>
                {profile.location ? (
                  <p className="hcp-sidebar-location" title={profile.location}>
                    <span aria-hidden>📍 </span>
                    {profile.location}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="hcp-guest-card">
              <p className="hcp-guest-text">Sign in to book nurses and track visits.</p>
              <Link to="/login" state={{ returnTo: location.pathname }} className="hcp-guest-btn" onClick={() => localStorage.setItem('userIntent', 'homecare')}>
                Sign in
              </Link>
            </div>
          )}
        </div>

        <nav className="hcn-nav">
          <p className="hcn-nav-label">Main menu</p>
          <ul className="hcn-nav-list">
            {NAV.map((item) => {
              const count = item.countKey === 'active' ? activeCount : 0;
              const active = isActive(item.path, item.exact);
              return (
                <li key={item.path}>
                  <button
                    type="button"
                    className={`hcn-nav-item ${active ? 'active' : ''} ${item.danger ? 'hcp-nav-danger' : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    <span className="hcn-nav-icon" aria-hidden>
                      <item.icon size={20} strokeWidth={2} />
                    </span>
                    <span>{item.label}</span>
                    {count > 0 ? <span className="hcn-nav-badge">{count}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hcn-sidebar-footer">
          <div className="hcn-trust">
            <Shield size={12} />
            <span>Secure home-care booking</span>
          </div>
          {uid ? (
            <button type="button" className="hcn-logout-btn" onClick={handleLogout}>
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          ) : (
            <Link to="/" className="hcp-back-home">
              ← Back to NessaHub
            </Link>
          )}
        </div>
      </aside>

      <main className="hcn-main hcp-main">
        <Outlet />
      </main>
    </div>
  );
}
