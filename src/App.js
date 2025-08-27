import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './component/Home/Home';
import Questionnaire from './component/Questionnaire/Questionnaire';
import Payment from './component/Payment/Payment';
import Navbar from './component/Layout/Navbar';
import { resolveRole } from './component/Auth/authService';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './component/Auth/firebaseConfig';
import Login from './component/Auth/Login';
import SignUp from './component/Auth/SignUp';
import ClientDashboard from './component/Dashboard/Client/ClientDashboard';
import TherapistDashboard from './component/Dashboard/Therapist/TherapistDashboard';
import VideoCallPage from './component/VideoCall/VideoCallPage';

function Placeholder({ title }) { return <div className="container"><h1 className="page-title">{title}</h1><p className="subtitle">Coming soon.</p></div>; }

export default function App() {
  const [session, setSession] = useState({ loading: true, role: null, profile: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        console.log('No user authenticated');
        return setSession({ loading: false, role: null, profile: null });
      }
      
      console.log('User authenticated:', u.uid);
      const { role, profile } = await resolveRole(u.uid);
      console.log('Resolved role:', role, 'Profile:', profile);
      setSession({ loading: false, role, profile });
    });
    return unsub;
  }, []);

  return (
    <div>
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/questionnaire" element={<Questionnaire />} />
          <Route path="/payment" element={<Payment />} />

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/about" element={<Placeholder title="About" />} />
          <Route path="/contact" element={<Placeholder title="Contact" />} />
          <Route path="/faqs" element={<Placeholder title="FAQs" />} />
          <Route path="/advice" element={<Placeholder title="Advice" />} />
          
          {/* Video Call Route */}
          <Route path="/video-call/:roomName/:participantName" element={<VideoCallPage />} />
          
                            <Route path="/dashboard/*" element={session.role ? (
                    session.role === 'therapist' ? 
                      <TherapistDashboard profile={session.profile} /> : 
                      <ClientDashboard profile={session.profile} />
                  ) : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

