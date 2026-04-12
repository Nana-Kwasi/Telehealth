import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Calendar, FileText, Pill, MessageSquare, Video,
  AlertTriangle, Check, X, Plus, Save, Trash2, Clock, Download,
} from 'lucide-react';
import { db } from '../../Auth/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';

const TODAY = new Date().toISOString().split('T')[0];

function StatusBadge({ status }) {
  const map = { pending: ['#fef3c7','#b45309'], confirmed: ['#dcfce7','#15803d'], completed: ['#f1f5f9','#475569'], cancelled: ['#fee2e2','#b91c1c'], discharged: ['#f1f5f9','#64748b'] };
  const [bg, color] = map[status] || map.pending;
  return <span style={{ background: bg, color, padding: '0.2rem 0.65rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{status || 'pending'}</span>;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  if (!name) return 'P';
  const parts = name.trim().split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

export default function DoctorPatientDetail({ profile }) {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [patientProfile, setPatientProfile] = useState(null);
  const [intakeData, setIntakeData] = useState(null);
  const [dailyFeelings, setDailyFeelings] = useState([]);
  const [viewingFeeling, setViewingFeeling] = useState(null);

  // Note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: '', content: '', type: 'consultation' });
  const [savingNote, setSavingNote] = useState(false);

  // Prescription form
  const [showRxForm, setShowRxForm] = useState(false);
  const [rxForm, setRxForm] = useState({ medication: '', dosage: '', frequency: '', duration: '', instructions: '' });
  const [savingRx, setSavingRx] = useState(false);

  // Discharge modal
  const [showDischarge, setShowDischarge] = useState(false);
  const [dischargeReason, setDischargeReason] = useState('');
  const [discharging, setDischarging] = useState(false);

  useEffect(() => {
    if (profile?.id && patientId) loadPatientData();
  }, [profile, patientId]);

  const loadPatientData = async () => {
    try {
      // Load appointments for this patient with this doctor
      const apptsQ = query(
        collection(db, 'doctorAppointments'),
        where('doctorId', '==', profile.id),
        where('clientId', '==', patientId)
      );
      const apptsSnap = await getDocs(apptsQ);
      const appts = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      appts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      // Derive patient info from appointments, then enrich from auth collection
      let patientName = appts[0]?.clientName || '';
      let patientEmail = appts[0]?.clientEmail || '';
      let bloodType = '', allergies = '', dob = '', phone = '';
      try {
        const authSnap = await getDoc(doc(db, 'auth', patientId));
        if (authSnap.exists()) {
          const d = authSnap.data();
          patientName = d.name || d.displayName || patientName || 'Patient';
          patientEmail = d.email || patientEmail;
          bloodType = d.bloodType || '';
          allergies = d.allergies || '';
          dob = d.dob || '';
          phone = d.phone || '';
        }
      } catch (_) {}
      setPatient({ id: patientId, name: patientName || 'Patient', email: patientEmail, bloodType, allergies, dob, phone });
      setAppointments(appts);

      // Load notes — no orderBy to avoid composite index requirement; sort in JS
      const notesQ = query(
        collection(db, 'doctorNotes'),
        where('doctorId', '==', profile.id),
        where('patientId', '==', patientId)
      );
      try {
        const notesSnap = await getDocs(notesQ);
        const noteList = notesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        noteList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setNotes(noteList);
      } catch (e) { console.error('Error loading notes:', e); }

      // Load extended patient profile (insurance, emergency contact, health records)
      try {
        const profSnap = await getDoc(doc(db, 'patientProfiles', patientId));
        if (profSnap.exists()) setPatientProfile(profSnap.data());
      } catch (_) {}

      // Load prescriptions
      const rxQ = query(
        collection(db, 'doctorPrescriptions'),
        where('doctorId', '==', profile.id),
        where('patientId', '==', patientId)
      );
      try {
        const rxSnap = await getDocs(rxQ);
        const rxList = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        rxList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setPrescriptions(rxList);
      } catch { /* ignore */ }

      // Load intake / questionnaire data
      try {
        const intakeSnap = await getDoc(doc(db, 'patientIntake', patientId));
        if (intakeSnap.exists()) setIntakeData(intakeSnap.data());
      } catch (_) {}

      // Load daily feelings
      try {
        const feelSnap = await getDocs(query(
          collection(db, 'patientDailyFeelings'),
          where('patientId', '==', patientId)
        ));
        const feelings = feelSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setDailyFeelings(feelings);
      } catch (_) {}

    } catch (err) {
      console.error('Error loading patient data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const totalAppts = appointments.length;
  const completedAppts = appointments.filter(a => a.status === 'completed').length;
  const upcomingAppts = appointments.filter(a => a.date >= TODAY && a.status !== 'cancelled').length;
  const lastVisit = appointments.find(a => a.status === 'completed')?.date || null;
  const isActive = !appointments.every(a => a.status === 'cancelled' || a.status === 'discharged');

  // Appointment status update
  const updateApptStatus = async (apptId, newStatus) => {
    await updateDoc(doc(db, 'doctorAppointments', apptId), { status: newStatus });
    setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: newStatus } : a));
  };

  // Save note
  const saveNote = async () => {
    if (!noteForm.title.trim() || !noteForm.content.trim()) return;
    setSavingNote(true);
    try {
      const data = {
        doctorId: profile.id,
        doctorName: profile.name || 'Doctor',
        patientId,
        patientName: patient?.name || 'Patient',
        title: noteForm.title.trim(),
        content: noteForm.content.trim(),
        type: noteForm.type,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'doctorNotes'), data);
      setNotes(prev => [{ id: ref.id, ...data }, ...prev]);
      setNoteForm({ title: '', content: '', type: 'consultation' });
      setShowNoteForm(false);
    } catch (err) { console.error(err); }
    finally { setSavingNote(false); }
  };

  // Delete note
  const deleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return;
    await deleteDoc(doc(db, 'doctorNotes', noteId));
    setNotes(prev => prev.filter(n => n.id !== noteId));
  };

  // Save prescription
  const saveRx = async () => {
    if (!rxForm.medication.trim()) return;
    setSavingRx(true);
    try {
      const data = {
        doctorId: profile.id,
        doctorName: profile.name || 'Doctor',
        patientId,
        patientName: patient?.name || 'Patient',
        ...rxForm,
        status: 'active',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'doctorPrescriptions'), data);
      setPrescriptions(prev => [{ id: ref.id, ...data }, ...prev]);
      setRxForm({ medication: '', dosage: '', frequency: '', duration: '', instructions: '' });
      setShowRxForm(false);
    } catch (err) { console.error(err); }
    finally { setSavingRx(false); }
  };

  // Discharge patient
  const dischargePatient = async () => {
    if (!dischargeReason.trim()) return;
    setDischarging(true);
    try {
      // Write discharge note
      await addDoc(collection(db, 'doctorNotes'), {
        doctorId: profile.id,
        doctorName: profile.name || 'Doctor',
        patientId,
        patientName: patient?.name || 'Patient',
        title: 'Patient Discharged',
        content: dischargeReason.trim(),
        type: 'discharge',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Update patient subcollection status
      await setDoc(doc(db, 'doctors', profile.id, 'patients', patientId), {
        status: 'discharged', dischargedAt: serverTimestamp(), dischargeReason: dischargeReason.trim(),
      }, { merge: true });
      // Cancel all pending/confirmed appointments
      for (const a of appointments.filter(a => ['pending','confirmed'].includes(a.status))) {
        await updateDoc(doc(db, 'doctorAppointments', a.id), { status: 'cancelled' });
      }
      setShowDischarge(false);
      navigate('/dashboard/patients');
    } catch (err) { console.error(err); }
    finally { setDischarging(false); }
  };

  const noteTypeColors = { consultation: '#1e6bb8', followup: '#7c3aed', prescription: '#059669', referral: '#d97706', discharge: '#dc2626', general: '#64748b' };

  if (loading) return <div className="doctor-page"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>Loading patient records…</p></div>;
  if (!patient) return <div className="doctor-page"><p style={{ textAlign: 'center', padding: '3rem' }}>Patient not found.</p></div>;

  return (
    <div className="doctor-page">
      {/* Back */}
      <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate('/dashboard/patients')} style={{ marginBottom: '1.25rem' }}>
        <ChevronLeft size={16} /> Back to Patients
      </button>

      {/* Patient Header */}
      <div className="doctor-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #1e6bb8, #2563eb)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.4rem', flexShrink: 0 }}>
            {getInitials(patient.name)}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{patient.name}</h2>
            {patient.email && <p style={{ margin: '0 0 0.4rem', color: '#64748b', fontSize: '0.875rem' }}>{patient.email}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <StatusBadge status={isActive ? 'confirmed' : 'cancelled'} />
              {lastVisit && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Last visit: {fmtDate(lastVisit)}</span>}
            </div>
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => { setActiveTab('notes'); setShowNoteForm(true); }}>
              <Plus size={14} /> Add Note
            </button>
            <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => { setActiveTab('prescriptions'); setShowRxForm(true); }}>
              <Pill size={14} /> Prescribe
            </button>
            <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate('/dashboard/messages')}>
              <MessageSquare size={14} /> Message
            </button>
            <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate('/dashboard/video')}>
              <Video size={14} /> Video Call
            </button>
            <button className="doctor-btn doctor-btn-danger doctor-btn-sm" onClick={() => setShowDischarge(true)}>
              <AlertTriangle size={14} /> Discharge
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Visits', value: totalAppts, color: '#1e6bb8', bg: '#e8f1fb', icon: Calendar },
          { label: 'Completed', value: completedAppts, color: '#16a34a', bg: '#dcfce7', icon: Check },
          { label: 'Upcoming', value: upcomingAppts, color: '#d97706', bg: '#fef3c7', icon: Clock },
          { label: 'Notes', value: notes.length, color: '#7c3aed', bg: '#f3e8ff', icon: FileText },
          { label: 'Prescriptions', value: prescriptions.length, color: '#059669', bg: '#d1fae5', icon: Pill },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} style={{ background: 'white', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</p>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
        {[['overview','Overview'],['appointments','Appointments'],['notes','Notes'],['prescriptions','Prescriptions'],['info','Patient Info'],['feelings','Daily Feeling']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '0.65rem 1.1rem', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600, borderBottom: activeTab === key ? '2.5px solid #1e6bb8' : '2.5px solid transparent',
              color: activeTab === key ? '#1e6bb8' : '#64748b', marginBottom: -2, transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="doctor-grid-2">
          <div className="doctor-card">
            <h3>Recent Appointments</h3>
            {appointments.slice(0, 4).length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No appointments yet.</p>
            ) : appointments.slice(0, 4).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: a.status === 'completed' ? '#dcfce7' : a.status === 'pending' ? '#fef3c7' : '#e8f1fb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Calendar size={16} color={a.status === 'completed' ? '#15803d' : a.status === 'pending' ? '#b45309' : '#1e6bb8'} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{fmtDate(a.date)}{a.time ? ` at ${a.time}` : ''}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', textTransform: 'capitalize' }}>{a.consultationType || 'Video'}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
          <div className="doctor-card">
            <h3>Latest Notes</h3>
            {notes.slice(0, 3).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No notes yet.</p>
                <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => { setActiveTab('notes'); setShowNoteForm(true); }}><Plus size={14} /> Add First Note</button>
              </div>
            ) : notes.slice(0, 3).map(n => (
              <div key={n.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, background: (noteTypeColors[n.type] || '#64748b') + '15', color: noteTypeColors[n.type] || '#64748b', padding: '0.1rem 0.4rem', borderRadius: 4 }}>{n.type}</span>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>{n.createdAt?.toDate?.()?.toLocaleDateString() || ''}</p>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{n.title}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>{n.content.slice(0, 80)}{n.content.length > 80 ? '…' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── APPOINTMENTS TAB ── */}
      {activeTab === 'appointments' && (
        <div className="doctor-card">
          <h3>All Appointments ({appointments.length})</h3>
          {appointments.length === 0 ? (
            <div className="doctor-empty-state"><Calendar size={36} /><p>No appointments yet.</p></div>
          ) : (
            <table className="doctor-table">
              <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {appointments.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{fmtDate(a.date)}</td>
                    <td>{a.time || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{a.consultationType || 'video'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: 150, fontStyle: a.reason ? 'italic' : 'normal' }}>{a.reason ? `"${a.reason}"` : '—'}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>
                      {a.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button className="doctor-btn doctor-btn-success doctor-btn-sm" onClick={() => updateApptStatus(a.id, 'confirmed')}><Check size={13} /> Accept</button>
                          <button className="doctor-btn doctor-btn-danger doctor-btn-sm" onClick={() => updateApptStatus(a.id, 'cancelled')}><X size={13} /></button>
                        </div>
                      )}
                      {a.status === 'confirmed' && (
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => navigate('/dashboard/video')}><Video size={13} /> Start</button>
                          <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => updateApptStatus(a.id, 'completed')}><Check size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── NOTES TAB ── */}
      {activeTab === 'notes' && (
        <div>
          <button className="doctor-btn doctor-btn-primary" style={{ marginBottom: '1rem' }} onClick={() => setShowNoteForm(v => !v)}>
            <Plus size={16} /> {showNoteForm ? 'Cancel' : 'New Note'}
          </button>

          {showNoteForm && (
            <div className="doctor-card" style={{ marginBottom: '1rem' }}>
              <h3>New Consultation Note</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                  <label>Note Type</label>
                  <select className="doctor-form-select" value={noteForm.type} onChange={e => setNoteForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="consultation">Consultation</option>
                    <option value="followup">Follow-up</option>
                    <option value="prescription">Prescription</option>
                    <option value="referral">Referral</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                  <label>Title</label>
                  <input className="doctor-form-input" placeholder="Note title" value={noteForm.title} onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))} />
                </div>
              </div>
              <div className="doctor-form-group">
                <label>Notes</label>
                <textarea className="doctor-form-textarea" rows={5} placeholder="Write your consultation notes here..." value={noteForm.content} onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="doctor-btn doctor-btn-primary" onClick={saveNote} disabled={savingNote || !noteForm.title.trim() || !noteForm.content.trim()}>
                  <Save size={15} /> {savingNote ? 'Saving…' : 'Save Note'}
                </button>
                <button className="doctor-btn doctor-btn-outline" onClick={() => setShowNoteForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="doctor-card">
            <h3>Consultation Notes ({notes.length})</h3>
            {notes.length === 0 ? (
              <div className="doctor-empty-state"><FileText size={36} /><p>No notes for this patient yet.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {notes.map(n => (
                  <div key={n.id} style={{ padding: '1rem 1.25rem', background: '#f8fafc', borderRadius: 10, borderLeft: `4px solid ${noteTypeColors[n.type] || '#64748b'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.2rem', fontSize: '0.9rem', color: '#0f172a' }}>{n.title}</h4>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, background: (noteTypeColors[n.type] || '#64748b') + '15', color: noteTypeColors[n.type] || '#64748b', padding: '0.1rem 0.45rem', borderRadius: 4 }}>{n.type}</span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{n.createdAt?.toDate?.()?.toLocaleDateString() || ''}</span>
                        </div>
                      </div>
                      <button className="doctor-btn doctor-btn-sm doctor-btn-danger" onClick={() => deleteNote(n.id)}><Trash2 size={12} /></button>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRESCRIPTIONS TAB ── */}
      {activeTab === 'prescriptions' && (
        <div>
          <button className="doctor-btn doctor-btn-primary" style={{ marginBottom: '1rem' }} onClick={() => setShowRxForm(v => !v)}>
            <Plus size={16} /> {showRxForm ? 'Cancel' : 'New Prescription'}
          </button>

          {showRxForm && (
            <div className="doctor-card" style={{ marginBottom: '1rem' }}>
              <h3>New Prescription for {patient.name}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {[['medication','Medication / Drug Name','e.g., Amoxicillin 500mg'],['dosage','Dosage','e.g., 500mg'],['frequency','Frequency','e.g., Twice daily'],['duration','Duration','e.g., 7 days']].map(([key, label, ph]) => (
                  <div key={key} className="doctor-form-group" style={{ marginBottom: 0 }}>
                    <label>{label}</label>
                    <input className="doctor-form-input" placeholder={ph} value={rxForm[key]} onChange={e => setRxForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="doctor-form-group">
                <label>Special Instructions</label>
                <textarea className="doctor-form-textarea" rows={3} placeholder="e.g., Take with food. Avoid alcohol." value={rxForm.instructions} onChange={e => setRxForm(f => ({ ...f, instructions: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="doctor-btn doctor-btn-primary" onClick={saveRx} disabled={savingRx || !rxForm.medication.trim()}>
                  <Save size={15} /> {savingRx ? 'Saving…' : 'Issue Prescription'}
                </button>
                <button className="doctor-btn doctor-btn-outline" onClick={() => setShowRxForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="doctor-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Prescriptions ({prescriptions.length})</h3>
              <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={async () => {
                try {
                  const rxSnap = await getDocs(query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', profile.id), where('patientId', '==', patientId)));
                  const rxList = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                  rxList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                  setPrescriptions(rxList);
                } catch (_) {}
              }}>↻ Refresh</button>
            </div>
            {prescriptions.length === 0 ? (
              <div className="doctor-empty-state"><Pill size={36} /><p>No prescriptions issued yet.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {prescriptions.map(rx => {
                  const isDone = rx.status === 'completed';
                  const medName = rx.medication || rx.medications?.[0]?.name || 'Medication';
                  const metaLine = [
                    rx.dosage || rx.medications?.[0]?.dosage,
                    rx.frequency || rx.medications?.[0]?.frequency,
                    rx.duration || rx.medications?.[0]?.duration,
                  ].filter(Boolean).join(' • ');
                  return (
                    <div key={rx.id} style={{ padding: '1rem', background: isDone ? '#f0fdf4' : '#f8fafc', borderRadius: 10, border: `1.5px solid ${isDone ? '#bbf7d0' : '#e2e8f0'}`, borderLeft: isDone ? '4px solid #22c55e' : '1.5px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{medName}</p>
                          {metaLine && <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>{metaLine}</p>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {isDone ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 }}>
                              ✓ Completed
                            </span>
                          ) : (
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 }}>
                              Active
                            </span>
                          )}
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{rx.createdAt?.toDate?.()?.toLocaleDateString() || ''}</span>
                        </div>
                      </div>
                      {rx.instructions && (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', background: '#fff', padding: '0.5rem 0.75rem', borderRadius: 6, borderLeft: '3px solid #059669' }}>
                          {rx.instructions}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PATIENT INFO TAB ── */}
      {activeTab === 'info' && (
        <div className="doctor-grid-2">
          {/* Insurance */}
          <div className="doctor-card">
            <h3 style={{ marginBottom: '1rem' }}>Insurance Details</h3>
            {patientProfile?.insurance ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {[
                  ['Provider', patientProfile.insurance.provider],
                  ['Policy Number', patientProfile.insurance.policyNumber],
                  ['Group Number', patientProfile.insurance.groupNumber],
                  ['Member ID', patientProfile.insurance.memberId],
                  ['Expiry Date', patientProfile.insurance.expiryDate],
                ].map(([label, val]) => val ? (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '0.875rem', color: '#0f172a', fontWeight: 500 }}>{val}</span>
                  </div>
                ) : null)}
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No insurance details provided by patient.</p>
            )}
          </div>

          {/* Emergency Contact */}
          <div className="doctor-card">
            <h3 style={{ marginBottom: '1rem' }}>Emergency Contact</h3>
            {patientProfile?.emergencyContacts?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {patientProfile.emergencyContacts.map((ec, i) => (
                  <div key={i} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: 10, border: '1.5px solid #e2e8f0' }}>
                    <p style={{ margin: '0 0 0.2rem', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{ec.name}</p>
                    <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#64748b' }}>{ec.relationship}</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#1e6bb8' }}>{ec.phone}</p>
                    {ec.email && <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>{ec.email}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No emergency contacts provided by patient.</p>
            )}
          </div>

          {/* Health Records */}
          <div className="doctor-card" style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ marginBottom: '1rem' }}>Health Records</h3>
            {patientProfile?.healthRecords?.length > 0 ? (
              <table className="doctor-table">
                <thead>
                  <tr><th>Document</th><th>Type</th><th>Date</th><th>Notes</th><th>File</th></tr>
                </thead>
                <tbody>
                  {patientProfile.healthRecords.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>{r.type || '—'}</td>
                      <td>{r.date || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{r.notes || '—'}</td>
                      <td>
                        {r.fileUrl ? (
                          <a
                            href={r.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#1e6bb8', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none' }}
                          >
                            <Download size={13} /> {r.fileName || 'View'}
                          </a>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No health records uploaded by patient.</p>
            )}
          </div>

          {/* Basic health info from auth */}
          <div className="doctor-card">
            <h3 style={{ marginBottom: '1rem' }}>Health Information</h3>
            {['bloodType', 'allergies', 'dob', 'phone'].some(k => patient[k]) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {patient.allergies && (
                  <div style={{ background: '#fff0f0', border: '1.5px solid #fecaca', borderRadius: 10, padding: '0.75rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>⚠️</span>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#b91c1c' }}>Allergies</p>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: '#b91c1c' }}>{patient.allergies}</p>
                    </div>
                  </div>
                )}
                {[['Blood Type', patient.bloodType], ['Date of Birth', patient.dob], ['Phone', patient.phone]].map(([label, val]) => val ? (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '0.875rem', color: '#0f172a', fontWeight: 500 }}>{val}</span>
                  </div>
                ) : null)}
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No health information recorded.</p>
            )}
          </div>
        </div>
      )}

      {/* ── INTAKE / COMPLAINT DATA (appended to Patient Info) ── */}
      {activeTab === 'info' && intakeData && (
        <div className="doctor-card" style={{ marginTop: '1.25rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Initial Complaint (Patient Intake)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[
              ['Main Complaint', intakeData.complaint],
              ['Duration', intakeData.duration],
              ['Severity', intakeData.severity ? `${intakeData.severity}/10` : null],
              ['Symptoms', Array.isArray(intakeData.symptoms) ? intakeData.symptoms.join(', ') : intakeData.symptoms],
              ['Additional Notes', intakeData.notes],
            ].filter(([, val]) => val).map(([label, val]) => (
              <div key={label} style={{ padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '0.2rem' }}>{label}</p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#0f172a' }}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DAILY FEELING TAB ── */}
      {activeTab === 'feelings' && (
        <div>
          {dailyFeelings.length === 0 ? (
            <div className="doctor-card">
              <div className="doctor-empty-state">
                <span style={{ fontSize: '2rem' }}>😊</span>
                <h3>No daily check-ins yet</h3>
                <p>The patient has not submitted any daily feeling reports.</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {dailyFeelings.map(f => {
                const MOOD_META = {
                  great: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', emoji: '😊' },
                  good:  { color: '#65a30d', bg: '#f7fee7', border: '#d9f99d', emoji: '🙂' },
                  okay:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', emoji: '😐' },
                  poor:  { color: '#dc2626', bg: '#fff7ed', border: '#fed7aa', emoji: '😟' },
                  bad:   { color: '#b91c1c', bg: '#fff1f2', border: '#fecdd3', emoji: '😢' },
                };
                const meta = MOOD_META[f.mood?.toLowerCase()] || { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', emoji: '❓' };
                const dateStr = f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
                const timeStr = f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
                const painColor = f.painLevel >= 7 ? '#ef4444' : f.painLevel >= 4 ? '#f59e0b' : '#22c55e';
                const symptomList = Array.isArray(f.symptoms) ? f.symptoms.filter(Boolean) : [];
                return (
                  <div key={f.id} style={{ background: meta.bg, border: `1.5px solid ${meta.border}`, borderRadius: 14, padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: meta.color + '18', border: `1.5px solid ${meta.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                          {meta.emoji}
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: meta.color, textTransform: 'capitalize' }}>{f.mood || 'Check-in'}</p>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{dateStr}{timeStr ? ` • ${timeStr}` : ''}</p>
                        </div>
                      </div>
                      {f.painLevel != null && (
                        <div style={{ textAlign: 'center', background: 'white', borderRadius: 10, padding: '0.5rem 0.85rem', border: '1.5px solid #e2e8f0' }}>
                          <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>PAIN</p>
                          <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: painColor, lineHeight: 1 }}>{f.painLevel}<span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/10</span></p>
                        </div>
                      )}
                    </div>

                    {symptomList.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
                        {symptomList.slice(0, 3).map((s, i) => (
                          <span key={i} style={{ background: '#fff0f0', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 20, padding: '0.2rem 0.65rem', fontSize: '0.78rem', fontWeight: 600 }}>{s}</span>
                        ))}
                        {symptomList.length > 3 && <span style={{ color: '#94a3b8', fontSize: '0.78rem', alignSelf: 'center' }}>+{symptomList.length - 3} more</span>}
                      </div>
                    )}

                    {f.notes && (
                      <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>{f.notes.length > 120 ? f.notes.slice(0, 120) + '…' : f.notes}</p>
                    )}

                    <button
                      className="doctor-btn doctor-btn-sm doctor-btn-outline"
                      style={{ borderColor: meta.color + '60', color: meta.color }}
                      onClick={() => setViewingFeeling(f)}
                    >
                      View Full Details
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Daily Feeling Detail Modal */}
      {viewingFeeling && (() => {
        const MOOD_META = {
          great: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', emoji: '😊' },
          good:  { color: '#65a30d', bg: '#f7fee7', border: '#d9f99d', emoji: '🙂' },
          okay:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', emoji: '😐' },
          poor:  { color: '#dc2626', bg: '#fff7ed', border: '#fed7aa', emoji: '😟' },
          bad:   { color: '#b91c1c', bg: '#fff1f2', border: '#fecdd3', emoji: '😢' },
        };
        const meta = MOOD_META[viewingFeeling.mood?.toLowerCase()] || { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', emoji: '❓' };
        const dateStr = viewingFeeling.createdAt?.seconds ? new Date(viewingFeeling.createdAt.seconds * 1000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
        const timeStr = viewingFeeling.createdAt?.seconds ? new Date(viewingFeeling.createdAt.seconds * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
        const painColor = viewingFeeling.painLevel >= 7 ? '#ef4444' : viewingFeeling.painLevel >= 4 ? '#f59e0b' : '#22c55e';
        const symptomList = Array.isArray(viewingFeeling.symptoms) ? viewingFeeling.symptoms.filter(Boolean) : [];
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
            <div style={{ background: 'white', borderRadius: 20, maxWidth: 500, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              {/* Header */}
              <div style={{ background: meta.bg, borderBottom: `1.5px solid ${meta.border}`, padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div style={{ fontSize: '2rem' }}>{meta.emoji}</div>
                    <div>
                      <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: meta.color, textTransform: 'capitalize' }}>{viewingFeeling.mood || 'Check-in'}</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{dateStr}</p>
                      {timeStr && <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>{timeStr}</p>}
                    </div>
                  </div>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b', padding: '0.25rem' }} onClick={() => setViewingFeeling(null)}>✕</button>
                </div>
              </div>
              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Pain */}
                {viewingFeeling.painLevel != null && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 12, padding: '1rem 1.25rem', border: '1.5px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>❤️‍🩹</span>
                      <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>Pain Level</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <span style={{ fontSize: '2rem', fontWeight: 900, color: painColor }}>{viewingFeeling.painLevel}</span>
                      <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 600 }}>/10</span>
                    </div>
                  </div>
                )}
                {/* Symptoms */}
                {symptomList.length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Symptoms</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {symptomList.map((s, i) => <span key={i} style={{ background: '#fff0f0', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 20, padding: '0.3rem 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>{s}</span>)}
                    </div>
                  </div>
                )}
                {/* Medications */}
                {viewingFeeling.medications && (
                  <div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Medications Taken</p>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.85rem 1rem', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', color: '#0f172a' }}>
                      {Array.isArray(viewingFeeling.medications) ? viewingFeeling.medications.join(', ') : viewingFeeling.medications}
                    </div>
                  </div>
                )}
                {/* Notes */}
                {viewingFeeling.notes && (
                  <div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patient Notes</p>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.85rem 1rem', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }}>
                      {viewingFeeling.notes}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem 1.5rem', borderTop: '1.5px solid #f1f5f9' }}>
                <button className="doctor-btn doctor-btn-primary" style={{ width: '100%', background: meta.color }} onClick={() => setViewingFeeling(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── DISCHARGE MODAL ── */}
      {showDischarge && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '2rem', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={20} color="#dc2626" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Discharge Patient</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>This will cancel all pending appointments</p>
              </div>
            </div>

            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#475569' }}>
              You are about to discharge <strong>{patient.name}</strong>. Please provide a clinical reason for the discharge record:
            </p>

            <textarea
              style={{ width: '100%', padding: '0.75rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.875rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', minHeight: 100 }}
              placeholder="Reason for discharge (required)..."
              value={dischargeReason}
              onChange={e => setDischargeReason(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button style={{ flex: 1 }} className="doctor-btn doctor-btn-outline" onClick={() => setShowDischarge(false)}>Cancel</button>
              <button
                style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none', borderRadius: 10, padding: '0.75rem', fontWeight: 700, cursor: discharging || !dischargeReason.trim() ? 'not-allowed' : 'pointer', opacity: discharging || !dischargeReason.trim() ? 0.6 : 1 }}
                disabled={discharging || !dischargeReason.trim()}
                onClick={dischargePatient}
              >
                {discharging ? 'Processing…' : 'Confirm Discharge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
