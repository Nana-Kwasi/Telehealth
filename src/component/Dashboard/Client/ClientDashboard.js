import BillingAssistantPanel from '../../Common/BillingAssistantPanel';
import React from 'react';
import AiAssistantFab from '../../Common/AiAssistantFab';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, MessageSquare, Video, Calendar, BookOpen, CreditCard, Settings, HelpCircle, LogOut, User, Bell, Sparkles, Pill, Leaf, ClipboardList, Search, Clock,
} from 'lucide-react';
import { signOut } from '../../../services/authShim';
import { auth } from '../../../services/firestoreShim';
import './ClientDashboard.css';
import '../DashboardShell.css';

// Import all client dashboard components
import ClientHome from './Home';
import SecondOpinionHome from '../../SecondOpinion/SecondOpinionHome';
import BecomeMember from '../../SecondOpinion/BecomeMember';
import ClientMessages from './Messages';
import ClientVideoCall from './VideoCall';
import ClientSchedule from './Schedule';
import ClientProfile from './Profile';
import ClientResources from './Resources';
import ClientBilling from './Billing';
import ClientSettings from './Settings';
import ClientSupport from './Support';
import TherapistDetails from './TherapistDetails';
import WorksheetView from './WorksheetView';
import NoteView from './NoteView';
import GlobalReportForm from '../Common/GlobalReportForm';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';
import CoupleClientGate from '../../Common/CoupleClientGate';
import '../../../styles/zencare.css';
import '../../../styles/zencare-therapy.css';
import { resolveFileUrl } from '../../../utils/fileUrl';
import NotificationCentre from '../../Common/NotificationCentre';
import AiHealthAssistant from '../../Common/AiHealthAssistant';
import CareCentre from '../../Common/CareCentre';
import ClientWellness from '../../Common/ClientWellness';
import MyCarePlan from '../../Common/MyCarePlan';
import RecordExplorer from '../../Common/RecordExplorer';

