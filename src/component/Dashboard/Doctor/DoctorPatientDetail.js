import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdherencePanel from '../../Common/AdherencePanel';
import RecordGapsPanel from '../../Common/RecordGapsPanel';
import SmartDocumentUpload from '../../Common/SmartDocumentUpload';
import CodingAssistPanel from '../../Common/CodingAssistPanel';
import RecordExplorer from '../../Common/RecordExplorer';
import {
  ChevronLeft, Calendar, FileText, Pill, MessageSquare, Video,
  AlertTriangle, Check, X, Plus, Save, Trash2, Clock, Download,
  UserX, UserCheck, Activity, FlaskConical, Minus,
} from 'lucide-react';
import { auth, db } from '../../../services/firestoreShim';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, setDoc, getDoc, serverTimestamp,
} from '../../../services/firestoreShim';
import { hasPatientPharmacy, patientPharmacyKey, removePatientPharmacyByKey } from '../../../utils/patientPharmacyDedupe';

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

// The latest reading is returned as `vitalsLatestJson` — a JSON STRING of flat
// fields ({bpSystolic, heartRate, …}). Reading `vitals.latest` alone always gave
// undefined, so the card said "No vitals recorded by patient yet" for every patient
// who had actually recorded them.
function parseLatestVitals(pd) {
  if (!pd) return null;
  if (typeof pd.vitalsLatestJson === 'string' && pd.vitalsLatestJson.trim()) {
    try {
      const parsed = JSON.parse(pd.vitalsLatestJson);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* fall through to the legacy shapes */ }
  }
  return pd.vitals?.latest || pd.vitals || null;
}

// A health record's attachments are NOT a single `fileUrl`. The patient's Health
// Records form uploads one file per selected document type and stores them as
// `radiologyFiles: { "MRI": {fileUrl, fileName}, … }`; the flat `fileUrl` is left as
// an empty string. Reading only the flat field is why the File column showed "—"
// even though three PDFs were attached. Return every file, whichever shape it's in.
function recordFiles(rec) {
  if (!rec) return [];
  const out = [];
  const push = (label, url, name) => {
    if (!url || typeof url !== 'string' || !url.trim()) return;
    if (out.some(f => f.url === url)) return;
    out.push({ label: label || name || 'Attachment', url, name: name || label || 'file' });
  };
  const bag = rec.radiologyFiles && typeof rec.radiologyFiles === 'object' ? rec.radiologyFiles : {};
  Object.entries(bag).forEach(([label, v]) => {
    if (!v) return;
    if (typeof v === 'string') push(label, v, label);
    else push(label, v.fileUrl || v.url, v.fileName || v.name);
  });
  // Some records (and older ones) carry a single top-level attachment instead.
  push(rec.fileName || 'Attachment', rec.fileUrl || rec.url, rec.fileName);
  return out;
}

// The form records the selected document types as `types` (an array). The table read
// the singular `type`, which does not exist — hence "—" in every Type cell.
function recordTypes(rec) {
  if (!rec) return [];
  if (Array.isArray(rec.types)) return rec.types.filter(Boolean);
  if (typeof rec.types === 'string' && rec.types.trim()) return [rec.types.trim()];
  if (rec.type) return [rec.type];
  return [];
}

