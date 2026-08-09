import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Users,
  Calendar,
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  Activity,
  Video,
  Pill,
  Star,
  BarChart3,
  LayoutDashboard,
  FlaskConical,
  ClipboardList,
} from 'lucide-react';
import { signOut } from '../../../services/authShim';
import { auth } from '../../../services/firestoreShim';
import { db } from '../../../services/firestoreShim';
import { doc, getDoc } from '../../../services/firestoreShim';
import './DoctorDashboard.css';
import '../DashboardShell.css';

import DoctorHome from './DoctorHome';
import DoctorPatients from './DoctorPatients';
import DoctorPatientPanel from './DoctorPatientPanel';
import DoctorAppointments from './DoctorAppointments';
import DoctorMessages from './DoctorMessages';
import DoctorNotes from './DoctorNotes';
import DoctorVideoCall from './DoctorVideoCall';
import DoctorPrescriptions from './DoctorPrescriptions';
import DoctorReviews from './DoctorReviews';
import DoctorAnalytics from './DoctorAnalytics';
import DoctorSettings from './DoctorSettings';
import DoctorPatientDetail from './DoctorPatientDetail';
import DoctorPatientOverview from './DoctorPatientOverview';
import DoctorDiagnosticOrder from './DoctorDiagnosticOrder';
import DoctorDiagnosticResults from './DoctorDiagnosticResults';
import NotificationBell from './NotificationBell';
import GlobalReportForm from '../Common/GlobalReportForm';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';

export default function DoctorDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [livePhotoURL, setLivePhotoURL] = useState(profile?.photoURL || '');

  useEffect(() => {
    if (!profile?.id) return;
    getDoc(doc(db, 'doctors', profile.id))
      .then(snap => { if (snap.exists() && snap.data().photoURL) setLivePhotoURL(snap.data().photoURL); })
      .catch(() => {});
  }, [profile?.id]);

  const navigationItems = [
    { path: '/dashboard', icon: Home, label: 'Home' },
    { path: '/dashboard/patients', icon: Users, label: 'Patients' },
    { path: '/dashboard/patient-panel', icon: LayoutDashboard, label: 'Patient Panel' },
    { path: '/dashboard/appointments', icon: Calendar, label: 'Appointments' },
    { path: '/dashboard/video', icon: Video, label: 'Video Calls' },
    { path: '/dashboard/messages', icon: MessageSquare, label: 'Messages' },
    { path: '/dashboard/notes', icon: FileText, label: 'Notes' },
    { path: '/dashboard/prescriptions', icon: Pill, label: 'Prescriptions' },
    { path: '/dashboard/diagnostic-order', icon: FlaskConical, label: 'Order Lab / Scan' },
    { path: '/dashboard/diagnostic-results', icon: ClipboardList, label: 'Lab & Scan Results' },
    { path: '/dashboard/reviews', icon: Star, label: 'Reviews' },
    { path: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/dashboard/report-issue', icon: FileText, label: 'Report Issue' },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const isActiveRoute = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="doctor-dashboard">
      <aside className="doctor-sidebar">
        <div className="sidebar-header">
          <div className="doctor-logo">
            <Activity size={24} />
            <h2>NessaHub</h2>
            <span className="logo-badge">Medical</span>
          </div>
          <div className="user-info">
            <div className="doctor-avatar">
              {livePhotoURL ? (
                <img src={livePhotoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              ) : (
                <span>{profile?.name ? profile.name.charAt(0).toUpperCase() : 'D'}</span>
              )}
            </div>
            <div className="user-details">
              <p className="user-name">Dr. {profile?.name || 'Doctor'}</p>
              <p className="user-role">{profile?.specialization || 'Medical Doctor'}</p>
              <SidebarSavedLocation profile={profile} />
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3>NAVIGATION</h3>
            <ul className="nav-list">
              {navigationItems.map((item) => (
                <li key={item.path}>
                  <button
                    className={`nav-item ${isActiveRoute(item.path) ? 'active' : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', padding: '0 0.5rem', fontWeight: 500 }}>
            <Activity size={11} /> HIPAA Compliant &nbsp;·&nbsp; Secure
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="doctor-main">
        <ForcedPasswordChangeOverlay profile={profile} firestoreCollection="doctors" />
        <Routes>
          <Route path="/" element={<DoctorHome profile={profile} />} />
          <Route path="/patients" element={<DoctorPatients profile={profile} />} />
          <Route path="/patients/:patientId" element={<DoctorPatientDetail profile={profile} />} />
          <Route path="/patient-overview/:patientId" element={<DoctorPatientOverview profile={profile} />} />
          <Route path="/patient-panel" element={<DoctorPatientPanel profile={profile} />} />
          <Route path="/appointments" element={<DoctorAppointments profile={profile} />} />
          <Route path="/video" element={<DoctorVideoCall profile={profile} />} />
          <Route path="/messages" element={<DoctorMessages profile={profile} />} />
          <Route path="/notes" element={<DoctorNotes profile={profile} />} />
          <Route path="/prescriptions" element={<DoctorPrescriptions profile={profile} />} />
          <Route path="/diagnostic-order" element={<DoctorDiagnosticOrder profile={profile} />} />
          <Route path="/diagnostic-results" element={<DoctorDiagnosticResults profile={profile} />} />
          <Route path="/reviews" element={<DoctorReviews profile={profile} />} />
          <Route path="/analytics" element={<DoctorAnalytics profile={profile} />} />
          <Route path="/report-issue" element={<GlobalReportForm profile={profile} reporterType="doctor" />} />
          <Route path="/settings" element={<DoctorSettings profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
