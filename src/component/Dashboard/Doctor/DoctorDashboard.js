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
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../Auth/firebaseConfig';
import { db } from '../../Auth/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import './DoctorDashboard.css';
import '../DashboardShell.css';

import DoctorHome from './DoctorHome';
import DoctorPatients from './DoctorPatients';
import DoctorAppointments from './DoctorAppointments';
import DoctorMessages from './DoctorMessages';
import DoctorNotes from './DoctorNotes';
import DoctorVideoCall from './DoctorVideoCall';
import DoctorPrescriptions from './DoctorPrescriptions';
import DoctorReviews from './DoctorReviews';
import DoctorAnalytics from './DoctorAnalytics';
import DoctorSettings from './DoctorSettings';
import DoctorPatientDetail from './DoctorPatientDetail';
import NotificationBell from './NotificationBell';

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
    { path: '/dashboard/appointments', icon: Calendar, label: 'Appointments' },
    { path: '/dashboard/video', icon: Video, label: 'Video Calls' },
    { path: '/dashboard/messages', icon: MessageSquare, label: 'Messages' },
    { path: '/dashboard/notes', icon: FileText, label: 'Notes' },
    { path: '/dashboard/prescriptions', icon: Pill, label: 'Prescriptions' },
    { path: '/dashboard/reviews', icon: Star, label: 'Reviews' },
    { path: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
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
        <Routes>
          <Route path="/" element={<DoctorHome profile={profile} />} />
          <Route path="/patients" element={<DoctorPatients profile={profile} />} />
          <Route path="/patients/:patientId" element={<DoctorPatientDetail profile={profile} />} />
          <Route path="/appointments" element={<DoctorAppointments profile={profile} />} />
          <Route path="/video" element={<DoctorVideoCall profile={profile} />} />
          <Route path="/messages" element={<DoctorMessages profile={profile} />} />
          <Route path="/notes" element={<DoctorNotes profile={profile} />} />
          <Route path="/prescriptions" element={<DoctorPrescriptions profile={profile} />} />
          <Route path="/reviews" element={<DoctorReviews profile={profile} />} />
          <Route path="/analytics" element={<DoctorAnalytics profile={profile} />} />
          <Route path="/settings" element={<DoctorSettings profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