import { MedPatSettings, MedPatPrescriptions, MedPatEPharmacy, MedPatTimeline } from '../MedicalPatient/MedicalPatientDashboard';
import { api, getStoredUserId } from '../../../services/apiClient';
import PhoneVerifyBanner from '../../Common/PhoneVerifyBanner';
import InsuranceCards from '../../Common/InsuranceCards';
import ClaimConfirmations from '../../Common/ClaimConfirmations';
import BrandLogo from '../../Common/BrandLogo';
export default function ClientDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get client data from localStorage
  const clientData = JSON.parse(localStorage.getItem('th.onboard') || '{}');
  const therapistName = clientData.assignedTherapistName || 'Your therapist';

  // A Second Opinion client bought ONE review, not a programme. Calendar and
  // Resources describe ongoing care they do not have, so they are hidden rather
  // than shown empty — and Home becomes the case view. The full dashboard
  // returns the moment they convert to membership.
  const isSecondOpinion = (profile?.membershipTier || profile?.tier) === 'second_opinion';

  // Psychiatry clients are prescribed for by their psychiatrist, so they get the
  // medical patient's Prescriptions and E-Pharmacy screens. The care track lives
  // in the client profile; /medpsych/me reports it (mobile reads the same call).
  const [isPsychiatry, setIsPsychiatry] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    api('/api/v1/medpsych/me')
      .then((me) => { if (!cancelled) setIsPsychiatry(String(me?.careTrack || '').toLowerCase() === 'psychiatry'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const selfProfile = React.useMemo(
    () => ({ ...(profile || {}), id: getStoredUserId(), uid: getStoredUserId() }),
    [profile],
  );

  const navigationItems = [
    { path: '/dashboard', icon: Home, label: isSecondOpinion ? 'My case' : 'Home', component: ClientHome },
    { path: '/dashboard/messages', icon: MessageSquare, label: 'Therapist', component: ClientMessages },
    { path: '/dashboard/video', icon: Video, label: 'Schedule', component: ClientVideoCall },
    ...(isPsychiatry ? [
      { path: '/dashboard/prescriptions', icon: Pill, label: 'Prescriptions', component: MedPatPrescriptions },
      { path: '/dashboard/epharmacy', icon: Pill, label: 'E-Pharmacy', component: MedPatEPharmacy },
      { path: '/dashboard/timeline', icon: Clock, label: 'Health Timeline', component: MedPatTimeline },
    ] : []),
    ...(isSecondOpinion ? [] : [
      { path: '/dashboard/schedule', icon: Calendar, label: 'Calendar', component: ClientSchedule },
      { path: '/dashboard/resources', icon: BookOpen, label: 'Resources', component: ClientResources },
      /* The receiving end of the therapist's wellness messages. Those went out
         as email only, so there was no way to re-read one — or to see any of
         them at all with wellness email switched off. */
      { path: '/dashboard/wellness', icon: Leaf, label: 'Wellness', component: ClientWellness },
      { path: '/dashboard/care-plan', icon: ClipboardList, label: 'My Care Plan', component: MyCarePlan },
      { path: '/dashboard/my-records', icon: Search, label: 'My Records', component: RecordExplorer },
    ]),
    { path: '/dashboard/billing', icon: CreditCard, label: 'Billing', component: ClientBilling },
    { path: '/dashboard/insurance', icon: CreditCard, label: 'Insurance', component: InsuranceCards },
    { path: '/dashboard/notifications', icon: Bell, label: 'Notifications', component: NotificationCentre },
    { path: '/dashboard/ai-assistant', icon: Sparkles, label: 'NessaHub Assistant', component: AiHealthAssistant },
    { path: '/dashboard/my-care', icon: Pill, label: 'My Care', component: CareCentre },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings', component: ClientSettings },
    { path: '/dashboard/support', icon: HelpCircle, label: 'Support', component: ClientSupport },
    { path: '/dashboard/report-issue', icon: User, label: 'Report Issue', component: GlobalReportForm }
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
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
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

  return (
    <CoupleClientGate profile={profile}>
    <div className="zc zc-therapy zc-app-ground">
    <div className="client-dashboard">
      {/* Sidebar */}
      <aside className="client-sidebar">
        <div className="sidebar-header">
          <BrandLogo tone="dark" badge="Therapy" />
          <div className="user-info">
            <div className="user-avatar" onClick={() => document.getElementById('profile-image-input').click()}>
              {profile?.photoURL ? (
                <img src={resolveFileUrl(profile.photoURL)} alt="Profile" />
              ) : (
                <span>{profile?.name ? profile.name.charAt(0).toUpperCase() : 'C'}</span>
              )}
              <div className="avatar-overlay">
                <span>📷</span>
              </div>
            </div>
            <input
              id="profile-image-input"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleProfileImageUpload}
            />
            <div className="user-details">
              <p className="user-name">{profile?.name || 'Client'}</p>
              <p className="user-role">Client</p>
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
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="client-main">
        <ForcedPasswordChangeOverlay profile={profile} firestoreCollection="auth" />
        {/* Until their phone is verified (only while SMS is set up). */}
        <PhoneVerifyBanner />
        {/* Medicine billed to their insurer, waiting for them to confirm receipt. */}
        <ClaimConfirmations />
        <Routes>
          <Route
            path="/"
            element={isSecondOpinion
              ? <SecondOpinionHome profile={profile} />
              : <ClientHome profile={profile} />}
          />
          {/* Reachable from the case dashboard's upgrade card. Lives inside
              the dashboard because only a signed-in limited account can use it. */}
          <Route path="/become-member" element={<BecomeMember profile={profile} />} />
          <Route path="/messages" element={<ClientMessages />} />
          <Route path="/video" element={<ClientVideoCall profile={profile} />} />
          <Route path="/schedule" element={<ClientSchedule />} />
          <Route path="/profile" element={<ClientProfile />} />
          <Route path="/resources" element={<ClientResources />} />
          <Route path="/wellness" element={<ClientWellness peopleNoun="therapist" />} />
          <Route path="/care-plan" element={<MyCarePlan />} />
          <Route path="/my-records" element={<RecordExplorer title="My records" />} />
          <Route path="/billing" element={<><BillingAssistantPanel /><ClientBilling /></>} />
          <Route path="/insurance" element={<div className="mp-page"><InsuranceCards accent="#5046bd" /></div>} />
          <Route path="/notifications" element={<NotificationCentre />} />
          <Route path="/ai-assistant" element={<AiHealthAssistant />} />
          <Route path="/my-care" element={<CareCentre variant="therapy" userId={profile?.id || profile?.uid} />} />
          {/* Same settings as the app: the patient benchmark in its therapy variant.
              The account id (not a profile-row id) is what the settings load by. */}
          <Route path="/prescriptions" element={<MedPatPrescriptions profile={selfProfile} />} />
          <Route path="/epharmacy" element={<MedPatEPharmacy profile={selfProfile} />} />
          <Route path="/timeline" element={<MedPatTimeline profile={selfProfile} />} />
          <Route path="/settings" element={<MedPatSettings variant="therapy" profile={{ ...(profile || {}), id: getStoredUserId(), uid: getStoredUserId() }} />} />
          <Route path="/support" element={<ClientSupport />} />
          <Route path="/report-issue" element={<GlobalReportForm profile={profile} reporterType="client" />} />
          <Route path="/therapist/:therapistId" element={<TherapistDetails />} />
          <Route path="/resources/worksheet/:worksheetId" element={<WorksheetView />} />
          <Route path="/resources/note/:noteId" element={<NoteView />} />
        </Routes>
        {/* Floating, so the assistant is reachable from every screen without
            navigating away from what you are looking at. */}
        <AiAssistantFab />

      </main>
    </div>
    </div>
    </CoupleClientGate>
  );
}
