import React, { useState, useEffect } from 'react';
import AiAssistantFab from '../../Common/AiAssistantFab';
import CarePlanComposer from '../../Common/CarePlanComposer';
import ReferralComposer from '../../Common/ReferralComposer';
import AdminDocComposer from '../../Common/AdminDocComposer';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Users, MessageSquare, Video, Calendar, BookOpen, Settings, LogOut, Clock, FileText, Flag, Activity, Heart, Gift, Leaf, Star, Bell, Sparkles, ClipboardList, Tag, Share2, FileSignature, Pill, FlaskConical,
} from 'lucide-react';
import { signOut } from '../../../services/authShim';
import { auth, db, doc, getDoc } from '../../../services/firestoreShim';
import './TherapistDashboard.css';
import '../DashboardShell.css';

// Import all therapist dashboard components
import TherapistHome from './Home';
import TherapistClients from './Clients';
import TherapistMessages from './Messages';
import TherapistVideoCall from './VideoCall';
import TherapistCalendar from './Calendar';
import TherapistAppointments from './Appointments';
import TherapistSchedule from './Schedule';
import TherapistNotes from './Notes';
import TherapistResources from './Resources';
import TherapistReports from './Reports';
import TherapistSettings from './Settings';
import CoupleCases from './CoupleCases';
import TherapistLogs from './Logs';
import MoodDashboard from './MoodDashboard';
import ClientDetails from './ClientDetails';
import TherapistPrescriptions from './TherapistPrescriptions';
import DoctorDiagnosticOrder from '../Doctor/DoctorDiagnosticOrder';
import DoctorDiagnosticResults from '../Doctor/DoctorDiagnosticResults';
import '../Doctor/DoctorDashboard.css';

import PrescriptionRequestsInbox from '../../Common/PrescriptionRequestsInbox';
import ViewNote from './ViewNote';
import ReportDetails from './ReportDetails';
import Notifications from './Notifications';
import GlobalReportForm from '../Common/GlobalReportForm';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';
import '../../../styles/zencare.css';
import '../../../styles/zencare-therapy.css';
import { resolveFileUrl } from '../../../utils/fileUrl';
import ProviderPromotions from '../../Common/ProviderPromotions';
import ProviderPricePromotions from '../../Common/ProviderPricePromotions';
import ProviderWellness from '../../Common/ProviderWellness';
import FeedbackResults from '../../Common/FeedbackResults';
import NotificationCentre from '../../Common/NotificationCentre';
import AiClinicalAssistant from '../../Common/AiClinicalAssistant';
import ClinicianFollowUps from '../../Common/ClinicianFollowUps';

import BrandLogo from '../../Common/BrandLogo';

