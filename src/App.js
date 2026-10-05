import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './component/Home/Home';
import Questionnaire from './component/Questionnaire/Questionnaire';
import Payment from './component/Payment/Payment';
import Navbar from './component/Layout/Navbar';
import { resolveRole, onAuthStateChanged, performLogout } from './component/Auth/authService';
import { hasActiveSession } from './services/apiClient';
import IncomingCall from './component/Common/IncomingCall';
import { refreshCurrentLocation } from './services/liveLocation';
import useSystemConfig, { cfg, useFeatureFlagsConfig } from './hooks/useSystemConfig';
import { logAction, A } from './utils/auditLogger';
import Login from './component/Auth/Login';
import SignUp from './component/Auth/SignUp';
import ClientDashboard from './component/Dashboard/Client/ClientDashboard';
import MedicalPatientDashboard from './component/Dashboard/MedicalPatient/MedicalPatientDashboard';
import TherapistDashboard from './component/Dashboard/Therapist/TherapistDashboard';
import DoctorDashboard from './component/Dashboard/Doctor/DoctorDashboard';
import AdminDashboard from './component/Dashboard/Admin/AdminDashboard';
import PharmacyDashboard from './component/Dashboard/Pharmacy/PharmacyDashboard';
import BranchDashboard from './component/Dashboard/Pharmacy/BranchDashboard';
import LabDashboard from './component/Dashboard/Lab/LabDashboard';
import ScanDashboard from './component/Dashboard/Scan/ScanDashboard';
import LabBranchDashboard from './component/Dashboard/Lab/LabBranchDashboard';
import ScanBranchDashboard from './component/Dashboard/Scan/ScanBranchDashboard';
import VideoCallPage from './component/VideoCall/VideoCallPage';
import Terms from './component/Home/Terms';
import Privacy from './component/Home/Privacy';
import AboutPage from './component/Home/AboutPage';
import ContactPage from './component/Home/ContactPage';
import FaqsPage from './component/Home/FaqsPage';
import ResourcesPage from './component/Home/ResourcesPage';
import HelpCenterPage from './component/Home/HelpCenterPage';
import CrisisSupportPage from './component/Home/CrisisSupportPage';
import DoctorSearch from './component/Doctors/DoctorSearch';
import DoctorProfilePage from './component/Doctors/DoctorProfilePage';
import MedicalIntake from './component/Doctors/MedicalIntake';
import HomeCarePatientDashboard from './component/HomeCare/HomeCarePatientDashboard';
import HomeCarePatientShell from './component/HomeCare/HomeCarePatientShell';
import HomeCareHome from './component/HomeCare/HomeCareHome';
import HomeCareSearch from './component/HomeCare/HomeCareSearch';
import HomeCareNurseProfile from './component/HomeCare/HomeCareNurseProfile';
import HomeCareBook from './component/HomeCare/HomeCareBook';
import HomeCareBookingStatus from './component/HomeCare/HomeCareBookingStatus';
import HomeCareHistory from './component/HomeCare/HomeCareHistory';
import HomeCareOngoingCare from './component/HomeCare/HomeCareOngoingCare';
import HomeCareEmergency from './component/HomeCare/HomeCareEmergency';
import HomeCareFeedback from './component/HomeCare/HomeCareFeedback';
import HomeCareReport from './component/HomeCare/HomeCareReport';
import HomeCareVisitSummary from './component/HomeCare/HomeCareVisitSummary';
import HomeCareSignUp from './component/HomeCare/HomeCareSignUp';
import ParentGuardianInfo from './component/TeenTherapy/ParentGuardianInfo';
import ChildInfo from './component/TeenTherapy/ChildInfo';
import ParentConsent from './component/TeenTherapy/ParentConsent';
import CoupleInitiation from './component/CoupleTherapy/CoupleInitiation';
import CoupleInviteEntry from './component/CoupleTherapy/CoupleInviteEntry';
import CouplePartnerBWelcome from './component/CoupleTherapy/CouplePartnerBWelcome';
import CoupleAccept from './component/CoupleTherapy/CoupleAccept';
import CoupleIntake from './component/CoupleTherapy/CoupleIntake';
import CoupleWaitingPartner from './component/CoupleTherapy/CoupleWaitingPartner';
import CoupleDashboard from './component/CoupleTherapy/CoupleDashboard';
import MatchTherapist from './component/Match/MatchTherapist';
import HomeCareNurseDashboard from './component/Dashboard/HomeCare/HomeCareNurseDashboard';
import DashboardLocationGate from './component/Common/DashboardLocationGate';
import AuthenticatedLandingRedirect from './component/Common/AuthenticatedLandingRedirect';
import SecondOpinionIntake from './component/SecondOpinion/SecondOpinionIntake';
import MedPsychSignUp from './component/MedPsych/MedPsychSignUp';
import MedPsychPsychiatrists from './component/MedPsych/MedPsychPsychiatrists';
import MedPsychBooking from './component/MedPsych/MedPsychBooking';
import NotificationCenter from './component/Common/NotificationCenter';

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--surface-page, #f5f7fa)'
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        border: '3px solid #e2e8f0',
        borderTopColor: 'var(--color-medical-500, #1e6bb8)',
        animation: 'spin 0.7s linear infinite',
        marginBottom: '1rem'
      }} />
      <p style={{
        color: '#64748b', fontSize: '0.9rem',
        fontFamily: 'var(--font-sans)', margin: 0
      }}>
        Loading NessaHub…
      </p>
    </div>
  );
}

