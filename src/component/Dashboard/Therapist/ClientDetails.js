import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '../../../services/firestoreShim';
import {
  collection, query, where, getDocs, getDoc, doc,
  addDoc, updateDoc, serverTimestamp, orderBy, limit, setDoc
} from '../../../services/firestoreShim';
import AdherencePanel from '../../Common/AdherencePanel';
import { hasPatientPharmacy, patientPharmacyKey, removePatientPharmacyByKey } from '../../../utils/patientPharmacyDedupe';
import { isRxDelivered } from '../../../utils/pharmacyRxStatus';
// The Prescriptions / E-Pharmacy tabs reuse the doctor page's doctor-* classes.
import '../Doctor/DoctorDashboard.css';
import {
  ArrowLeft, User, Mail, Phone, Calendar, FileText,
  MessageSquare, Edit, UserX, UserCheck, TrendingUp,
  Activity, Clock, Heart, AlertTriangle, Target, CheckCircle, BookOpen, Eye,
  Pill, Plus, Save, Check, Minus,
} from 'lucide-react';
import { api } from '../../../services/apiClient';
import ChatModal from './ChatModal';
import WeeklyCheckInPanel from '../../Common/WeeklyCheckInPanel';
import PreSessionBrief from '../../Common/PreSessionBrief';
import RecordGapsPanel from '../../Common/RecordGapsPanel';
import CodingAssistPanel from '../../Common/CodingAssistPanel';
import './ClientDetails.css';
import {
  getClientDisplayName,
  getClientPhone,
  getClientRelationshipStatus,
  fetchClientSessions,
  getLastSessionRecord,
  resolveTherapistIdForClient,
  fetchAuthProfileForClient,
  getQuestionnaireGroupedSections,
  PHQ9_SCALE,
  formatFieldValue,
  formatSessionDateLabel,
  formatSessionTimeLabel,
  sessionTimestamp,
  toFirestoreDate,
} from '../../../utils/clientTherapyMetrics';
import { getNoteSections, getNotePreview, getNoteTitle } from '../../../utils/noteDisplayUtils';

const noteCardStyle = {
  padding: '1.2rem',
  margin: '0.75rem 0',
  background: '#f8fafc',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  cursor: 'pointer',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const cardStyle = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};

