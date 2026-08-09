import React from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  User,
  LogOut,
  HeartPulse,
  Shield,
  ClipboardList,
} from 'lucide-react';
import { signOut } from '../../../services/authShim';
import { auth } from '../../../services/firestoreShim';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';
import { HomeCareNurseProvider, useHomeCareNurse } from './HomeCareNurseContext';
import { NURSE_PRESENCE } from '../../../constants/homeCareConstants';
import HomeCareNurseHome from './HomeCareNurseHome';
import HomeCareNurseBookings from './HomeCareNurseBookings';
import HomeCareNurseAccount from './HomeCareNurseAccount';
import HomeCareNurseVisit from './HomeCareNurseVisit';
import NursePhotoPicker from './NursePhotoPicker';
import NurseNotificationsBell from './NurseNotificationsBell';
import './HomeCareNurseDashboard.css';

const NAV = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/dashboard/bookings', icon: Inbox, label: 'Bookings', countKeys: ['pending', 'emergency', 'ongoing'] },
  { path: '/dashboard/account', icon: User, label: 'Account' },
];

function NurseDashboardShell({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { nurse, pending, emergency, ongoing } = useHomeCareNurse();

  const bookingCount = pending.length + emergency.length + ongoing.length;
  const online = nurse?.presenceStatus === NURSE_PRESENCE.ONLINE;

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  const navCount = (item) => {
    if (item.path === '/dashboard/bookings') return bookingCount;
    return 0;
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="hcn-dashboard">
      <aside className="hcn-sidebar">
        <div className="hcn-sidebar-header">
          <div className="hcn-logo">
            <HeartPulse size={24} />
            <h2>NessaHub</h2>
            <span className="hcn-logo-badge">Home Care</span>
          </div>
          <div className="hcn-user-card">
            <NursePhotoPicker nurse={nurse} size={44} />
            <div className="hcn-user-info">
              <div className="hcn-user-name-row">
                <p className="hcn-user-name">{nurse?.fullName || 'Nurse'}</p>
                <NurseNotificationsBell />
              </div>
              <p className="hcn-user-role">{nurse?.specialty || 'Home Care Nurse'}</p>
              <span className={`hcn-presence-pill ${online ? 'online' : 'offline'}`}>
                <span className="hcn-presence-dot" />
                {online ? 'Online' : 'Offline'}
              </span>
              <SidebarSavedLocation profile={profile} />
            </div>
          </div>
        </div>

        <nav className="hcn-nav">
          <p className="hcn-nav-label">Main menu</p>
          <ul className="hcn-nav-list">
            {NAV.map((item) => {
              const count = navCount(item);
              return (
                <li key={item.path}>
                  <button
                    type="button"
                    className={`hcn-nav-item ${isActive(item.path) ? 'active' : ''}`}
                    onClick={() => navigate(item.path === '/dashboard/bookings' ? '/dashboard/bookings?tab=requests' : item.path === '/dashboard/account' ? '/dashboard/account?tab=profile' : item.path)}
                  >
                    <span className="hcn-nav-icon" aria-hidden>
                      <item.icon size={20} strokeWidth={2} />
                    </span>
                    <span>{item.label}</span>
                    {count > 0 ? <span className="hcn-nav-badge muted">{count}</span> : null}
                  </button>
                </li>
              );
            })}
            {location.pathname.includes('/visit/') ? (
              <li>
                <button type="button" className="hcn-nav-item active" onClick={() => navigate(location.pathname)}>
                  <span className="hcn-nav-icon" aria-hidden>
                    <ClipboardList size={20} strokeWidth={2} />
                  </span>
                  <span>Active visit</span>
                </button>
              </li>
            ) : null}
          </ul>
        </nav>

        <div className="hcn-sidebar-footer">
          <div className="hcn-trust">
            <Shield size={12} />
            <span>Secure · Reference fees only</span>
          </div>
          <button type="button" className="hcn-logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="hcn-main">
        <ForcedPasswordChangeOverlay profile={profile} firestoreCollection="homeCareNurses" />
        <Routes>
          <Route path="/" element={<HomeCareNurseHome />} />
          <Route path="/bookings" element={<HomeCareNurseBookings />} />
          <Route path="/account" element={<HomeCareNurseAccount />} />
          <Route path="/visit/:bookingId" element={<HomeCareNurseVisit />} />
          <Route path="/requests" element={<Navigate to="/dashboard/bookings?tab=requests" replace />} />
          <Route path="/emergency" element={<Navigate to="/dashboard/bookings?tab=emergency" replace />} />
          <Route path="/ongoing" element={<Navigate to="/dashboard/bookings?tab=ongoing" replace />} />
          <Route path="/availability" element={<Navigate to="/dashboard/account?tab=availability" replace />} />
          <Route path="/profile" element={<Navigate to="/dashboard/account?tab=profile" replace />} />
          <Route path="/documents" element={<Navigate to="/dashboard/account?tab=documents" replace />} />
          <Route path="/earnings" element={<Navigate to="/dashboard/account?tab=earnings" replace />} />
          <Route path="/notifications" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function HomeCareNurseDashboard({ profile }) {
  return (
    <HomeCareNurseProvider profile={profile}>
      <NurseDashboardShell profile={profile} />
    </HomeCareNurseProvider>
  );
}