// Redirects authenticated users away from login / signup
function PublicRoute({ children, session }) {
  if (session.loading) return <LoadingScreen />;
  if (session.role) {
    return <AuthenticatedLandingRedirect session={session} />;
  }
  return children;
}

// Requires authentication — sends unauthenticated users to login
function PrivateRoute({ children, session }) {
  if (session.loading) return <LoadingScreen />;
  if (!session.role) return <Navigate to="/login" replace />;
  return children;
}

// `th.clientId` is a Firestore-era key that ~40 client screens read as
// `localStorage.getItem('th.clientId') || currentUser.uid`. The intake flow used to
// store the shim's 'pending-intake' placeholder in it, and every one of those
// screens then fetched /clients/pending-intake — a 400 — instead of the real
// profile. Anything that is not a uuid is not a usable id, so drop it once at
// startup; the `|| uid` fallback in each screen then resolves correctly. Existing
// sessions carrying the bad value heal on next load without clearing storage.
function purgeInvalidClientId() {
  try {
    const v = localStorage.getItem('th.clientId');
    if (v && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      localStorage.removeItem('th.clientId');
    }
  } catch { /* storage unavailable — nothing to clean */ }
}

export default function App() {
  const location = useLocation();
  const [session, setSession] = useState({ loading: true, role: null, profile: null });
  useEffect(() => { purgeInvalidClientId(); }, []);
  const sysConfig             = useSystemConfig();
  useFeatureFlagsConfig();
  const inactivityTimer       = useRef(null);

  // ── Session timeout (driven by systemConfig) ──────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    const minutes = cfg(sysConfig, 'security', 'sessionTimeoutMinutes', 60);
    const ms = minutes * 60 * 1000;
    clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(async () => {
      if (hasActiveSession()) {
        await logAction(A.LOGOUT, { reason: 'session_timeout', timeoutMinutes: minutes });
        performLogout().catch(() => {});
      }
    }, ms);
  }, [sysConfig]);

  // Re-detect the user's current location whenever an authenticated session is
  // established (i.e. on every app open / login). Best-effort and non-blocking —
  // a denied permission keeps the last known location.
  useEffect(() => {
    if (!session.role || session.role === 'guest') return;
    // Not inside a call: the phone app opens the call page in a web view, where
    // this surfaced a location prompt over the call.
    if (window.location.pathname.startsWith('/video-call')) return;
    refreshCurrentLocation().catch(() => {});
  }, [session.role]);

  useEffect(() => {
    if (!session.role) return;
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }));
    resetInactivityTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer));
      clearTimeout(inactivityTimer.current);
    };
  }, [session.role, resetInactivityTimer]);

  useEffect(() => {
    const unsub = onAuthStateChanged(async (u) => {
      if (!u) {
        const prev = sessionStorage.getItem('previousSession');
        if (prev) {
          sessionStorage.removeItem('previousSession');
        }
        try {
          const { clearCoupleLocalSession } = await import('./services/coupleTherapyService');
          clearCoupleLocalSession();
        } catch {
          /* ignore */
        }
        return setSession({ loading: false, role: null, profile: null });
      }

      try {
        let { role, profile } = await resolveRole(u.uid);
        if (role === 'guest') {
          await new Promise((r) => setTimeout(r, 600));
          const retry = await resolveRole(u.uid);
          role = retry.role;
          profile = retry.profile;
        }
        sessionStorage.setItem('previousSession', JSON.stringify({ userId: u.uid, role, profile }));
        if (role === 'client') {
          try {
            const { isCoupleTherapyAccount, syncCoupleSessionFromProfile, clearCoupleLocalSession } =
              await import('./services/coupleTherapyService');
            if (isCoupleTherapyAccount(profile)) syncCoupleSessionFromProfile(profile);
            else clearCoupleLocalSession();
          } catch {
            /* ignore */
          }
        }
        setSession({ loading: false, role, profile });
      } catch (err) {
        performLogout().catch(() => {});
        setSession({ loading: false, role: null, profile: null });
      }
    });
    return unsub;
  }, []);

  if (session.loading) return <LoadingScreen />;

  // Maintenance mode — block non-admins
  const maintenanceMode = cfg(sysConfig, 'general', 'maintenanceMode', false);
  if (maintenanceMode && session.role && session.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔧</div>
        <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Platform Under Maintenance</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem', margin: '0 0 1.5rem', maxWidth: 400 }}>
          NessaHub is currently undergoing scheduled maintenance. Please check back shortly.
        </p>
        <button style={{ padding: '0.6rem 1.5rem', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
          onClick={() => performLogout().catch(() => {})}>
          Sign Out
        </button>
      </div>
    );
  }

  const dashboard =
    session.role === 'admin'                                  ? <AdminDashboard          profile={session.profile} /> :
    session.role === 'pharmacy'                               ? <PharmacyDashboard       profile={session.profile} /> :
    session.role === 'branch_user'                            ? <BranchDashboard         profile={session.profile} /> :
    session.role === 'lab'                                    ? <LabDashboard            profile={session.profile} /> :
    session.role === 'scan'                                   ? <ScanDashboard           profile={session.profile} /> :
    session.role === 'lab_branch'                             ? <LabBranchDashboard      profile={session.profile} /> :
    session.role === 'scan_branch'                            ? <ScanBranchDashboard     profile={session.profile} /> :
    session.role === 'therapist'                              ? <TherapistDashboard      profile={session.profile} /> :
    session.role === 'doctor'                                 ? <DoctorDashboard         profile={session.profile} /> :
    session.role === 'homecare_nurse'                         ? <HomeCareNurseDashboard  profile={session.profile} /> :
    session.profile?.userIntent === 'medical'                 ? <MedicalPatientDashboard profile={session.profile} /> :
                                                                <ClientDashboard         profile={session.profile} />;

  const hideNavbar =
    location.pathname.startsWith('/home-care') && location.pathname !== '/home-care/sign-up';
  // The call page is full-screen: no site navbar or bell over the video.
  const inCall = location.pathname.startsWith('/video-call');

  return (
    <div>
      {inCall ? null : <Navbar session={session} />}
      {/* Rendered once for any signed-in user rather than per dashboard: every
          module writes notifications, but only the therapist shell had a bell.
          Fixed-position so it does not depend on each dashboard's own header. */}
      {session?.role && !inCall ? (
        <div className="nh-notif-floating">
          <NotificationCenter />
        </div>
      ) : null}
      {/* Rings over any screen when a clinician calls. Not shown inside the
          call itself, and clinicians are never rung. */}
      {session?.role && !location.pathname.startsWith('/video-call')
        && !['doctor', 'therapist', 'admin'].includes(String(session.role).toLowerCase())
        ? <IncomingCall /> : null}
      <div className={hideNavbar ? 'hcp-app-root' : 'container'}>
        <DashboardLocationGate role={session.role} profile={session.profile} activePath={location.pathname} />
        <Routes>
          {/* ── Public ── */}
          <Route path="/"              element={<Home />} />
          <Route path="/teen/parent-guardian" element={<ParentGuardianInfo />} />
          <Route path="/teen/child" element={<ChildInfo />} />
          <Route path="/teen/consent" element={<ParentConsent />} />
          <Route path="/couple/initiation" element={<CoupleInitiation />} />
          <Route path="/couple/join" element={<CoupleInviteEntry />} />
          <Route path="/couple/welcome" element={<CouplePartnerBWelcome />} />
          {/* Partner B sets a password against the draft — no account yet. */}
          <Route path="/couple/accept" element={<CoupleAccept />} />
          <Route path="/couple/intake" element={<CoupleIntake />} />
          <Route path="/couple/waiting" element={<CoupleWaitingPartner />} />
          <Route path="/couple/dashboard" element={<CoupleDashboard />} />
          {/* MedPsych — second-opinion psychiatry. Deliberately outside the
              therapy onboarding: these users skip the questionnaire entirely. */}
          <Route path="/medpsych" element={<MedPsychSignUp />} />
          {/* Second Opinion shares the sign-up gate and the specialist/booking
              screens; only the intake differs, so it enters at the same policy
              gate carrying its own service type. */}
          <Route path="/second-opinion" element={<MedPsychSignUp service="second_opinion" />} />
          <Route path="/second-opinion/intake" element={<SecondOpinionIntake />} />
          <Route path="/medpsych/psychiatrists" element={<MedPsychPsychiatrists />} />
          <Route path="/medpsych/booking" element={<MedPsychBooking />} />
          <Route path="/questionnaire" element={<Questionnaire />} />
          <Route path="/payment"       element={<Payment />} />
          <Route path="/match-therapist" element={<MatchTherapist />} />
          <Route path="/terms"         element={<Terms />} />
          <Route path="/privacy"       element={<Privacy />} />
          <Route path="/about"         element={<AboutPage />} />
          <Route path="/contact"       element={<ContactPage />} />
          <Route path="/faqs"          element={<FaqsPage />} />
          <Route path="/advice"        element={<ResourcesPage />} />
          <Route path="/help"          element={<HelpCenterPage />} />
          <Route path="/crisis-support" element={<CrisisSupportPage />} />

          {/* ── Doctor Discovery (public) ── */}
          <Route path="/medical"           element={<MedicalIntake />} />
          <Route path="/doctors"           element={<DoctorSearch session={session} />} />
          <Route path="/doctors/:doctorId" element={<DoctorProfilePage session={session} />} />

          {/* ── Home Care (sidebar shell on web; sign-up stays full-page) ── */}
          <Route path="/home-care" element={<HomeCarePatientShell />}>
            <Route index element={<HomeCarePatientDashboard />} />
            <Route path="browse" element={<HomeCareHome />} />
            <Route path="search" element={<HomeCareSearch />} />
            <Route path="nurse/:nurseId" element={<HomeCareNurseProfile />} />
            <Route path="book/:nurseId" element={<HomeCareBook />} />
            <Route path="booking/:bookingId" element={<HomeCareBookingStatus />} />
            <Route path="history" element={<HomeCareHistory />} />
            <Route path="ongoing" element={<HomeCareOngoingCare />} />
            <Route path="emergency" element={<HomeCareEmergency />} />
            <Route path="feedback/:bookingId" element={<HomeCareFeedback />} />
            <Route path="report/:bookingId" element={<HomeCareReport />} />
            <Route path="visit-summary/:bookingId" element={<HomeCareVisitSummary />} />
          </Route>
          <Route path="/home-care/sign-up" element={<HomeCareSignUp />} />

          {/* ── Auth (redirect if already logged in) ── */}
          <Route path="/login"  element={<PublicRoute session={session}><Login  /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute session={session}><SignUp /></PublicRoute>} />

          {/* ── Video (accessible without sidebar) ── */}
          <Route path="/video-call/:roomName/:participantName" element={<VideoCallPage />} />

          {/* ── Protected Dashboard ── */}
          <Route path="/dashboard/*" element={
            <PrivateRoute session={session}>{dashboard}</PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
