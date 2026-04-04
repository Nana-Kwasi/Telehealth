import React, { useState, useEffect } from 'react';
import { Search, Users, Calendar, MessageSquare, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs, getDoc, doc, query, where, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function DoctorPatients({ profile }) {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) loadPatients();
  }, [profile]);

  const loadPatients = async () => {
    try {
      // Query all appointments for this doctor — derive unique patients from them
      const apptsQ = query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id));
      const apptsSnap = await getDocs(apptsQ);
      const appts = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Build a map of unique patients keyed by clientId
      const patientMap = new Map();
      for (const a of appts) {
        if (!a.clientId) continue;
        if (!patientMap.has(a.clientId)) {
          patientMap.set(a.clientId, {
            id: a.clientId,
            name: a.clientName || '',
            email: a.clientEmail || '',
            appointments: [],
          });
        }
        patientMap.get(a.clientId).appointments.push(a);
      }
      // Enrich names for patients with missing/generic names from auth collection
      for (const [uid, patient] of patientMap) {
        if (!patient.name || patient.name === 'Patient') {
          try {
            const authSnap = await getDoc(doc(db, 'auth', uid));
            if (authSnap.exists()) {
              const d = authSnap.data();
              patient.name = d.name || d.displayName || patient.name || 'Unknown Patient';
              if (!patient.email && d.email) patient.email = d.email;
            } else {
              patient.name = patient.name || 'Unknown Patient';
            }
          } catch (_) {
            patient.name = patient.name || 'Unknown Patient';
          }
        }
      }

      // Compute display fields per patient
      const list = Array.from(patientMap.values()).map(p => {
        const sorted = [...p.appointments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const latest = sorted[0];
        const statuses = p.appointments.map(a => a.status);
        const activeStatus = statuses.includes('confirmed') ? 'confirmed'
          : statuses.includes('pending') ? 'pending'
          : statuses.includes('completed') ? 'completed' : 'cancelled';
        return {
          ...p,
          appointmentCount: p.appointments.length,
          completedCount: statuses.filter(s => s === 'completed').length,
          lastVisit: latest?.date || null,
          activeStatus,
        };
      });

      // Load patient statuses from patientProfiles
      const statusResults = await Promise.all(
        list.map(p => getDoc(doc(db, 'patientProfiles', p.id)).then(snap => ({ id: p.id, status: snap.exists() ? (snap.data().status || 'active') : 'active' })).catch(() => ({ id: p.id, status: 'active' })))
      );
      const statusMap = Object.fromEntries(statusResults.map(r => [r.id, r.status]));
      const listWithStatus = list.map(p => ({ ...p, patientStatus: statusMap[p.id] || 'active' }));
      listWithStatus.sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
      setPatients(listWithStatus);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDischarge = async (e, patientId, patientName) => {
    e.stopPropagation();
    if (!window.confirm(`Discharge ${patientName} from your care? Their status will change to Discharged.`)) return;
    try {
      await updateDoc(doc(db, 'patientProfiles', patientId), {
        status: 'discharged',
        dischargedBy: profile.id,
        dischargedByName: profile.name || 'Doctor',
        dischargedAt: serverTimestamp(),
      });
      setPatients(prev => prev.map(p => p.id === patientId ? { ...p, patientStatus: 'discharged' } : p));
    } catch (err) {
      // If doc doesn't exist yet, create it
      try {
        await setDoc(doc(db, 'patientProfiles', patientId), {
          status: 'discharged',
          dischargedBy: profile.id,
          dischargedByName: profile.name || 'Doctor',
          dischargedAt: serverTimestamp(),
        }, { merge: true });
        setPatients(prev => prev.map(p => p.id === patientId ? { ...p, patientStatus: 'discharged' } : p));
      } catch (_) { console.error('Error discharging patient:', err); }
    }
  };

  const filtered = patients.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.name && p.name.toLowerCase().includes(q)) ||
           (p.email && p.email.toLowerCase().includes(q));
  });

  const fmtDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const statusBadge = (status) => {
    const cls = `doctor-badge badge-${status}`;
    const labels = { confirmed: 'Active', pending: 'Pending', completed: 'Completed', cancelled: 'Inactive' };
    return <span className={cls}>{labels[status] || status}</span>;
  };

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Patients</h1>
        <p>All patients who have booked with you</p>
      </div>

      <div className="doctor-search">
        <Search size={18} color="#94a3b8" />
        <input
          type="text"
          placeholder="Search patients by name or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="doctor-card">
        <h3>All Patients ({filtered.length})</h3>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading patients...</p>
        ) : filtered.length === 0 ? (
          <div className="doctor-empty-state">
            <Users size={40} />
            <h3>{searchQuery ? 'No patients match your search' : 'No patients yet'}</h3>
            <p>Patients will appear here when they book appointments with you.</p>
          </div>
        ) : (
          <table className="doctor-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Email</th>
                <th>Appointments</th>
                <th>Last Visit</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(patient => (
                <tr
                  key={patient.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/dashboard/patients/${patient.id}`)}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: '#e8f1fb', color: '#1e6bb8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                      }}>
                        {(patient.name || 'P')[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#1e293b' }}>{patient.name}</p>
                        {patient.completedCount > 0 && (
                          <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
                            {patient.completedCount} completed session{patient.completedCount !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ color: '#64748b', fontSize: '0.875rem' }}>{patient.email || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{patient.appointmentCount}</td>
                  <td style={{ fontSize: '0.875rem', color: '#64748b' }}>{fmtDate(patient.lastVisit)}</td>
                  <td>
                    {patient.patientStatus === 'discharged'
                      ? <span className="doctor-badge badge-cancelled">Discharged</span>
                      : statusBadge(patient.activeStatus)
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                      <button className="doctor-btn doctor-btn-outline doctor-btn-sm" title="Appointments" onClick={() => navigate('/dashboard/appointments')}><Calendar size={13} /></button>
                      <button className="doctor-btn doctor-btn-outline doctor-btn-sm" title="Message" onClick={() => navigate('/dashboard/messages')}><MessageSquare size={13} /></button>
                      <button className="doctor-btn doctor-btn-primary doctor-btn-sm" title="View Profile" onClick={() => navigate(`/dashboard/patients/${patient.id}`)}><ChevronRight size={13} /></button>
                      {patient.patientStatus !== 'discharged' && (
                        <button
                          className="doctor-btn doctor-btn-sm"
                          style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}
                          title="Discharge patient"
                          onClick={(e) => handleDischarge(e, patient.id, patient.name)}
                        >
                          Discharge
                        </button>
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
