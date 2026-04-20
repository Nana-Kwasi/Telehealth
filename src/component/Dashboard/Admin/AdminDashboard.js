import React from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../Auth/firebaseConfig';
import './AdminDashboard.css';

import AdminOverview from './AdminOverview';
import AdminUserManagement from './AdminUserManagement';
import AdminCreatePharmacy from './AdminCreatePharmacy';
import AdminPrescriptionMonitor from './AdminPrescriptionMonitor';
import AdminSystemConfig from './AdminSystemConfig';
import OnboardDoctor from './OnboardDoctor';
import OnboardTherapist from './OnboardTherapist';
import AdminWalkInVerify from './AdminWalkInVerify';

const NAV = [
  { path: '/dashboard',                  label: 'Overview',             icon: '📊', section: 'PLATFORM' },
  { path: '/dashboard/users',            label: 'User Management',      icon: '👥', section: 'PLATFORM' },
  { path: '/dashboard/prescriptions',    label: 'Prescription Monitor', icon: '💊', section: 'PLATFORM' },
  { path: '/dashboard/walkin',           label: 'Walk-in Verify',       icon: '🔍', section: 'PLATFORM' },
  { path: '/dashboard/create-pharmacy',  label: 'Create Pharmacy',      icon: '🏥', section: 'ONBOARDING' },
  { path: '/dashboard/onboard-doctor',   label: 'Onboard Doctor',       icon: '🩺', section: 'ONBOARDING' },
  { path: '/dashboard/onboard-therapist',label: 'Onboard Therapist',    icon: '🧠', section: 'ONBOARDING' },
  { path: '/dashboard/system-config',    label: 'System Config',        icon: '⚙️', section: 'SYSTEM' },
];

export default function AdminDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await signOut(auth); navigate('/'); } catch (e) {}
  };

  const isActive = (path) =>
    path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path);

  const sections = [...new Set(NAV.map(n => n.section))];

  return (
    <div className="admin-dashboard">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <div className="admin-logo">
            <span>🏥</span>
            <h2>NessaHub</h2>
            <span className="admin-logo-badge">Admin</span>
          </div>
          <div className="admin-user-info">
            <div className="admin-avatar">{profile?.name?.[0]?.toUpperCase() || 'A'}</div>
            <div>
              <p className="admin-user-name">{profile?.name || 'Admin'}</p>
              <p className="admin-user-role">Super Admin</p>
            </div>
          </div>
        </div>

        <nav className="admin-nav">
          {sections.map(section => (
            <div key={section} className="admin-nav-section">
              <h3>{section}</h3>
              <ul className="admin-nav-list">
                {NAV.filter(n => n.section === section).map(item => (
                  <li key={item.path}>
                    <button
                      className={`admin-nav-item ${isActive(item.path) ? 'active' : ''}`}
                      onClick={() => navigate(item.path)}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={handleLogout}>
            🚪 <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Routes>
          <Route path="/"                   element={<AdminOverview />} />
          <Route path="/users"              element={<AdminUserManagement />} />
          <Route path="/prescriptions"      element={<AdminPrescriptionMonitor />} />
          <Route path="/walkin"             element={<AdminWalkInVerify />} />
          <Route path="/create-pharmacy"    element={<AdminCreatePharmacy />} />
          <Route path="/onboard-doctor"     element={<OnboardDoctor />} />
          <Route path="/onboard-therapist"  element={<OnboardTherapist />} />
          <Route path="/system-config"      element={<AdminSystemConfig />} />
        </Routes>
      </main>
    </div>
  );
}
