import React from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../Auth/firebaseConfig';
import './AdminDashboard.css';

import AdminOverview          from './AdminOverview';
import AdminUserManagement    from './AdminUserManagement';
import AdminCreatePharmacy    from './AdminCreatePharmacy';
import AdminPrescriptionMonitor from './AdminPrescriptionMonitor';
import AdminSystemConfig      from './AdminSystemConfig';
import OnboardDoctor          from './OnboardDoctor';
import OnboardTherapist       from './OnboardTherapist';
import AdminCreateLabScan     from './AdminCreateLabScan';
import AdminAppointments      from './AdminAppointments';
import AdminNotifications     from './AdminNotifications';
import AdminReports           from './AdminReports';
import AdminReportsCenter     from './AdminReportsCenter';
import AdminSystemPdfExport   from './AdminSystemPdfExport';
import AdminAuditLog          from './AdminAuditLog';
import AdminApprovals         from './AdminApprovals';
import AdminUserDetail        from './AdminUserDetail';

const NAV = [
  // PLATFORM
  { path: '/dashboard',                   label: 'Overview',              icon: '📊', section: 'PLATFORM' },
  { path: '/dashboard/users',             label: 'User Management',       icon: '👥', section: 'PLATFORM' },
  { path: '/dashboard/approvals',         label: 'Account Approvals',     icon: '✅', section: 'PLATFORM' },
  { path: '/dashboard/appointments',      label: 'Appointments',          icon: '📅', section: 'PLATFORM' },
  { path: '/dashboard/prescriptions',     label: 'Prescription Monitor',  icon: '💊', section: 'PLATFORM' },
  // ONBOARDING
  { path: '/dashboard/create-pharmacy',   label: 'Create Pharmacy',       icon: '🏥', section: 'ONBOARDING' },
  { path: '/dashboard/onboard-doctor',    label: 'Onboard Doctor',        icon: '🩺', section: 'ONBOARDING' },
  { path: '/dashboard/onboard-therapist', label: 'Onboard Therapist',     icon: '🧠', section: 'ONBOARDING' },
  { path: '/dashboard/create-lab-scan',   label: 'Create Lab / Scan',     icon: '🧪', section: 'ONBOARDING' },
  // ANALYTICS & COMMS
  { path: '/dashboard/reports',           label: 'Analytics & Reports',   icon: '📈', section: 'ANALYTICS' },
  { path: '/dashboard/system-pdf-export', label: 'System PDF export',     icon: '📄', section: 'ANALYTICS' },
  { path: '/dashboard/reports-center',    label: 'Reports & Feedback',    icon: '📩', section: 'ANALYTICS' },
  { path: '/dashboard/notifications',     label: 'Notifications',         icon: '📣', section: 'ANALYTICS' },
  { path: '/dashboard/audit-log',         label: 'Audit Log',             icon: '🔍', section: 'ANALYTICS' },
  // SYSTEM
  { path: '/dashboard/system-config',     label: 'System Config',         icon: '⚙️', section: 'SYSTEM' },
];

export default function AdminDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await signOut(auth); navigate('/'); } catch {}
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
                      onClick={() => navigate(item.path)}>
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
          <Route path="/"                    element={<AdminOverview />} />
          <Route path="/users"               element={<AdminUserManagement />} />
          <Route path="/users/:col/:userId"  element={<AdminUserDetail />} />
          <Route path="/approvals"           element={<AdminApprovals />} />
          <Route path="/appointments"        element={<AdminAppointments />} />
          <Route path="/prescriptions"       element={<AdminPrescriptionMonitor />} />
          <Route path="/create-pharmacy"     element={<AdminCreatePharmacy />} />
          <Route path="/onboard-doctor"      element={<OnboardDoctor />} />
          <Route path="/onboard-therapist"   element={<OnboardTherapist />} />
          <Route path="/create-lab-scan"     element={<AdminCreateLabScan />} />
          <Route path="/reports"             element={<AdminReports />} />
          <Route path="/system-pdf-export"   element={<AdminSystemPdfExport />} />
          <Route path="/reports-center"      element={<AdminReportsCenter />} />
          <Route path="/notifications"       element={<AdminNotifications />} />
          <Route path="/audit-log"           element={<AdminAuditLog />} />
          <Route path="/system-config"       element={<AdminSystemConfig />} />
        </Routes>
      </main>
    </div>
  );
}