export default function DoctorPatientDetail({ profile }) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  // Health-record detail modal
  const [viewingRecord, setViewingRecord] = useState(null);

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
  const [viewingRx, setViewingRx] = useState(null);
  const [latestVitals, setLatestVitals] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [patientStatus, setPatientStatus] = useState('active');
  const [changingStatus, setChangingStatus] = useState(false);

  // Data sharing permissions from patient privacy settings
  const [dataSharing, setDataSharing] = useState({});

  // Self-discharge request submitted by the patient
  const [selfDischargeRequest, setSelfDischargeRequest] = useState(null);

  // Note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: '', content: '', type: 'consultation' });
  const [savingNote, setSavingNote] = useState(false);

  // Discharge modal
  const [showDischarge, setShowDischarge] = useState(false);
  const [dischargeReason, setDischargeReason] = useState('');
  const [discharging, setDischarging] = useState(false);

  // Timeline
  const [timeline, setTimeline] = useState([]);

  // E-Pharmacy
  const [sendingToPharmacy, setSendingToPharmacy] = useState(null); // pharmacyId being sent to
  const [sentPharmacies, setSentPharmacies] = useState({}); // { pharmacyId: true }
  const [showAddPharmacy, setShowAddPharmacy] = useState(false);
  const [pharmacyForm, setPharmacyForm] = useState({ name: '', address: '', phone: '', email: '', notes: '' });
  const [savingPharmacy, setSavingPharmacy] = useState(false);
  const [removingPharmacyKey, setRemovingPharmacyKey] = useState(null);

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

      // Derive patient info from appointments, then enrich from the patient profile.
      // NOTE: the patient's /auth doc is self-or-admin only (a doctor viewing another
      // user gets 403 → the extended info silently failed to load). /patients/{id} is
      // doctor-readable and returns name/email/phone plus metadata (dob, blood type,
      // allergies), so source the header from there instead.
      let patientName = appts[0]?.clientName || '';
      let patientEmail = appts[0]?.clientEmail || '';
      let bloodType = '', allergies = '', dob = '', phone = '';
      let pd = null;
      try {
        const profSnap = await getDoc(doc(db, 'patientProfiles', patientId));
        if (profSnap.exists()) {
          pd = profSnap.data();
          patientName = pd.name || pd.fullName || pd.displayName || patientName || 'Patient';
          patientEmail = pd.email || patientEmail;
          bloodType = pd.bloodType || '';
          allergies = pd.allergies || '';
          dob = pd.dob || pd.dateOfBirth || '';
          phone = pd.phone || '';
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

      // Extended patient profile (insurance, emergency contact, health records,
      // vitals, pharmacies) — reuse the profile fetched above for the header.
      if (pd) {
        setPatientProfile(pd);
        setLatestVitals(parseLatestVitals(pd));
        setPharmacies(pd.pharmacies || []);
        setPatientStatus(pd.status || 'active');
        setDataSharing(pd.privacy?.dataSharing || {});
      }

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

      // Self-discharge request
      try {
        const disSnap = await getDocs(query(
          collection(db, 'dischargeRequests'),
          where('patientId', '==', patientId)
        ));
        if (!disSnap.empty) {
          const sorted = disSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
          setSelfDischargeRequest(sorted[0]);
        }
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

      // Load patient timeline
      try {
        const tlSnap = await getDocs(query(
          collection(db, 'patientTimeline'),
          where('patientId', '==', patientId)
        ));
        const events = tlSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setTimeline(events);
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

  const openFullPrescriptionForm = () => {
    navigate('/dashboard/prescriptions', {
      state: {
        openRxForm: true,
        presetPatientId: patientId,
        presetPatientName: patient?.name || '',
      },
    });
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

  // Change patient status
  const changePatientStatus = async (newStatus) => {
    const labels = { active: 'Active', inactive: 'Inactive', discharged: 'Discharged' };
    const confirmMsg = newStatus === 'discharged'
      ? `Discharge ${patient?.name}? Use the Discharge button below for full discharge with a reason, or confirm here for a quick status change.`
      : `Set ${patient?.name} to ${labels[newStatus]}?`;
    if (!window.confirm(confirmMsg)) return;
    setChangingStatus(true);
    try {
      await setDoc(doc(db, 'patientProfiles', patientId), {
        status: newStatus,
        updatedBy: profile.id,
        updatedByName: profile.name || 'Doctor',
        updatedAt: serverTimestamp(),
        ...(newStatus === 'discharged' ? { dischargedAt: serverTimestamp() } : {}),
      }, { merge: true });
      setPatientStatus(newStatus);
    } catch (err) {
      console.error('Error changing patient status:', err);
      alert('Could not update patient status. Please try again.');
    } finally {
      setChangingStatus(false);
    }
  };

  // Send prescription to pharmacy
  const sendPrescriptionToPharmacy = async (pharmacy, pharmacyIdx) => {
    const latestRx = prescriptions[0];
    if (!latestRx) { alert('No prescriptions found. Please issue a prescription first.'); return; }
    const key = pharmacyIdx;
    setSendingToPharmacy(key);
    try {
      await updateDoc(doc(db, 'doctorPrescriptions', latestRx.id), {
        pharmacy: { name: pharmacy.name, address: pharmacy.address || '', phone: pharmacy.phone || '' },
        pharmacyStatus: 'sent',
        sentAt: serverTimestamp(),
      });
      setSentPharmacies(prev => ({ ...prev, [key]: true }));
    } catch (err) {
      console.error('Error sending prescription:', err);
      alert('Could not send prescription. Please try again.');
    } finally {
      setSendingToPharmacy(null);
    }
  };

  // Add pharmacy on behalf of patient
  const removePatientPharmacyEntry = async (ph) => {
    const rk = patientPharmacyKey(ph) || ph.id || ph.name || '';
    setRemovingPharmacyKey(rk);
    try {
      const updated = removePatientPharmacyByKey(pharmacies, ph);
      await setDoc(doc(db, 'patientProfiles', patientId), { pharmacies: updated }, { merge: true });
      setPharmacies(updated);
    } catch (err) {
      console.error(err);
      alert('Could not remove pharmacy. Please try again.');
    } finally {
      setRemovingPharmacyKey(null);
    }
  };

  const addPharmacyForPatient = async () => {
    if (!pharmacyForm.name.trim()) return;
    setSavingPharmacy(true);
    try {
      const newPharmacy = {
        id: Date.now().toString(),
        name: pharmacyForm.name.trim(),
        address: pharmacyForm.address.trim(),
        country: '',
        city: '',
        area: '',
        region: '',
        street: '',
        ghanaDigitalAddress: '',
        latitude: null,
        longitude: null,
        phone: pharmacyForm.phone.trim(),
        email: pharmacyForm.email.trim(),
        notes: pharmacyForm.notes.trim(),
        addedByDoctor: true,
        addedByDoctorId: profile.id,
        addedByDoctorName: profile.name || 'Doctor',
        addedAt: new Date().toISOString(),
      };
      if (hasPatientPharmacy(pharmacies, newPharmacy)) {
        alert('⚠️ This e-pharmacy is already added for this patient.');
        setSavingPharmacy(false);
        return;
      }
      const updated = [...pharmacies, newPharmacy];
      await setDoc(doc(db, 'patientProfiles', patientId), { pharmacies: updated }, { merge: true });
      setPharmacies(updated);
      setPharmacyForm({ name: '', address: '', phone: '', email: '', notes: '' });
      setShowAddPharmacy(false);
    } catch (err) {
      console.error('Error adding pharmacy:', err);
      alert('Could not add pharmacy. Please try again.');
    } finally {
      setSavingPharmacy(false);
    }
  };

  const noteTypeColors = { consultation: '#1e6bb8', followup: '#7c3aed', prescription: '#059669', referral: '#d97706', discharge: '#dc2626', general: '#64748b' };

  const RestrictedAccess = ({ section }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', border: '1.5px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', marginBottom: '1rem' }}>
        🔒
      </div>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Access Restricted</h3>
      <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', maxWidth: 360, lineHeight: 1.6 }}>
        This patient has restricted doctor access to their {section}.<br />
        This data is hidden based on their privacy settings.
      </p>
    </div>
  );

  if (loading) return <div className="doctor-page"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>Loading patient records…</p></div>;
  if (!patient) return <div className="doctor-page"><p style={{ textAlign: 'center', padding: '3rem' }}>Patient not found.</p></div>;

  return (
    <div className="doctor-page">
      {/* Back */}
      <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate('/dashboard/patients')} style={{ marginBottom: '1.25rem' }}>
        <ChevronLeft size={16} /> Back to Patients
      </button>

      {/* How they have actually been taking their medication. Hides itself
          when nothing has been logged — an empty chart would read as perfect
          adherence rather than as no data. */}
      <AdherencePanel patientId={patientId} />

      {/* What is missing from this record, by rule — nothing renders when complete. */}
      <RecordGapsPanel patientId={patientId} />

      {/* A document the patient handed over: read, name-checked, filed by you. */}
      <SmartDocumentUpload patientId={patientId} />

      {/* Codes suggested from your own documentation, approved by you. */}
      <CodingAssistPanel patientId={patientId} />

      {/* Search this patient's record in plain words, and read it in order.
          Both halves come from the same server retrieval, so they cannot
          disagree about what is on file. */}
      <RecordExplorer subjectId={patientId} title="This patient's record" />

      {/* Patient Header */}
      <div className="doctor-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #1e6bb8, #2563eb)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.4rem', flexShrink: 0 }}>
            {getInitials(patient.name)}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{patient.name}</h2>
            {patient.email && <p style={{ margin: '0 0 0.4rem', color: '#64748b', fontSize: '0.875rem' }}>{patient.email}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={isActive ? 'confirmed' : 'cancelled'} />
              {/* Patient Panel status */}
              {(() => {
                const smap = { active: ['#f0fdf4','#15803d','#bbf7d0','Active'], inactive: ['#fff7ed','#c2410c','#fed7aa','Inactive'], discharged: ['#fef2f2','#b91c1c','#fecdd3','Discharged'] };
                const [bg, color, border, label] = smap[patientStatus] || smap.active;
                return <span style={{ background: bg, color, border: `1px solid ${border}`, padding: '0.2rem 0.65rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 }}>{label}</span>;
              })()}
              {lastVisit && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Last visit: {fmtDate(lastVisit)}</span>}
            </div>
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => { setActiveTab('notes'); setShowNoteForm(true); }}>
              <Plus size={14} /> Add Note
            </button>
            <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={openFullPrescriptionForm}>
              <Pill size={14} /> Prescribe
            </button>
            <button className="doctor-btn doctor-btn-sm"
              style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}
              onClick={() => navigate('/dashboard/diagnostic-order', { state: { patientId, patientName: patient?.name } })}>
              <FlaskConical size={14} /> Order Lab/Scan
            </button>
            <button className="doctor-btn doctor-btn-sm"
              style={{ background: '#ede9fe', color: '#4c1d95', border: '1px solid #c4b5fd' }}
              onClick={() => setActiveTab('timeline')}>
              <Clock size={14} /> Timeline
            </button>
            <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate('/dashboard/messages')}>
              <MessageSquare size={14} /> Message
            </button>
            <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => navigate('/dashboard/video')}>
              <Video size={14} /> Video Call
            </button>
            {/* Status actions */}
            {patientStatus === 'active' && (
              <button className="doctor-btn doctor-btn-sm" disabled={changingStatus}
                style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.78rem' }}
                onClick={() => changePatientStatus('inactive')}>
                <Activity size={13} /> {changingStatus ? '…' : 'Set Inactive'}
              </button>
            )}
            {patientStatus === 'inactive' && (
              <button className="doctor-btn doctor-btn-sm" disabled={changingStatus}
                style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontSize: '0.78rem' }}
                onClick={() => changePatientStatus('active')}>
                <UserCheck size={13} /> {changingStatus ? '…' : 'Set Active'}
              </button>
            )}
            {patientStatus === 'discharged' && (
              <button className="doctor-btn doctor-btn-sm" disabled={changingStatus}
                style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontSize: '0.78rem' }}
                onClick={() => changePatientStatus('active')}>
                <UserCheck size={13} /> {changingStatus ? '…' : 'Reactivate'}
              </button>
            )}
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
        {[['overview','Overview'],['appointments','Appointments'],['notes','Notes'],['prescriptions','Prescriptions'],['epharmacy','E-Pharmacy'],['info','Patient Info'],['feelings','Daily Feeling'],['timeline','Health Timeline']].map(([key, label]) => (
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
        dataSharing.appointments === false
          ? <div className="doctor-card"><RestrictedAccess section="appointment history" /></div>
          : <div className="doctor-card">
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
        dataSharing.prescriptions === false
          ? <div className="doctor-card"><RestrictedAccess section="prescriptions" /></div>
          : <div>
          <button className="doctor-btn doctor-btn-primary" style={{ marginBottom: '1rem' }} onClick={openFullPrescriptionForm}>
            <Plus size={16} /> New prescription (full form)
          </button>

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
                  const altMed = (rx.medications || []).find(m => m.alternativeSuggested);
                  const transferredMed = (rx.medications || []).find(m => m.drugStatus === 'transferred' && m.transferBranchName);
                  const metaLine = [
                    rx.dosage || rx.medications?.[0]?.dosage,
                    rx.frequency || rx.medications?.[0]?.frequency,
                    rx.duration || rx.medications?.[0]?.duration,
                  ].filter(Boolean).join(' • ');
                  return (
                    <div key={rx.id} onClick={() => setViewingRx(rx)} style={{ padding: '1rem', background: isDone ? '#f0fdf4' : '#f8fafc', borderRadius: 10, border: `1.5px solid ${isDone ? '#bbf7d0' : '#e2e8f0'}`, borderLeft: isDone ? '4px solid #22c55e' : '1.5px solid #e2e8f0', cursor: 'pointer' }}>
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
                      {altMed && (
                        <p style={{ margin: '0.45rem 0 0', fontSize: '0.78rem', color: altMed.drugStatus === 'approved_replacement' ? '#166534' : '#7c3aed', background: '#fdf4ff', padding: '0.45rem 0.65rem', borderRadius: 6, border: '1px solid #e9d5ff' }}>
                          🔁 {altMed.name || 'Original'} → {altMed.alternativeSuggested} · {altMed.drugStatus === 'approved_replacement'
                            ? `Approved · Dr. ${altMed.approvedByDoctorName || rx.doctorName || 'Doctor'}`
                            : 'Waiting for Approval from your Doctor'}
                          {altMed.alternativeRationale ? ` · Why: ${altMed.alternativeRationale}` : ''}
                        </p>
                      )}
                      {transferredMed && (
                        <p style={{ margin: '0.45rem 0 0', fontSize: '0.78rem', color: '#0369a1', background: '#eff6ff', padding: '0.45rem 0.65rem', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                          This drug ({transferredMed.name || 'Drug'}) is transfered to branch ({transferredMed.transferBranchName}{transferredMed.transferBranchAddress ? `, ${transferredMed.transferBranchAddress}` : ''}).
                        </p>
                      )}
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: '#94a3b8', textAlign: 'right' }}>Tap card for full details</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── E-PHARMACY TAB ── */}
      {activeTab === 'epharmacy' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Patient Pharmacies</h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>Send prescriptions directly to the patient's preferred pharmacies</p>
            </div>
            <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => setShowAddPharmacy(v => !v)}>
              <Plus size={14} /> {showAddPharmacy ? 'Cancel' : 'Add Pharmacy'}
            </button>
          </div>

          {/* Add pharmacy form */}
          {showAddPharmacy && (
            <div className="doctor-card" style={{ marginBottom: '1rem', borderLeft: '4px solid #1e6bb8' }}>
              <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#0f172a' }}>Add Pharmacy for Patient</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.65rem' }}>
                <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                  <label>Pharmacy Name *</label>
                  <input className="doctor-form-input" placeholder="e.g., CVS Pharmacy" value={pharmacyForm.name} onChange={e => setPharmacyForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                  <label>Phone</label>
                  <input className="doctor-form-input" placeholder="e.g., +1 (555) 123-4567" value={pharmacyForm.phone} onChange={e => setPharmacyForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                  <label>Address</label>
                  <input className="doctor-form-input" placeholder="Street address" value={pharmacyForm.address} onChange={e => setPharmacyForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="doctor-form-group" style={{ marginBottom: 0 }}>
                  <label>Email</label>
                  <input className="doctor-form-input" placeholder="pharmacy@example.com" value={pharmacyForm.email} onChange={e => setPharmacyForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="doctor-form-group" style={{ marginBottom: '0.75rem' }}>
                <label>Notes</label>
                <input className="doctor-form-input" placeholder="e.g., 24-hour pharmacy, preferred for controlled substances" value={pharmacyForm.notes} onChange={e => setPharmacyForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={addPharmacyForPatient} disabled={savingPharmacy || !pharmacyForm.name.trim()}>
                  <Save size={13} /> {savingPharmacy ? 'Saving…' : 'Save Pharmacy'}
                </button>
                <button className="doctor-btn doctor-btn-outline doctor-btn-sm" onClick={() => { setShowAddPharmacy(false); setPharmacyForm({ name: '', address: '', phone: '', email: '', notes: '' }); }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Pharmacy list */}
          {pharmacies.length === 0 ? (
            <div className="doctor-card">
              <div className="doctor-empty-state">
                <span style={{ fontSize: '2rem' }}>💊</span>
                <h3>No pharmacies on file</h3>
                <p>This patient has not added any pharmacies yet. You can add one on their behalf.</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {pharmacies.map((ph, idx) => {
                const isSending = sendingToPharmacy === idx;
                const alreadySent = sentPharmacies[idx];
                const phRowKey = patientPharmacyKey(ph) || ph.id || String(idx);
                return (
                  <div key={phRowKey} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    {/* Icon */}
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
                      💊
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{ph.name}</p>
                        {ph.addedByDoctor && (
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, padding: '0.1rem 0.5rem', fontSize: '0.68rem', fontWeight: 700 }}>Added by Doctor</span>
                        )}
                      </div>
                      {ph.address && <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#64748b' }}>📍 {ph.address}</p>}
                      {ph.phone && <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#64748b' }}>📞 {ph.phone}</p>}
                      {ph.email && <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#64748b' }}>✉️ {ph.email}</p>}
                      {ph.notes && <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>{ph.notes}</p>}
                    </div>

                    {/* Remove + send */}
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '0.45rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        title="Remove pharmacy from patient"
                        disabled={removingPharmacyKey === phRowKey}
                        onClick={(e) => { e.stopPropagation(); removePatientPharmacyEntry(ph); }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          border: '1.5px solid #fecaca',
                          background: '#fef2f2',
                          color: '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: removingPharmacyKey === phRowKey ? 'wait' : 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <Minus size={18} strokeWidth={2.5} />
                      </button>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                        {alreadySent ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '0.4rem 0.85rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                            <Check size={13} /> Sent
                          </span>
                        ) : (
                          <button
                            className="doctor-btn doctor-btn-primary doctor-btn-sm"
                            style={{ whiteSpace: 'nowrap' }}
                            disabled={isSending || prescriptions.length === 0}
                            onClick={() => sendPrescriptionToPharmacy(ph, idx)}
                            title={prescriptions.length === 0 ? 'No prescriptions to send' : `Send latest prescription to ${ph.name}`}
                          >
                            {isSending ? 'Sending…' : '📤 Send Rx'}
                          </button>
                        )}
                        {prescriptions.length > 0 && (
                          <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8', textAlign: 'right' }}>
                            Latest: {prescriptions[0]?.medication || prescriptions[0]?.medications?.[0]?.name || 'Rx'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Prescription send info */}
          {prescriptions.length === 0 && pharmacies.length > 0 && (
            <div style={{ marginTop: '1rem', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <AlertTriangle size={16} color="#d97706" />
              <p style={{ margin: 0, fontSize: '0.825rem', color: '#92400e' }}>
                No prescriptions issued yet. Issue a prescription first before sending to a pharmacy.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── PATIENT INFO TAB ── */}
      {activeTab === 'info' && (
        <div className="doctor-grid-2">
          {/* Self-Discharge Request Banner */}
          {selfDischargeRequest && (
            <div style={{ gridColumn: '1 / -1', background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 800, color: '#92400e' }}>Patient Self-Discharge Request</p>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', color: '#78350f' }}>
                  <strong>Reason:</strong> {selfDischargeRequest.reason || '—'}
                </p>
                {selfDischargeRequest.message && (
                  <p style={{ margin: '0 0 0.25rem', fontSize: '0.825rem', color: '#92400e' }}>{selfDischargeRequest.message}</p>
                )}
                {selfDischargeRequest.submittedAt?.seconds && (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#b45309' }}>
                    Submitted: {new Date(selfDischargeRequest.submittedAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          )}

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
            {dataSharing.records === false ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '0.85rem 1.1rem' }}>
                <span style={{ fontSize: '1.1rem' }}>🔒</span>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#b91c1c', fontWeight: 600 }}>Health records are restricted by this patient's privacy settings.</p>
              </div>
            ) : patientProfile?.healthRecords?.length > 0 ? (
              <table className="doctor-table">
                <thead>
                  <tr><th>Document</th><th>Type</th><th>Date</th><th>Notes</th><th>File</th></tr>
                </thead>
                <tbody>
                  {patientProfile.healthRecords.map((r, i) => {
                    const types = recordTypes(r);
                    const files = recordFiles(r);
                    return (
                    <tr key={i} onClick={() => setViewingRecord(r)} style={{ cursor: 'pointer' }} title="Open full record">
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td style={{ maxWidth: 240 }}>
                        {types.length === 0 ? '—' : (
                          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {types.slice(0, 2).map(t => (
                              <span key={t} style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 20, padding: '0.1rem 0.5rem', fontSize: '0.7rem', fontWeight: 700 }}>{t}</span>
                            ))}
                            {types.length > 2 && (
                              <span style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 700, alignSelf: 'center' }}>+{types.length - 2}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td>{r.date || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{r.notes || '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {files.length === 0 ? (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                        ) : files.length === 1 ? (
                          <a
                            href={files[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={files[0].name}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#1e6bb8', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none' }}
                          >
                            <Download size={13} /> {files[0].name || 'View'}
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setViewingRecord(r)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#1e6bb8', fontWeight: 700, fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            <Download size={13} /> {files.length} files
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No health records uploaded by patient.</p>
            )}
          </div>

          {/* Latest Vitals */}
          <div className="doctor-card" style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#dc2626' }}>❤️</span> Latest Vitals
            </h3>
            {latestVitals ? (
              <>
                {latestVitals.recordedAt?.seconds && (
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    Recorded: {new Date(latestVitals.recordedAt.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                  {(latestVitals.bpSystolic || latestVitals.bpDiastolic) && (
                    <div style={{ background: '#fff0f0', borderRadius: 10, padding: '0.85rem 1rem', border: '1.5px solid #fecaca' }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Blood Pressure</p>
                      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>{latestVitals.bpSystolic || '—'} / {latestVitals.bpDiastolic || '—'} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>mmHg</span></p>
                    </div>
                  )}
                  {latestVitals.heartRate && (
                    <div style={{ background: '#fff0f0', borderRadius: 10, padding: '0.85rem 1rem', border: '1.5px solid #fecaca' }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Heart Rate</p>
                      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>{latestVitals.heartRate} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>bpm</span></p>
                    </div>
                  )}
                  {latestVitals.respiratoryRate && (
                    <div style={{ background: '#eff6ff', borderRadius: 10, padding: '0.85rem 1rem', border: '1.5px solid #bfdbfe' }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Respiratory Rate</p>
                      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1d4ed8' }}>{latestVitals.respiratoryRate} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>breaths/min</span></p>
                    </div>
                  )}
                  {latestVitals.spo2 && (
                    <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '0.85rem 1rem', border: '1.5px solid #bbf7d0' }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>SpO2</p>
                      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>{latestVitals.spo2}<span style={{ fontSize: '0.75rem', fontWeight: 400 }}>%</span></p>
                    </div>
                  )}
                  {latestVitals.temperature && (
                    <div style={{ background: '#fff7ed', borderRadius: 10, padding: '0.85rem 1rem', border: '1.5px solid #fed7aa' }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Temperature</p>
                      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>{latestVitals.temperature} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>°{latestVitals.tempUnit || 'C'}</span></p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No vitals recorded by patient yet.</p>
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
        dataSharing.labResults === false
          ? <div className="doctor-card"><RestrictedAccess section="daily health check-ins" /></div>
          : <div>
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

      {viewingRx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(3px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setViewingRx(null)}>
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '88vh', overflowY: 'auto', padding: '1.25rem', boxShadow: '0 22px 60px rgba(2,6,23,0.28)', border: '1px solid #e2e8f0' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', paddingBottom: '0.65rem', borderBottom: '1px solid #eef2f7' }}>
              <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>Prescription Details</h3>
              <button className="doctor-btn doctor-btn-sm doctor-btn-outline" style={{ borderRadius: 10 }} onClick={() => setViewingRx(null)}>Close</button>
            </div>
            <p style={{ margin: '0 0 0.3rem', color: '#0f172a', fontWeight: 700 }}>{viewingRx.patientName || patient?.name || 'Patient'}</p>
            <p style={{ margin: '0 0 0.75rem', color: '#64748b', fontSize: '0.85rem' }}>{viewingRx.diagnosis || '—'} · {viewingRx.date || '—'} {viewingRx.prescriptionRef ? `· ${viewingRx.prescriptionRef}` : ''}</p>
            {(viewingRx.medications || []).map((m, i) => (
              <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem', marginBottom: '0.5rem' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>{[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ') || '—'}</p>
                {m.drugStatus === 'transferred' && m.transferBranchName ? (
                  <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: '#0369a1', fontWeight: 700 }}>
                    This drug ({m.name || 'Drug'}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
                  </p>
                ) : null}
              </div>
            ))}
            {viewingRx.instructions ? <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#374151' }}><b>Instructions:</b> {viewingRx.instructions}</p> : null}
          </div>
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
                {/* Every section above is conditional, so a check-in with no stored
                    content rendered as a blank white panel that looked broken. Say
                    plainly that there is nothing to show. */}
                {!viewingFeeling.mood && viewingFeeling.painLevel == null && symptomList.length === 0
                  && !viewingFeeling.medications && !viewingFeeling.notes && (
                  <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '1rem 1.25rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#92400e' }}>No details were recorded with this check-in.</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#a16207', lineHeight: 1.5 }}>
                      The patient logged it, but the answers were not stored. Check-ins submitted from now on capture mood, pain level, symptoms, medications and notes.
                    </p>
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

      {/* ── HEALTH TIMELINE TAB ── */}
      {activeTab === 'timeline' && (() => {
        const EVENT_CFG = {
          APPOINTMENT:     { emoji: '📅', color: '#1e6bb8', bg: '#e8f1fb', label: 'Appointment' },
          PRESCRIPTION:    { emoji: '💊', color: '#7c3aed', bg: '#f3e8ff', label: 'Prescription' },
          LAB_ORDER:       { emoji: '🧪', color: '#065f46', bg: '#d1fae5', label: 'Lab Order' },
          LAB_RESULT:      { emoji: '📋', color: '#059669', bg: '#d1fae5', label: 'Lab Result' },
          SCAN_ORDER:      { emoji: '🩻', color: '#4c1d95', bg: '#ede9fe', label: 'Scan Order' },
          SCAN_RESULT:     { emoji: '📄', color: '#6d28d9', bg: '#ede9fe', label: 'Scan Report' },
          PHARMACY_UPDATE: { emoji: '🏪', color: '#0c4a6e', bg: '#e0f2fe', label: 'Pharmacy' },
        };
        const STATUS_COL = {
          PENDING:     { bg: '#fef3c7', color: '#92400e' },
          IN_PROGRESS: { bg: '#dbeafe', color: '#1e40af' },
          COMPLETED:   { bg: '#dcfce7', color: '#14532d' },
        };
        const fmtTs = (ts) => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Health Timeline</h3>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>{timeline.length} event{timeline.length !== 1 ? 's' : ''} on record</p>
              </div>
              <button className="doctor-btn doctor-btn-sm" style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}
                onClick={() => navigate('/dashboard/diagnostic-order', { state: { patientId, patientName: patient?.name } })}>
                <FlaskConical size={13} /> New Order
              </button>
            </div>
            {timeline.length === 0 ? (
              <div className="doctor-card">
                <div className="doctor-empty-state">
                  <Clock size={36} />
                  <h3>No timeline events yet</h3>
                  <p>Events appear here as the patient receives care — prescriptions, lab orders, scan orders, and results.</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {timeline.map(evt => {
                  const cfg = EVENT_CFG[evt.type] || EVENT_CFG.APPOINTMENT;
                  const sc = STATUS_COL[evt.status] || STATUS_COL.COMPLETED;
                  return (
                    <div key={evt.id} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                        {cfg.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.label}</span>
                          <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: '0.1rem 0.5rem', fontSize: '0.68rem', fontWeight: 700 }}>{evt.status}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>{evt.title}</p>
                        {evt.actor?.name && <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>by {evt.actor.name}</p>}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtTs(evt.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
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

      {/* Health record detail — the table row only has room for a summary, and the
          record's attachments are per-document-type, so open the whole thing here. */}
      {viewingRecord && (() => {
        const types = recordTypes(viewingRecord);
        const files = recordFiles(viewingRecord);
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}
            onClick={() => setViewingRecord(null)}
          >
            <div
              style={{ background: 'white', borderRadius: 20, maxWidth: 760, width: '100%', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ background: '#eff6ff', borderBottom: '1.5px solid #bfdbfe', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a' }}>{viewingRecord.name || 'Health record'}</h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#475569' }}>
                    Submitted by {patient?.name || 'the patient'}{viewingRecord.date ? ` • ${viewingRecord.date}` : ''}
                  </p>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', flexShrink: 0 }} onClick={() => setViewingRecord(null)}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {types.length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document types</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {types.map(t => (
                        <span key={t} style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 20, padding: '0.25rem 0.7rem', fontSize: '0.78rem', fontWeight: 700 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {viewingRecord.notes && (
                  <div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patient notes</p>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', color: '#0f172a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {viewingRecord.notes}
                    </div>
                  </div>
                )}

                <div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Attachments {files.length > 0 ? `(${files.length})` : ''}
                  </p>
                  {files.length === 0 ? (
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.875rem' }}>No files attached to this record.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {files.map((f, i) => (
                        <div key={`${f.url}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.75rem 1rem' }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{f.label}</p>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                          </div>
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={f.name}
                            className="doctor-btn doctor-btn-outline doctor-btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', flexShrink: 0 }}
                          >
                            <Download size={14} /> Download
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
