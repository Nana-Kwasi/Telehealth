import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './component/Home/Home';
import Questionnaire from './component/Questionnaire/Questionnaire';
import Payment from './component/Payment/Payment';
import Navbar from './component/Layout/Navbar';
import { resolveRole, logUserLogout } from './component/Auth/authService';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './component/Auth/firebaseConfig';
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
import DoctorSearch from './component/Doctors/DoctorSearch';
import DoctorProfilePage from './component/Doctors/DoctorProfilePage';
import MedicalIntake from './component/Doctors/MedicalIntake';
import DashboardLocationGate from './component/Common/DashboardLocationGate';

function Placeholder({ title }) {
  return (
    <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1e293b' }}>{title}</h1>
      <p style={{ color: '#64748b' }}>Coming soon.</p>
    </div>
  );
}

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
  if (session.role) return <Navigate to="/dashboard" replace />;
  return children;
}

// Requires authentication — sends unauthenticated users to login
function PrivateRoute({ children, session }) {
  if (session.loading) return <LoadingScreen />;
  if (!session.role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  const [session, setSession] = useState({ loading: true, role: null, profile: null });
  const sysConfig             = useSystemConfig();
  useFeatureFlagsConfig();
  const inactivityTimer       = useRef(null);

  // ── Session timeout (driven by systemConfig) ──────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    const minutes = cfg(sysConfig, 'security', 'sessionTimeoutMinutes', 60);
    const ms = minutes * 60 * 1000;
    clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(async () => {
      if (auth.currentUser) {
        await logAction(A.LOGOUT, { reason: 'session_timeout', timeoutMinutes: minutes });
        signOut(auth).catch(() => {});
      }
    }, ms);
  }, [sysConfig]);

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
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        const prev = sessionStorage.getItem('previousSession');
        if (prev) {
          try {
            const s = JSON.parse(prev);
            await logUserLogout(s.userId, s.role, s.profile);
          } catch (_) {}
          sessionStorage.removeItem('previousSession');
        }
        return setSession({ loading: false, role: null, profile: null });
      }

      try {
        const { role, profile } = await resolveRole(u.uid);
        sessionStorage.setItem('previousSession', JSON.stringify({ userId: u.uid, role, profile }));
        setSession({ loading: false, role, profile });
      } catch (err) {
        auth.signOut().catch(() => {});
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
          onClick={() => { import('firebase/auth').then(({ signOut }) => signOut(auth).catch(() => {})); }}>
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
    session.role === 'therapist' && session.profile?.role === 'admin' ? <AdminDashboard  profile={session.profile} /> :
    session.role === 'therapist'                              ? <TherapistDashboard      profile={session.profile} /> :
    session.role === 'doctor'                                 ? <DoctorDashboard         profile={session.profile} /> :
    session.profile?.userIntent === 'medical'                 ? <MedicalPatientDashboard profile={session.profile} /> :
                                                                <ClientDashboard         profile={session.profile} />;

  return (
    <div>
      <Navbar />
      <div className="container">
        <DashboardLocationGate role={session.role} profile={session.profile} activePath={location.pathname} />
        <Routes>
          {/* ── Public ── */}
          <Route path="/"              element={<Home />} />
          <Route path="/questionnaire" element={<Questionnaire />} />
          <Route path="/payment"       element={<Payment />} />
          <Route path="/terms"         element={<Terms />} />
          <Route path="/privacy"       element={<Privacy />} />
          <Route path="/about"         element={<Placeholder title="About" />} />
          <Route path="/contact"       element={<Placeholder title="Contact" />} />
          <Route path="/faqs"          element={<Placeholder title="FAQs" />} />
          <Route path="/advice"        element={<Placeholder title="Advice" />} />

          {/* ── Doctor Discovery (public) ── */}
          <Route path="/medical"           element={<MedicalIntake />} />
          <Route path="/doctors"           element={<DoctorSearch session={session} />} />
          <Route path="/doctors/:doctorId" element={<DoctorProfilePage session={session} />} />

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
