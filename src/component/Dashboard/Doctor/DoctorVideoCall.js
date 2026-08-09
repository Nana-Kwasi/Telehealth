import React, { useState, useEffect } from 'react';
import { Video, Phone, Clock, Calendar, Search, ExternalLink } from 'lucide-react';
import { db, functions, httpsCallable } from '../../../services/firestoreShim';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from '../../../services/firestoreShim';

const generateDoctorToken = httpsCallable(functions, 'generateDoctorToken');

export default function DoctorVideoCall({ profile }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (profile?.id) loadVideoAppointments();
  }, [profile]);

  const loadVideoAppointments = async () => {
    try {
      const q = query(
        collection(db, 'doctorAppointments'),
        where('doctorId', '==', profile.id),
      );
      const snap = await getDocs(q);
      const appts = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => (a.consultationType || 'video') === 'video')
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
      setAppointments(appts);
    } catch (error) {
      console.error('Error loading video appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const initiateCall = async (appointment) => {
    try {
      const roomName = `doctor_${profile.id}_${appointment.clientId}_${Date.now()}`;
      const participantName = `Dr. ${profile.name || 'Doctor'}`;

      // Get a Twilio JWT from Cloud Function (also creates the room)
      const result = await generateDoctorToken({
        roomName,
        participantName,
        appointmentId: appointment.id,
      });
      const { token } = result.data;

      // Notify the patient of incoming call
      await addDoc(collection(db, 'callNotifications'), {
        doctorId: profile.id,
        doctorName: profile.name || 'Doctor',
        targetId: appointment.clientId,
        targetName: appointment.clientName || 'Patient',
        appointmentId: appointment.id,
        roomName,
        status: 'incoming',
        type: 'video',
        createdAt: serverTimestamp(),
      });

      // Mark appointment as in-progress
      await updateDoc(doc(db, 'doctorAppointments', appointment.id), {
        callStatus: 'in_progress',
        callRoomName: roomName,
        callStartedAt: serverTimestamp(),
      });

      // Pass token + room info to the VideoCallPage via localStorage
      localStorage.setItem('videoCallInfo', JSON.stringify({
        token,
        roomName,
        participantName,
        appointmentId: appointment.id,
        patientName: appointment.clientName || 'Patient',
        role: 'doctor',
      }));

      window.open(`/video-call/${roomName}/${encodeURIComponent(participantName)}`, '_blank');
      setAppointments(prev =>
        prev.map(a => a.id === appointment.id ? { ...a, callStatus: 'in_progress', callRoomName: roomName } : a)
      );
    } catch (error) {
      console.error('Error initiating call:', error);
    }
  };

  const markCallComplete = async (appointment) => {
    try {
      await updateDoc(doc(db, 'doctorAppointments', appointment.id), {
        callStatus: 'completed',
        callEndedAt: serverTimestamp(),
        status: 'completed',
      });
      setAppointments(prev =>
        prev.map(a => a.id === appointment.id ? { ...a, callStatus: 'completed', status: 'completed' } : a)
      );
    } catch (error) {
      console.error('Error completing call:', error);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const filtered = appointments.filter(a => {
    // Filter by time
    if (filter === 'today' && a.date !== today) return false;
    if (filter === 'upcoming' && (a.date || '') < today) return false;
    if (filter === 'past' && (a.date || '') >= today) return false;

    // Only show confirmed or in-progress
    if (!['confirmed', 'completed'].includes(a.status) && a.callStatus !== 'in_progress') return false;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (a.clientName && a.clientName.toLowerCase().includes(q)) ||
             (a.date && a.date.includes(q));
    }
    return true;
  });

  const getCallStatusBadge = (appt) => {
    if (appt.callStatus === 'in_progress') return <span className="doctor-badge badge-pending">In Progress</span>;
    if (appt.callStatus === 'completed' || appt.status === 'completed') return <span className="doctor-badge badge-completed">Completed</span>;
    if (appt.status === 'confirmed') return <span className="doctor-badge badge-confirmed">Ready</span>;
    return <span className="doctor-badge badge-pending">{appt.status}</span>;
  };

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Video Consultations</h1>
        <p>Manage and initiate video calls with patients</p>
      </div>

      {/* Quick Stats */}
      <div className="doctor-stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <Calendar size={24} />
          </div>
          <div>
            <p className="doctor-stat-value">{appointments.filter(a => a.date === today && a.status === 'confirmed').length}</p>
            <p className="doctor-stat-label">Today's Calls</p>
          </div>
        </div>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Phone size={24} />
          </div>
          <div>
            <p className="doctor-stat-value">{appointments.filter(a => a.callStatus === 'in_progress').length}</p>
            <p className="doctor-stat-label">In Progress</p>
          </div>
        </div>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
            <Clock size={24} />
          </div>
          <div>
            <p className="doctor-stat-value">{appointments.filter(a => (a.date || '') > today && a.status === 'confirmed').length}</p>
            <p className="doctor-stat-label">Upcoming</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['today', 'Today'], ['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']].map(([key, label]) => (
          <button key={key}
            className={`doctor-btn doctor-btn-sm ${filter === key ? 'doctor-btn-primary' : 'doctor-btn-outline'}`}
            onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="doctor-search">
        <Search size={18} color="#94a3b8" />
        <input placeholder="Search by patient name or date..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <div className="doctor-card">
        <h3>Video Appointments ({filtered.length})</h3>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="doctor-empty-state">
            <Video size={40} />
            <h3>No video appointments {filter !== 'all' ? `for ${filter}` : ''}</h3>
            <p>Confirmed video appointments will appear here.</p>
          </div>
        ) : (
          <table className="doctor-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(appt => (
                <tr key={appt.id}>
                  <td style={{ fontWeight: 500 }}>{appt.clientName || 'Patient'}</td>
                  <td>{appt.date || '—'}</td>
                  <td>{appt.time || '—'}</td>
                  <td>{getCallStatusBadge(appt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {appt.status === 'confirmed' && appt.callStatus !== 'in_progress' && (
                        <button className="doctor-btn doctor-btn-sm doctor-btn-success" onClick={() => initiateCall(appt)}>
                          <Video size={14} /> Start Call
                        </button>
                      )}
                      {appt.callStatus === 'in_progress' && (
                        <>
                          <button className="doctor-btn doctor-btn-sm doctor-btn-primary" onClick={() => {
                            const callInfo = {
                              roomName: appt.callRoomName,
                              participantName: `Dr. ${profile.name || 'Doctor'}`,
                              role: 'doctor',
                            };
                            localStorage.setItem('videoCallInfo', JSON.stringify(callInfo));
                            window.open(`/video-call/${appt.callRoomName}/${encodeURIComponent(callInfo.participantName)}`, '_blank');
                          }}>
                            <ExternalLink size={14} /> Rejoin
                          </button>
                          <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => markCallComplete(appt)}>
                            End Call
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