const TherapistDiagnosticOrder = (props) => <DoctorDiagnosticOrder {...props} clinician="therapist" />;
export default function TherapistDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // "Admin therapist" is a therapist-scoped privilege stored on the THERAPIST
  // profile (therapists/{id}.role === 'admin'), not on the user account — an admin
  // therapist is still role THERAPIST at login.
  //
  // So `profile` alone can never reveal it: `profile` comes from resolve-role,
  // which reports the account role and always says "therapist". The promotion took
  // effect nowhere in the UI because every gate here read only that. Read the
  // therapist document too, the way Home.js already does.
  const [therapistRole, setTherapistRole] = useState(null);

  useEffect(() => {
    const uid = profile?.id || profile?.uid || auth.currentUser?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'therapists', uid));
        if (!cancelled && snap.exists()) setTherapistRole(snap.data()?.role || null);
      } catch { /* keep the account-level answer */ }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.uid]);

  const isAdmin =
    profile?.role === 'admin' ||
    profile?.type === 'Administrator' ||
    profile?.isAdminTherapist === true ||
    therapistRole === 'admin';

  const navigationItems = [
    { path: '/dashboard', icon: Home, label: 'Home', component: TherapistHome },
    { path: '/dashboard/clients', icon: Users, label: 'Clients', component: TherapistClients },
    { path: '/dashboard/couple-cases', icon: Heart, label: 'Couple Cases', component: CoupleCases },
    { path: '/dashboard/staff', icon: MessageSquare, label: 'Messaging', component: TherapistMessages },
    { path: '/dashboard/video', icon: Video, label: 'Video Call', component: TherapistVideoCall },
    { path: '/dashboard/appointments', icon: Calendar, label: 'Appointments', component: TherapistAppointments },
    { path: '/dashboard/calendar', icon: Calendar, label: 'Calendar', component: TherapistCalendar },
    { path: '/dashboard/notes', icon: BookOpen, label: 'Notes', component: TherapistNotes },
    // Psychiatry: prescribing for psychiatry-track clients — the doctor's flow, copied.
    { path: '/dashboard/prescriptions', icon: Pill, label: 'Prescriptions', component: TherapistPrescriptions },
    { path: '/dashboard/prescription-requests', icon: Pill, label: 'Prescription Requests', component: PrescriptionRequestsInbox },
    // Psychiatry: lab tests and scans for psychiatry-track clients, as a doctor orders them.
    { path: '/dashboard/diagnostic-order', icon: FlaskConical, label: 'Order Lab / Scan', component: TherapistDiagnosticOrder },
    { path: '/dashboard/diagnostic-results', icon: FlaskConical, label: 'Lab & Scan Results', component: DoctorDiagnosticResults },
    { path: '/dashboard/care-plans', icon: ClipboardList, label: 'Care Plans', component: CarePlanComposer },
    { path: '/dashboard/documents', icon: FileSignature, label: 'Documents', component: AdminDocComposer },
    { path: '/dashboard/referrals', icon: Share2, label: 'Referrals', component: ReferralComposer },
    { path: '/dashboard/resources', icon: BookOpen, label: 'Resources', component: TherapistResources },
    { path: '/dashboard/mood', icon: Heart, label: 'Client Moods', component: MoodDashboard },
    { path: '/dashboard/wellness', icon: Leaf, label: 'Wellness', component: ProviderWellness },
    { path: '/dashboard/feedback', icon: Star, label: 'Patient Feedback', component: FeedbackResults },
    { path: '/dashboard/ai-assistant', icon: Sparkles, label: 'NessaHub Assistant', component: AiClinicalAssistant },
    { path: '/dashboard/check-ins', icon: ClipboardList, label: 'Check-ins', component: ClinicianFollowUps },
    { path: '/dashboard/notifications', icon: Bell, label: 'Notifications', component: NotificationCentre },
    { path: '/dashboard/promotions', icon: Gift, label: 'Promotions', component: ProviderPromotions },
    { path: '/dashboard/fee-offers', icon: Tag, label: 'Offers on my fee', component: ProviderPricePromotions },
    { path: '/dashboard/reports', icon: Flag, label: 'Reports', component: TherapistReports },
    { path: '/dashboard/report-issue', icon: FileText, label: 'Report Issue', component: GlobalReportForm },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings', component: TherapistSettings }
  ];

  if (isAdmin) {
    navigationItems.push(
      { path: '/dashboard/logs', icon: FileText, label: 'Logs', component: TherapistLogs },
    );
  }

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleProfileImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Here you would typically upload to Firebase Storage
      // For now, we'll create a local URL
      const imageUrl = URL.createObjectURL(file);
      
      // Update profile with new image URL
      // In a real app, you'd upload to Firebase Storage and update the profile document
      console.log('Profile image uploaded:', imageUrl);
      
      // You can add Firebase Storage upload logic here
      // const storageRef = ref(storage, `profile-images/${profile.id}`);
      // await uploadBytes(storageRef, file);
      // const downloadURL = await getDownloadURL(storageRef);
      
    } catch (error) {
      console.error('Error uploading profile image:', error);
    }
  };

  const isActiveRoute = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };



  return (
    <div className="zc zc-therapy zc-app-ground">
    <div className="therapist-dashboard">
      {/* Sidebar */}
      <aside className="therapist-sidebar">
        <div className="sidebar-header">
          {/* Logo */}
          <BrandLogo tone="dark" badge="Therapist" />

          {/* User Card */}
          <div className="user-info">
            <div className="user-avatar" onClick={() => document.getElementById('therapist-profile-image-input').click()}>
              {profile?.photoURL ? (
                <img src={resolveFileUrl(profile.photoURL)} alt="Profile" />
              ) : (
                <span>{profile?.name ? profile.name.charAt(0).toUpperCase() : 'T'}</span>
              )}
              <div className="avatar-overlay"><span>📷</span></div>
            </div>
            <input id="therapist-profile-image-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileImageUpload} />
            <div className="user-details">
              <p className="user-name">Dr. {profile?.name || 'Therapist'}</p>
              <p className="user-role">{isAdmin ? 'Admin Therapist' : 'Therapist'}</p>
              <SidebarSavedLocation profile={profile} />
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3>MAIN MENU</h3>
            <ul className="nav-list">
              {navigationItems.map((item) => (
                <li key={item.path}>
                  <button
                    className={`nav-item ${isActiveRoute(item.path) ? 'active' : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="therapist-main">
        <ForcedPasswordChangeOverlay profile={profile} firestoreCollection="therapists" />
        <Routes>
          <Route path="/" element={<TherapistHome profile={profile} />} />
          <Route path="/clients" element={<TherapistClients profile={profile} />} />
          <Route path="/staff" element={<TherapistMessages />} />
          <Route path="/video" element={<TherapistVideoCall profile={profile} />} />
          <Route path="/appointments" element={<TherapistAppointments />} />
          <Route path="/calendar" element={<TherapistCalendar />} />
          <Route path="/notes" element={<TherapistNotes />} />
          <Route path="/prescriptions" element={<TherapistPrescriptions profile={profile} />} />
          <Route path="/diagnostic-order" element={<TherapistDiagnosticOrder profile={profile} />} />
          <Route path="/diagnostic-results" element={<DoctorDiagnosticResults profile={profile} />} />
          <Route path="/prescription-requests" element={<PrescriptionRequestsInbox />} />
          <Route path="/care-plans" element={<CarePlanComposer role="THERAPIST" />} />
          <Route path="/documents" element={<AdminDocComposer role="THERAPIST" />} />
          <Route path="/referrals" element={<ReferralComposer role="THERAPIST" />} />
          <Route path="/resources" element={<TherapistResources />} />
          <Route path="/promotions" element={<ProviderPromotions />} />
          <Route path="/fee-offers" element={<ProviderPricePromotions />} />
          <Route path="/wellness" element={<ProviderWellness audience="my_clients" peopleNoun="clients" />} />
          <Route path="/feedback" element={<FeedbackResults />} />
          <Route path="/ai-assistant" element={<AiClinicalAssistant role="THERAPIST" />} />
          <Route path="/check-ins" element={<ClinicianFollowUps role="THERAPIST" />} />
          <Route path="/notifications" element={<NotificationCentre />} />
          <Route path="/mood" element={<MoodDashboard />} />
          <Route path="/reports" element={<TherapistReports />} />
          <Route path="/report-issue" element={<GlobalReportForm profile={profile} reporterType="therapist" />} />
          <Route path="/couple-cases" element={<CoupleCases />} />
          <Route path="/settings" element={<TherapistSettings />} />
          <Route path="/clients/:clientId" element={<ClientDetails />} />
          <Route path="/notes/:noteId" element={<ViewNote />} />
          <Route path="/reports/:reportId" element={<ReportDetails />} />
          <Route path="/notifications" element={<Notifications />} />
          {isAdmin && <Route path="/logs" element={<TherapistLogs />} />}
        </Routes>
        {/* Floating, so the assistant is reachable from every screen without
            navigating away from what you are looking at. */}
        <AiAssistantFab clinician />

      </main>
    </div>
    </div>
  );
}