/* ─────────────────────────────────────────────
   Note detail modal (therapy + clinical)
───────────────────────────────────────────── */
function NoteDetailModal({ note, kind, onClose }) {
  const sections = getNoteSections(note);
  const title = getNoteTitle(note, kind);
  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(2px)', padding: '1rem',
  };
  const modal = {
    background: '#fff', borderRadius: 18, padding: '1.75rem',
    width: '100%', maxWidth: 640, maxHeight: '85vh', overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  };

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{title}</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
              {fmtDate(note.createdAt || note.sessionDate)}
              {note.therapistName ? ` · ${note.therapistName}` : ''}
              {note.isDraft === true ? ' · Draft' : note.isDraft === false ? ' · Final' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }} aria-label="Close">×</button>
        </div>

        {sections.length === 0 ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>This note has no stored content.</p>
        ) : (
          sections.map((section) => (
            <div key={section.key} style={{ marginBottom: '1.1rem', paddingBottom: '1.1rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {section.label}
              </div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{section.value}</p>
            </div>
          ))
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '0.6rem 1.25rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteListCard({ note, kind, onOpen }) {
  const preview = getNotePreview(note);
  const title = getNoteTitle(note, kind);
  const sections = getNoteSections(note);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(note, kind)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(note, kind); } }}
      style={noteCardStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#c7d2fe';
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(79,70,229,0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e2e8f0';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>{fmtDate(note.createdAt || note.sessionDate)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {note.mood != null && note.mood !== '' && (
            <span style={{ padding: '0.2rem 0.65rem', borderRadius: 20, background: '#eff6ff', color: '#4f46e5', fontSize: '0.72rem', fontWeight: 700 }}>
              Mood {note.mood}{typeof note.mood === 'number' || /^\d+$/.test(String(note.mood)) ? '/10' : ''}
            </span>
          )}
          {note.moodRating != null && note.moodRating !== '' && (
            <span style={{ padding: '0.2rem 0.65rem', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontSize: '0.72rem', fontWeight: 700 }}>
              Mood {note.moodRating}
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#4f46e5', fontWeight: 600 }}>
            <Eye size={13} /> Read
          </span>
        </div>
      </div>

      {sections.length > 0 ? (
        <>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: '#475569', lineHeight: 1.55 }}>{preview}</p>
          {sections.length > 1 && (
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {sections.slice(0, 2).map((s) => (
                <span key={s.key} style={{ marginRight: '0.75rem' }}>
                  <strong style={{ color: '#64748b' }}>{s.label}:</strong> {s.value.length > 60 ? `${s.value.slice(0, 60)}…` : s.value}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>Click to view note details</p>
      )}
      <div style={{ marginTop: '0.65rem', fontSize: '0.72rem', color: '#4f46e5', fontWeight: 600 }}>Click to read full note →</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Questionnaire responses (grouped, readable)
───────────────────────────────────────────── */
function QuestionnaireResponsesPanel({ client }) {
  const sections = getQuestionnaireGroupedSections(client);
  const totalFields = sections.reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <div style={{ ...cardStyle, padding: '1.5rem', gridColumn: '1 / -1' }} className="questionnaire-panel">
      <div className="questionnaire-panel__header">
        <h3 className="questionnaire-panel__title">
          <BookOpen size={15} aria-hidden />
          Full questionnaire responses
        </h3>
        {totalFields > 0 && (
          <span className="questionnaire-panel__count">
            {sections.length} section{sections.length !== 1 ? 's' : ''} · {totalFields} answers
          </span>
        )}
      </div>

      {sections.length === 0 ? (
        <p className="questionnaire-empty">No questionnaire responses on file.</p>
      ) : (
        <div className="questionnaire-panel__body">
          {sections.map((section) => (
            <section
              key={section.id}
              className={`questionnaire-section${section.id === 'phq9' ? ' questionnaire-section--phq9' : ''}`}
              aria-labelledby={`q-section-${section.id}`}
            >
              <header className="questionnaire-section__head">
                <h4 id={`q-section-${section.id}`} className="questionnaire-section__title">
                  {section.title}
                </h4>
                {section.phq9Summary ? (
                  <>
                    <p className="questionnaire-section__meta">
                      Past 2 weeks · {section.rows.length} questions
                    </p>
                    <div className="questionnaire-phq9-summary">
                      <span className="questionnaire-phq9-summary__score">
                        Total score: <strong>{section.phq9Summary.total}</strong> / {section.phq9Summary.maxScore}
                      </span>
                      {section.phq9Summary.severity && (
                        <span className={`questionnaire-phq9-summary__severity severity-${section.phq9Summary.severity.key}`}>
                          {section.phq9Summary.severity.label}
                        </span>
                      )}
                    </div>
                    <p className="questionnaire-phq9-legend">
                      {PHQ9_SCALE.map((o) => `${o.value} = ${o.label}`).join(' · ')}
                    </p>
                  </>
                ) : (
                  <p className="questionnaire-section__meta">
                    {section.rows.length} response{section.rows.length !== 1 ? 's' : ''}
                  </p>
                )}
              </header>
              <div className={`questionnaire-fields${section.id !== 'phq9' ? ' questionnaire-fields--two-col' : ''}`}>
                {section.rows.map((row) => (
                  <div key={row.fieldKey} className="questionnaire-field">
                    <span className="questionnaire-field__label">{row.label}</span>
                    {row.phq9Score != null ? (
                      <p className="questionnaire-phq9-answer__label">{row.value}</p>
                    ) : (
                      <p className="questionnaire-field__value">{row.value}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Inline TherapyNoteModal
───────────────────────────────────────────── */
function TherapyNoteModal({ clientId, therapistId, onClose, onSaved }) {
  const [form, setForm] = useState({
    sessionFocus: '',
    progressAssessment: '',
    mood: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSave = async () => {
    if (!form.notes.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'clients', clientId, 'therapyNotes'), {
        ...form,
        clientId,
        therapistId,
        createdAt: serverTimestamp(),
      });
      onSaved && onSaved();
      onClose();
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setSaving(false);
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(2px)',
  };
  const modal = {
    background: '#fff', borderRadius: 18, padding: '2rem',
    width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', gap: '1rem',
  };
  const label = { fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
  const input = {
    width: '100%', padding: '0.6rem 0.85rem', borderRadius: 10,
    border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };
  const btnRow = { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: 4 };

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Add Therapy Note</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div>
          <div style={label}>Session Focus</div>
          <input style={input} name="sessionFocus" value={form.sessionFocus} onChange={handleChange} placeholder="e.g. Anxiety management, CBT exercises" />
        </div>
        <div>
          <div style={label}>Mood Rating (1–10)</div>
          <input style={input} name="mood" type="number" min="1" max="10" value={form.mood} onChange={handleChange} placeholder="5" />
        </div>
        <div>
          <div style={label}>Progress Assessment</div>
          <input style={input} name="progressAssessment" value={form.progressAssessment} onChange={handleChange} placeholder="e.g. Good progress, needs follow-up" />
        </div>
        <div>
          <div style={label}>Clinical Notes *</div>
          <textarea
            style={{ ...input, minHeight: 110, resize: 'vertical' }}
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Detailed session notes..."
          />
        </div>

        <div style={btnRow}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#64748b' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.notes.trim()}
            style={{ padding: '0.6rem 1.4rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
const MOOD_EMOJI = { 1: '😞', 2: '😟', 3: '😕', 4: '🙁', 5: '😐', 6: '🙂', 7: '😊', 8: '😄', 9: '😁', 10: '🤩' };
const MOOD_LABEL = { 1: 'Very Low', 2: 'Low', 3: 'Below Avg', 4: 'Slightly Low', 5: 'Neutral', 6: 'Okay', 7: 'Good', 8: 'Great', 9: 'Excellent', 10: 'Outstanding' };

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'active') return { bg: '#dcfce7', color: '#15803d' };
  if (s === 'inactive') return { bg: '#f1f5f9', color: '#64748b' };
  if (s === 'on_hold') return { bg: '#fef9c3', color: '#b45309' };
  if (s === 'discharged') return { bg: '#fee2e2', color: '#b91c1c' };
  return { bg: '#e0e7ff', color: '#4f46e5' };
}

function sessionStatusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return { bg: '#dcfce7', color: '#15803d' };
  if (s === 'upcoming' || s === 'scheduled') return { bg: '#dbeafe', color: '#1d4ed8' };
  if (s === 'cancelled') return { bg: '#fee2e2', color: '#b91c1c' };
  return { bg: '#f1f5f9', color: '#64748b' };
}

function fmtDate(ts) {
  const d = toFirestoreDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function Avatar({ name, size = 72 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#4f46e5,#818cf8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 800, fontSize: size * 0.32,
      flexShrink: 0, letterSpacing: '-0.02em',
    }}>
      {initials}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function ClientDetails() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [authProfile, setAuthProfile] = useState(null);
  const [resolvedTherapistId, setResolvedTherapistId] = useState(null);
  const [therapistName, setTherapistName] = useState('');
  const [sessions, setSessions] = useState([]);
  const [therapyNotes, setTherapyNotes] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [moodEntries, setMoodEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [isAdmin, setIsAdmin] = useState(false);

  const [showNoteModal, setShowNoteModal] = useState(false);

  // ── Prescribing (psychiatry track only) ────────────────────────────────────
  // Opens the full prescription form (Prescriptions page) with this client
  // preselected — the same hand-off as DoctorPatientDetail.openFullPrescriptionForm.
  const openFullPrescriptionForm = () => {
    navigate('/dashboard/prescriptions', {
      state: {
        openRxForm: true,
        presetPatientId: client?.id || client?.clientId,
        presetPatientName: client?.name || '',
      },
    });
  };
  // ── Prescriptions & E-Pharmacy (psychiatry track) ─────────────────────────
  // Copied from Doctor/DoctorPatientDetail.js so a psychiatrist has the same
  // per-client prescription and pharmacy tools as a doctor has per patient.
  const therapistUid = auth.currentUser?.uid;
  const isPsychiatryClient = String(client?.careTrack || '').toLowerCase() === 'psychiatry';
  const [prescriptions, setPrescriptions] = useState([]);
  const [viewingRx, setViewingRx] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [dataSharing, setDataSharing] = useState({});
  const [sendingToPharmacy, setSendingToPharmacy] = useState(null);
  const [sentPharmacies, setSentPharmacies] = useState({});
  const [showAddPharmacy, setShowAddPharmacy] = useState(false);
  const [pharmacyForm, setPharmacyForm] = useState({ name: '', address: '', phone: '', email: '', notes: '' });
  const [savingPharmacy, setSavingPharmacy] = useState(false);
  const [removingPharmacyKey, setRemovingPharmacyKey] = useState(null);

  useEffect(() => {
    if (!isPsychiatryClient || !clientId || !therapistUid) return;
    (async () => {
      try {
        const pSnap = await getDoc(doc(db, 'patientProfiles', clientId));
        if (pSnap.exists()) {
          const pd = pSnap.data();
          setPharmacies(pd.pharmacies || []);
          setDataSharing(pd.privacy?.dataSharing || {});
        }
      } catch { /* tabs show empty */ }
      try {
        const rxSnap = await getDocs(query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', therapistUid), where('patientId', '==', clientId)));
        const rxList = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        rxList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setPrescriptions(rxList);
      } catch { /* ignore */ }
    })();
  }, [isPsychiatryClient, clientId, therapistUid]);

  // Send prescription to pharmacy
  const sendPrescriptionToPharmacy = async (pharmacy, pharmacyIdx) => {
    const latestRx = prescriptions[0];
    if (!latestRx) { alert('No prescriptions found. Please issue a prescription first.'); return; }
    // Only a NessaHub branch can receive a prescription. A manually typed pharmacy
    // has no account to route to; writing just `pharmacyStatus: 'sent'` used to mark
    // the prescription sent while no pharmacy ever saw it.
    if (!pharmacy.branchId) {
      alert(`${pharmacy.name} is not on NessaHub, so the prescription cannot be sent to it. Share it with the pharmacy directly, or pick a NessaHub branch.`);
      return;
    }
    if (isRxDelivered(latestRx)) {
      alert('The latest prescription has already been delivered and cannot be re-sent.');
      return;
    }
    const routedElsewhere = latestRx.branchId && latestRx.branchId !== pharmacy.branchId;
    if (routedElsewhere && !window.confirm(
      `The latest prescription is already with ${latestRx.branchName || latestRx.pharmacyName || 'another pharmacy'}. Move it to ${pharmacy.branchName || pharmacy.name}?`
    )) return;
    const key = pharmacyIdx;
    setSendingToPharmacy(key);
    try {
      await updateDoc(doc(db, 'doctorPrescriptions', latestRx.id), {
        ...(pharmacy.pharmacyId ? { pharmacyId: pharmacy.pharmacyId } : {}),
        branchId: pharmacy.branchId,
        pharmacyStatus: 'sent',
      });
      setSentPharmacies(prev => ({ ...prev, [key]: true }));
    } catch (err) {
      console.error('Error sending prescription:', err);
      alert(err?.message || 'Could not send prescription. Please try again.');
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
      await setDoc(doc(db, 'patientProfiles', clientId), { pharmacies: updated }, { merge: true });
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
        addedByDoctorId: therapistUid,
        addedByDoctorName: auth.currentUser?.displayName || 'Psychiatrist',
        addedAt: new Date().toISOString(),
      };
      if (hasPatientPharmacy(pharmacies, newPharmacy)) {
        alert('⚠️ This e-pharmacy is already added for this client.');
        setSavingPharmacy(false);
        return;
      }
      const updated = [...pharmacies, newPharmacy];
      await setDoc(doc(db, 'patientProfiles', clientId), { pharmacies: updated }, { merge: true });
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

  const RestrictedAccess = ({ section }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', border: '1.5px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', marginBottom: '1rem' }}>
        🔒
      </div>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Access Restricted</h3>
      <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', maxWidth: 360, lineHeight: 1.6 }}>
        This client has restricted clinician access to their {section}.<br />
        This data is hidden based on their privacy settings.
      </p>
    </div>
  );


  const [viewingNote, setViewingNote] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [goals, setGoals] = useState([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', targetDate: '', priority: 'medium', status: 'active' });
  const [savingGoal, setSavingGoal] = useState(false);

  const currentUser = auth.currentUser;

  /* ── fetch everything ── */
  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      setLoading(true);
      try {
        /* client doc */
        const cSnap = await getDoc(doc(db, 'clients', clientId));
        if (!cSnap.exists()) { setLoading(false); return; }
        const rawClient = { id: cSnap.id, ...cSnap.data() };

        // A client's details live in TWO records, and this screen read one:
        //
        //   client_profiles_v2.preferences_json — the intake questionnaire
        //   patient_profiles.metadata_json      — country, city, gender, dob
        //
        // So Country showed "—" for clients who have one on file, simply
        // because it sits in the record this screen never opened. Merge both;
        // the questionnaire wins where they overlap, being the client's own
        // answer rather than a derived location. Same fix as mobile.
        let patientMeta = {};
        try {
          const pat = await api(`/api/v1/patients/${clientId}`);
          if (pat?.metadataJson) patientMeta = JSON.parse(pat.metadataJson) || {};
          if (pat?.phone && !patientMeta.phone) patientMeta.phone = pat.phone;
        } catch (_) { /* the questionnaire half still renders */ }

        const cData = { ...patientMeta, ...rawClient };
        const auth = await fetchAuthProfileForClient(cData);
        setAuthProfile(auth);

        const therapistId = await resolveTherapistIdForClient(clientId, cData);
        setResolvedTherapistId(therapistId);

        if (therapistId) {
          try {
            const tSnap = await getDoc(doc(db, 'therapists', therapistId));
            if (tSnap.exists()) {
              setTherapistName(tSnap.data().displayName || tSnap.data().name || '');
            }
          } catch (_) {}
        }

        setClient({
          ...cData,
          phone: getClientPhone(cData, auth),
          therapistId: therapistId || cData.therapistId,
        });

        if (currentUser) {
          try {
            const meSnap = await getDoc(doc(db, 'therapists', currentUser.uid));
            if (meSnap.exists() && meSnap.data().role === 'admin') setIsAdmin(true);
          } catch (_) {}
        }

        const sessRows = await fetchClientSessions(clientId, { authUid: cData.authUid });
        setSessions(sessRows);

        try {
          const tnSnap = await getDocs(
            query(collection(db, 'clients', clientId, 'therapyNotes'), orderBy('createdAt', 'desc')),
          );
          setTherapyNotes(tnSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (_) {
          try {
            const tnSnap = await getDocs(collection(db, 'clients', clientId, 'therapyNotes'));
            setTherapyNotes(tnSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
          } catch (_) {
            setTherapyNotes([]);
          }
        }

        try {
          const cnQ = query(
            collection(db, 'clinicalNotes'),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc'),
          );
          const cnSnap = await getDocs(cnQ);
          setClinicalNotes(cnSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (_) {
          try {
            const cnSnap = await getDocs(
              query(collection(db, 'clinicalNotes'), where('clientId', '==', clientId)),
            );
            setClinicalNotes(cnSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
          } catch (_) {
            setClinicalNotes([]);
          }
        }

        /* mood entries */
        try {
          const moodQ = query(
            collection(db, 'Client daily mood tracking'),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc')
          );
          const moodSnap = await getDocs(moodQ);
          setMoodEntries(moodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (_) { setMoodEntries([]); }

        /* treatment goals */
        try {
          const goalsSnap = await getDocs(
            query(collection(db, 'clients', clientId, 'goals'), orderBy('createdAt', 'desc'))
          );
          setGoals(goalsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (_) { setGoals([]); }

      } catch (err) {
        console.error('Error fetching client details:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clientId]);

  const displayVal = (val) => (val != null && val !== '' ? val : null);

  const moodFromNotes = therapyNotes
    .map((n) => Number(n.mood))
    .filter((m) => !Number.isNaN(m) && m > 0);
  const moodValues = [
    // Same trap as the cards below: `mood` is the label, not the score.
    ...moodEntries
      .map((e) => Number(e.moodValue ?? e.moodScore ?? e.value ?? e.rating))
      .filter((m) => !Number.isNaN(m) && m > 0),
    ...moodFromNotes,
  ];
  const avgMood = moodValues.length
    ? (moodValues.reduce((a, b) => a + b, 0) / moodValues.length).toFixed(1)
    : null;

  const totalSessions = sessions.length;
  const totalNotes = therapyNotes.length + clinicalNotes.length;
  const lastSession = getLastSessionRecord(sessions);
  const lastSessionLabel = lastSession ? formatSessionDateLabel(lastSession) : null;

  /* ── status change ── */
  const handleStatusChange = async (newStatus) => {
    setShowStatusMenu(false);
    if (!client) return;
    setStatusUpdating(true);
    try {
      await updateDoc(doc(db, 'clients', clientId), { status: newStatus });
      setClient(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDischarge = async () => {
    setShowDischargeConfirm(false);
    await handleStatusChange('discharged');
  };

  /* ── reload notes after add ── */
  const reloadNotes = async () => {
    try {
      const tnSnap = await getDocs(
        query(collection(db, 'clients', clientId, 'therapyNotes'), orderBy('createdAt', 'desc'))
      );
      setTherapyNotes(tnSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (_) {
      try {
        const tnSnap = await getDocs(collection(db, 'clients', clientId, 'therapyNotes'));
        setTherapyNotes(tnSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (_) {}
    }
    try {
      const cnQ = query(
        collection(db, 'clinicalNotes'),
        where('clientId', '==', clientId),
        orderBy('createdAt', 'desc'),
      );
      const cnSnap = await getDocs(cnQ);
      setClinicalNotes(cnSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (_) {
      try {
        const cnSnap = await getDocs(
          query(collection(db, 'clinicalNotes'), where('clientId', '==', clientId)),
        );
        setClinicalNotes(cnSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (_) {}
    }
  };

  const openNoteDetail = (note, kind) => setViewingNote({ note, kind });

  /* ── goals ── */
  const handleSaveGoal = async () => {
    if (!goalForm.title.trim()) return;
    setSavingGoal(true);
    try {
      const docRef = await addDoc(collection(db, 'clients', clientId, 'goals'), {
        ...goalForm,
        clientId,
        therapistId: currentUser?.uid,
        createdAt: serverTimestamp(),
      });
      setGoals(prev => [{ id: docRef.id, ...goalForm }, ...prev]);
      setGoalForm({ title: '', description: '', targetDate: '', priority: 'medium', status: 'active' });
      setShowGoalForm(false);
    } catch (_) {} finally { setSavingGoal(false); }
  };

  const handleToggleGoalStatus = async (goal) => {
    const newStatus = goal.status === 'completed' ? 'active' : 'completed';
    try {
      await updateDoc(doc(db, 'clients', clientId, 'goals', goal.id), { status: newStatus });
      setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, status: newStatus } : g));
    } catch (_) {}
  };

  /* ────────────────────────────────── render ── */

  const pageStyle = {
    padding: '2rem', background: '#f4f6fb', minHeight: '100vh',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  };

  const TABS = ['overview', 'sessions', 'notes', 'mood', 'goals',
    // Psychiatry: the doctor page's Prescriptions and E-Pharmacy tabs.
    ...(isPsychiatryClient ? ['prescriptions', 'epharmacy'] : [])];
  const TAB_LABELS = { epharmacy: 'E-Pharmacy' };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8', fontSize: '0.95rem', fontWeight: 500 }}>
          Loading client details…
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>Client not found.</div>
        <div style={{ textAlign: 'center' }}>
          <button className="btn-primary" onClick={() => navigate('/dashboard/clients')}>
            <ArrowLeft size={16} /> Back to Clients
          </button>
        </div>
      </div>
    );
  }

  const clientName = getClientDisplayName(client, authProfile);
  const clientPhone = getClientPhone(client, authProfile);
  const statusColors = statusColor(client.status);

  return (
    <div style={pageStyle}>

      {/* ── Back button ── */}
      <button
        onClick={() => navigate('/dashboard/clients')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.5rem 1rem', borderRadius: 10, border: '1.5px solid #e2e8f0',
          background: '#fff', color: '#475569', fontSize: '0.82rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', marginBottom: '1.25rem',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
      >
        <ArrowLeft size={15} /> Back to Clients
      </button>

      {/* ── Profile Header Card ── */}
      <div style={{ ...cardStyle, padding: '1.5rem 1.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <Avatar name={clientName} size={72} />

          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: '0 0 0.2rem', fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {clientName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.82rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <Mail size={13} />
              <span>{client.clientEmail || client.email || 'No email'}</span>
              {clientPhone && (
                <><Phone size={13} style={{ marginLeft: 8 }} /><span>{clientPhone}</span></>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', padding: '0.22rem 0.7rem',
                borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                background: statusColors.bg, color: statusColors.color,
              }}>
                {(client.status || 'active').replace(/_/g, ' ').toUpperCase()}
              </span>
              {therapistName && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                  <User size={12} />
                  Assigned to: <span style={{ color: '#4f46e5', fontWeight: 700 }}>{therapistName}</span>
                </span>
              )}
              {client.therapyType && (
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500, background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: 20 }}>
                  {client.therapyType}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Action Buttons Row ── */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setShowNoteModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(79,70,229,0.28)' }}
          >
            <FileText size={14} /> Add Note
          </button>

          <button
            onClick={() => setShowChatModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: '1.5px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <MessageSquare size={14} /> Message
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowStatusMenu(v => !v)}
              disabled={statusUpdating}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: statusUpdating ? 0.6 : 1 }}
            >
              <Edit size={14} /> {statusUpdating ? 'Updating…' : 'Change Status'}
            </button>
            {showStatusMenu && (
              <div style={{ position: 'absolute', left: 0, top: '110%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 200, minWidth: 170, overflow: 'hidden' }}>
                {['active', 'inactive', 'on_hold', 'discharged'].map(s => {
                  const c = statusColor(s);
                  return (
                    <button key={s} onClick={() => handleStatusChange(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', padding: '0.65rem 1rem', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: c.color, fontFamily: 'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background = c.bg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowDischargeConfirm(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: '1.5px solid #fca5a5', background: '#fff5f5', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <UserX size={14} /> Discharge
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate('/dashboard/clients')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 10, border: '1.5px solid #c4b5fd', background: '#f5f3ff', color: '#6d28d9', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <UserCheck size={14} /> Reassign
            </button>
          )}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { icon: <Activity size={20} color="#4f46e5" />, label: 'Total Sessions', value: totalSessions, bg: '#eff6ff' },
          { icon: <FileText size={20} color="#0891b2" />, label: 'Total Notes', value: totalNotes, bg: '#ecfeff' },
          { icon: <TrendingUp size={20} color="#059669" />, label: 'Avg Mood', value: avgMood ?? '—', bg: '#ecfdf5' },
          {
            icon: <Clock size={20} color="#d97706" />, label: 'Last Session',
            value: lastSessionLabel || '—', bg: '#fffbeb',
          },
        ].map((kpi, i) => (
          <div key={i} style={{ ...cardStyle, padding: '1.2rem 1.4rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {kpi.icon}
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{kpi.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Opt-in weekly check-in and this week's answers against last week's. */}
      {/* What the client has shared since last time, before you start. */}
      <PreSessionBrief clientId={clientId} />
      <WeeklyCheckInPanel clientId={clientId} />
      <RecordGapsPanel patientId={clientId} />
      <CodingAssistPanel patientId={clientId} />
      {isPsychiatryClient && <AdherencePanel patientId={clientId} />}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', background: '#fff', borderRadius: 14, padding: '0.4rem', border: '1px solid #e2e8f0', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
              background: activeTab === tab ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : 'transparent',
              color: activeTab === tab ? '#fff' : '#64748b',
              boxShadow: activeTab === tab ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
            }}
          >
            {TAB_LABELS[tab] || (tab.charAt(0).toUpperCase() + tab.slice(1))}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}

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
                  const rxSnap = await getDocs(query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', therapistUid), where('patientId', '==', clientId)));
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
                            ? `Approved · ${altMed.approvedByDoctorName || rx.doctorName || 'Psychiatrist'}`
                            : 'Waiting for your approval'}
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
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Client Pharmacies</h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>Send prescriptions directly to the client's preferred pharmacies</p>
            </div>
            <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => setShowAddPharmacy(v => !v)}>
              <Plus size={14} /> {showAddPharmacy ? 'Cancel' : 'Add Pharmacy'}
            </button>
          </div>

          {/* Add pharmacy form */}
          {showAddPharmacy && (
            <div className="doctor-card" style={{ marginBottom: '1rem', borderLeft: '4px solid #1e6bb8' }}>
              <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#0f172a' }}>Add Pharmacy for Client</h4>
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
                <p>This client has not added any pharmacies yet. You can add one on their behalf.</p>
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
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, padding: '0.1rem 0.5rem', fontSize: '0.68rem', fontWeight: 700 }}>Added by clinician</span>
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
                        title="Remove pharmacy from client"
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
                            disabled={isSending || prescriptions.length === 0 || !ph.branchId}
                            onClick={() => sendPrescriptionToPharmacy(ph, idx)}
                            title={
                              !ph.branchId ? `${ph.name} is not on NessaHub — prescriptions can only be sent to NessaHub branches`
                                : prescriptions.length === 0 ? 'No prescriptions to send'
                                : `Send latest prescription to ${ph.name}`
                            }
                          >
                            {isSending ? 'Sending…' : !ph.branchId ? 'Not on NessaHub' : '📤 Send Rx'}
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


      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '1.25rem' }}>

          {/* Psychiatry: the Prescriptions section of Doctor/DoctorPatientOverview.js. */}
          {isPsychiatryClient && (
            <div className="doctor-card" style={{ padding: '1.1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                <Pill size={18} color="#1e6bb8" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Prescriptions ({prescriptions.length})</h3>
              </div>
              {prescriptions.length === 0
                ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.875rem' }}>No prescriptions</p>
                : prescriptions.slice(0, 12).map(rx => (
                  <div key={rx.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                    {rx.medication || rx.medications?.[0]?.name || 'Rx'}
                  </div>
                ))}
            </div>
          )}

          {/* Personal */}
          <div style={{ ...cardStyle, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <User size={15} /> Personal Information
            </div>
            {[
              ['Name', clientName],
              ['Email', client.clientEmail || client.email || authProfile?.email],
              ['Phone', clientPhone],
              ['Age', client.age],
              ['Gender', client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : client.gender],
              ['Country', client.country],
              ['Employment', client.employment],
              ['Relationship Status', getClientRelationshipStatus(client)],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.82rem' }}>{label}</span>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>{displayVal(val) ?? '—'}</span>
              </div>
            ))}
          </div>

          {/* Therapy */}
          <div style={{ ...cardStyle, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <Calendar size={15} /> Therapy Information
            </div>
            {/* Say plainly when the intake was never completed. These fields
                otherwise render as a column of dashes, which reads like a
                loading failure rather than "this client has not answered". */}
            {/* A Second Opinion client has a CASE, not a programme. Their
                answers are the most important thing on this screen — the
                specialist is here to review a specific decision — so they come
                before the therapy fields rather than being buried among
                programme details that do not apply. */}
            {/* Prescribing is offered only for the PSYCHIATRY track: a
                psychiatrist prescribes, a counsellor does not, and both use
                this screen. The server enforces the same rule, so hiding this
                is a courtesy rather than the control. */}
            {String(client.careTrack || '').toLowerCase() === 'psychiatry' && (
              <button
                type="button"
                onClick={openFullPrescriptionForm}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  width: '100%', padding: '0.8rem', marginBottom: '0.85rem',
                  borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: '#5046bd', color: '#fff', fontWeight: 800, fontSize: '0.9rem',
                }}
              >
                Prescribe medication
              </button>
            )}

            {client.serviceType === 'second_opinion' && (
              <div style={{
                padding: '0.85rem', marginBottom: '0.85rem', borderRadius: 10,
                background: 'rgba(80,70,189,0.07)', border: '1px solid rgba(80,70,189,0.22)',
              }}>
                <div style={{
                  fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: '#3f3796', marginBottom: '0.5rem',
                }}>
                  Second opinion request
                </div>
                {[
                  ['Wants reviewed', client.reviewAreasLabel],
                  ['Reason', client.reason],
                  ['Current diagnosis', client.currentDiagnosis],
                  ['Current treatment', client.currentTreatment],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.74rem', color: '#44474f', fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: '0.86rem', color: '#101010' }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {client.questionnaireCompleted === false && !client.therapyType && client.serviceType !== 'second_opinion' && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                padding: '0.75rem', marginBottom: '0.85rem', borderRadius: 10,
                background: 'rgba(115,78,18,0.08)', border: '1px solid rgba(115,78,18,0.22)',
                color: '#734e12', fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.45,
              }}>
                Intake questionnaire not completed — clinical answers are not on file for this client.
              </div>
            )}
            {[
              ['Therapy Type', formatFieldValue(client.therapyType || client.therapyTypes)],
              ['Session Frequency', client.sessionFrequency],
              ['Session Structure', client.sessionStructure],
              ['Therapist Style', client.therapistStyle],
              ['Assigned Therapist', therapistName || client.assignedTherapist?.name],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.82rem' }}>{label}</span>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>{displayVal(val) ?? '—'}</span>
              </div>
            ))}
          </div>

          {/* Health */}
          <div style={{ ...cardStyle, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <Heart size={15} /> Health & Wellness
            </div>
            {[
              ['Physical Health', client.physicalHealth],
              ['Sleep Quality', client.sleep],
              ['Exercise', client.exercise],
              ['Eating Habits', client.eatingHabits],
              ['Depression Level', client.depression],
              ['Anxiety Level', client.anxiety],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.82rem' }}>{label}</span>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>{displayVal(val) ?? '—'}</span>
              </div>
            ))}
          </div>

          <QuestionnaireResponsesPanel client={client} />

          {/* Mental Health History */}
          {(client.mentalHealthHistory || client.previousTherapy || client.medications) && (
            <div style={{ ...cardStyle, padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                <AlertTriangle size={15} /> Mental Health History
              </div>
              {[
                ['History', client.mentalHealthHistory],
                ['Previous Therapy', client.previousTherapy],
                ['Medications', client.medications],
                ['Trauma History', client.traumaHistory],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} style={{ padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ color: '#64748b', fontWeight: 600, fontSize: '0.78rem', marginBottom: 4 }}>{label}</div>
                  <div style={{ color: '#0f172a', fontSize: '0.875rem' }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SESSIONS */}
      {activeTab === 'sessions' && (
        <div style={cardStyle}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Scheduled Sessions ({sessions.length})</h3>
          </div>
          {sessions.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No sessions found.</div>
          ) : (
            <div style={{ padding: '0.5rem 1.5rem 1.5rem' }}>
              {sessions.map(sess => {
                const sc = sessionStatusColor(sess.status);
                return (
                  <div key={sess.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1rem 1.25rem', margin: '0.75rem 0',
                    background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
                    flexWrap: 'wrap', gap: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Calendar size={20} color="#4f46e5" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                          {formatSessionDateLabel(sess)}
                          {sessionTimestamp(sess) && (
                            <span style={{ color: '#64748b', fontWeight: 500, marginLeft: 8 }}>
                              {formatSessionTimeLabel(sess)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
                          {sess.sessionType || sess.type || 'Session'}
                          {sess.duration ? ` · ${sess.duration} min` : ''}
                        </div>
                      </div>
                    </div>
                    <span style={{
                      padding: '0.25rem 0.75rem', borderRadius: 20,
                      fontSize: '0.72rem', fontWeight: 700,
                      background: sc.bg, color: sc.color,
                    }}>
                      {(sess.status || 'scheduled').replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* NOTES */}
      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Therapy notes */}
          <div style={cardStyle}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Therapy Notes ({therapyNotes.length})</h3>
              <button className="btn-primary" onClick={() => setShowNoteModal(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
                <FileText size={14} /> Add Note
              </button>
            </div>
            {therapyNotes.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No therapy notes yet.</div>
            ) : (
              <div style={{ padding: '0.5rem 1.5rem 1.5rem' }}>
                {therapyNotes.map((note) => (
                  <NoteListCard key={note.id} note={note} kind="therapy" onOpen={openNoteDetail} />
                ))}
              </div>
            )}
          </div>

          {/* Clinical notes */}
          <div style={cardStyle}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Clinical Notes ({clinicalNotes.length})</h3>
            </div>
            {clinicalNotes.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No clinical notes found.</div>
            ) : (
              <div style={{ padding: '0.5rem 1.5rem 1.5rem' }}>
                {clinicalNotes.map((note) => (
                  <NoteListCard key={note.id} note={note} kind="clinical" onOpen={openNoteDetail} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MOOD */}
      {activeTab === 'mood' && (
        <div style={cardStyle}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Mood Tracking ({moodEntries.length} entries)</h3>
          </div>
          {moodEntries.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No mood entries found.</div>
          ) : (
            <div style={{ padding: '0.5rem 1.5rem 1.5rem' }}>
              {moodEntries.map(entry => {
                // `mood` holds the LABEL ("Sad", "😔"), not a number — and it is
                // truthy, so it won this || chain and Number("Sad") gave NaN → 0.
                // Every card therefore read "Unknown" and "0/10" even though the
                // entry had a real score. Take the numeric field first.
                const moodVal = Number(
                  entry.moodValue ?? entry.moodScore ?? entry.value ?? entry.rating,
                ) || 0;
                const emoji = MOOD_EMOJI[moodVal] || '😐';
                // Prefer the words the client actually chose; fall back to the
                // score mapping. An emoji-only label has no letters, so it stays
                // as the icon rather than becoming the title.
                const rawMood = typeof entry.mood === 'string' ? entry.mood.trim() : '';
                const wordMood = /[a-z]/i.test(rawMood) ? rawMood : '';
                const label = wordMood || MOOD_LABEL[moodVal] || entry.label || 'Unknown';
                const pct = Math.round((moodVal / 10) * 100);
                const barColor = moodVal >= 7 ? '#10b981' : moodVal >= 5 ? '#f59e0b' : '#ef4444';

                return (
                  <div key={entry.id} style={{ padding: '1.2rem 1.4rem', margin: '0.75rem 0', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '2rem' }}>{emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{label}</span>
                          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: barColor }}>{moodVal}/10</span>
                        </div>
                        <div style={{ height: 8, background: '#e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 8, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textAlign: 'right' }}>
                        {fmtDate(entry.createdAt || entry.date)}
                      </div>
                    </div>
                    {(entry.journal || entry.journalEntry || entry.note) && (
                      <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, paddingTop: '0.6rem', borderTop: '1px solid #e2e8f0' }}>
                        {entry.journal || entry.journalEntry || entry.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* GOALS / TREATMENT PLAN */}
      {activeTab === 'goals' && (
        <div style={cardStyle}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Treatment Goals</h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                {goals.filter(g => g.status === 'completed').length}/{goals.length} goals completed
              </p>
            </div>
            <button
              onClick={() => setShowGoalForm(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 1rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Target size={14} /> Add Goal
            </button>
          </div>

          {/* Add goal inline form */}
          {showGoalForm && (
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <input
                  placeholder="Goal title *"
                  value={goalForm.title}
                  onChange={e => setGoalForm(p => ({ ...p, title: e.target.value }))}
                  style={{ gridColumn: '1/-1', padding: '0.6rem 0.85rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
                <textarea
                  placeholder="Description / details"
                  value={goalForm.description}
                  onChange={e => setGoalForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  style={{ gridColumn: '1/-1', padding: '0.6rem 0.85rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Target Date</label>
                  <input type="date" value={goalForm.targetDate} onChange={e => setGoalForm(p => ({ ...p, targetDate: e.target.value }))}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Priority</label>
                  <select value={goalForm.priority} onChange={e => setGoalForm(p => ({ ...p, priority: e.target.value }))}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowGoalForm(false)} style={{ padding: '0.5rem 1rem', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={handleSaveGoal} disabled={savingGoal || !goalForm.title.trim()} style={{ padding: '0.5rem 1.25rem', borderRadius: 9, border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', opacity: savingGoal ? 0.7 : 1 }}>
                  {savingGoal ? 'Saving…' : 'Save Goal'}
                </button>
              </div>
            </div>
          )}

          {goals.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <Target size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 0.75rem' }} />
              <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>No treatment goals yet</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>Add goals to track this client's therapy progress</p>
            </div>
          ) : (
            <div style={{ padding: '0.75rem 1.5rem 1.5rem' }}>
              {goals.map(goal => {
                const priorityColor = { high: '#dc2626', medium: '#d97706', low: '#16a34a' }[goal.priority] || '#64748b';
                const priorityBg = { high: '#fee2e2', medium: '#fef3c7', low: '#dcfce7' }[goal.priority] || '#f1f5f9';
                const isDone = goal.status === 'completed';
                return (
                  <div key={goal.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '1rem 1.1rem', margin: '0.6rem 0', background: isDone ? '#f0fdf4' : '#f8fafc', borderRadius: 12, border: `1px solid ${isDone ? '#bbf7d0' : '#e2e8f0'}`, transition: 'all 0.15s' }}>
                    <button
                      onClick={() => handleToggleGoalStatus(goal)}
                      style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${isDone ? '#16a34a' : '#cbd5e1'}`, background: isDone ? '#16a34a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                    >
                      {isDone && <CheckCircle size={13} color="#fff" />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isDone ? '#94a3b8' : '#0f172a', textDecoration: isDone ? 'line-through' : 'none' }}>
                          {goal.title}
                        </span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: priorityBg, color: priorityColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {goal.priority}
                        </span>
                        {isDone && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: '#dcfce7', color: '#16a34a' }}>COMPLETED</span>}
                      </div>
                      {goal.description && <p style={{ margin: '0 0 0.3rem', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>{goal.description}</p>}
                      {goal.targetDate && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Target: {new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {showNoteModal && (
        <TherapyNoteModal
          clientId={clientId}
          therapistId={currentUser?.uid}
          onClose={() => setShowNoteModal(false)}
          onSaved={reloadNotes}
        />
      )}

      {viewingNote && (
        <NoteDetailModal
          note={viewingNote.note}
          kind={viewingNote.kind}
          onClose={() => setViewingNote(null)}
        />
      )}

      {showChatModal && (
        <ChatModal
          target={{ id: clientId, name: clientName, ...client }}
          type="client"
          onClose={() => setShowChatModal(false)}
        />
      )}

      {/* Discharge confirm */}
      {showDischargeConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '2rem', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Discharge Client</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
              Are you sure you want to discharge <strong>{clientName}</strong>? Their status will be set to <em>discharged</em>. This action can be reversed by changing their status later.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDischargeConfirm(false)}
                style={{ padding: '0.6rem 1.2rem', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#64748b', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDischarge}
                style={{ padding: '0.6rem 1.4rem', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Discharge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* close status menu on outside click */}
      {showStatusMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          onClick={() => setShowStatusMenu(false)}
        />
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
            <p style={{ margin: '0 0 0.3rem', color: '#0f172a', fontWeight: 700 }}>{viewingRx.patientName || client?.name || 'Client'}</p>
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

    </div>
  );
}
