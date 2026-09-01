import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Calendar, MessageSquare, FileText, Settings,
  LogOut, Activity, ChevronLeft, ChevronRight, Send, Clock,
  CheckCircle, Video, Phone, MessageCircle, Pill,
  Bell, CreditCard, AlertCircle, TrendingUp, User,
  BarChart2, Heart, Star, Shield, Download, Plus, Smile, AlertTriangle, Search,
  Mic, MicOff, Paperclip, Microscope, Minus,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { signOut } from '../../../services/authShim';
import { auth, db, storage } from '../../../services/firestoreShim';
import { api } from '../../../services/apiClient';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc,
  addDoc, updateDoc, orderBy, onSnapshot, serverTimestamp,
} from '../../../services/firestoreShim';
import { ref as storageRef, uploadBytes, getDownloadURL } from '../../../services/firestoreShim';
import './MedicalPatientDashboard.css';
import useAddressAutofill from '../../../hooks/useAddressAutofill';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import WeatherCard from '../../Common/WeatherCard';
import { subscribeLocationUpdate, applyLocationPatch, publishLocationUpdate } from '../../../utils/locationBus';
import { patientPharmacyKey, removePatientPharmacyByKey } from '../../../utils/patientPharmacyDedupe';
import { normalizeDiagnosticOrderStatus } from '../../../utils/diagnosticOrderStatus';
import { deriveRxStockStatus, patientVisibleNotes } from '../../../utils/pharmacyRxStatus';
import ForcedPasswordChangeOverlay from '../../Common/ForcedPasswordChangeOverlay';
import SidebarSavedLocation from '../../Common/SidebarSavedLocation';
import { readPendingBooking, materializePendingBooking } from '../../../utils/pendingDoctorBooking';
import { getJoinWindow } from '../../../utils/sessionJoinWindow';

/** Local YYYY-MM-DD — toISOString() would shift the day across UTC. */
function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One-line summary of a vitals reading, for the dashboard card. */
function summariseVitals(v) {
  if (!v) return '';
  const bits = [];
  if (v.bpSystolic && v.bpDiastolic) bits.push(`BP ${v.bpSystolic}/${v.bpDiastolic}`);
  if (v.heartRate) bits.push(`HR ${v.heartRate}`);
  if (v.spo2) bits.push(`SpO2 ${v.spo2}%`);
  if (v.temperature) bits.push(`${v.temperature}°${v.tempUnit || 'C'}`);
  if (v.respiratoryRate) bits.push(`RR ${v.respiratoryRate}`);
  return bits.length ? bits.join(' · ') : 'Recorded';
}

/**
 * Renders modals into <body> instead of wherever they sit in the tree.
 *
 * They used to live inside the right column, which is `position: sticky` — and
 * a sticky element creates a stacking context. That trapped the overlay's
 * `z-index: 9999` INSIDE that context, so it could not paint above siblings of
 * the column that carry a z-index of their own (the banner action cards, the
 * doctor card). The result was a modal with page content floating on top of its
 * own dim overlay. A portal to <body> puts the overlay at the top level where
 * its z-index means what it says, whatever the layout does around it.
 */
function ModalHost({ children }) {
  return createPortal(children, document.body);
}

/**
 * Millis from whatever shape a timestamp arrives in — the shim hands back a
 * dual-shaped Timestamp (`seconds` + `toDate()`), while a plain REST read is an
 * ISO string. Returns 0 when there is nothing usable, so callers can compare.
 */
function tsMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts.toDate === 'function') { const d = ts.toDate(); return d ? d.getTime() : 0; }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

// How the daily check-in prompt paces itself. Once a check-in is logged the
// prompt stays away for a full day; dismissing it only snoozes, so it can still
// catch the patient later the same day without nagging on every navigation.
const MOOD_PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MOOD_SNOOZE_MS = 4 * 60 * 60 * 1000;

/** The 6x7 grid for a month, padded with the surrounding days. */
function getCalendarDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}


function getInitials(name) {
  if (!name) return 'P';
  const parts = name.trim().split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function StatusBadge({ status }) {
  const map = { pending: 'mp-badge-pending', confirmed: 'mp-badge-confirmed', completed: 'mp-badge-completed', cancelled: 'mp-badge-cancelled' };
  return <span className={`mp-badge ${map[status] || 'mp-badge-pending'}`}>{status || 'pending'}</span>;
}

// ─── Home Screen ─────────────────────────────────────────────────────────────
function MedPatHome({ profile }) {
  const navigate = useNavigate();
  const [appts, setAppts] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  // Days with an appointment. `date` is already a local YYYY-MM-DD string, so it
  // is used as-is — parsing it through Date would shift the day across UTC.
  const appointmentDates = useMemo(() => {
    const set = new Set();
    (appts || []).forEach((a) => {
      if (String(a.status || '').toLowerCase() === 'cancelled') return;
      const raw = a.date || a.scheduledAt || a.appointmentDate;
      if (!raw) return;
      if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) { set.add(raw.slice(0, 10)); return; }
      const d = raw?.toDate ? raw.toDate() : new Date(raw);
      if (!Number.isNaN(d.getTime())) set.add(ymdLocal(d));
    });
    return set;
  }, [appts]);
  const [allAppts, setAllAppts] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [moodHistory, setMoodHistory] = useState([]);

  // `profile` is resolved once at login and never changes for the rest of the
  // session, so a location saved in Settings left this page showing the old one
  // until the patient signed out. Track a live copy that location saves patch.
  const [liveProfile, setLiveProfile] = useState(profile);
  useEffect(() => { setLiveProfile(profile); }, [profile]);
  useEffect(
    () => subscribeLocationUpdate(patch => setLiveProfile(p => applyLocationPatch(p, patch))),
    [],
  );
  const [stats, setStats] = useState({ upcoming: 0, completed: 0, pending: 0, prescriptions: 0 });
  const [loading, setLoading] = useState(true);
  const [primaryDoctor, setPrimaryDoctor] = useState(null);
  const [patientStatus, setPatientStatus] = useState('active');
  const [lastBookedDoctor, setLastBookedDoctor] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('th.lastBookedDoctor') || 'null'); } catch { return null; }
  });

  // "Tell doctor what's wrong" intake button
  const [showIntakeBtn, setShowIntakeBtn] = useState(false);
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [intakeForm, setIntakeForm] = useState({ complaint: '', duration: '', severity: '5', symptoms: '', notes: '' });
  const [submittingIntake, setSubmittingIntake] = useState(false);

  // Daily mood popup
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [moodForm, setMoodForm] = useState({ mood: '', painLevel: '', symptoms: '', medications: '', notes: '' });
  const [submittingMood, setSubmittingMood] = useState(false);

  // Vitals modal
  const EMPTY_VITALS = { bpSystolic: '', bpDiastolic: '', heartRate: '', respiratoryRate: '', spo2: '', temperature: '', tempUnit: 'C' };
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [vitalsForm, setVitalsForm] = useState(EMPTY_VITALS);
  const [submittingVitals, setSubmittingVitals] = useState(false);
  // The last reading on file, and whether the modal is reading it back or
  // editing it. Once a patient has logged vitals the card stops asking them to
  // record and offers to show or amend what is already there.
  const [latestVitals, setLatestVitals] = useState(null);
  const [vitalsMode, setVitalsMode] = useState('edit');
  const [vitalsError, setVitalsError] = useState('');
  const [moodError, setMoodError] = useState('');

  const TODAY = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      // A doctor booked before signing up is parked in localStorage and turned
      // into an appointment during signup. If that write didn't land (the shim
      // swallows write errors, so signup can't tell), the intent is still here —
      // complete it now, before reading the appointment list, so the doctor shows
      // up on this first render instead of the patient having to re-book.
      const pending = readPendingBooking();
      if (pending) {
        // Never let a leftover booking intent break the dashboard: this is a
        // best-effort catch-up, not something the patient asked for right now.
        try {
          await materializePendingBooking(pending, {
            userId: profile.id,
            name: profile.name || profile.fullName || profile.displayName || '',
            email: profile.email || '',
          });
        } catch (err) {
          console.warn('Pending booking could not be completed:', err?.message);
        }
      }

      const [apptSnap, rxSnap, moodSnap] = await Promise.all([
        getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id))),
        getDocs(query(collection(db, 'doctorPrescriptions'), where('patientId', '==', profile.id))),
        getDocs(query(collection(db, 'patientDailyFeelings'), where('patientId', '==', profile.id))),
      ]);
      const all = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const upcoming = all.filter(a => a.date >= TODAY && a.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date));
      const rx = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAppts(upcoming.slice(0, 4));
      setAllAppts(all.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      setPrescriptions(rx.slice(0, 3));

      // Process mood history for charts (last 7 entries)
      const moodScore = { Great: 5, Good: 4, Okay: 3, Poor: 2, Bad: 1 };
      const moodDocs = moodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // The server is the authority on whether today's check-in exists — the
      // localStorage stamp below is only a fast path and is empty on a new
      // browser or after a cache clear.
      const lastCheckInAt = moodDocs.reduce((max, m) => Math.max(max, tsMillis(m.createdAt)), 0);
      const moodList = moodDocs
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 7)
        .reverse()
        .map((m, i) => ({
          day: m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Day ${i + 1}`,
          mood: moodScore[m.mood] || 3,
          moodLabel: m.mood || 'Okay',
          pain: m.painLevel || 0,
        }));
      setMoodHistory(moodList);
      setStats({
        upcoming: upcoming.length,
        completed: all.filter(a => a.status === 'completed').length,
        pending: all.filter(a => a.status === 'pending').length,
        prescriptions: rx.length,
      });
      // Derive primary doctor from most recent non-cancelled appointment
      const withDoc = all.filter(a => a.doctorId && a.status !== 'cancelled').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      let hasPrimaryDoctor = false;
      if (withDoc.length > 0) {
        hasPrimaryDoctor = true;
        const pd = { id: withDoc[0].doctorId, name: withDoc[0].doctorName, spec: withDoc[0].doctorSpecialization || 'Medical Doctor', photoURL: null };
        try {
          const drSnap = await getDoc(doc(db, 'doctors', pd.id));
          if (drSnap.exists()) pd.photoURL = drSnap.data().photoURL || null;
        } catch (_) {}
        setPrimaryDoctor(pd);
        sessionStorage.removeItem('th.lastBookedDoctor');
        setLastBookedDoctor(null);
      }
      // Check if patient has submitted intake data
      if (hasPrimaryDoctor) {
        try {
          const intakeSnap = await getDoc(doc(db, 'patientIntake', profile.id));
          const lsKey = `intakeSubmitted_${profile.id}`;
          const localDone = localStorage.getItem(lsKey);
          if (!intakeSnap.exists() && !localDone) setShowIntakeBtn(true);
        } catch (_) {}
      }
      // Daily check-in prompt. This used to consult only the localStorage stamp,
      // which is written on SUBMIT alone — so dismissing the modal recorded
      // nothing and it reappeared on every single navigation back to home. Two
      // things now suppress it: a check-in already logged within the last day
      // (read from the server, so it holds on a fresh browser too), and a
      // dismissal, which snoozes it for a few hours rather than forever.
      try {
        const stampStr = localStorage.getItem(`lastDailyFeeling_${profile.id}`);
        const stamp = stampStr ? parseInt(stampStr) : 0;
        const lastLogged = Math.max(lastCheckInAt, stamp);
        const snoozeStr = localStorage.getItem(`dailyFeelingSnooze_${profile.id}`);
        const snoozedUntil = snoozeStr ? parseInt(snoozeStr) : 0;
        const now = Date.now();
        const dueForCheckIn = now - lastLogged > MOOD_PROMPT_INTERVAL_MS;
        if (dueForCheckIn && now > snoozedUntil) setShowMoodModal(true);
      } catch (_) {}
      // Fetch patient status and the most recent vitals. The backend keeps the
      // last reading on the profile as `vitalsLatestJson` (a JSON string); the
      // old `vitals.latest` shape this screen used to write never existed
      // server-side, which is why nothing was ever read back.
      try {
        const pat = await api(`/api/v1/patients/${profile.id}`);
        if (pat) {
          setPatientStatus(pat.status || 'active');
          const raw = pat.vitalsLatestJson;
          const parsed = typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : (raw || null);
          if (parsed && typeof parsed === 'object') setLatestVitals(parsed);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, [profile]);

  const submitIntake = async () => {
    if (!intakeForm.complaint.trim()) return;
    setSubmittingIntake(true);
    try {
      await setDoc(doc(db, 'patientIntake', profile.id), {
        patientId: profile.id,
        complaint: intakeForm.complaint.trim(),
        duration: intakeForm.duration.trim(),
        severity: parseInt(intakeForm.severity) || 5,
        symptoms: intakeForm.symptoms.split(',').map(s => s.trim()).filter(Boolean),
        notes: intakeForm.notes.trim(),
        submittedAt: serverTimestamp(),
      });
      localStorage.setItem(`intakeSubmitted_${profile.id}`, '1');
      setShowIntakeBtn(false);
      setShowIntakeModal(false);
    } catch (_) {}
    finally { setSubmittingIntake(false); }
  };

  // Closing the check-in without submitting has to leave a trace, or the prompt
  // has no way to tell "already asked and declined" from "never asked today"
  // and re-opens the moment the patient navigates back to home.
  const dismissMoodModal = () => {
    try {
      localStorage.setItem(`dailyFeelingSnooze_${profile.id}`, String(Date.now() + MOOD_SNOOZE_MS));
    } catch (_) {}
    setShowMoodModal(false);
  };

  const submitMood = async () => {
    if (!moodForm.mood) return;
    setSubmittingMood(true);
    setMoodError('');
    try {
      await addDoc(collection(db, 'patientDailyFeelings'), {
        patientId: profile.id,
        mood: moodForm.mood,
        painLevel: parseInt(moodForm.painLevel) || 0,
        symptoms: moodForm.symptoms.split(',').map(s => s.trim()).filter(Boolean),
        medications: moodForm.medications,
        notes: moodForm.notes,
        createdAt: serverTimestamp(),
      });
      localStorage.setItem(`lastDailyFeeling_${profile.id}`, String(Date.now()));
      localStorage.removeItem(`dailyFeelingSnooze_${profile.id}`);
      // Show it on the trend immediately instead of waiting for a reload.
      setMoodHistory(prev => [...prev, {
        day: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        mood: { Great: 5, Good: 4, Okay: 3, Poor: 2, Bad: 1 }[moodForm.mood] || 3,
        moodLabel: moodForm.mood,
        pain: parseInt(moodForm.painLevel) || 0,
      }].slice(-7));
      setShowMoodModal(false);
    } catch (err) {
      // This used to swallow the error, so a check-in that never reached the
      // server looked submitted — the modal closed and the trend stayed empty
      // with no explanation.
      setMoodError(err?.message || 'Could not submit your check-in. Please try again.');
    }
    finally { setSubmittingMood(false); }
  };

  /** Open the vitals modal reading back the last entry, or editing it. */
  const openVitals = (mode) => {
    setVitalsError('');
    setVitalsMode(mode);
    // Editing always starts from the most recent reading, so "save" amends it
    // rather than making the patient retype everything.
    setVitalsForm(latestVitals ? { ...EMPTY_VITALS, ...latestVitals } : EMPTY_VITALS);
    setShowVitalsModal(true);
  };

  const submitVitals = async () => {
    const hasData = vitalsForm.bpSystolic || vitalsForm.heartRate || vitalsForm.spo2 || vitalsForm.temperature || vitalsForm.respiratoryRate;
    if (!hasData) { setVitalsError('Enter at least one reading before saving.'); return; }
    setSubmittingVitals(true);
    setVitalsError('');
    try {
      // POST /vitals is the only write that reaches the vitals store: it appends
      // to the log AND refreshes the profile's latest reading. The previous
      // patientProfiles write put `vitals.latest` into metadata_json instead,
      // where nothing reads it — so every reading a patient logged was lost.
      const payload = { ...vitalsForm, recordedAt: new Date().toISOString() };
      await api(`/api/v1/patients/${profile.id}/vitals`, { method: 'POST', body: payload });
      setLatestVitals(payload);
      setShowVitalsModal(false);
    } catch (err) {
      // Never swallow this. A patient who thinks their readings reached their
      // doctor when they did not is worse off than one who sees an error.
      setVitalsError(err?.message || 'Could not save. Please try again.');
    }
    finally { setSubmittingVitals(false); }
  };

  const nextAppt = appts[0];
  const todayAppts = appts.filter(a => a.date === TODAY);
  // Today's call is only offered once its window is actually open — being on
  // today's date is not the same as being joinable at 6am.
  const hasConfirmedToday = todayAppts.some(a => a.status === 'confirmed' && getJoinWindow(a).canJoin);

  return (
    <div className="mp-page">
      {/* ── Top strip ────────────────────────────────────────────────────
          Where you are, what it is like there, and who your doctor is. The
          doctor card came up from the sidebar: it is identity, not a widget,
          and belonged beside the other "about you" cards rather than above a
          calendar. ── */}
      <div className="mp-top-strip">
        <LocationSummaryCard profile={liveProfile} compact onEdit={() => navigate('/dashboard/settings')} />
        <WeatherCard profile={liveProfile} />
        {/* Your Doctor Card */}
        {primaryDoctor && (
          <div className="mp-your-doctor-card">
            <div className="mp-yd-label"><Heart size={14} /> Your Doctor</div>
            <div className="mp-yd-body">
              <div className="mp-yd-avatar" style={{ overflow: 'hidden', padding: 0 }}>
                {primaryDoctor.photoURL ? (
                  <img src={primaryDoctor.photoURL} alt={primaryDoctor.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                ) : null}
                <span style={{ display: primaryDoctor.photoURL ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>{getInitials(primaryDoctor.name)}</span>
              </div>
              <div className="mp-yd-info">
                <p className="mp-yd-name">Dr. {primaryDoctor.name}</p>
                <p className="mp-yd-spec">{primaryDoctor.spec}</p>
              </div>
              <div className="mp-yd-actions">
                <button className="mp-btn mp-btn-primary mp-btn-sm" onClick={() => navigate('/dashboard/appointments')}>
                  <Calendar size={13} /> Schedule
                </button>
                <button className="mp-btn mp-btn-outline mp-btn-sm" onClick={() => navigate('/dashboard/messages')}>
                  <MessageSquare size={13} /> Message
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Welcome Banner */}
      <div className="mp-welcome-banner">
        <div className="mp-welcome-left">
          <div className="mp-welcome-avatar">{getInitials(profile?.name)}</div>
          <div>
            <h1 className="mp-welcome-name">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.name?.split(' ')[0] || 'Patient'}</h1>
            <p className="mp-welcome-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <span className={`mp-patient-status-badge ${patientStatus === 'discharged' ? 'mp-status-discharged' : 'mp-status-active'}`}>
              {patientStatus === 'discharged' ? '● Discharged' : '● Active Patient'}
            </span>
          </div>
        </div>
        {/* The two prompts that ask something OF the patient. They used to sit at
            the very bottom of the right column, below a 12-tile quick-actions
            grid, so they were off-screen until you scrolled — the last place a
            call to action should be. On the banner they are the first thing
            read after the greeting. */}
        <div className="mp-welcome-actions">
          {latestVitals ? (
            /* Something is on file — stop asking for it and offer the reading
               back instead, with the two things you can do to it. */
            <div className="mp-welcome-action mp-welcome-action--static">
              <span className="mp-wa-icon"><Heart size={18} /></span>
              <span className="mp-wa-text">
                <span className="mp-wa-title">Your Vitals</span>
                <span className="mp-wa-sub">{summariseVitals(latestVitals)}</span>
              </span>
              <span className="mp-wa-actions">
                <button type="button" className="mp-wa-btn" onClick={() => openVitals('view')}>View</button>
                <button type="button" className="mp-wa-btn mp-wa-btn--solid" onClick={() => openVitals('edit')}>Edit</button>
              </span>
            </div>
          ) : (
            <button className="mp-welcome-action" onClick={() => openVitals('edit')}>
              <span className="mp-wa-icon"><Heart size={18} /></span>
              <span className="mp-wa-text">
                <span className="mp-wa-title">Record Your Vitals</span>
                <span className="mp-wa-sub">Blood pressure, heart rate, SpO2 and more</span>
              </span>
            </button>
          )}

          {showIntakeBtn && (
            <button className="mp-welcome-action mp-welcome-action--intake" onClick={() => setShowIntakeModal(true)}>
              <span className="mp-wa-icon"><AlertTriangle size={18} /></span>
              <span className="mp-wa-text">
                <span className="mp-wa-title">Tell your doctor what's wrong</span>
                <span className="mp-wa-sub">Describe your symptoms before your consultation</span>
              </span>
            </button>
          )}
        </div>

        <div className="mp-welcome-right">
          {hasConfirmedToday ? (
            <button className="mp-join-call-banner-btn" onClick={() => navigate('/dashboard/video')}>
              <Video size={16} /> Join Today's Call
            </button>
          ) : !primaryDoctor ? (
            <button className="mp-find-doc-btn" onClick={() => navigate('/doctors')}>
              <Plus size={16} /> Find a Doctor
            </button>
          ) : (
            // Plain outline button: the inline white-on-transparent overrides
            // that used to be here existed only to survive the blue gradient,
            // and turned invisible once the banner went white.
            <button className="mp-btn mp-btn-outline" onClick={() => navigate('/dashboard/appointments')}>
              <Calendar size={16} /> Book Appointment
            </button>
          )}
        </div>
      </div>

      {/* No-doctor CTA banner */}
      {!loading && !primaryDoctor && !lastBookedDoctor && (
        <div className="mp-find-doctor-banner">
          <div className="mp-fdb-icon"><User size={28} color="#1e6bb8" /></div>
          <div className="mp-fdb-body">
            <p className="mp-fdb-title">You haven't found a doctor yet</p>
            <p className="mp-fdb-sub">Search our network of licensed physicians and book your first consultation.</p>
          </div>
          <button className="mp-btn mp-btn-primary" onClick={() => navigate('/doctors')}>
            <Plus size={15} /> Find a Doctor
          </button>
        </div>
      )}

      {/* New booking banner (shown right after signup before Firestore loads) */}
      {lastBookedDoctor && (
        <div className="mp-new-booking-banner">
          <div className="mp-new-booking-icon"><CheckCircle size={20} color="#16a34a" /></div>
          <div className="mp-new-booking-info">
            <p className="mp-new-booking-title">Appointment booked with Dr. {lastBookedDoctor.doctorName}</p>
            <p className="mp-new-booking-sub">
              {lastBookedDoctor.date ? `${fmtDate(lastBookedDoctor.date)}${lastBookedDoctor.time ? ' at ' + lastBookedDoctor.time : ''}` : 'Date TBD'} &bull; Awaiting confirmation
            </p>
          </div>
          <span className="mp-badge mp-badge-pending">Pending</span>
        </div>
      )}

      {/* Alert: appointment today */}
      {todayAppts.length > 0 && (
        <div className="mp-alert-banner mp-alert-blue">
          <Bell size={16} />
          <span>You have <strong>{todayAppts.length}</strong> appointment{todayAppts.length > 1 ? 's' : ''} today — {todayAppts.map(a => `Dr. ${a.doctorName}`).join(', ')}</span>
          <button className="mp-alert-action" onClick={() => navigate('/dashboard/appointments')}>View</button>
        </div>
      )}

      {/* Stats Row */}
      <div className="mp-stats-grid-4">
        <div className="mp-stat-card mp-stat-blue" onClick={() => navigate('/dashboard/appointments')} style={{ cursor: 'pointer' }}>
          <div className="mp-stat-icon-wrap"><Calendar size={20} /></div>
          <div className="mp-stat-body">
            <p className="mp-stat-number">{stats.upcoming}</p>
            <p className="mp-stat-label">Upcoming</p>
          </div>
          <div className="mp-stat-trend"><TrendingUp size={14} /> Active</div>
        </div>
        <div className="mp-stat-card mp-stat-amber">
          <div className="mp-stat-icon-wrap"><Clock size={20} /></div>
          <div className="mp-stat-body">
            <p className="mp-stat-number">{stats.pending}</p>
            <p className="mp-stat-label">Awaiting Confirm</p>
          </div>
          <div className="mp-stat-trend"><AlertCircle size={14} /> Pending</div>
        </div>
        <div className="mp-stat-card mp-stat-green">
          <div className="mp-stat-icon-wrap"><CheckCircle size={20} /></div>
          <div className="mp-stat-body">
            <p className="mp-stat-number">{stats.completed}</p>
            <p className="mp-stat-label">Completed</p>
          </div>
          <div className="mp-stat-trend"><BarChart2 size={14} /> Total</div>
        </div>
        <div className="mp-stat-card mp-stat-purple" onClick={() => navigate('/dashboard/prescriptions')} style={{ cursor: 'pointer' }}>
          <div className="mp-stat-icon-wrap"><Pill size={20} /></div>
          <div className="mp-stat-body">
            <p className="mp-stat-number">{stats.prescriptions}</p>
            <p className="mp-stat-label">Prescriptions</p>
          </div>
          <div className="mp-stat-trend"><Activity size={14} /> Active</div>
        </div>
      </div>

      {/* Everything below runs full width in one grid. The calendar and
          quick actions are cards in it rather than a 340px rail — that rail
          ran far taller than the cards beside it, which is what produced the
          empty band down the page. */}
      <div className="mp-home-body">

          {/* Next Appointment Spotlight */}
          {nextAppt && (
            <div className="mp-next-appt-spotlight">
              <div className="mp-next-appt-label"><Calendar size={14} /> Next Appointment</div>
              <div className="mp-next-appt-body">
                <div className="mp-next-appt-date-block">
                  <span className="mp-next-appt-day">{new Date(nextAppt.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric' })}</span>
                  <span className="mp-next-appt-mon">{new Date(nextAppt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</span>
                  <span className="mp-next-appt-yr">{new Date(nextAppt.date + 'T00:00:00').getFullYear()}</span>
                </div>
                <div className="mp-next-appt-divider" />
                <div className="mp-next-appt-info">
                  <div className="mp-next-appt-avatar">{getInitials(nextAppt.doctorName)}</div>
                  <div>
                    <p className="mp-next-appt-doctor">Dr. {nextAppt.doctorName}</p>
                    <p className="mp-next-appt-meta">{nextAppt.doctorSpecialization || 'Medical Doctor'}</p>
                    <p className="mp-next-appt-time">
                      <Clock size={13} /> {nextAppt.time || 'TBD'} &nbsp;·&nbsp;
                      {nextAppt.consultationType === 'video' ? <><Video size={13} /> Video</> : nextAppt.consultationType === 'audio' ? <><Phone size={13} /> Audio</> : <><MessageCircle size={13} /> Chat</>}
                    </p>
                  </div>
                </div>
                <div className="mp-next-appt-actions">
                  <StatusBadge status={nextAppt.status} />
                  {/* Joinable only inside the scheduled window — a patient
                      offered "Join Call" days early has nothing to join. */}
                  {nextAppt.status === 'confirmed' && (getJoinWindow(nextAppt).canJoin ? (
                    <button className="mp-btn mp-btn-primary" onClick={() => navigate('/dashboard/video')}>
                      <Video size={14} /> Join Call
                    </button>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#64748b' }}>
                      <Clock size={13} /> Opens {getJoinWindow(nextAppt).waitLabel}
                    </span>
                  ))}
                  <button className="mp-btn mp-btn-outline" onClick={() => navigate('/dashboard/messages')}>
                    <MessageSquare size={14} /> Message
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upcoming Appointments list + Prescriptions stacked */}
          <div className="mp-home-grid">
            {/* Upcoming Appointments */}
        <div className="mp-card">
          <div className="mp-card-header">
            <h3>Upcoming Appointments</h3>
            <button className="mp-card-link" onClick={() => navigate('/dashboard/appointments')}>View all</button>
          </div>
          {loading ? <p className="mp-loading-text">Loading…</p> : appts.length === 0 ? (
            <div className="mp-empty-small">
              <Calendar size={32} />
              <p>No upcoming appointments</p>
              {!primaryDoctor && <button className="mp-btn mp-btn-primary" onClick={() => navigate('/doctors')}>Find a Doctor</button>}
              {primaryDoctor && <button className="mp-btn mp-btn-primary" onClick={() => navigate('/dashboard/appointments')}>Book Appointment</button>}
            </div>
          ) : (
            <div className="mp-appt-list">
              {appts.map(a => (
                <div key={a.id} className="mp-appt-row">
                  <div className="mp-appt-date-badge">
                    <span className="mp-appt-day">{new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric' })}</span>
                    <span className="mp-appt-mon">{new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</span>
                  </div>
                  <div className="mp-appt-info">
                    <p className="mp-appt-doctor">Dr. {a.doctorName || 'Doctor'}</p>
                    <p className="mp-appt-meta">{a.time || 'TBD'} &bull; {a.consultationType || 'Video'}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Prescriptions */}
        <div className="mp-card">
          <div className="mp-card-header">
            <h3>Prescriptions</h3>
            <button className="mp-card-link" onClick={() => navigate('/dashboard/prescriptions')}>View all</button>
          </div>
          {loading ? <p className="mp-loading-text">Loading…</p> : prescriptions.length === 0 ? (
            <div className="mp-empty-small"><Pill size={32} /><p>No prescriptions yet</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {prescriptions.map(rx => (
                <div key={rx.id} className="mp-rx-row">
                  <div className="mp-rx-icon"><Pill size={16} /></div>
                  <div className="mp-rx-info">
                    <p className="mp-rx-name">{rx.medication || rx.medicationName || 'Medication'}</p>
                    <p className="mp-rx-meta">{rx.dosage || ''}{rx.frequency ? ' · ' + rx.frequency : ''}</p>
                    <p className="mp-rx-doctor">Dr. {rx.doctorName || 'Doctor'}</p>
                  </div>
                  <span className="mp-rx-badge">Active</span>
                </div>
              ))}
            </div>
          )}
        </div>
      {/* Quick Actions */}
      <div className="mp-card" style={{ padding: '1.25rem' }}>
        <div className="mp-card-header" style={{ marginBottom: '1rem' }}><h3>Quick Actions</h3></div>
        <div className="mp-quick-actions-grid">
          {[
            primaryDoctor
              ? { icon: Calendar, label: 'Book Appointment', color: '#1e6bb8', bg: '#eff6ff', action: () => navigate('/dashboard/appointments') }
              : { icon: Plus, label: 'Find a Doctor', color: '#1e6bb8', bg: '#eff6ff', action: () => navigate('/doctors') },
            { icon: Video, label: 'Video Calls', color: '#7c3aed', bg: '#f3e8ff', action: () => navigate('/dashboard/video') },
            { icon: MessageSquare, label: 'Messages', color: '#0891b2', bg: '#ecfeff', action: () => navigate('/dashboard/messages') },
            { icon: Pill, label: 'Prescriptions', color: '#059669', bg: '#f0fdf4', action: () => navigate('/dashboard/prescriptions') },
            { icon: FileText, label: 'Medical History', color: '#d97706', bg: '#fffbeb', action: () => navigate('/dashboard/history') },
            { icon: Shield, label: 'Insurance', color: '#0e7490', bg: '#ecfeff', action: () => navigate('/dashboard/insurance') },
            { icon: Phone, label: 'Emergency Contacts', color: '#ea580c', bg: '#fff7ed', action: () => navigate('/dashboard/emergency') },
            { icon: Download, label: 'Health Records', color: '#059669', bg: '#f0fdf4', action: () => navigate('/dashboard/records') },
            { icon: Heart, label: 'Record Vitals', color: '#dc2626', bg: '#fef2f2', action: () => setShowVitalsModal(true) },
            { icon: Pill, label: 'E-Pharmacy', color: '#7c3aed', bg: '#f3e8ff', action: () => navigate('/dashboard/epharmacy') },
            { icon: Settings, label: 'My Profile', color: '#64748b', bg: '#f1f5f9', action: () => navigate('/dashboard/settings') },
            { icon: AlertCircle, label: 'Support', color: '#dc2626', bg: '#fef2f2', action: () => navigate('/dashboard/support') },
          ].map(({ icon: Icon, label, color, bg, action }) => (
            <button key={label} className="mp-quick-action-btn" onClick={action} style={{ '--qa-color': color, '--qa-bg': bg }}>
              <div className="mp-qa-icon"><Icon size={20} /></div>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
        {/* Care Team */}
        <div className="mp-card">
          <div className="mp-card-header"><h3>My Care Team</h3></div>
          {loading ? <p className="mp-loading-text">Loading…</p> : (() => {
            const seen = new Set();
            const doctors = [];
            allAppts.forEach(a => {
              if (a.doctorId && !seen.has(a.doctorId)) {
                seen.add(a.doctorId);
                doctors.push({ id: a.doctorId, name: a.doctorName, spec: a.doctorSpecialization });
              }
            });
            return doctors.length === 0 ? (
              <div className="mp-empty-small"><User size={32} /><p>No doctors assigned yet</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {doctors.map(d => (
                  <div key={d.id} className="mp-care-team-row">
                    <div className="mp-care-avatar">{getInitials(d.name)}</div>
                    <div>
                      <p className="mp-care-name">Dr. {d.name}</p>
                      <p className="mp-care-spec">{d.spec || 'Medical Doctor'}</p>
                    </div>
                    <button className="mp-btn mp-btn-outline mp-btn-sm" onClick={() => navigate('/dashboard/messages')}>
                      <MessageSquare size={12} /> Message
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Activity Feed */}
        <div className="mp-card">
          <div className="mp-card-header"><h3>Recent Activity</h3></div>
          {loading ? <p className="mp-loading-text">Loading…</p> : allAppts.length === 0 ? (
            <div className="mp-empty-small"><Activity size={32} /><p>No activity yet</p></div>
          ) : (
            <div className="mp-activity-feed">
              {allAppts.slice(0, 5).map((a, i) => {
                const iconMap = { confirmed: CheckCircle, pending: Clock, completed: Star, cancelled: AlertCircle };
                const colorMap = { confirmed: '#16a34a', pending: '#d97706', completed: '#2563eb', cancelled: '#dc2626' };
                const Icon = iconMap[a.status] || Clock;
                const color = colorMap[a.status] || '#94a3b8';
                return (
                  <div key={a.id} className="mp-activity-item">
                    <div className="mp-activity-icon" style={{ color }}><Icon size={16} /></div>
                    <div className="mp-activity-body">
                      <p className="mp-activity-text">
                        {a.status === 'confirmed' ? 'Appointment confirmed' : a.status === 'completed' ? 'Visit completed' : a.status === 'cancelled' ? 'Appointment cancelled' : 'Appointment booked'} with Dr. {a.doctorName}
                      </p>
                      <p className="mp-activity-time">{fmtDate(a.date)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      {/* Appointments calendar — the dashboard had no calendar, so a patient
          could not see their scheduled dates without opening another page.
          Mirrors the mobile medical home. */}
      <div className="mp-card mp-cal-card">
        <div className="mp-card-header">
          <h3>My Appointments Calendar</h3>
          <div className="mp-cal-nav">
            <button
              type="button"
              className="mp-cal-nav-btn"
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
              aria-label="Previous month"
            >‹</button>
            <span className="mp-cal-month">
              {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="mp-cal-nav-btn"
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
              aria-label="Next month"
            >›</button>
          </div>
        </div>

        <div className="mp-cal-weekdays">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="mp-cal-grid">
          {getCalendarDays(calendarMonth).map((day, i) => {
            const key = ymdLocal(day);
            const booked = appointmentDates.has(key);
            const inMonth = day.getMonth() === calendarMonth.getMonth();
            const isToday = ymdLocal(new Date()) === key;
            return (
              <div
                key={i}
                className={[
                  'mp-cal-day',
                  !inMonth ? 'mp-cal-day--other' : '',
                  isToday ? 'mp-cal-day--today' : '',
                  booked ? 'mp-cal-day--booked' : '',
                ].filter(Boolean).join(' ')}
                title={booked ? 'Appointment scheduled' : undefined}
              >
                {day.getDate()}
              </div>
            );
          })}
        </div>
        <p className="mp-cal-legend">
          {appointmentDates.size > 0
            ? 'Highlighted days have a scheduled appointment.'
            : 'No appointments scheduled yet.'}
        </p>
      </div>
      </div>{/* end mp-home-grid */}

      {/* ── Health Overview ──────────────────────────────────────────────
          Lives at the foot of the LEFT column, not below the whole grid.
          The right column (doctor, calendar, quick actions, vitals) is far
          taller than the cards above, so as a full-width trailer these two
          started only after it ended — leaving a screen-high empty band down
          the left side. Inside the column they simply fill it. ── */}
      <div className="mp-health-overview-grid">

      {/* LEFT card: Mood & Pain Trend — line chart style */}
      <div className="mp-card" style={{ padding: '1.75rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Mood &amp; Pain Trend</h3>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Based on your daily check-ins</span>
        </div>
        {moodHistory.length === 0 ? (
          <div style={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '0.5rem' }}>
            <Smile size={36} color="#cbd5e1" />
            <p style={{ margin: 0, fontSize: '0.875rem' }}>Complete a daily check-in to see your trend</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={moodHistory} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                domain={[0, 5]}
                ticks={[0, 1, 2, 3, 4, 5]}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => ['', 'Bad', 'Poor', 'Okay', 'Good', 'Great'][v] || v}
              />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.8rem', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', padding: '0.6rem 1rem' }}
                labelStyle={{ fontWeight: 700, marginBottom: 4, color: '#1e293b' }}
                formatter={(v, name) => name === 'Mood' ? [['', 'Bad', 'Poor', 'Okay', 'Good', 'Great'][v] || v, 'Mood'] : [v, 'Pain Level']}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem', paddingTop: '0.75rem' }} />
              <Line type="monotone" dataKey="mood" name="Mood" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: 'white' }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="pain" name="Pain Level" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4, fill: '#7c3aed', strokeWidth: 2, stroke: 'white' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* RIGHT card: Session Breakdown — donut pie */}
      <div className="mp-card" style={{ padding: '1.75rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Session Breakdown</h3>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>All appointments</span>
        </div>
        {(stats.completed + stats.upcoming + stats.pending) === 0 ? (
          <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '0.5rem' }}>
            <Activity size={36} color="#cbd5e1" />
            <p style={{ margin: 0, fontSize: '0.875rem' }}>No appointment data yet</p>
          </div>
        ) : (
          <>
            <div style={{ overflow: 'hidden' }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={[
                      { name: 'Completed', value: stats.completed, color: '#2563eb' },
                      { name: 'Upcoming', value: stats.upcoming, color: '#16a34a' },
                      { name: 'Pending', value: stats.pending, color: '#d97706' },
                    ].filter(d => d.value > 0)}
                    cx="50%" cy="50%"
                    innerRadius={58} outerRadius={84}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {[
                      { name: 'Completed', value: stats.completed, color: '#2563eb' },
                      { name: 'Upcoming', value: stats.upcoming, color: '#16a34a' },
                      { name: 'Pending', value: stats.pending, color: '#d97706' },
                    ].filter(d => d.value > 0).map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.78rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.5rem' }}>
              {[
                { name: 'Completed', value: stats.completed, color: '#2563eb' },
                { name: 'Upcoming', value: stats.upcoming, color: '#16a34a' },
                { name: 'Pending', value: stats.pending, color: '#d97706' },
              ].map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#475569' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                    {s.name}
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{s.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
      </div>{/* end mp-home-body */}


      <ModalHost>
        {/* Daily Mood Popup Modal */}
        {showMoodModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'white', borderRadius: 20, padding: '2rem', maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Smile size={22} color="#1e6bb8" />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Daily Check-In</h3>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }} onClick={dismissMoodModal}>✕</button>
              </div>
              <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#64748b' }}>Tell your doctor how you're feeling today.</p>

              <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>How are you feeling? *</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {['Great','Good','Okay','Poor','Bad'].map(m => (
                  <button key={m} onClick={() => setMoodForm(f => ({ ...f, mood: m }))} style={{ padding: '0.4rem 1rem', borderRadius: 20, border: `2px solid ${moodForm.mood === m ? '#1e6bb8' : '#e2e8f0'}`, background: moodForm.mood === m ? '#1e6bb8' : 'white', color: moodForm.mood === m ? 'white' : '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                    {m}
                  </button>
                ))}
              </div>

              {[
                { key: 'painLevel', label: 'Pain Level (0–10)', placeholder: '0 = no pain, 10 = severe', type: 'number' },
                { key: 'symptoms', label: 'Symptoms Today', placeholder: 'e.g. Headache, nausea (comma-separated)' },
                { key: 'medications', label: 'Medications Taken Today', placeholder: 'e.g. Amoxicillin 500mg' },
                { key: 'notes', label: 'Additional Notes', placeholder: 'Any other concerns...', multiline: true },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>{f.label}</label>
                  {f.multiline ? (
                    <textarea style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.875rem', outline: 'none', resize: 'vertical', minHeight: 70, boxSizing: 'border-box' }}
                      placeholder={f.placeholder} value={moodForm[f.key]} onChange={e => setMoodForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  ) : (
                    <input type={f.type || 'text'} style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                      placeholder={f.placeholder} value={moodForm[f.key]} onChange={e => setMoodForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  )}
                </div>
              ))}

              {moodError ? (
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: '#b91c1c' }}>{moodError}</p>
              ) : null}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button style={{ flex: 1, padding: '0.7rem', background: '#f1f5f9', border: 'none', borderRadius: 10, color: '#64748b', fontWeight: 600, cursor: 'pointer' }} onClick={dismissMoodModal}>Skip for Now</button>
                <button style={{ flex: 2, padding: '0.7rem', background: '#1e6bb8', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: !moodForm.mood || submittingMood ? 'not-allowed' : 'pointer', opacity: !moodForm.mood || submittingMood ? 0.6 : 1 }} onClick={submitMood} disabled={!moodForm.mood || submittingMood}>
                  {submittingMood ? 'Submitting…' : 'Submit Check-In'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vitals Modal */}
        {showVitalsModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'white', borderRadius: 20, padding: '2rem', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Heart size={20} color="#dc2626" />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>
                    {vitalsMode === 'view' ? 'Your Latest Vitals' : latestVitals ? 'Update Vitals' : 'Record Vitals'}
                  </h3>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }} onClick={() => setShowVitalsModal(false)}>✕</button>
              </div>
              <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#64748b' }}>
                {vitalsMode === 'view'
                  ? `Your most recent reading${latestVitals?.recordedAt ? ', recorded ' + fmtDate(String(latestVitals.recordedAt).slice(0, 10)) : ''}.`
                  : 'Enter your current readings. Leave fields blank if not available.'}
              </p>

              {/* A disabled fieldset makes every control below read-only in view
                  mode without duplicating the form. */}
              <fieldset disabled={vitalsMode === 'view'} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>

              {/* Blood Pressure */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#b91c1c', marginBottom: '0.4rem' }}>❤️ Blood Pressure (mmHg)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem' }}>Systolic</label>
                    <input type="number" style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: '#fff0f0' }} placeholder="e.g. 120" value={vitalsForm.bpSystolic} onChange={e => setVitalsForm(f => ({ ...f, bpSystolic: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem' }}>Diastolic</label>
                    <input type="number" style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: '#fff0f0' }} placeholder="e.g. 80" value={vitalsForm.bpDiastolic} onChange={e => setVitalsForm(f => ({ ...f, bpDiastolic: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Heart Rate + SpO2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#b91c1c', marginBottom: '0.4rem' }}>💓 Heart Rate (bpm)</label>
                  <input type="number" style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: '#fff0f0' }} placeholder="e.g. 72" value={vitalsForm.heartRate} onChange={e => setVitalsForm(f => ({ ...f, heartRate: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#16a34a', marginBottom: '0.4rem' }}>🫁 SpO2 (%)</label>
                  <input type="number" style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #bbf7d0', borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: '#f0fdf4' }} placeholder="e.g. 98" value={vitalsForm.spo2} onChange={e => setVitalsForm(f => ({ ...f, spo2: e.target.value }))} />
                </div>
              </div>

              {/* Respiratory Rate + Temperature */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '0.4rem' }}>🌬️ Respiratory Rate (breaths/min)</label>
                  <input type="number" style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #bfdbfe', borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: '#eff6ff' }} placeholder="e.g. 16" value={vitalsForm.respiratoryRate} onChange={e => setVitalsForm(f => ({ ...f, respiratoryRate: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#d97706', marginBottom: '0.4rem' }}>🌡️ Temperature</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input type="number" style={{ flex: 1, padding: '0.6rem 0.85rem', border: '1.5px solid #fed7aa', borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: '#fff7ed' }} placeholder="e.g. 37.0" value={vitalsForm.temperature} onChange={e => setVitalsForm(f => ({ ...f, temperature: e.target.value }))} />
                    <select style={{ padding: '0.6rem 0.5rem', border: '1.5px solid #fed7aa', borderRadius: 8, fontSize: '0.875rem', outline: 'none', background: '#fff7ed', cursor: 'pointer' }} value={vitalsForm.tempUnit} onChange={e => setVitalsForm(f => ({ ...f, tempUnit: e.target.value }))}>
                      <option value="C">°C</option>
                      <option value="F">°F</option>
                    </select>
                  </div>
                </div>
              </div>

              </fieldset>

              {vitalsError ? (
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#b91c1c' }}>{vitalsError}</p>
              ) : null}

              {vitalsMode === 'view' ? (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button style={{ flex: 1, padding: '0.7rem', background: '#f1f5f9', border: 'none', borderRadius: 10, color: '#64748b', fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowVitalsModal(false)}>Close</button>
                  <button style={{ flex: 2, padding: '0.7rem', background: '#dc2626', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: 'pointer' }} onClick={() => setVitalsMode('edit')}>
                    Edit Readings
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button style={{ flex: 1, padding: '0.7rem', background: '#f1f5f9', border: 'none', borderRadius: 10, color: '#64748b', fontWeight: 600, cursor: 'pointer' }} onClick={() => { setShowVitalsModal(false); setVitalsForm(EMPTY_VITALS); setVitalsError(''); }}>Cancel</button>
                  <button style={{ flex: 2, padding: '0.7rem', background: '#dc2626', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: submittingVitals ? 'not-allowed' : 'pointer', opacity: submittingVitals ? 0.6 : 1 }} onClick={submitVitals} disabled={submittingVitals}>
                    {submittingVitals ? 'Saving…' : latestVitals ? '❤️ Save Changes' : '❤️ Save Vitals'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Intake Modal */}
        {showIntakeModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'white', borderRadius: 20, padding: '2rem', maxWidth: 500, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <AlertTriangle size={20} color="#ef4444" />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>Tell Your Doctor What's Wrong</h3>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }} onClick={() => setShowIntakeModal(false)}>✕</button>
              </div>
              <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#64748b' }}>Describe your main health concern so your doctor can prepare for your consultation.</p>

              {[
                { key: 'complaint', label: 'Main Complaint *', placeholder: 'e.g. I have been experiencing chest pain for 3 days', multiline: true },
                { key: 'duration', label: 'How long have you had this?', placeholder: 'e.g. 3 days, 2 weeks' },
                { key: 'severity', label: 'Severity (1–10)', placeholder: '10 = worst possible', type: 'number' },
                { key: 'symptoms', label: 'Other Symptoms', placeholder: 'e.g. Fever, headache (comma-separated)' },
                { key: 'notes', label: 'Additional Notes', placeholder: 'Anything else your doctor should know...', multiline: true },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>{f.label}</label>
                  {f.multiline ? (
                    <textarea style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.875rem', outline: 'none', resize: 'vertical', minHeight: 70, boxSizing: 'border-box' }}
                      placeholder={f.placeholder} value={intakeForm[f.key]} onChange={e => setIntakeForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  ) : (
                    <input type={f.type || 'text'} style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                      placeholder={f.placeholder} value={intakeForm[f.key]} onChange={e => setIntakeForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button style={{ flex: 1, padding: '0.7rem', background: '#f1f5f9', border: 'none', borderRadius: 10, color: '#64748b', fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowIntakeModal(false)}>Cancel</button>
                <button style={{ flex: 2, padding: '0.7rem', background: '#ef4444', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: !intakeForm.complaint.trim() || submittingIntake ? 'not-allowed' : 'pointer', opacity: !intakeForm.complaint.trim() || submittingIntake ? 0.6 : 1 }} onClick={submitIntake} disabled={!intakeForm.complaint.trim() || submittingIntake}>
                  {submittingIntake ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </ModalHost>

    </div>
  );
}

// ─── Appointments Screen ──────────────────────────────────────────────────────
function MedPatAppointments({ profile }) {
  const navigate = useNavigate();
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [modalDay, setModalDay] = useState(null);       // view-appointments modal
  const [scheduleDay, setScheduleDay] = useState(null); // new appointment modal
  const [filter, setFilter] = useState('all');

  // Doctor list (for scheduling)
  const [myDoctors, setMyDoctors] = useState([]);

  // Schedule form
  const [sForm, setSForm] = useState({ doctorId: '', doctorName: '', time: '09:00', type: 'video', reason: '' });
  const [sSaving, setSSaving] = useState(false);
  const [sError, setSError] = useState('');
  const [conflict, setConflict] = useState(null); // array of doctor appts on same day

  // Doctor calendar overlay
  const [showDocCal, setShowDocCal] = useState(false);
  const [docCalAppts, setDocCalAppts] = useState([]);
  const [docCalLoading, setDocCalLoading] = useState(false);
  const [docCalYear, setDocCalYear] = useState(new Date().getFullYear());
  const [docCalMonth, setDocCalMonth] = useState(new Date().getMonth());

  const TODAY = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const q = query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      all.sort((a, b) => a.date?.localeCompare(b.date || '') || 0);
      setAppts(all);
      // Build unique doctor list
      const seen = new Set();
      const docs = [];
      for (const a of all) {
        if (a.doctorId && !seen.has(a.doctorId)) {
          seen.add(a.doctorId);
          docs.push({ id: a.doctorId, name: a.doctorName || 'Doctor', spec: a.doctorSpecialization || '' });
        }
      }
      setMyDoctors(docs);
      setLoading(false);
    })();
  }, [profile]);

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();
  const toDateStr = (d) => `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const toDocCalDateStr = (d) => `${docCalYear}-${String(docCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const apptsByDate = appts.reduce((acc, a) => {
    if (!a.date) return acc;
    if (!acc[a.date]) acc[a.date] = [];
    acc[a.date].push(a);
    return acc;
  }, {});

  const calDays = () => {
    const total = daysInMonth(calYear, calMonth);
    const startPad = firstDayOfMonth(calYear, calMonth);
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const docCalDays = () => {
    const total = daysInMonth(docCalYear, docCalMonth);
    const startPad = firstDayOfMonth(docCalYear, docCalMonth);
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const statusColor = (status) => {
    const map = { confirmed: '#16a34a', pending: '#d97706', completed: '#6b7280', cancelled: '#dc2626' };
    return map[status] || '#94a3b8';
  };

  const filtered = appts.filter(a => {
    if (filter === 'upcoming') return a.date >= TODAY && a.status !== 'cancelled';
    if (filter === 'past') return a.date < TODAY || a.status === 'completed';
    if (filter !== 'all') return a.status === filter;
    return true;
  });

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const modalAppts = modalDay ? (apptsByDate[modalDay] || []) : [];

  // Check for conflict when doctor + date changes in schedule form
  const checkConflict = async (doctorId, date) => {
    if (!doctorId || !date) { setConflict(null); return; }
    const q = query(collection(db, 'doctorAppointments'),
      where('doctorId', '==', doctorId), where('date', '==', date));
    const snap = await getDocs(q);
    const results = snap.docs.map(d => d.data()).filter(a => a.status !== 'cancelled');
    setConflict(results.length > 0 ? results : null);
  };

  const loadDoctorCalendar = async (doctorId) => {
    if (!doctorId) return;
    setDocCalLoading(true);
    const q = query(collection(db, 'doctorAppointments'), where('doctorId', '==', doctorId));
    const snap = await getDocs(q);
    setDocCalAppts(snap.docs.map(d => d.data()).filter(a => a.status !== 'cancelled'));
    setDocCalLoading(false);
  };

  const handleScheduleNew = async () => {
    if (!sForm.doctorId) { setSError('Please select a doctor.'); return; }
    if (!sForm.time) { setSError('Please enter a time.'); return; }
    setSSaving(true); setSError('');
    try {
      await addDoc(collection(db, 'doctorAppointments'), {
        doctorId: sForm.doctorId,
        doctorName: sForm.doctorName,
        clientId: profile.id,
        clientName: profile.name || 'Patient',
        date: scheduleDay,
        time: sForm.time,
        consultationType: sForm.type,
        reason: sForm.reason,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      // Refresh local list
      const updated = [...appts, { id: 'tmp', doctorId: sForm.doctorId, doctorName: sForm.doctorName, date: scheduleDay, time: sForm.time, consultationType: sForm.type, reason: sForm.reason, status: 'pending' }];
      setAppts(updated.sort((a, b) => (a.date || '').localeCompare(b.date || '')));
      setScheduleDay(null);
      setSForm({ doctorId: '', doctorName: '', time: '09:00', type: 'video', reason: '' });
      setConflict(null);
    } catch (err) {
      console.error(err);
      setSError('Failed to book. Please try again.');
    } finally { setSSaving(false); }
  };

  // Doctor calendar busy-date map
  const docBusyDates = docCalAppts.reduce((acc, a) => {
    if (a.date) acc[a.date] = (acc[a.date] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1>Appointments</h1>
        <p>Track and manage your medical appointments</p>
      </div>

      <div className="mp-view-toggle">
        <button className={`mp-toggle-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
          <FileText size={16} /> List
        </button>
        <button className={`mp-toggle-btn ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>
          <Calendar size={16} /> Calendar
        </button>
      </div>

      {/* ══ BEAUTIFUL CALENDAR VIEW ══ */}
      {view === 'calendar' && (
        <div style={{ background: 'white', borderRadius: 20, border: '1.5px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {/* Gradient header */}
          <div style={{ background: 'linear-gradient(135deg, #0d1f3c 0%, #1e40af 100%)', padding: '1.5rem 1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => { if (calMonth === 0) { setCalYear(y => y-1); setCalMonth(11); } else setCalMonth(m => m-1); }} style={{ width:38,height:38,borderRadius:10,border:'1.5px solid rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.1)',color:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin:0,fontSize:'1.3rem',fontWeight:800,color:'white' }}>{MONTHS[calMonth]}</h3>
              <p style={{ margin:0,fontSize:'0.85rem',color:'rgba(255,255,255,0.65)',marginTop:2 }}>{calYear}</p>
            </div>
            <button onClick={() => { if (calMonth === 11) { setCalYear(y => y+1); setCalMonth(0); } else setCalMonth(m => m+1); }} style={{ width:38,height:38,borderRadius:10,border:'1.5px solid rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.1)',color:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div style={{ padding: '1.25rem 1.5rem 1.5rem' }}>
            {/* Day labels */}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:'0.5rem' }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                <div key={d} style={{ textAlign:'center',fontSize:'0.72rem',fontWeight:700,padding:'0.35rem 0',color: i===0||i===6 ? '#f87171' : '#94a3b8' }}>{d}</div>
              ))}
            </div>

            {/* Date grid */}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:5 }}>
              {calDays().map((d, i) => {
                if (!d) return <div key={`ep-${i}`} />;
                const dateStr = toDateStr(d);
                const dayAppts = apptsByDate[dateStr] || [];
                const isPast = dateStr < TODAY;
                const isToday = dateStr === TODAY;
                const isWeekend = (i % 7 === 0) || (i % 7 === 6);
                const hasAppts = dayAppts.length > 0;
                const hasConfirmed = dayAppts.some(a => a.status === 'confirmed');
                const hasPending = dayAppts.some(a => a.status === 'pending');

                let bg = 'transparent', border = '1.5px solid transparent';
                if (isToday) { bg = '#eff6ff'; border = '2px solid #2563eb'; }
                else if (hasConfirmed) { bg = '#f0fdf4'; border = '1.5px solid #86efac'; }
                else if (hasPending) { bg = '#fffbeb'; border = '1.5px solid #fde68a'; }

                return (
                  <button key={dateStr}
                    onClick={() => {
                      if (isPast && !hasAppts) return;
                      if (hasAppts) { setModalDay(dateStr); return; }
                      if (isPast) return;
                      // A patient can only book with a doctor they already have.
                      // With none, the modal's picker is empty and the booking can
                      // never be submitted — send them to find a doctor instead.
                      if (myDoctors.length === 0) { navigate('/doctors'); return; }
                      setScheduleDay(dateStr); setConflict(null); setSForm(f => ({...f}));
                    }}
                    style={{ minHeight:82,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',padding:'0.5rem 0.3rem 0.3rem',borderRadius:12,border,background:bg,cursor:(isPast&&!hasAppts)?'default':'pointer',opacity:isPast&&!hasAppts?0.3:1,transition:'all 0.12s' }}
                    onMouseEnter={e => { if(!(isPast&&!hasAppts)) e.currentTarget.style.transform='translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform=''; }}
                  >
                    <div style={{ width:28,height:28,borderRadius:'50%',background:isToday?'#2563eb':'transparent',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:hasAppts?3:0 }}>
                      <span style={{ fontSize:'0.875rem',fontWeight:isToday||hasAppts?700:400,color:isToday?'white':isWeekend&&!isPast?'#ef4444':isPast?'#94a3b8':'#0f172a' }}>{d}</span>
                    </div>
                    {hasAppts && (
                      <div style={{ display:'flex',flexDirection:'column',gap:2,width:'100%',padding:'0 2px' }}>
                        {dayAppts.slice(0,2).map((a,idx) => (
                          <div key={idx} style={{ fontSize:'0.6rem',fontWeight:600,padding:'2px 4px',borderRadius:5,textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',background:a.status==='confirmed'?'#f0fdf4':a.status==='pending'?'#fffbeb':'#f8fafc',color:statusColor(a.status),border:`1px solid ${statusColor(a.status)}40` }}>
                            {a.time?a.time.slice(0,5):''} Dr.{(a.doctorName||'').split(' ').pop()?.slice(0,5)}
                          </div>
                        ))}
                        {dayAppts.length>2 && <div style={{ fontSize:'0.58rem',color:'#64748b',fontWeight:600,textAlign:'center' }}>+{dayAppts.length-2}</div>}
                      </div>
                    )}
                    {!hasAppts && !isPast && (
                      <Plus size={11} color="#cbd5e1" style={{ marginTop:2 }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display:'flex',gap:'1rem',marginTop:'1.25rem',paddingTop:'1rem',borderTop:'1px solid #f1f5f9',flexWrap:'wrap',alignItems:'center' }}>
              {[['#f0fdf4','#86efac','#16a34a','Confirmed'],['#fffbeb','#fde68a','#d97706','Pending'],['#f8fafc','#e2e8f0','#64748b','Completed']].map(([bg,border,color,label]) => (
                <div key={label} style={{ display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.78rem',color:'#475569' }}>
                  <span style={{ width:22,height:14,borderRadius:4,background:bg,border:`1.5px solid ${border}`,display:'inline-block' }} />
                  {label}
                </div>
              ))}
              <span style={{ marginLeft:'auto',fontSize:'0.7rem',color:'#94a3b8' }}>Tap + on empty date to schedule</span>
            </div>
          </div>
        </div>
      )}

      {/* ══ LIST VIEW ══ */}
      {view === 'list' && (
        <div className="mp-card">
          <div className="mp-filter-row">
            {['all','upcoming','pending','confirmed','completed','past'].map(f => (
              <button key={f} className={`mp-filter-btn ${filter===f?'active':''}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
          </div>
          {loading ? <p className="mp-loading-text">Loading appointments…</p> : filtered.length===0 ? (
            <div className="mp-empty"><Calendar size={40}/><p>No appointments found</p></div>
          ) : (
            <div className="mp-appt-list">
              {filtered.map(a => (
                <div key={a.id} className="mp-appt-row mp-appt-row-full" style={{ borderLeft:`4px solid ${statusColor(a.status)}`,paddingLeft:'1rem' }}>
                  <div className="mp-appt-date-badge">
                    <span className="mp-appt-day">{a.date?new Date(a.date+'T00:00:00').toLocaleDateString('en-US',{day:'numeric'}):'?'}</span>
                    <span className="mp-appt-mon">{a.date?new Date(a.date+'T00:00:00').toLocaleDateString('en-US',{month:'short'}):'?'}</span>
                  </div>
                  <div className="mp-appt-info" style={{ flex:1 }}>
                    <p className="mp-appt-doctor">Dr. {a.doctorName||'Doctor'}</p>
                    <p className="mp-appt-meta">{a.time||'TBD'} &bull; {a.consultationType?a.consultationType.charAt(0).toUpperCase()+a.consultationType.slice(1):'Video'}</p>
                    {a.doctorSpecialization && <p className="mp-appt-spec">{a.doctorSpecialization}</p>}
                    {a.reason && <p className="mp-appt-reason">"{a.reason}"</p>}
                  </div>
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'0.4rem' }}>
                    <StatusBadge status={a.status} />
                    {a.status==='confirmed' && (getJoinWindow(a).canJoin ? (
                      <button className="mp-btn mp-btn-primary mp-btn-sm" onClick={() => navigate('/dashboard/video')}>
                        <Video size={12}/> Join Call
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {getJoinWindow(a).state === 'ended' ? 'Closed' : `Opens ${getJoinWindow(a).waitLabel}`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ VIEW APPOINTMENTS MODAL ══ */}
      {modalDay && (
        <div className="mp-modal-overlay" onClick={() => setModalDay(null)}>
          <div className="mp-modal" onClick={e => e.stopPropagation()}>
            <div className="mp-modal-header">
              <div>
                <h3>{fmtDate(modalDay)}</h3>
                <p style={{ margin:0,fontSize:'0.8rem',color:'#64748b' }}>{modalAppts.length} appointment{modalAppts.length!==1?'s':''}</p>
              </div>
              <button className="mp-modal-close" onClick={() => setModalDay(null)}>✕</button>
            </div>
            <div className="mp-modal-body">
              {modalAppts.map(a => (
                <div key={a.id} className="mp-modal-appt" style={{ borderLeftColor: statusColor(a.status) }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem' }}>
                    <div>
                      <p style={{ margin:0,fontWeight:700,color:'#0f172a',fontSize:'0.95rem' }}>Dr. {a.doctorName||'Doctor'}</p>
                      <p style={{ margin:'0.15rem 0 0',fontSize:'0.8rem',color:'#64748b' }}>
                        {a.time||'TBD'} &bull; {a.consultationType||'Video'}{a.doctorSpecialization?` · ${a.doctorSpecialization}`:''}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  {a.reason && <p style={{ margin:'0.3rem 0 0.5rem',fontSize:'0.8rem',color:'#475569',fontStyle:'italic' }}>"{a.reason}"</p>}
                  <div style={{ display:'flex',gap:'0.5rem',marginTop:'0.5rem' }}>
                    {a.status==='confirmed' && (
                      <button className="mp-btn mp-btn-primary" style={{ flex:1 }} onClick={() => { setModalDay(null); navigate('/dashboard/video'); }}>
                        <Video size={14}/> Join Video Call
                      </button>
                    )}
                    <button className="mp-btn mp-btn-outline" style={{ flex: a.status==='confirmed'?'unset':1 }} onClick={() => { setModalDay(null); navigate('/dashboard/messages'); }}>
                      <MessageSquare size={14}/> Message Doctor
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:'1rem 1.5rem',borderTop:'1px solid #f1f5f9',display:'flex',gap:'0.5rem' }}>
              <button className="mp-btn mp-btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={() => { setModalDay(null); setScheduleDay(modalDay); setConflict(null); }}>
                <Plus size={14}/> Book Another Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SCHEDULE NEW APPOINTMENT MODAL ══ */}
      {scheduleDay && (
        <div className="mp-modal-overlay" onClick={() => { setScheduleDay(null); setSError(''); setConflict(null); }}>
          <div className="mp-modal" style={{ maxWidth:500 }} onClick={e => e.stopPropagation()}>
            <div className="mp-modal-header" style={{ background:'linear-gradient(135deg,#0d1f3c,#1e40af)',borderRadius:'20px 20px 0 0' }}>
              <div>
                <h3 style={{ color:'white',margin:'0 0 0.2rem' }}>Book Appointment</h3>
                <p style={{ color:'rgba(255,255,255,0.7)',margin:0,fontSize:'0.82rem' }}>{fmtDate(scheduleDay)}</p>
              </div>
              <button className="mp-modal-close" style={{ background:'rgba(255,255,255,0.15)',color:'white' }} onClick={() => { setScheduleDay(null); setSError(''); setConflict(null); }}>✕</button>
            </div>

            <div className="mp-modal-body" style={{ display:'flex',flexDirection:'column',gap:'1rem' }}>
              {/* Doctor selector */}
              <div style={{ display:'flex',flexDirection:'column',gap:'0.4rem' }}>
                <label style={{ fontSize:'0.83rem',fontWeight:700,color:'#374151' }}>Select Doctor</label>
                {myDoctors.length===0 ? (
                  <div style={{ padding:'0.75rem',background:'#f8fafc',borderRadius:10,fontSize:'0.85rem',color:'#64748b',textAlign:'center' }}>
                    No doctors yet. <button className="mp-btn mp-btn-primary mp-btn-sm" style={{ marginLeft:8 }} onClick={() => { setScheduleDay(null); navigate('/doctors'); }}>Find a Doctor</button>
                  </div>
                ) : (
                  <select
                    value={sForm.doctorId}
                    onChange={async e => {
                      const doc = myDoctors.find(d => d.id === e.target.value);
                      setSForm(f => ({...f,doctorId:e.target.value,doctorName:doc?.name||''}));
                      await checkConflict(e.target.value, scheduleDay);
                    }}
                    style={{ padding:'0.7rem 0.9rem',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:'0.9rem',background:'white',outline:'none',cursor:'pointer' }}
                  >
                    <option value="">— Choose your doctor —</option>
                    {myDoctors.map(d => <option key={d.id} value={d.id}>Dr. {d.name}{d.spec?` · ${d.spec}`:''}</option>)}
                  </select>
                )}
              </div>

              {/* Conflict warning */}
              {conflict && (
                <div style={{ background:'#fff7ed',border:'1.5px solid #fed7aa',borderRadius:12,padding:'1rem' }}>
                  <div style={{ display:'flex',alignItems:'flex-start',gap:'0.6rem',marginBottom:'0.75rem' }}>
                    <AlertCircle size={18} color="#ea580c" style={{ flexShrink:0,marginTop:1 }} />
                    <div>
                      <p style={{ margin:'0 0 0.25rem',fontWeight:700,fontSize:'0.875rem',color:'#9a3412' }}>
                        Dr. {sForm.doctorName} is busy on {fmtDate(scheduleDay)}
                      </p>
                      <p style={{ margin:0,fontSize:'0.8rem',color:'#c2410c' }}>
                        This doctor already has {conflict.length} appointment{conflict.length>1?'s':''} that day. You can still book — they'll confirm if available.
                      </p>
                    </div>
                  </div>
                  <button
                    className="mp-btn mp-btn-outline"
                    style={{ width:'100%',justifyContent:'center',borderColor:'#fed7aa',color:'#ea580c',fontSize:'0.82rem' }}
                    onClick={async () => {
                      await loadDoctorCalendar(sForm.doctorId);
                      setDocCalYear(new Date().getFullYear());
                      setDocCalMonth(new Date().getMonth());
                      setShowDocCal(true);
                    }}
                  >
                    <Calendar size={14}/> View Doctor's Calendar
                  </button>
                </div>
              )}

              {/* Time + Type */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem' }}>
                <div style={{ display:'flex',flexDirection:'column',gap:'0.4rem' }}>
                  <label style={{ fontSize:'0.83rem',fontWeight:700,color:'#374151' }}>Time</label>
                  <input type="time" value={sForm.time} onChange={e => setSForm(f => ({...f,time:e.target.value}))} style={{ padding:'0.7rem 0.9rem',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:'0.9rem',outline:'none' }} />
                </div>
                <div style={{ display:'flex',flexDirection:'column',gap:'0.4rem' }}>
                  <label style={{ fontSize:'0.83rem',fontWeight:700,color:'#374151' }}>Type</label>
                  <select value={sForm.type} onChange={e => setSForm(f => ({...f,type:e.target.value}))} style={{ padding:'0.7rem 0.9rem',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:'0.9rem',background:'white',outline:'none',cursor:'pointer' }}>
                    <option value="video">Video Call</option>
                    <option value="audio">Audio Call</option>
                    <option value="chat">Chat</option>
                  </select>
                </div>
              </div>

              {/* Reason */}
              <div style={{ display:'flex',flexDirection:'column',gap:'0.4rem' }}>
                <label style={{ fontSize:'0.83rem',fontWeight:700,color:'#374151' }}>Reason <span style={{ fontWeight:400,color:'#94a3b8' }}>(optional)</span></label>
                <textarea value={sForm.reason} onChange={e => setSForm(f => ({...f,reason:e.target.value}))} placeholder="Describe your symptoms or reason for this appointment…" rows={3} style={{ padding:'0.7rem 0.9rem',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:'0.875rem',outline:'none',resize:'vertical',fontFamily:'inherit' }} />
              </div>

              {sError && <p style={{ margin:0,fontSize:'0.83rem',color:'#dc2626',background:'#fef2f2',padding:'0.6rem 0.9rem',borderRadius:8 }}>{sError}</p>}
            </div>

            <div style={{ padding:'1rem 1.5rem',borderTop:'1px solid #f1f5f9',display:'flex',gap:'0.75rem' }}>
              <button className="mp-btn mp-btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={() => { setScheduleDay(null); setSError(''); setConflict(null); }}>Cancel</button>
              <button className="mp-btn mp-btn-primary" style={{ flex:2,justifyContent:'center' }} onClick={handleScheduleNew} disabled={sSaving||myDoctors.length===0}>
                <Video size={15}/> {sSaving?'Booking…':'Request Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DOCTOR CALENDAR OVERLAY ══ */}
      {showDocCal && (
        <div className="mp-modal-overlay" onClick={() => setShowDocCal(false)}>
          <div className="mp-modal" style={{ maxWidth:560 }} onClick={e => e.stopPropagation()}>
            <div className="mp-modal-header" style={{ background:'linear-gradient(135deg,#1e40af,#2563eb)',borderRadius:'20px 20px 0 0' }}>
              <div>
                <h3 style={{ color:'white',margin:'0 0 0.2rem' }}>Dr. {sForm.doctorName}'s Calendar</h3>
                <p style={{ color:'rgba(255,255,255,0.7)',margin:0,fontSize:'0.8rem' }}>Green = free · Red/Orange = busy</p>
              </div>
              <button className="mp-modal-close" style={{ background:'rgba(255,255,255,0.15)',color:'white' }} onClick={() => setShowDocCal(false)}>✕</button>
            </div>
            <div className="mp-modal-body">
              {docCalLoading ? <p className="mp-loading-text">Loading calendar…</p> : (
                <>
                  {/* Month nav */}
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem' }}>
                    <button className="mp-cal-nav" onClick={() => { if(docCalMonth===0){setDocCalYear(y=>y-1);setDocCalMonth(11);}else setDocCalMonth(m=>m-1); }}>
                      <ChevronLeft size={16}/>
                    </button>
                    <span style={{ fontWeight:700,color:'#0f172a',fontSize:'0.95rem' }}>{MONTHS[docCalMonth]} {docCalYear}</span>
                    <button className="mp-cal-nav" onClick={() => { if(docCalMonth===11){setDocCalYear(y=>y+1);setDocCalMonth(0);}else setDocCalMonth(m=>m+1); }}>
                      <ChevronRight size={16}/>
                    </button>
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:4 }}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} style={{ textAlign:'center',fontSize:'0.68rem',fontWeight:700,color:'#94a3b8',padding:'0.25rem 0' }}>{d}</div>)}
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4 }}>
                    {docCalDays().map((d,i) => {
                      if(!d) return <div key={`dc-${i}`}/>;
                      const dateStr = toDocCalDateStr(d);
                      const busyCount = docBusyDates[dateStr] || 0;
                      const isPast = dateStr < TODAY;
                      const isToday = dateStr === TODAY;
                      let bg='#f0fdf4', border='1.5px solid #86efac', color='#15803d'; // free = green
                      if(isPast) { bg='#f8fafc'; border='1px solid #e2e8f0'; color='#94a3b8'; }
                      else if(busyCount>0) { bg='#fff7ed'; border='1.5px solid #fed7aa'; color='#ea580c'; } // busy = orange
                      if(isToday) { border='2.5px solid #2563eb'; }
                      return (
                        <div key={dateStr} style={{ minHeight:52,borderRadius:8,background:bg,border,opacity:isPast?0.5:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0.3rem' }}>
                          <span style={{ fontSize:'0.8rem',fontWeight:isToday?800:500,color }}>{d}</span>
                          {busyCount>0 && <span style={{ fontSize:'0.58rem',fontWeight:700,color:'#ea580c',marginTop:1 }}>{busyCount} appt{busyCount>1?'s':''}</span>}
                          {!isPast && busyCount===0 && <span style={{ fontSize:'0.55rem',color:'#16a34a',fontWeight:600,marginTop:1 }}>Free</span>}
                        </div>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div style={{ display:'flex',gap:'1rem',marginTop:'1rem',paddingTop:'0.75rem',borderTop:'1px solid #f1f5f9',flexWrap:'wrap' }}>
                    {[['#f0fdf4','#86efac','Free day'],['#fff7ed','#fed7aa','Has appointments']].map(([bg,border,label]) => (
                      <div key={label} style={{ display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.75rem',color:'#475569' }}>
                        <span style={{ width:18,height:14,borderRadius:4,background:bg,border:`1.5px solid ${border}`,display:'inline-block' }}/>
                        {label}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div style={{ padding:'1rem 1.5rem',borderTop:'1px solid #f1f5f9' }}>
              <button className="mp-btn mp-btn-primary" style={{ width:'100%',justifyContent:'center' }} onClick={() => setShowDocCal(false)}>
                Close &amp; Go Back to Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Video Calls Screen ───────────────────────────────────────────────────────
function MedPatVideoCalls({ profile }) {
  const navigate = useNavigate();
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const TODAY = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const q = query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.consultationType === 'video' || !a.consultationType)
        .sort((a, b) => a.date?.localeCompare(b.date || '') || 0);
      setAppts(all);
      setLoading(false);
    })();
  }, [profile]);

  const upcoming = appts.filter(a => a.date >= TODAY && a.status !== 'cancelled' && a.status !== 'completed');
  const past = appts.filter(a => a.date < TODAY || a.status === 'completed');

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1>Video Calls</h1>
        <p>Join or review your virtual consultations</p>
      </div>

      {upcoming.length === 0 && (
        <div className="mp-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Video size={36} color="#2563eb" />
          </div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>No upcoming video calls</h3>
          <p style={{ color: '#64748b', marginBottom: '1.25rem' }}>Book a video consultation with a doctor to get started</p>
          <button className="mp-btn mp-btn-primary" onClick={() => navigate('/doctors')}>Find a Doctor</button>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <h3 className="mp-section-title">Upcoming Calls</h3>
          {upcoming.map(a => (
            <div key={a.id} className="mp-video-card mp-video-card-active">
              <div className="mp-video-card-left">
                <div className="mp-video-avatar">{getInitials(a.doctorName)}</div>
                <div>
                  <p className="mp-video-doctor">Dr. {a.doctorName}</p>
                  <p className="mp-video-spec">{a.doctorSpecialization || 'Medical Doctor'}</p>
                  <p className="mp-video-datetime"><Calendar size={13} /> {fmtDate(a.date)} &nbsp;·&nbsp; <Clock size={13} /> {a.time || 'TBD'}</p>
                </div>
              </div>
              <div className="mp-video-card-right">
                <StatusBadge status={a.status} />
                {a.status === 'confirmed' ? (
                  <button className="mp-btn mp-btn-primary" style={{ marginTop: '0.5rem' }}>
                    <Video size={14} /> Join Now
                  </button>
                ) : (
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>Awaiting confirmation</p>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <h3 className="mp-section-title" style={{ marginTop: '2rem' }}>Past Calls</h3>
          {past.map(a => (
            <div key={a.id} className="mp-video-card">
              <div className="mp-video-card-left">
                <div className="mp-video-avatar mp-video-avatar-past">{getInitials(a.doctorName)}</div>
                <div>
                  <p className="mp-video-doctor">Dr. {a.doctorName}</p>
                  <p className="mp-video-spec">{a.doctorSpecialization || 'Medical Doctor'}</p>
                  <p className="mp-video-datetime"><Calendar size={13} /> {fmtDate(a.date)} &nbsp;·&nbsp; <Clock size={13} /> {a.time || 'TBD'}</p>
                </div>
              </div>
              <div className="mp-video-card-right">
                <StatusBadge status={a.status} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Prescriptions Screen ─────────────────────────────────────────────────────
function MedPatPrescriptions({ profile }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completingRx, setCompletingRx] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const q = query(collection(db, 'doctorPrescriptions'), where('patientId', '==', profile.id));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(all);
      setLoading(false);
    })();
  }, [profile]);

  const handleTickPress = (rx) => {
    if (rx.status === 'completed') return;
    setCompletingRx(rx);
    setShowWarning(true);
  };

  const confirmComplete = async () => {
    if (!completingRx) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'doctorPrescriptions', completingRx.id), {
        status: 'completed', completedAt: serverTimestamp(),
      });
      setPrescriptions(prev => prev.map(r => r.id === completingRx.id ? { ...r, status: 'completed' } : r));
      setShowWarning(false);
      setCompletingRx(null);
    } catch (_) { alert('Could not update prescription. Please try again.'); }
    finally { setUpdating(false); }
  };

  const active = prescriptions.filter(r => r.status !== 'completed');
  const completed = prescriptions.filter(r => r.status === 'completed');

  const renderRxCard = (rx) => {
    const meds = Array.isArray(rx.medications) && rx.medications.length > 0
      ? rx.medications
      : rx.medication || rx.medicationName
        ? [{ name: rx.medication || rx.medicationName, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }]
        : [];
    const isDone = rx.status === 'completed';
    return (
      <div key={rx.id} className="mp-rx-card" style={isDone ? { opacity: 0.8, borderColor: '#bbf7d0' } : {}}>
        <div className="mp-rx-card-header">
          <div className="mp-rx-card-icon" style={{ background: isDone ? '#f0fdf4' : undefined }}><Pill size={20} color={isDone ? '#22c55e' : '#059669'} /></div>
          <div style={{ flex: 1 }}>
            <p className="mp-rx-card-name" style={isDone ? { textDecoration: 'line-through', color: '#94a3b8' } : {}}>{meds[0]?.name || 'Prescription'}</p>
            {rx.diagnosis && <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>Diagnosis: {rx.diagnosis}</p>}
            <p className="mp-rx-card-doctor">Dr. {rx.doctorName || 'Doctor'}</p>
          </div>
          {/* Tick/complete button */}
          <button
            onClick={() => handleTickPress(rx)}
            disabled={isDone}
            title={isDone ? 'Completed' : 'Mark as completed'}
            style={{ background: 'none', border: 'none', cursor: isDone ? 'default' : 'pointer', padding: '0.25rem', fontSize: '1.4rem', lineHeight: 1, color: isDone ? '#22c55e' : '#cbd5e1', flexShrink: 0 }}
          >
            {isDone ? '✅' : '⭕'}
          </button>
        </div>
        {meds.map((m, i) => (
          <div key={i} className="mp-rx-card-details" style={i > 0 ? { borderTop: '1px solid #e2e8f0', marginTop: '0.5rem', paddingTop: '0.5rem' } : {}}>
            {i > 0 && <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.4rem' }}>{m.name}</div>}
            {m.dosage && <div className="mp-rx-detail-item"><span className="mp-rx-detail-label">Dosage</span><span>{m.dosage}</span></div>}
            {m.frequency && <div className="mp-rx-detail-item"><span className="mp-rx-detail-label">Frequency</span><span>{m.frequency}</span></div>}
            {m.duration && <div className="mp-rx-detail-item"><span className="mp-rx-detail-label">Duration</span><span>{m.duration}</span></div>}
            {i === 0 && rx.createdAt?.toDate && <div className="mp-rx-detail-item"><span className="mp-rx-detail-label">Date</span><span>{rx.createdAt.toDate().toLocaleDateString()}</span></div>}
          </div>
        ))}
        {rx.instructions && (
          <div className="mp-rx-instructions">
            <p className="mp-rx-detail-label">Instructions</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>{rx.instructions}</p>
          </div>
        )}
        {isDone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: '0.85rem' }}>✅</span>
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#16a34a' }}>Prescription completed</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1>Prescriptions</h1>
        <p>Tap the circle to mark a prescription as completed</p>
      </div>

      {loading ? <p className="mp-loading-text">Loading…</p> : prescriptions.length === 0 ? (
        <div className="mp-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Pill size={36} color="#059669" />
          </div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>No prescriptions yet</h3>
          <p style={{ color: '#64748b' }}>Prescriptions from your doctor will appear here after your consultation.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>ACTIVE</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                {active.map(renderRxCard)}
              </div>
            </>
          )}
          {completed.length > 0 && (
            <>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>COMPLETED</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {completed.map(renderRxCard)}
              </div>
            </>
          )}
        </>
      )}

      {/* Completion Warning Modal */}
      {showWarning && completingRx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '2rem', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.75rem' }}>⚠️</div>
            <h3 style={{ textAlign: 'center', margin: '0 0 0.5rem', fontWeight: 800 }}>Mark as Completed?</h3>
            <p style={{ textAlign: 'center', color: '#475569', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Before marking <strong>{completingRx.medication || completingRx.medications?.[0]?.name || 'this prescription'}</strong> as completed, please confirm:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {['I have taken all doses as prescribed by my doctor.', 'I did not stop early without medical advice.', 'I understand stopping early may reduce effectiveness.'].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ color: '#f59e0b', fontSize: '1rem', flexShrink: 0 }}>✓</span>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>{item}</p>
                </div>
              ))}
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0 }}>ℹ️</span>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>If you are experiencing side effects or stopped early, please inform your doctor first.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', border: 'none', borderRadius: 10, color: '#64748b', fontWeight: 600, cursor: 'pointer' }} onClick={() => { setShowWarning(false); setCompletingRx(null); }}>Cancel</button>
              <button style={{ flex: 2, padding: '0.75rem', background: '#22c55e', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1 }} onClick={confirmComplete} disabled={updating}>
                {updating ? 'Saving…' : 'Yes, Completed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Messages Screen ──────────────────────────────────────────────────────────
function MedPatMessages({ profile }) {
  const [doctors, setDoctors] = useState([]);
  const [activeDoctor, setActiveDoctor] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastMsgs, setLastMsgs] = useState({});
  const [search, setSearch] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [uploading, setUploading] = useState(false);
  // Presence & read receipts
  const [doctorPresence, setDoctorPresence] = useState(null);
  const [doctorLastRead, setDoctorLastRead] = useState(null);
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const presenceUnsubRef = useRef(null);
  const seenUnsubRef = useRef(null);

  const fmtTime = ts => ts?.toDate ? ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const fmtConvTime = ts => {
    if (!ts?.toDate) return '';
    const d = ts.toDate(), diff = Date.now() - d;
    if (diff < 60000) return 'Just now';
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const fmtFileSize = bytes => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };
  const fmtDuration = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fmtLastSeen = ts => {
    // Accept a Firestore Timestamp (.toDate), an ISO string, millis, or a Date.
    let d = null;
    if (ts?.toDate) d = ts.toDate();
    else if (typeof ts === 'string') d = new Date(ts);
    else if (typeof ts === 'number') d = new Date(ts);
    else if (ts instanceof Date) d = ts;
    if (!d || isNaN(d.getTime())) return 'Offline';
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Online';
    if (diff < 3600000) return `Last seen ${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `Last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return `Last seen ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  // Own presence — heartbeat every 25s so the backend's 40s "online" window
  // never lapses while the tab is open (WhatsApp-style).
  useEffect(() => {
    if (!profile?.id) return;
    const presenceRef = doc(db, 'userPresence', profile.id);
    const beat = () => setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() }, { merge: true });
    beat();
    const hb = setInterval(beat, 25000);
    const handleUnload = () => setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true });
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(hb);
      window.removeEventListener('beforeunload', handleUnload);
      setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true });
    };
  }, [profile]);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id)));
      const seen = new Set(); const docList = [];
      for (const a of snap.docs.map(d => d.data())) {
        if (a.doctorId && !seen.has(a.doctorId)) {
          seen.add(a.doctorId);
          docList.push({ id: a.doctorId, name: a.doctorName || 'Doctor', specialization: a.doctorSpecialization || '' });
        }
      }
      setDoctors(docList);
      setLoading(false);
    })();
  }, [profile]);

  useEffect(() => {
    if (!activeDoctor || !profile?.id) return;
    const chatId = [profile.id, activeDoctor.id].sort().join('_');
    const unsub = onSnapshot(
      query(collection(db, 'doctor_chats', chatId, 'messages'), orderBy('timestamp', 'asc')),
      snap => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        if (msgs.length > 0) setLastMsgs(prev => ({ ...prev, [activeDoctor.id]: msgs[msgs.length - 1] }));
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    );
    return () => unsub();
  }, [activeDoctor, profile]);

  // Subscribe to doctor presence + chatSeen when active doctor changes
  useEffect(() => {
    presenceUnsubRef.current?.();
    seenUnsubRef.current?.();
    if (!activeDoctor || !profile?.id) return;
    const chatId = [profile.id, activeDoctor.id].sort().join('_');
    // Mark patient's own last-read
    setDoc(doc(db, 'chatSeen', `${chatId}_${profile.id}`), { lastReadAt: serverTimestamp() }, { merge: true });
    // Subscribe to doctor presence
    presenceUnsubRef.current = onSnapshot(doc(db, 'userPresence', activeDoctor.id), snap => {
      setDoctorPresence(snap.exists() ? snap.data() : null);
    });
    // Subscribe to doctor's last-read for this chat
    seenUnsubRef.current = onSnapshot(doc(db, 'chatSeen', `${chatId}_${activeDoctor.id}`), snap => {
      setDoctorLastRead(snap.exists() ? snap.data().lastReadAt : null);
    });
    return () => { presenceUnsubRef.current?.(); seenUnsubRef.current?.(); };
  }, [activeDoctor, profile]);

  const getChatId = () => activeDoctor ? [profile.id, activeDoctor.id].sort().join('_') : null;

  const sendTextMessage = async () => {
    if (!newMsg.trim() || !activeDoctor) return;
    const text = newMsg.trim(); setNewMsg('');
    await addDoc(collection(db, 'doctor_chats', getChatId(), 'messages'), {
      text, type: 'text', from: profile.id, fromName: profile.name || 'Patient',
      to: activeDoctor.id, toName: `Dr. ${activeDoctor.name}`, timestamp: serverTimestamp(),
    });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeDoctor) return;
    e.target.value = '';
    setUploading(true);
    try {
      const chatId = getChatId();
      const isImage = file.type.startsWith('image/');
      const sRef = storageRef(storage, `chat_files/${chatId}/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      await addDoc(collection(db, 'doctor_chats', chatId, 'messages'), {
        type: isImage ? 'image' : 'file', fileName: file.name, fileSize: file.size, fileUrl: url,
        from: profile.id, fromName: profile.name || 'Patient',
        to: activeDoctor.id, toName: `Dr. ${activeDoctor.name}`, timestamp: serverTimestamp(),
      });
    } catch (err) { alert('Failed to upload file.'); }
    finally { setUploading(false); }
  };

  const startRecording = async () => {
    if (!activeDoctor) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setUploading(true);
        try {
          const chatId = getChatId();
          const sRef = storageRef(storage, `chat_voice/${chatId}/${Date.now()}.webm`);
          await uploadBytes(sRef, blob);
          const url = await getDownloadURL(sRef);
          await addDoc(collection(db, 'doctor_chats', chatId, 'messages'), {
            type: 'audio', fileUrl: url, duration: recordingSecs,
            from: profile.id, fromName: profile.name || 'Patient',
            to: activeDoctor.id, toName: `Dr. ${activeDoctor.name}`, timestamp: serverTimestamp(),
          });
        } catch (_) {}
        finally { setUploading(false); setRecordingSecs(0); }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true); setRecordingSecs(0);
      timerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    } catch (_) { alert('Microphone access denied.'); }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const getMsgStatus = (m) => {
    if (m.from !== profile.id) return null;
    if (!doctorLastRead || !m.timestamp) return 'sent';
    return (m.timestamp?.seconds || 0) <= (doctorLastRead?.seconds || 0) ? 'read' : 'delivered';
  };
  const TickIcon = ({ status }) => {
    if (!status) return null;
    if (status === 'sent') return <span style={{ fontSize: '0.63rem', opacity: 0.55 }}>✓</span>;
    if (status === 'delivered') return <span style={{ fontSize: '0.63rem', opacity: 0.55 }}>✓✓</span>;
    return <span style={{ fontSize: '0.63rem', color: '#60a5fa' }}>✓✓</span>;
  };
  const isDrOnline = doctorPresence?.online === true;
  const drPresenceLabel = doctorPresence ? (isDrOnline ? 'Online' : fmtLastSeen(doctorPresence.lastSeen)) : 'Offline';

  const renderMessage = (m, i) => {
    const isMe = m.from === profile.id;
    const prev = messages[i - 1];
    const showAvatar = !isMe && (!prev || prev.from !== m.from);
    const gapTop = i > 0 && messages[i - 1].from !== m.from ? '0.65rem' : '0.15rem';
    const status = getMsgStatus(m);
    return (
      <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '0.4rem', marginTop: gapTop }}>
        {!isMe && (
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f1fb', color: '#1e6bb8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0, opacity: showAvatar ? 1 : 0 }}>
            {getInitials(activeDoctor?.name)}
          </div>
        )}
        <div style={{ maxWidth: '68%' }}>
          {m.type === 'text' && (
            <div style={{ padding: '0.6rem 0.95rem', borderRadius: 18, borderBottomRightRadius: isMe ? 4 : 18, borderBottomLeftRadius: isMe ? 18 : 4, background: isMe ? '#2563eb' : 'white', color: isMe ? 'white' : '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.45, wordBreak: 'break-word' }}>{m.text}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.63rem', opacity: 0.7 }}>{fmtTime(m.timestamp)}</span>
                <TickIcon status={status} />
              </div>
            </div>
          )}
          {m.type === 'image' && (
            <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}>
              <img src={m.fileUrl} alt={m.fileName} style={{ display: 'block', maxWidth: 240, maxHeight: 200, objectFit: 'cover' }} />
              <div style={{ background: isMe ? '#2563eb' : 'white', padding: '0.3rem 0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <a href={m.fileUrl} download={m.fileName} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: isMe ? 'rgba(255,255,255,0.85)' : '#1e6bb8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}><Download size={11} /> Download</a>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: '0.63rem', color: isMe ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>{fmtTime(m.timestamp)}</span>
                  <TickIcon status={status} />
                </div>
              </div>
            </div>
          )}
          {m.type === 'file' && (
            <div style={{ padding: '0.7rem 0.95rem', borderRadius: 14, background: isMe ? '#2563eb' : 'white', color: isMe ? 'white' : '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 200 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: isMe ? 'rgba(255,255,255,0.2)' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} color={isMe ? 'white' : '#2563eb'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fileName}</p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', opacity: 0.7 }}>{fmtFileSize(m.fileSize)}</p>
              </div>
              <a href={m.fileUrl} download={m.fileName} target="_blank" rel="noopener noreferrer" style={{ color: isMe ? 'white' : '#2563eb' }}><Download size={16} /></a>
            </div>
          )}
          {m.type === 'audio' && (
            <div style={{ padding: '0.6rem 0.95rem', borderRadius: 18, borderBottomRightRadius: isMe ? 4 : 18, borderBottomLeftRadius: isMe ? 18 : 4, background: isMe ? '#2563eb' : 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mic size={14} color={isMe ? 'rgba(255,255,255,0.9)' : '#2563eb'} />
                <audio controls src={m.fileUrl} style={{ height: 28, flex: 1, minWidth: 140 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.63rem', color: isMe ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>{fmtTime(m.timestamp)}</span>
                <TickIcon status={status} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const filteredDoctors = doctors.filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mp-page" style={{ padding: 0, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Sidebar ── */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'white', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Messages</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', borderRadius: 10, padding: '0.45rem 0.85rem' }}>
              <Search size={14} color="#94a3b8" />
              <input style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', flex: 1 }}
                placeholder="Search doctors..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.85rem' }}>Loading…</p>
              : filteredDoctors.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  <MessageSquare size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>No doctors yet</p>
                </div>
              ) : filteredDoctors.map(d => {
                const last = lastMsgs[d.id];
                const isActive = activeDoctor?.id === d.id;
                return (
                  <div key={d.id} onClick={() => { setActiveDoctor(d); setMessages([]); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', cursor: 'pointer', background: isActive ? '#eff6ff' : 'transparent', borderLeft: `3px solid ${isActive ? '#2563eb' : 'transparent'}`, transition: 'all 0.12s' }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: isActive ? '#2563eb' : '#e8f1fb', color: isActive ? 'white' : '#1e6bb8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                      {getInitials(d.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dr. {d.name}</p>
                        {last && <span style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0, marginLeft: 4 }}>{fmtConvTime(last.timestamp)}</span>}
                      </div>
                      <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {last ? (last.from === profile.id ? `You: ${last.type !== 'text' ? `📎 ${last.type === 'audio' ? 'Voice message' : last.fileName || 'File'}` : last.text}` : (last.type !== 'text' ? `📎 ${last.type === 'audio' ? 'Voice message' : last.fileName || 'File'}` : last.text)) : d.specialization || 'Tap to start a conversation'}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* ── Chat area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f0f4f8' }}>
          {!activeDoctor ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', background: 'white' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={28} color="#94a3b8" />
              </div>
              <h3 style={{ margin: 0, color: '#64748b', fontWeight: 700 }}>Select a conversation</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>Choose a doctor from the list to start messaging</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1.25rem', background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.875rem' }}>
                  {getInitials(activeDoctor.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Dr. {activeDoctor.name}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: isDrOnline ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                    {isDrOnline ? '● Online' : drPresenceLabel}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', margin: 'auto' }}>
                    <div style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 12, padding: '0.6rem 1.25rem', display: 'inline-block', fontSize: '0.82rem', color: '#64748b' }}>No messages yet — send the first message</div>
                  </div>
                ) : messages.map((m, i) => renderMessage(m, i))}
                <div ref={endRef} />
              </div>

              {/* Input bar */}
              <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
                {isRecording && (
                  <div style={{ padding: '0.5rem 1.25rem', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                    <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 600 }}>Recording… {fmtDuration(recordingSecs)}</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 'auto' }}>Release to send</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem' }}>
                  <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
                    <Paperclip size={17} />
                  </button>
                  <input
                    style={{ flex: 1, padding: '0.65rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: 24, fontSize: '0.875rem', outline: 'none', background: '#f8fafc' }}
                    placeholder={uploading ? 'Uploading…' : `Message Dr. ${activeDoctor.name}…`}
                    value={newMsg} onChange={e => setNewMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } }}
                    onFocus={e => e.target.style.borderColor = '#2563eb'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    disabled={isRecording}
                  />
                  {newMsg.trim() ? (
                    <button onClick={sendTextMessage}
                      style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Send size={17} />
                    </button>
                  ) : (
                    <button
                      onMouseDown={startRecording} onMouseUp={stopRecording}
                      onTouchStart={startRecording} onTouchEnd={stopRecording}
                      style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: isRecording ? '#ef4444' : '#f1f5f9', color: isRecording ? 'white' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {isRecording ? <MicOff size={17} /> : <Mic size={17} />}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Medical History Screen ───────────────────────────────────────────────────
function MedPatHistory({ profile }) {
  const [history, setHistory] = useState([]);
  const [prescriptions, setHistPrescriptions] = useState([]);
  const [healthProfile, setHealthProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('consultations');

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const [apptSnap, rxSnap, profSnap] = await Promise.all([
        getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id))),
        getDocs(query(collection(db, 'doctorPrescriptions'), where('patientId', '==', profile.id))),
        getDoc(doc(db, 'patientProfiles', profile.id)),
      ]);
      const all = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.status === 'completed')
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setHistory(all);
      const rxList = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setHistPrescriptions(rxList);
      if (profSnap.exists()) setHealthProfile(profSnap.data());
      setLoading(false);
    })();
  }, [profile]);

  const activeRx = prescriptions.filter(r => r.status !== 'completed');
  const completedRx = prescriptions.filter(r => r.status === 'completed');

  return (
    <div className="mp-page">
      <div className="mp-page-header"><h1>Medical History</h1><p>Your complete health record and consultation history</p></div>

      <div className="mp-view-toggle" style={{ marginBottom: '1.25rem' }}>
        <button className={`mp-toggle-btn ${tab === 'consultations' ? 'active' : ''}`} onClick={() => setTab('consultations')}>
          <CheckCircle size={16} /> Consultations ({history.length})
        </button>
        <button className={`mp-toggle-btn ${tab === 'prescriptions' ? 'active' : ''}`} onClick={() => setTab('prescriptions')}>
          <Pill size={16} /> Prescriptions ({prescriptions.length})
        </button>
        <button className={`mp-toggle-btn ${tab === 'records' ? 'active' : ''}`} onClick={() => setTab('records')}>
          <Shield size={16} /> Health Records
        </button>
      </div>

      <div className="mp-card">
        {loading ? <p className="mp-loading-text">Loading…</p> : tab === 'consultations' ? (
          history.length === 0 ? (
            <div className="mp-empty"><CheckCircle size={40} /><h3>No consultations yet</h3><p>Completed appointments will appear here.</p></div>
          ) : (
            <div className="mp-history-list">
              {history.map(a => (
                <div key={a.id} className="mp-history-item">
                  <div className="mp-history-icon"><CheckCircle size={20} color="#16a34a" /></div>
                  <div className="mp-history-body">
                    <div className="mp-history-header-row">
                      <p className="mp-history-doctor">Dr. {a.doctorName || 'Doctor'}</p>
                      <span className="mp-history-date">{fmtDate(a.date)}</span>
                    </div>
                    {a.doctorSpecialization && <p className="mp-history-spec">{a.doctorSpecialization}</p>}
                    <div className="mp-history-tags">
                      <span className="mp-history-tag">
                        {a.consultationType === 'video' ? <Video size={12} /> : a.consultationType === 'audio' ? <Phone size={12} /> : <MessageCircle size={12} />}
                        {(a.consultationType || 'video').charAt(0).toUpperCase() + (a.consultationType || 'video').slice(1)}
                      </span>
                      {a.time && <span className="mp-history-tag"><Clock size={12} /> {a.time}</span>}
                    </div>
                    {a.reason && <p className="mp-history-reason">Reason: {a.reason}</p>}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'prescriptions' ? (
          prescriptions.length === 0 ? (
            <div className="mp-empty"><Pill size={40} /><h3>No prescriptions yet</h3><p>Prescriptions from your doctor will appear here.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {activeRx.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: '#1e6bb8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active ({activeRx.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {activeRx.map(rx => (
                      <div key={rx.id} style={{ padding: '1rem 1.25rem', background: '#f0f9ff', borderRadius: 10, borderLeft: '4px solid #1e6bb8' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: '0 0 0.2rem', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{rx.medication}</p>
                            {rx.dosage && <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#475569' }}>Dosage: {rx.dosage}</p>}
                            {rx.frequency && <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#475569' }}>Frequency: {rx.frequency}</p>}
                            {rx.duration && <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#475569' }}>Duration: {rx.duration}</p>}
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ background: '#dbeafe', color: '#1e6bb8', padding: '0.1rem 0.55rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700 }}>Active</span>
                              {rx.doctorName && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Dr. {rx.doctorName}</span>}
                              {rx.createdAt?.toDate && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{rx.createdAt.toDate().toLocaleDateString()}</span>}
                            </div>
                          </div>
                        </div>
                        {rx.instructions && <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>{rx.instructions}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {completedRx.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed ({completedRx.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {completedRx.map(rx => (
                      <div key={rx.id} style={{ padding: '1rem 1.25rem', background: '#f0fdf4', borderRadius: 10, borderLeft: '4px solid #22c55e' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: '0 0 0.2rem', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{rx.medication}</p>
                            {rx.dosage && <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#475569' }}>Dosage: {rx.dosage}</p>}
                            {rx.frequency && <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', color: '#475569' }}>Frequency: {rx.frequency}</p>}
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ background: '#dcfce7', color: '#16a34a', padding: '0.1rem 0.55rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700 }}>✓ Completed</span>
                              {rx.doctorName && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Dr. {rx.doctorName}</span>}
                              {rx.completedAt?.toDate && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Completed {rx.completedAt.toDate().toLocaleDateString()}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          // Health Records tab
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Allergies card */}
            <div>
              <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Allergies</h4>
              {healthProfile?.allergies && healthProfile.allergies.length > 0 ? (
                <div style={{ padding: '1rem 1.25rem', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {(Array.isArray(healthProfile.allergies) ? healthProfile.allergies : healthProfile.allergies.split(',').map(s => s.trim())).filter(Boolean).map((al, i) => (
                      <span key={i} style={{ background: '#fee2e2', color: '#dc2626', padding: '0.25rem 0.75rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600 }}>
                        ⚠ {al}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', padding: '0.75rem 1.25rem', background: '#f8fafc', borderRadius: 10 }}>No known allergies on record.</p>
              )}
            </div>

            {/* Health info */}
            {healthProfile && (
              <div>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  {[
                    { label: 'Blood Type', value: healthProfile.bloodType },
                    { label: 'Height', value: healthProfile.height },
                    { label: 'Weight', value: healthProfile.weight },
                    { label: 'Chronic Conditions', value: Array.isArray(healthProfile.chronicConditions) ? healthProfile.chronicConditions.join(', ') : healthProfile.chronicConditions },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>{f.label}</p>
                      <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>{f.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Downloadable health records */}
            {healthProfile?.healthRecords && healthProfile.healthRecords.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Documents &amp; Files</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {healthProfile.healthRecords.map((rec, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileText size={16} color="#1e6bb8" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>{rec.name || `Health Record ${i + 1}`}</p>
                        {rec.uploadedAt?.toDate && <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>{rec.uploadedAt.toDate().toLocaleDateString()}</p>}
                      </div>
                      {rec.url && (
                        <a href={rec.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#1e6bb8', fontWeight: 600, textDecoration: 'none' }}>
                          <Download size={14} /> Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!healthProfile && (
              <div className="mp-empty"><Shield size={40} /><h3>No health records yet</h3><p>Your health information will appear here once added.</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Billing Screen ───────────────────────────────────────────────────────────
function MedPatBilling({ profile }) {
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const q = query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id));
      const snap = await getDocs(q);
      const completed = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.status === 'completed');
      setAppts(completed);
      setLoading(false);
    })();
  }, [profile]);

  const totalBilled = appts.reduce((sum, a) => sum + (Number(a.consultationFee) || 0), 0);

  return (
    <div className="mp-page">
      <div className="mp-page-header"><h1>Billing &amp; Payments</h1><p>Your consultation invoices and payment history</p></div>

      <div className="mp-stats-grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="mp-stat-card mp-stat-blue">
          <div className="mp-stat-icon-wrap"><CreditCard size={20} /></div>
          <div className="mp-stat-body"><p className="mp-stat-number">${totalBilled.toFixed(2)}</p><p className="mp-stat-label">Total Billed</p></div>
        </div>
        <div className="mp-stat-card mp-stat-green">
          <div className="mp-stat-icon-wrap"><CheckCircle size={20} /></div>
          <div className="mp-stat-body"><p className="mp-stat-number">{appts.length}</p><p className="mp-stat-label">Completed Visits</p></div>
        </div>
        <div className="mp-stat-card mp-stat-amber">
          <div className="mp-stat-icon-wrap"><AlertCircle size={20} /></div>
          <div className="mp-stat-body"><p className="mp-stat-number">$0.00</p><p className="mp-stat-label">Outstanding</p></div>
        </div>
      </div>

      <div className="mp-card">
        <div className="mp-card-header"><h3>Invoice History</h3></div>
        {loading ? <p className="mp-loading-text">Loading…</p> : appts.length === 0 ? (
          <div className="mp-empty">
            <CreditCard size={40} />
            <h3>No invoices yet</h3>
            <p>Billing records appear after completed consultations.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {appts.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem 0', borderBottom: i < appts.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle size={16} color="#16a34a" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>Dr. {a.doctorName}</p>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>{fmtDate(a.date)} &bull; {a.consultationType || 'Video'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>${a.consultationFee || '0.00'}</p>
                  <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#16a34a', padding: '0.1rem 0.45rem', borderRadius: 4, fontWeight: 600 }}>Paid</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Insurance Details Screen ─────────────────────────────────────────────────
function MedPatInsurance({ profile }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    provider: '', planType: '', policyNumber: '', groupNumber: '',
    memberId: '', expiryDate: '', deductible: '', copay: '', outOfPocketMax: '', notes: '',
  });

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'patientProfiles', profile.id));
        if (snap.exists() && snap.data().insurance) setForm(p => ({ ...p, ...snap.data().insurance }));
      } catch (_) {}
      setLoading(false);
    })();
  }, [profile]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.provider.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'patientProfiles', profile.id), { insurance: form, updatedAt: serverTimestamp() }, { merge: true });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (_) {}
    setSaving(false);
  };

  const field = (label, key, opts = {}) => (
    <div className="mp-field-group" key={key}>
      <label className="mp-label">{label}</label>
      <input className="mp-input" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} {...opts} />
    </div>
  );

  if (loading) return <div className="mp-page"><p className="mp-loading-text">Loading…</p></div>;

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1>Insurance Details</h1>
        <p>Your coverage information — visible to your care team</p>
      </div>
      <form onSubmit={handleSave} style={{ maxWidth: 700 }}>
        <div className="mp-card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.95rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan Information</h3>
          {field('Insurance Provider *', 'provider', { placeholder: 'e.g., Blue Cross Blue Shield', required: true })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {field('Plan Type', 'planType', { placeholder: 'e.g., HMO, PPO' })}
            {field('Policy Number', 'policyNumber', { placeholder: 'e.g., XYZ123456' })}
            {field('Group Number', 'groupNumber', { placeholder: 'e.g., GRP987654' })}
            {field('Member ID', 'memberId', { placeholder: 'e.g., MBR000123' })}
            {field('Expiry Date', 'expiryDate', { placeholder: 'MM/YYYY' })}
          </div>
        </div>
        <div className="mp-card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.95rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coverage Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            {field('Deductible', 'deductible', { placeholder: 'e.g., $1,500/yr' })}
            {field('Co-pay', 'copay', { placeholder: 'e.g., $30/visit' })}
            {field('Out-of-Pocket Max', 'outOfPocketMax', { placeholder: 'e.g., $5,000/yr' })}
          </div>
        </div>
        <div className="mp-card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.95rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Additional Notes</h3>
          <div className="mp-field-group">
            <label className="mp-label">Notes</label>
            <textarea className="mp-input" rows={4} style={{ resize: 'vertical' }} placeholder="e.g., secondary insurance, pre-auth requirements…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        {saved && <p style={{ color: '#16a34a', marginBottom: '0.75rem', fontWeight: 600 }}>Insurance details saved!</p>}
        <button className="mp-btn mp-btn-primary" type="submit" disabled={saving} style={{ minWidth: 200 }}>
          {saving ? 'Saving…' : <><Shield size={15} /> Save Insurance Details</>}
        </button>
      </form>
    </div>
  );
}

// ─── Emergency Contacts Screen ────────────────────────────────────────────────
const EC_RELATIONSHIPS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Guardian', 'Other'];
const emptyContact = { name: '', relationship: '', phone: '', email: '' };

function MedPatEmergencyContacts({ profile }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [form, setForm] = useState(emptyContact);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'patientProfiles', profile.id));
        if (snap.exists() && snap.data().emergencyContacts) setContacts(snap.data().emergencyContacts);
      } catch (_) {}
      setLoading(false);
    })();
  }, [profile]);

  const persistContacts = async (updated) => {
    await setDoc(doc(db, 'patientProfiles', profile.id), { emergencyContacts: updated, updatedAt: serverTimestamp() }, { merge: true });
  };

  const openAdd = () => { setForm(emptyContact); setEditIndex(null); setError(''); setShowModal(true); };
  const openEdit = (idx) => { setForm({ ...contacts[idx] }); setEditIndex(idx); setError(''); setShowModal(true); };

  const handleSaveContact = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.phone.trim()) { setError('Phone number is required.'); return; }
    setSaving(true);
    try {
      const updated = editIndex !== null ? contacts.map((c, i) => i === editIndex ? form : c) : [...contacts, form];
      await persistContacts(updated);
      setContacts(updated);
      setShowModal(false);
    } catch (_) { setError('Failed to save. Please try again.'); }
    setSaving(false);
  };

  const handleDelete = async (idx) => {
    if (!window.confirm(`Remove ${contacts[idx].name}?`)) return;
    const updated = contacts.filter((_, i) => i !== idx);
    try { await persistContacts(updated); setContacts(updated); } catch (_) {}
  };

  if (loading) return <div className="mp-page"><p className="mp-loading-text">Loading…</p></div>;

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1>Emergency Contacts</h1>
        <p>People your care team can reach in a medical emergency</p>
      </div>

      {contacts.length === 0 ? (
        <div className="mp-card mp-empty-state-card">
          <Phone size={48} color="#cbd5e1" />
          <p style={{ fontWeight: 600, fontSize: '1rem', margin: '0.75rem 0 0.25rem' }}>No emergency contacts</p>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.25rem' }}>Add at least one person your doctor can contact in an emergency.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', maxWidth: 700 }}>
          {contacts.map((c, idx) => (
            <div key={idx} className="mp-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
              <div className="mp-ec-avatar">{(c.name || '?')[0].toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, marginBottom: 2 }}>{c.name}</p>
                {c.relationship && <p style={{ fontSize: '0.8rem', color: '#1e6bb8', fontWeight: 600, marginBottom: 3 }}>{c.relationship}</p>}
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {c.phone && <span style={{ fontSize: '0.82rem', color: '#64748b' }}><Phone size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{c.phone}</span>}
                  {c.email && <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{c.email}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="mp-btn mp-btn-outline mp-btn-sm" onClick={() => openEdit(idx)}>Edit</button>
                <button className="mp-btn mp-btn-sm" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }} onClick={() => handleDelete(idx)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="mp-btn mp-btn-outline" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: 700 }}>
        <Plus size={16} /> Add Emergency Contact
      </button>

      {showModal && (
        <div className="mp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="mp-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="mp-modal-header">
              <h3>{editIndex !== null ? 'Edit Contact' : 'New Contact'}</h3>
              <button className="mp-modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="mp-field-group">
                <label className="mp-label">Full Name *</label>
                <input className="mp-input" placeholder="Contact's full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="mp-field-group">
                <label className="mp-label">Relationship</label>
                <select className="mp-input" value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}>
                  <option value="">Select relationship</option>
                  {EC_RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="mp-field-group">
                <label className="mp-label">Phone Number *</label>
                <input className="mp-input" placeholder="+1 (555) 000-0000" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="mp-field-group">
                <label className="mp-label">Email Address</label>
                <input className="mp-input" placeholder="contact@example.com" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}
              <button className="mp-btn mp-btn-primary" onClick={handleSaveContact} disabled={saving}>
                {saving ? 'Saving…' : editIndex !== null ? 'Update Contact' : 'Save Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Health Records Screen ────────────────────────────────────────────────────
const HR_RADIOLOGY = ['MRI', 'CT Scan', 'Ultrasound', 'X-Ray'];
const HR_LAB = ['CBC (Complete Blood Count)', 'BMP (Basic Metabolic Panel)', 'CMP (Comprehensive Metabolic Panel)', 'LFT (Liver Function Tests)', 'TFT (Thyroid Function Tests)', 'Lipid Panel', 'HbA1c', 'Lab Result', 'Blood Test', 'Urinalysis', 'Allergy Test'];
const HR_OTHER = ['Vaccination', 'Surgical Report', 'Drug Allergy', 'Prescribed Medication', 'Over-the-Counter Medication', 'Prescription', 'Other'];
const HR_GROUPS = [
  { label: 'Radiology', color: '#7c3aed', bg: '#f3e8ff', border: '#ddd6fe', types: HR_RADIOLOGY },
  { label: 'Lab Results', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', types: HR_LAB },
  { label: 'Other', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', types: HR_OTHER },
];
const HR_REQUIRES_FILE = new Set(['MRI', 'CT Scan', 'Ultrasound', 'X-Ray', 'Surgical Report']);
const emptyRecord = { name: '', types: [], date: '', notes: '', radiologyFiles: {}, fileUrl: '', fileName: '' };
const todayFormatted = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function MedPatHealthRecords({ profile }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // uploading: null | 'general' | '<radiology type>'
  const [uploading, setUploading] = useState(null);
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [form, setForm] = useState(emptyRecord);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  // one hidden file input per upload slot
  const generalFileRef = React.useRef(null);
  const radiologyFileRefs = React.useRef({});

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'patientProfiles', profile.id));
        if (snap.exists() && snap.data().healthRecords) setRecords(snap.data().healthRecords);
      } catch (_) {}
      setLoading(false);
    })();
  }, [profile]);

  const persistRecords = async (updated) => {
    await setDoc(doc(db, 'patientProfiles', profile.id), { healthRecords: updated, updatedAt: serverTimestamp() }, { merge: true });
  };

  const uploadFile = async (file, radioType = null) => {
    setUploading(radioType || 'general');
    try {
      const sRef = storageRef(storage, `healthRecords/${profile.id}/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const downloadURL = await getDownloadURL(sRef);
      if (radioType) {
        setForm(f => ({ ...f, radiologyFiles: { ...(f.radiologyFiles || {}), [radioType]: { fileUrl: downloadURL, fileName: file.name } } }));
      } else {
        setForm(f => ({ ...f, fileUrl: downloadURL, fileName: file.name }));
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('File upload failed. Please try again.');
    }
    setUploading(null);
  };

  const toggleType = (t) => setForm(f => {
    const arr = f.types || [];
    const newTypes = arr.includes(t) ? arr.filter(x => x !== t) : [...arr, t];
    // Remove radiology file entry if deselecting
    let radiologyFiles = { ...(f.radiologyFiles || {}) };
    if (arr.includes(t) && HR_RADIOLOGY.includes(t)) delete radiologyFiles[t];
    return { ...f, types: newTypes, radiologyFiles };
  });

  const toggleGroup = (label) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(label) ? next.delete(label) : next.add(label);
    return next;
  });

  const openAdd = () => {
    setForm({ ...emptyRecord, date: todayFormatted() });
    setEditIndex(null);
    setError('');
    setExpandedGroups(new Set());
    setShowModal(true);
  };

  const openEdit = (idx) => {
    const r = records[idx];
    const types = r.types?.length ? r.types : (r.type ? [r.type] : []);
    setForm({ ...r, types, radiologyFiles: r.radiologyFiles || {}, date: r.date || todayFormatted() });
    setEditIndex(idx);
    setError('');
    setExpandedGroups(new Set());
    setShowModal(true);
  };

  const handleSaveRecord = async () => {
    if (!form.name.trim()) { setError('Record name is required.'); return; }
    if (!form.types || form.types.length === 0) { setError('Please select at least one record type.'); return; }
    // Per-radiology file validation
    const selectedRadiology = form.types.filter(t => HR_RADIOLOGY.includes(t));
    for (const rType of selectedRadiology) {
      if (!form.radiologyFiles?.[rType]?.fileUrl) { setError(`Please upload a file for "${rType}".`); return; }
    }
    if (form.types.includes('Surgical Report') && !form.fileUrl) { setError('A file upload is required for Surgical Report records.'); return; }
    setSaving(true);
    try {
      const entry = { ...form, savedAt: new Date().toISOString() };
      delete entry.type;
      const updated = editIndex !== null ? records.map((r, i) => i === editIndex ? entry : r) : [...records, entry];
      await persistRecords(updated);
      setRecords(updated);
      setShowModal(false);
    } catch (_) { setError('Failed to save. Please try again.'); }
    setSaving(false);
  };

  const handleDelete = async (idx) => {
    if (!window.confirm(`Remove "${records[idx].name}"?`)) return;
    const updated = records.filter((_, i) => i !== idx);
    try { await persistRecords(updated); setRecords(updated); } catch (_) {}
  };

  const getGroupForType = (t) => HR_GROUPS.find(g => g.types.includes(t));
  const getDisplayTypes = (r) => r.types?.length ? r.types : (r.type ? [r.type] : ['Other']);

  if (loading) return <div className="mp-page"><p className="mp-loading-text">Loading…</p></div>;

  const selectedRadiology = (form.types || []).filter(t => HR_RADIOLOGY.includes(t));
  const hasNonRadiology = (form.types || []).some(t => !HR_RADIOLOGY.includes(t));

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1>Health Records</h1>
        <p>Lab results, imaging, reports — securely stored</p>
      </div>

      {records.length === 0 ? (
        <div className="mp-card mp-empty-state-card">
          <FileText size={48} color="#cbd5e1" />
          <p style={{ fontWeight: 600, fontSize: '1rem', margin: '0.75rem 0 0.25rem' }}>No health records yet</p>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.25rem' }}>Upload lab results, scans, or reports so your doctor has a full picture.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', maxWidth: 800 }}>
          {records.map((r, idx) => {
            const displayTypes = getDisplayTypes(r);
            return (
              <div key={idx} className="mp-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1rem 1.25rem' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={20} color="#1e6bb8" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>{r.name}</p>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    {displayTypes.map(t => {
                      const grp = getGroupForType(t);
                      return <span key={t} style={{ background: grp?.bg || '#f1f5f9', color: grp?.color || '#64748b', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{t}</span>;
                    })}
                    {r.date && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{r.date}</span>}
                  </div>
                  {r.notes && <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>{r.notes}</p>}
                  {r.fileUrl && (
                    <a href={r.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#16a34a', fontWeight: 600, marginTop: 4 }}>
                      <Download size={13} /> {r.fileName || 'Download file'}
                    </a>
                  )}
                  {r.radiologyFiles && Object.entries(r.radiologyFiles).map(([rType, f]) => f?.fileUrl ? (
                    <a key={rType} href={f.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#7c3aed', fontWeight: 600, marginTop: 4, marginRight: 10 }}>
                      <Download size={13} /> {rType}: {f.fileName || 'Download'}
                    </a>
                  ) : null)}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button className="mp-btn mp-btn-outline mp-btn-sm" onClick={() => openEdit(idx)}>Edit</button>
                  <button className="mp-btn mp-btn-sm" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }} onClick={() => handleDelete(idx)}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button className="mp-btn mp-btn-outline" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: 800 }}>
        <Plus size={16} /> Add Health Record
      </button>

      {/* Hidden file inputs */}
      <input ref={generalFileRef} type="file" accept=".pdf,image/*,.doc,.docx" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, null); e.target.value = ''; }} />

      {showModal && (
        <div className="mp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="mp-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Modal header */}
            <div className="mp-modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.875rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>{editIndex !== null ? 'Edit Record' : 'New Health Record'}</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>Fill in the details below</p>
              </div>
              <button className="mp-modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

              {/* Record name */}
              <div className="mp-field-group">
                <label className="mp-label">Record Name *</label>
                <input className="mp-input" placeholder="e.g., Complete Blood Count – March 2026" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              {/* Date — auto-filled, editable */}
              <div className="mp-field-group">
                <label className="mp-label">Date *</label>
                <input className="mp-input" type="date"
                  value={form.date ? (() => { try { return new Date(form.date).toISOString().split('T')[0]; } catch { return ''; } })() : new Date().toISOString().split('T')[0]}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => {
                    if (!e.target.value) return;
                    const d = new Date(e.target.value + 'T00:00:00');
                    setForm(f => ({ ...f, date: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }));
                  }}
                  style={{ cursor: 'pointer' }}
                />
                {form.date && <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>{form.date}</p>}
              </div>

              {/* Type picker */}
              <div className="mp-field-group">
                <label className="mp-label">Record Type(s) — select all that apply *</label>

                {/* Removable selected tags */}
                {(form.types || []).length > 0 && (
                  <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Selected — click to remove:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {form.types.map(t => {
                        const grp = getGroupForType(t);
                        return (
                          <button key={t} type="button" onClick={() => toggleType(t)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.3rem 0.6rem 0.3rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: grp?.color || '#64748b', color: '#fff', transition: 'opacity 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                          >
                            {t}
                            <span style={{ width: 16, height: 16, borderRadius: 8, background: 'rgba(0,0,0,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✕</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Accordion groups */}
                {HR_GROUPS.map(group => {
                  const isExpanded = expandedGroups.has(group.label);
                  const selectedInGroup = (form.types || []).filter(t => group.types.includes(t));
                  return (
                    <div key={group.label} style={{ marginBottom: '0.5rem', borderRadius: 10, border: `1.5px solid ${group.border}`, overflow: 'hidden' }}>
                      <button type="button"
                        onClick={() => toggleGroup(group.label)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.875rem', background: group.bg, border: 'none', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: group.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: group.color }}>{group.label}</span>
                          {selectedInGroup.length > 0 && (
                            <span style={{ background: group.color, color: '#fff', fontSize: '0.68rem', fontWeight: 700, padding: '1px 8px', borderRadius: 12 }}>{selectedInGroup.length} selected</span>
                          )}
                        </div>
                        <span style={{ color: group.color, fontSize: '0.8rem' }}>{isExpanded ? '▲' : '▼'}</span>
                      </button>
                      {isExpanded && (
                        <div style={{ padding: '0.75rem', background: '#fff', borderTop: `1px solid ${group.border}`, display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {group.types.map(t => {
                            const isSelected = (form.types || []).includes(t);
                            return (
                              <button key={t} type="button" onClick={() => toggleType(t)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', border: `1.5px solid ${isSelected ? group.color : group.border}`, background: isSelected ? group.color : '#fff', color: isSelected ? '#fff' : group.color }}
                              >
                                {isSelected && <span style={{ fontSize: 10 }}>✓</span>} {t}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Per-radiology dedicated upload fields */}
              {selectedRadiology.length > 0 && (
                <div style={{ padding: '0.875rem', background: '#faf5ff', borderRadius: 12, border: '1.5px solid #ddd6fe' }}>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    🗂 Radiology Files — Upload Each *
                  </p>
                  {selectedRadiology.map(rType => {
                    const rFile = form.radiologyFiles?.[rType];
                    const isUploading = uploading === rType;
                    const hasFile = !!rFile?.fileUrl;
                    return (
                      <div key={rType} style={{ marginBottom: '0.625rem' }}>
                        <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed' }}>
                          {rType} — file required *
                        </p>
                        <input
                          type="file" accept=".pdf,image/*,.doc,.docx" style={{ display: 'none' }}
                          ref={el => { radiologyFileRefs.current[rType] = el; }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, rType); e.target.value = ''; }}
                        />
                        {hasFile ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>
                            <CheckCircle size={14} color="#16a34a" />
                            <span style={{ flex: 1 }}>{rFile.fileName || 'Uploaded'}</span>
                            <button type="button" onClick={() => setForm(f => { const rf = { ...f.radiologyFiles }; delete rf[rType]; return { ...f, radiologyFiles: rf }; })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => radiologyFileRefs.current[rType]?.click()} disabled={uploading !== null}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, color: '#7c3aed', background: '#fff', border: '1.5px dashed #c4b5fd', cursor: 'pointer', opacity: isUploading ? 0.65 : 1 }}>
                            {isUploading ? '⏳ Uploading…' : <>📎 Upload {rType} file (PDF, Image)</>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* General file upload — Surgical Report or non-radiology optional */}
              {(form.types?.includes('Surgical Report') || (hasNonRadiology && !selectedRadiology.length)) && (
                <div className="mp-field-group">
                  <label className="mp-label">Attach Document{form.types?.includes('Surgical Report') ? ' *' : ' (optional)'}</label>
                  <button type="button" className="mp-upload-btn" onClick={() => generalFileRef.current?.click()} disabled={uploading !== null}>
                    {uploading === 'general' ? 'Uploading…' : form.fileName ? <><Download size={15} /> {form.fileName}</> : <><Plus size={15} /> Upload from Device (PDF, Image, Doc)</>}
                  </button>
                  {form.fileUrl && (
                    <div className="mp-upload-success">
                      <CheckCircle size={14} color="#16a34a" /> {form.fileName || 'File uploaded'}
                      <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }} onClick={() => setForm(f => ({ ...f, fileUrl: '', fileName: '' }))}>✕</button>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="mp-field-group">
                <label className="mp-label">Notes</label>
                <textarea className="mp-input" rows={3} style={{ resize: 'vertical' }} placeholder="Key findings, doctor comments, follow-up needed…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.6rem 0.875rem', fontSize: '0.83rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ⚠️ {error}
                </div>
              )}
              <button className="mp-btn mp-btn-primary" onClick={handleSaveRecord} disabled={saving || uploading !== null} style={{ marginTop: '0.25rem' }}>
                {saving ? 'Saving…' : editIndex !== null ? 'Update Record' : 'Save Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Screen ──────────────────────────────────────────────────────────
const DEF_PRIVACY = { dataSharing: { records: true, prescriptions: true, appointments: true, labResults: true }, profileVisible: true };
const DEF_SECURITY = { twoFAEnabled: false, biometricEnabled: false };
const DEF_EMERGENCY = { medicalNotes: '', organDonor: false, preferredHospital: '', emergencyAccess: true };
const DEF_LEGAL = { termsAccepted: false, privacyAccepted: false, hipaaAccepted: false, dataSharingConsent: true };

function Toggle({ on, onChange, color = '#2563eb' }) {
  return (
    <button type="button" onClick={onChange}
      style={{ width: 42, height: 24, borderRadius: 12, background: on ? color : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

function MedPatSettings({ profile }) {
  const [tab, setTab] = useState('profile');
  const [loading, setLoading] = useState(true);

  // Profile
  const [form, setForm] = useState({
    name: profile?.name || '',
    email: profile?.email || '',
    phone: '',
    dob: '',
    bloodType: '',
    allergies: '',
    country: '',
    city: '',
    area: '',
    region: '',
    street: '',
    ghanaDigitalAddress: '',
    latitude: null,
    longitude: null,
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofill();

  // Security
  const [security, setSecurity] = useState(DEF_SECURITY);
  const [privacy, setPrivacy] = useState(DEF_PRIVACY);
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [changingPwd, setChangingPwd] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePwd, setDeletePwd] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Emergency
  const [emergency, setEmergency] = useState(DEF_EMERGENCY);
  const [savingEmergency, setSavingEmergency] = useState(false);

  // Billing
  const [billingHistory, setBillingHistory] = useState([]);
  const [insuranceInfo, setInsuranceInfo] = useState(null);

  // Legal
  const [legal, setLegal] = useState(DEF_LEGAL);
  const [savingLegal, setSavingLegal] = useState(false);
  const [consentLogs, setConsentLogs] = useState([]);

  // Discharge
  const [dischargeForm, setDischargeForm] = useState({ reason: '', message: '', confirmed: false });
  const [submittingDischarge, setSubmittingDischarge] = useState(false);
  const [alreadyDischarged, setAlreadyDischarged] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const [authSnap, profileSnap] = await Promise.all([
          getDoc(doc(db, 'auth', profile.id)),
          getDoc(doc(db, 'patientProfiles', profile.id)),
        ]);
        if (authSnap.exists()) {
          const d = authSnap.data();
          setForm(f => ({
            ...f,
            name: d.name || profile.name || '',
            email: d.email || profile.email || '',
            phone: d.phone || '',
            dob: d.dob || '',
            bloodType: d.bloodType || '',
            allergies: d.allergies || '',
            country: d.country || d.locationMeta?.country || '',
            city: d.city || d.locationMeta?.city || '',
            area: d.area || d.locationMeta?.area || '',
            region: d.region || d.locationMeta?.region || '',
            street: d.street || d.locationMeta?.street || '',
            ghanaDigitalAddress: d.ghanaDigitalAddress || '',
            latitude: d.latitude ?? d.locationMeta?.latitude ?? null,
            longitude: d.longitude ?? d.locationMeta?.longitude ?? null,
          }));
        }
        if (profileSnap.exists()) {
          const d = profileSnap.data();
          setForm(f => ({
            ...f,
            country: f.country || d.country || d.locationMeta?.country || '',
            city: f.city || d.city || d.locationMeta?.city || '',
            area: f.area || d.area || d.locationMeta?.area || '',
            region: f.region || d.region || d.locationMeta?.region || '',
            street: f.street || d.street || d.locationMeta?.street || '',
            ghanaDigitalAddress: f.ghanaDigitalAddress || d.ghanaDigitalAddress || '',
            latitude: f.latitude ?? d.latitude ?? d.locationMeta?.latitude ?? null,
            longitude: f.longitude ?? d.longitude ?? d.locationMeta?.longitude ?? null,
          }));
          if (d.security) setSecurity(s => ({ ...s, ...d.security }));
          if (d.privacy) setPrivacy(p => ({ ...DEF_PRIVACY, ...d.privacy, dataSharing: { ...DEF_PRIVACY.dataSharing, ...(d.privacy.dataSharing || {}) } }));
          if (d.emergency) setEmergency(e => ({ ...DEF_EMERGENCY, ...d.emergency }));
          if (d.legal) { setLegal(l => ({ ...DEF_LEGAL, ...d.legal })); setConsentLogs(d.legal.consentLogs || []); }
          if (d.billingHistory) setBillingHistory(d.billingHistory);
          if (d.insurance) setInsuranceInfo(d.insurance);
          if (d.status === 'self-discharged') setAlreadyDischarged(true);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [profile]);

  const flash = (msg) => { setSavedMsg(msg); setTimeout(() => setSavedMsg(''), 3000); };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const latitude = Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null;
      const longitude = Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null;
      await setDoc(doc(db, 'auth', profile.id), {
        name: form.name,
        phone: form.phone,
        dob: form.dob,
        bloodType: form.bloodType,
        allergies: form.allergies,
        country: form.country || null,
        city: form.city || null,
        area: form.area || null,
        region: form.region || null,
        street: form.street || null,
        ghanaDigitalAddress: form.ghanaDigitalAddress || null,
        latitude,
        longitude,
        locationMeta: {
          country: form.country || null,
          city: form.city || null,
          area: form.area || null,
          region: form.region || null,
          street: form.street || null,
          latitude,
          longitude,
        },
      }, { merge: true });
      await setDoc(doc(db, 'patientProfiles', profile.id), {
        country: form.country || null,
        city: form.city || null,
        area: form.area || null,
        region: form.region || null,
        street: form.street || null,
        ghanaDigitalAddress: form.ghanaDigitalAddress || null,
        latitude,
        longitude,
        locationMeta: {
          country: form.country || null,
          city: form.city || null,
          area: form.area || null,
          region: form.region || null,
          street: form.street || null,
          latitude,
          longitude,
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      // Tell the rest of the dashboard the location moved. Without this the
      // card on home kept showing whatever login resolved, so a patient who
      // corrected their city here saw the old one until they signed out.
      publishLocationUpdate({
        country: form.country || '',
        city: form.city || '',
        area: form.area || '',
        region: form.region || '',
        street: form.street || '',
        ghanaDigitalAddress: form.ghanaDigitalAddress || '',
        latitude,
        longitude,
      });
      flash('Profile saved successfully.');
    } catch { flash('Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  const saveSecurity = async (newSec, newPriv) => {
    try {
      await setDoc(doc(db, 'patientProfiles', profile.id), { ...(newSec ? { security: newSec } : {}), ...(newPriv ? { privacy: newPriv } : {}), updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) { console.error(err); }
  };

  const toggleSecurity = async (key) => {
    const updated = { ...security, [key]: !security[key] };
    setSecurity(updated);
    await saveSecurity(updated, null);
  };

  const toggleDataSharing = async (key) => {
    const newDs = { ...privacy.dataSharing, [key]: !privacy.dataSharing[key] };
    const newPrivacy = { ...privacy, dataSharing: newDs };
    setPrivacy(newPrivacy);
    await saveSecurity(null, newPrivacy);
    const log = { action: `dataSharing.${key} set to ${!privacy.dataSharing[key]}`, timestamp: new Date().toISOString() };
    const updatedLogs = [...consentLogs.slice(-49), log];
    setConsentLogs(updatedLogs);
    await setDoc(doc(db, 'patientProfiles', profile.id), { 'legal.consentLogs': updatedLogs }, { merge: true });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const { current, next, confirm } = pwdForm;
    if (!current || !next || !confirm) { alert('Please fill all fields.'); return; }
    if (next.length < 6) { alert('New password must be at least 6 characters.'); return; }
    if (next !== confirm) { alert('Passwords do not match.'); return; }
    setChangingPwd(true);
    try {
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('../../../services/authShim');
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setShowPwdForm(false);
      setPwdForm({ current: '', next: '', confirm: '' });
      flash('Password changed successfully.');
    } catch (err) {
      alert(err.code === 'auth/wrong-password' ? 'Current password is incorrect.' : 'Could not change password.');
    } finally { setChangingPwd(false); }
  };

  const downloadMyData = async () => {
    try {
      const [authSnap, profileSnap, apptSnap] = await Promise.all([
        getDoc(doc(db, 'auth', profile.id)),
        getDoc(doc(db, 'patientProfiles', profile.id)),
        getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id))),
      ]);
      const data = { exportedAt: new Date().toISOString(), profile: authSnap.data() || {}, patientProfile: profileSnap.data() || {}, appointments: apptSnap.docs.map(d => d.data()) };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `nessahub-data-${profile.id}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Could not export data.'); }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (deleteConfirm !== 'DELETE') { alert('Type DELETE to confirm.'); return; }
    if (!deletePwd) { alert('Enter your password.'); return; }
    setDeleting(true);
    try {
      const { EmailAuthProvider, reauthenticateWithCredential, deleteUser } = await import('../../../services/authShim');
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, deletePwd));
      await setDoc(doc(db, 'patientProfiles', user.uid), { deletedAt: new Date().toISOString(), status: 'deleted' }, { merge: true });
      await deleteUser(user);
      window.location.href = '/';
    } catch (err) {
      alert(err.code === 'auth/wrong-password' ? 'Incorrect password.' : 'Could not delete account.');
    } finally { setDeleting(false); }
  };

  const saveEmergency = async () => {
    setSavingEmergency(true);
    try {
      await setDoc(doc(db, 'patientProfiles', profile.id), { emergency, updatedAt: serverTimestamp() }, { merge: true });
      flash('Emergency information saved.');
    } catch { flash('Failed to save.'); }
    finally { setSavingEmergency(false); }
  };

  const saveLegal = async () => {
    setSavingLegal(true);
    try {
      const log = { action: 'Legal consent updated', timestamp: new Date().toISOString() };
      const updatedLogs = [...consentLogs.slice(-49), log];
      setConsentLogs(updatedLogs);
      await setDoc(doc(db, 'patientProfiles', profile.id), { legal: { ...legal, consentLogs: updatedLogs }, updatedAt: serverTimestamp() }, { merge: true });
      flash('Legal preferences saved.');
    } catch { flash('Failed to save.'); }
    finally { setSavingLegal(false); }
  };

  const submitDischarge = async () => {
    if (!dischargeForm.reason.trim()) { alert('Please provide a reason.'); return; }
    if (!dischargeForm.confirmed) { alert('Please check the confirmation box.'); return; }
    setSubmittingDischarge(true);
    try {
      const [authSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, 'auth', profile.id)),
        getDoc(doc(db, 'patientProfiles', profile.id)),
      ]);
      const authData = authSnap.data() || {};
      const profData = profileSnap.data() || {};
      await addDoc(collection(db, 'dischargeRequests'), {
        patientId: profile.id, patientName: authData.name || profile.name || '', patientEmail: authData.email || profile.email || '',
        patientPhone: authData.phone || '', bloodType: authData.bloodType || '', allergies: authData.allergies || '',
        reason: dischargeForm.reason.trim(), message: dischargeForm.message.trim(), type: 'self',
        requestedAt: serverTimestamp(), status: 'pending_review',
        patientProfile: { emergency: profData.emergency || {}, insurance: profData.insurance || {}, legal: profData.legal || {} },
      });
      await setDoc(doc(db, 'patientProfiles', profile.id), { status: 'self-discharged', selfDischargeReason: dischargeForm.reason.trim(), selfDischargeMessage: dischargeForm.message.trim(), selfDischargedAt: serverTimestamp() }, { merge: true });
      setAlreadyDischarged(true);
    } catch (err) { console.error(err); alert('Could not submit. Please try again.'); }
    finally { setSubmittingDischarge(false); }
  };

  const TABS = [
    { key: 'profile',   label: '👤 Profile' },
    { key: 'security',  label: '🔒 Security' },
    { key: 'emergency', label: '🚨 Emergency' },
    { key: 'billing',   label: '💳 Billing' },
    { key: 'legal',     label: '📋 Legal' },
    { key: 'discharge', label: '🚪 Discharge', danger: true },
  ];

  const tabBtn = (t) => ({
    padding: '0.55rem 1.1rem', borderRadius: 20, border: `1.5px solid ${tab === t.key ? (t.danger ? '#dc2626' : '#2563eb') : '#e2e8f0'}`,
    background: tab === t.key ? (t.danger ? '#fef2f2' : '#eff6ff') : '#fff', cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 700, color: tab === t.key ? (t.danger ? '#dc2626' : '#2563eb') : '#64748b',
    whiteSpace: 'nowrap', transition: 'all 0.15s',
  });
  const inp = { border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.875rem', fontSize: '0.875rem', color: '#0f172a', outline: 'none', background: '#fafafa', width: '100%', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.03em' };
  const card = { background: '#fff', borderRadius: 14, padding: '1.25rem', marginBottom: '1rem', border: '1px solid #e2e8f0' };
  const rowItem = (icon, label, desc, rightEl) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>{label}</p>
        {desc && <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{desc}</p>}
      </div>
      {rightEl}
    </div>
  );

  if (loading) return <div className="mp-page"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>Loading…</p></div>;

  return (
    <div className="mp-page">
      <div className="mp-page-header"><h1>My Profile</h1><p>Manage your account, security, and preferences</p></div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {TABS.map(t => <button key={t.key} style={tabBtn(t)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {savedMsg && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#15803d', fontWeight: 600 }}>✓ {savedMsg}</div>}

      {/* ═══ PROFILE ═══ */}
      {tab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div style={card}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Personal Information</h3>
            {[['Full Name', 'name', 'text'], ['Phone Number', 'phone', 'tel'], ['Date of Birth', 'dob', 'date']].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom: '0.75rem' }}>
                <label style={lbl}>{label}</label>
                <input style={inp} type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={lbl}>Email (read-only)</label>
              <input style={{ ...inp, background: '#f8fafc', color: '#94a3b8' }} value={form.email} readOnly />
            </div>
            <button
              type="button"
              className="mp-btn mp-btn-outline mp-btn-sm"
              onClick={() => detectAddress((loc) => {
                setForm(f => ({
                  ...f,
                  country: loc.countryCode || f.country || '',
                  city: loc.city || f.city || '',
                  area: loc.area || f.area || '',
                  region: loc.region || f.region || '',
                  street: loc.street || f.street || '',
                  latitude: loc.latitude ?? f.latitude ?? null,
                  longitude: loc.longitude ?? f.longitude ?? null,
                }));
              })}
              disabled={locating}
              style={{ marginBottom: '0.5rem' }}
            >
              {locating ? 'Detecting location…' : 'Use current location'}
            </button>
            {locationMsg ? <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#64748b' }}>{locationMsg}</p> : null}
            {[
              ['Country', 'country', 'text', 'e.g. GH'],
              ['City', 'city', 'text', 'e.g. Accra'],
              ['Area / Locality', 'area', 'text', 'e.g. East Legon'],
              ['Region / State', 'region', 'text', 'e.g. Greater Accra'],
              ['Street', 'street', 'text', 'e.g. Liberation Road'],
              ['Ghana Digital Address (optional)', 'ghanaDigitalAddress', 'text', 'e.g. GA-123-4567'],
            ].map(([label, key, type, placeholder]) => (
              <div key={key} style={{ marginBottom: '0.75rem' }}>
                <label style={lbl}>{label}</label>
                <input style={inp} type={type} value={form[key] || ''} placeholder={placeholder} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <button className="mp-btn mp-btn-primary" onClick={saveProfile} disabled={saving} style={{ marginTop: '0.5rem' }}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
          <div style={card}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Health Information</h3>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={lbl}>Blood Type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: 4 }}>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bt => (
                  <button key={bt} type="button" onClick={() => setForm(f => ({ ...f, bloodType: bt }))}
                    style={{ padding: '0.3rem 0.75rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${form.bloodType === bt ? '#2563eb' : '#e2e8f0'}`, background: form.bloodType === bt ? '#eff6ff' : '#fff', color: form.bloodType === bt ? '#2563eb' : '#64748b' }}>
                    {bt}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={lbl}>Known Allergies</label>
              <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} placeholder="e.g. Penicillin, Peanuts…" />
            </div>
            {!showPwdForm ? (
              <button className="mp-btn mp-btn-outline" onClick={() => setShowPwdForm(true)}>🔑 Change Password</button>
            ) : (
              <form onSubmit={handleChangePassword} style={{ marginTop: '0.75rem' }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: '0 0 0.75rem' }}>Change Password</p>
                {[['Current Password', 'current'], ['New Password', 'next'], ['Confirm New Password', 'confirm']].map(([label, key]) => (
                  <div key={key} style={{ marginBottom: '0.6rem' }}>
                    <label style={lbl}>{label}</label>
                    <input style={inp} type="password" value={pwdForm[key]} onChange={e => setPwdForm(p => ({ ...p, [key]: e.target.value }))} placeholder="••••••••" />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button className="mp-btn mp-btn-primary mp-btn-sm" type="submit" disabled={changingPwd}>{changingPwd ? 'Changing…' : 'Update Password'}</button>
                  <button className="mp-btn mp-btn-outline mp-btn-sm" type="button" onClick={() => setShowPwdForm(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ═══ SECURITY ═══ */}
      {tab === 'security' && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={card}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Authentication</h3>
            {rowItem('📱', 'Two-Factor Authentication (2FA)', 'Receive a code on your phone when signing in', <Toggle on={security.twoFAEnabled} onChange={() => toggleSecurity('twoFAEnabled')} color="#2563eb" />)}
            {rowItem('🔏', 'Biometric Login', 'Face ID / Fingerprint on supported devices', <Toggle on={security.biometricEnabled} onChange={() => toggleSecurity('biometricEnabled')} color="#7c3aed" />)}
            <button className="mp-btn mp-btn-outline" style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d97706', borderColor: '#fde68a' }} onClick={() => { if (window.confirm('Sign out from all devices?')) { signOut(auth).then(() => window.location.href = '/'); } }}>
              🚪 Sign Out All Devices
            </button>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700 }}>Data Sharing Permissions</h3>
            <p style={{ margin: '0 0 0.875rem', fontSize: '0.82rem', color: '#64748b' }}>Control what your doctor can see. Turning a category off hides it from your doctor's view immediately.</p>
            {[
              ['📋', 'Health Records', 'records', '#059669'],
              ['💊', 'Prescriptions', 'prescriptions', '#7c3aed'],
              ['📅', 'Appointments', 'appointments', '#2563eb'],
              ['🔬', 'Lab Results', 'labResults', '#d97706'],
            ].map(([icon, label, key, color]) => rowItem(icon, label, privacy.dataSharing[key] ? 'Visible to your doctor' : 'Hidden from your doctor', <Toggle on={privacy.dataSharing[key]} onChange={() => toggleDataSharing(key)} color={color} />))}
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Your Data (GDPR)</h3>
            {rowItem('📥', 'Download My Data', 'Export all your health data as a JSON file', <button className="mp-btn mp-btn-outline mp-btn-sm" onClick={downloadMyData}>Download</button>)}
          </div>

          <div style={{ ...card, borderColor: '#fecaca', borderWidth: 1.5 }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#dc2626' }}>⚠️ Danger Zone</h3>
            {!showDeleteForm ? (
              <button className="mp-btn" style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setShowDeleteForm(true)}>
                🗑 Delete My Account
              </button>
            ) : (
              <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#991b1b' }}>This is permanent. Type <strong>DELETE</strong> and enter your password.</p>
                <div><label style={lbl}>Type DELETE</label><input style={inp} value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="DELETE" /></div>
                <div><label style={lbl}>Password</label><input style={inp} type="password" value={deletePwd} onChange={e => setDeletePwd(e.target.value)} placeholder="Your current password" /></div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" disabled={deleting} style={{ padding: '0.65rem 1rem', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Deleting…' : 'Delete Account'}</button>
                  <button type="button" className="mp-btn mp-btn-outline mp-btn-sm" onClick={() => setShowDeleteForm(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ═══ EMERGENCY ═══ */}
      {tab === 'emergency' && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.875rem', fontSize: '0.82rem', color: '#92400e' }}>
            ⚠️ This information is shared with emergency responders and your doctor when emergency access is enabled.
          </div>
          <div style={card}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Emergency Medical Notes</h3>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: '#64748b' }}>Critical conditions that doctors must know immediately (e.g., Asthmatic, Epileptic, Diabetic).</p>
            <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={emergency.medicalNotes} onChange={e => setEmergency(em => ({ ...em, medicalNotes: e.target.value }))} placeholder="e.g., Asthmatic — uses Ventolin. Epileptic — seizure protocol applies. Allergic to Penicillin." />
          </div>
          <div style={card}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Critical Status</h3>
            {rowItem('❤️', 'Organ Donor', 'Registered as an organ donor', <Toggle on={emergency.organDonor} onChange={() => setEmergency(em => ({ ...em, organDonor: !em.organDonor }))} color="#dc2626" />)}
            {rowItem('🛡️', 'Emergency Doctor Access', 'Allow any doctor to view your profile in life-threatening emergencies', <Toggle on={emergency.emergencyAccess} onChange={() => setEmergency(em => ({ ...em, emergencyAccess: !em.emergencyAccess }))} color="#16a34a" />)}
          </div>
          <div style={card}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Preferred Hospital</h3>
            <input style={inp} value={emergency.preferredHospital} onChange={e => setEmergency(em => ({ ...em, preferredHospital: e.target.value }))} placeholder="e.g., St. Mary's General Hospital, Chicago, IL" />
          </div>
          <button className="mp-btn mp-btn-primary" onClick={saveEmergency} disabled={savingEmergency} style={{ maxWidth: 300 }}>
            {savingEmergency ? 'Saving…' : '✓ Save Emergency Info'}
          </button>
        </div>
      )}

      {/* ═══ BILLING ═══ */}
      {tab === 'billing' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div style={card}>
            <h3 style={{ margin: '0 0 0.875rem', fontSize: '1rem', fontWeight: 700 }}>Insurance on File</h3>
            {insuranceInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.875rem' }}>
                {[['Provider', 'provider'], ['Plan', 'planType'], ['Policy #', 'policyNumber'], ['Member ID', 'memberId'], ['Expires', 'expiryDate'], ['Deductible', 'deductible'], ['Co-pay', 'copay']].map(([label, key]) => insuranceInfo[key] ? (
                  <p key={key} style={{ margin: 0, fontSize: '0.875rem', color: '#334155' }}><strong>{label}:</strong> {insuranceInfo[key]}</p>
                ) : null)}
              </div>
            ) : <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 0.875rem' }}>No insurance on file yet.</p>}
            <a href="/dashboard/insurance" className="mp-btn mp-btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}>
              🛡️ {insuranceInfo ? 'Update Insurance' : 'Add Insurance'}
            </a>
          </div>
          <div style={card}>
            <h3 style={{ margin: '0 0 0.875rem', fontSize: '1rem', fontWeight: 700 }}>Billing History</h3>
            {billingHistory.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No billing records yet.</p>
            ) : billingHistory.slice(-8).reverse().map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #f8fafc' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>{b.description || 'Consultation'}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>{b.date || '—'}</p>
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: b.status === 'paid' ? '#16a34a' : '#dc2626' }}>${b.amount || 0}</span>
              </div>
            ))}
            <a href="/dashboard/billing" className="mp-btn mp-btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', marginTop: '0.75rem' }}>
              💳 Full Billing Center
            </a>
          </div>
        </div>
      )}

      {/* ═══ LEGAL ═══ */}
      {tab === 'legal' && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.875rem', fontSize: '0.82rem', color: '#1e40af' }}>
            ℹ️ All consent changes are logged with a timestamp for HIPAA/GDPR compliance.
          </div>
          <div style={card}>
            <h3 style={{ margin: '0 0 0.875rem', fontSize: '1rem', fontWeight: 700 }}>Consent & Agreements</h3>
            {[
              { key: 'termsAccepted',     label: 'Terms & Conditions',              desc: 'I have read and agree to the NessaHub Terms of Service' },
              { key: 'privacyAccepted',   label: 'Privacy Policy',                  desc: 'I agree to the NessaHub Privacy Policy regarding data handling' },
              { key: 'hipaaAccepted',     label: 'HIPAA / GDPR Acknowledgment',     desc: 'I acknowledge my rights under HIPAA/GDPR for health data protection' },
              { key: 'dataSharingConsent',label: 'Doctor–Patient Data Sharing',     desc: 'I consent to sharing my health data with my assigned doctor(s)' },
            ].map(({ key, label, desc }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem', padding: '0.75rem 0', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }} onClick={() => setLegal(l => ({ ...l, [key]: !l[key] }))}>
                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${legal[key] ? '#2563eb' : '#cbd5e1'}`, background: legal[key] ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  {legal[key] && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>{label}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>{desc}</p>
                </div>
              </div>
            ))}
            <button className="mp-btn mp-btn-primary" onClick={saveLegal} disabled={savingLegal} style={{ marginTop: '0.875rem' }}>
              {savingLegal ? 'Saving…' : '✓ Save Legal Preferences'}
            </button>
          </div>
          <div style={card}>
            <h3 style={{ margin: '0 0 0.875rem', fontSize: '1rem', fontWeight: 700 }}>Legal Documents</h3>
            {[['Terms & Conditions', '📄'], ['Privacy Policy', '🔒'], ['HIPAA Notice of Privacy Practices', '⚕️'], ['GDPR Data Rights Information', '🇪🇺']].map(([label, icon]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>{icon} {label}</span>
                <button className="mp-btn mp-btn-outline mp-btn-sm" onClick={() => alert(`${label} will open in a new tab. Document managed by NessaHub Legal.`)}>View</button>
              </div>
            ))}
          </div>
          {consentLogs.length > 0 && (
            <div style={card}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Consent Audit Log</h3>
              {consentLogs.slice(-5).reverse().map((log, i) => (
                <p key={i} style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', color: '#64748b' }}>⏱ {log.action} — {new Date(log.timestamp).toLocaleString()}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ DISCHARGE ═══ */}
      {tab === 'discharge' && (
        <div style={{ maxWidth: 600 }}>
          {alreadyDischarged ? (
            <div style={{ ...card, textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h3 style={{ color: '#dc2626', margin: '0 0 0.75rem' }}>Discharge Request Submitted</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Your request has been submitted and your doctor has been notified. You may continue using NessaHub to view your records.</p>
            </div>
          ) : (
            <>
              <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '0.875rem', fontSize: '0.82rem', color: '#991b1b', marginBottom: '1rem' }}>
                ⚠️ Submitting this form will notify your doctor and update your status to "self-discharged". You can still access your records.
              </div>
              <div style={card}>
                <h3 style={{ margin: '0 0 0.875rem', fontSize: '1rem', fontWeight: 700 }}>Self-Discharge Request</h3>
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={lbl}>Reason for Leaving *</label>
                  <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={dischargeForm.reason} onChange={e => setDischargeForm(f => ({ ...f, reason: e.target.value }))} placeholder="Please describe why you wish to leave. Your honest feedback helps us improve." />
                </div>
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={lbl}>Additional Message to Your Doctor (optional)</label>
                  <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={dischargeForm.message} onChange={e => setDischargeForm(f => ({ ...f, message: e.target.value }))} placeholder="Any additional context you'd like your doctor to know…" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem', background: '#fef2f2', borderRadius: 10, marginBottom: '1rem', cursor: 'pointer' }} onClick={() => setDischargeForm(f => ({ ...f, confirmed: !f.confirmed }))}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${dischargeForm.confirmed ? '#dc2626' : '#cbd5e1'}`, background: dischargeForm.confirmed ? '#dc2626' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    {dischargeForm.confirmed && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#991b1b', fontWeight: 600 }}>I understand this will notify my doctor and update my status to "self-discharged".</p>
                </div>
                <button
                  onClick={submitDischarge} disabled={submittingDischarge || !dischargeForm.confirmed || !dischargeForm.reason.trim()}
                  style={{ padding: '0.875rem 1.5rem', borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: (submittingDischarge || !dischargeForm.confirmed || !dischargeForm.reason.trim()) ? 0.5 : 1 }}>
                  🚪 {submittingDischarge ? 'Submitting…' : 'Submit Discharge Request'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Support Screen ───────────────────────────────────────────────────────────
const ISSUE_TYPES = [
  { value: 'doctor_report', label: 'Report a Doctor', icon: '⚕️' },
  { value: 'app_bug', label: 'App Bug / Technical Issue', icon: '🐛' },
  { value: 'billing', label: 'Billing Issue', icon: '💳' },
  { value: 'account', label: 'Account Problem', icon: '🔒' },
  { value: 'appointment', label: 'Appointment Issue', icon: '📅' },
  { value: 'other', label: 'Other', icon: '💬' },
];

function MedPatSupport({ profile }) {
  const [issueType, setIssueType] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [emailingAdmin, setEmailingAdmin] = useState(false);

  /**
   * Files the ticket AND emails the administrators now, for anyone who would
   * rather reach a person than wait on a queue. Identity is read from the auth
   * token on the backend, so nothing identifying is sent from here.
   */
  const handleEmailAdmin = async () => {
    if (!issueType) { setError('Please select an issue type.'); return; }
    if (!subject.trim()) { setError('Please enter a subject.'); return; }
    if (!description.trim()) { setError('Please describe your issue.'); return; }
    setError('');
    setEmailingAdmin(true);
    try {
      await api('/api/v1/support/contact-admin', {
        method: 'POST',
        body: {
          subject: subject.trim(),
          message: description.trim(),
          category: issueType,
          priority: 'normal',
        },
      });
      setSuccess(true);
    } catch (err) {
      setError(err?.message || 'Could not send the email. Please try again.');
    } finally {
      setEmailingAdmin(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!issueType) { setError('Please select an issue type.'); return; }
    if (!subject.trim()) { setError('Please enter a subject.'); return; }
    if (!description.trim()) { setError('Please describe your issue.'); return; }
    setError('');
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'supportTickets'), {
        userId: profile?.id || '',
        userName: profile?.name || '',
        userEmail: profile?.email || '',
        issueType,
        subject: subject.trim(),
        description: description.trim(),
        status: 'open',
        platform: 'web',
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'globalReports'), {
        category: issueType === 'billing' ? 'billing' : issueType === 'app_bug' ? 'technical' : 'complaint',
        subject: subject.trim(),
        message: description.trim(),
        severity: issueType === 'doctor_report' ? 'high' : 'medium',
        status: 'open',
        source: 'medical_patient_support',
        sourceCollection: 'supportTickets',
        reporterId: profile?.id || '',
        reporterName: profile?.name || '',
        reporterEmail: profile?.email || '',
        reporterType: 'patient',
        metadata: { issueType, platform: 'web' },
        adminReplies: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSuccess(true);
    } catch (err) {
      setError('Failed to submit ticket. Please try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setIssueType(''); setSubject(''); setDescription('');
    setSuccess(false); setError('');
  };

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1>Support &amp; Report</h1>
        <p>Need help or want to report an issue? We're here for you.</p>
      </div>

      {success ? (
        <div className="mp-card" style={{ maxWidth: 560, textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h3 style={{ marginTop: 0, color: '#16a34a' }}>Ticket Submitted!</h3>
          <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
            Your support request has been received. Our team will follow up via email within 24–48 hours.
          </p>
          <button className="mp-btn mp-btn-primary" onClick={handleReset}>Submit Another Ticket</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', maxWidth: 900 }}>
          {/* Issue type selection */}
          <div className="mp-card">
            <h3 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1rem' }}>Select Issue Type</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {ISSUE_TYPES.map(it => (
                <button
                  key={it.value}
                  onClick={() => setIssueType(it.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.85rem 1rem', borderRadius: '10px', cursor: 'pointer',
                    border: issueType === it.value ? '2px solid #1e6bb8' : '1.5px solid #e2e8f0',
                    background: issueType === it.value ? '#eff6ff' : 'white',
                    textAlign: 'left', fontWeight: issueType === it.value ? '700' : '500',
                    color: issueType === it.value ? '#1e6bb8' : '#334155',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{it.icon}</span>
                  <span style={{ fontSize: '0.9rem' }}>{it.label}</span>
                  {issueType === it.value && <CheckCircle size={16} color="#1e6bb8" style={{ marginLeft: 'auto' }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="mp-card">
            <h3 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1rem' }}>Describe Your Issue</h3>
            <form onSubmit={handleSubmit} className="mp-settings-form">
              <div className="mp-field-group">
                <label className="mp-label">Subject</label>
                <input
                  className="mp-input"
                  placeholder="Brief summary of your issue"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="mp-field-group">
                <label className="mp-label">Description</label>
                <textarea
                  className="mp-input"
                  rows={6}
                  placeholder="Please describe your issue in detail…"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
              {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>}
              <button className="mp-btn mp-btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'Submitting…' : 'Submit Ticket'}
              </button>
              <button
                type="button"
                className="mp-btn mp-btn-outline"
                onClick={handleEmailAdmin}
                disabled={emailingAdmin}
                style={{ width: '100%', marginTop: '0.6rem' }}
              >
                {emailingAdmin ? 'Sending…' : 'Email an Administrator'}
              </button>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
                Sends your message to our admin team by email. You will receive a copy.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── E-Pharmacy Screen ────────────────────────────────────────────────────────
const DRUG_STATUS_ICONS = {
  pending:               { icon: '⏳', label: 'Pending',      color: '#d97706' },
  available:             { icon: '✅', label: 'Available',    color: '#16a34a' },
  not_available:         { icon: '❌', label: 'Not Available',color: '#dc2626' },
  alternative_suggested: { icon: '🔁', label: 'Alt. Suggested',color: '#7c3aed' },
  approved_replacement:  { icon: '✅', label: 'Approved Alt.',color: '#16a34a' },
};

const RX_STATUS_META = {
  sent:                { label: 'Sent to Pharmacy', color: '#1d4ed8', bg: '#eff6ff' },
  accepted:            { label: 'Processing',       color: '#d97706', bg: '#fffbeb' },
  partially_fulfilled: { label: 'Partial',          color: '#d97706', bg: '#fffbeb' },
  ready:               { label: 'Ready for Pickup', color: '#16a34a', bg: '#f0fdf4' },
  delivered:           { label: 'Delivered',        color: '#475569', bg: '#f8fafc' },
};

const DEFAULT_TRANSFER_APPROVAL_TTL_HOURS = 6;

function MedPatEPharmacy({ profile }) {
  const [tab, setTab] = useState('prescriptions'); // 'prescriptions' | 'myPharmacies' | 'pharmacies'
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [myPharmacies, setMyPharmacies] = useState([]);
  const [loadingMyPh, setLoadingMyPh] = useState(true);
  const [removingPhKey, setRemovingPhKey] = useState(null);
  const [systemPharmacies, setSystemPharmacies] = useState([]);
  const [loadingPh, setLoadingPh] = useState(false);
  const [searchPh, setSearchPh] = useState('');
  const [selectedRx, setSelectedRx] = useState(null);
  const [transferActionKey, setTransferActionKey] = useState('');

  useEffect(() => {
    if (!profile?.id) return;
    // Real-time prescription updates
    const q = query(collection(db, 'doctorPrescriptions'), where('patientId', '==', profile.id));
    const unsub = onSnapshot(q, async snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const expiries = [];
      rows.forEach((rx) => {
        const meds = Array.isArray(rx.medications) ? rx.medications : [];
        if (meds.some(isTransferRequestExpired)) {
          const nextMeds = meds.map(m => (isTransferRequestExpired(m) ? expirePendingTransferRequest(m) : m));
          expiries.push(
            updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
              medications: nextMeds,
              pharmacyStatus: deriveRxStockStatus(nextMeds),
              updatedAt: serverTimestamp(),
            }).catch(() => {})
          );
        }
      });
      if (expiries.length) {
        await Promise.all(expiries);
        return;
      }
      const list = rows
        .filter(r => r.pharmacyId) // only routed prescriptions
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(list);
      setLoadingRx(false);
    }, () => setLoadingRx(false));
    return unsub;
  }, [profile]);

  useEffect(() => {
    if (!profile?.id) return;
    const unsub = onSnapshot(doc(db, 'patientProfiles', profile.id), (snap) => {
      setMyPharmacies(snap.exists() ? (snap.data().pharmacies || []) : []);
      setLoadingMyPh(false);
    }, () => setLoadingMyPh(false));
    return unsub;
  }, [profile]);

  useEffect(() => {
    if (tab !== 'pharmacies') return;
    setLoadingPh(true);
    getDocs(query(collection(db, 'pharmacies'), where('status', '==', 'active')))
      .then(snap => setSystemPharmacies(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setLoadingPh(false));
  }, [tab]);

  const filteredPh = systemPharmacies.filter(ph => {
    if (!searchPh.trim()) return true;
    const q = searchPh.toLowerCase();
    return (ph.pharmacyName || ph.name || '').toLowerCase().includes(q) ||
           (ph.country || '').toLowerCase().includes(q) ||
           (ph.address || '').toLowerCase().includes(q);
  });

  const isTransferRequestExpired = (med) => {
    if (!med || med.drugStatus !== 'transfer_requested' || med.transferRequestStatus !== 'pending_patient') return false;
    const requestedAt = med.transferRequestedAt ? new Date(med.transferRequestedAt).getTime() : NaN;
    if (!Number.isFinite(requestedAt)) return false;
    const ttlHours = Math.max(1, Number(med.transferApprovalTtlHours) || DEFAULT_TRANSFER_APPROVAL_TTL_HOURS);
    const ttlMs = ttlHours * 60 * 60 * 1000;
    return Date.now() - requestedAt > ttlMs;
  };

  const expirePendingTransferRequest = (med) => ({
    ...med,
    drugStatus: 'not_available',
    transferRequestStatus: 'expired',
    transferRequestExpiredAt: new Date().toISOString(),
    transferBranchId: null,
    transferBranchName: null,
    transferBranchAddress: null,
    transferRequestBranchId: null,
    transferRequestBranchName: null,
    transferRequestBranchAddress: null,
  });

  const removeSavedPharmacy = async (ph) => {
    const rk = patientPharmacyKey(ph) || ph.id || ph.name || '';
    setRemovingPhKey(rk);
    try {
      const updated = removePatientPharmacyByKey(myPharmacies, ph);
      await setDoc(doc(db, 'patientProfiles', profile.id), { pharmacies: updated }, { merge: true });
    } catch {
      alert('Could not remove pharmacy. Please try again.');
    } finally {
      setRemovingPhKey(null);
    }
  };

  const resolveTransferRequest = async (rx, medIndex, approve) => {
    const meds = Array.isArray(rx?.medications) ? rx.medications : [];
    const med = meds[medIndex];
    if (!med || med.drugStatus !== 'transfer_requested' || med.transferRequestStatus !== 'pending_patient') return;
    const key = `${rx.id}:${medIndex}:${approve ? 'approve' : 'reject'}`;
    setTransferActionKey(key);
    try {
      // The patient is not allowed to PATCH the prescription (that endpoint is for
      // doctors/pharmacies), which made this fail with 403. The dedicated endpoint
      // applies the transfer state machine server-side after confirming the line is
      // genuinely awaiting THIS patient.
      await api(`/api/v1/medical/prescriptions/${rx.id}/transfer-decision`, {
        method: 'POST',
        body: { medIndex, approve },
      });
    } catch {
      alert('Failed to process transfer decision. Please try again.');
    } finally {
      setTransferActionKey('');
    }
  };

  return (
    <div className="mp-page">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>💊 E-Pharmacy</h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Track your prescription status and explore available pharmacies.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0', flexWrap: 'wrap' }}>
        {[{ key: 'prescriptions', label: '📋 My Prescriptions' }, { key: 'myPharmacies', label: '⭐ My Pharmacies' }, { key: 'pharmacies', label: '🏪 Browse Pharmacies' }].map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: 'none', color: tab === t.key ? '#1e6bb8' : '#64748b', borderBottom: tab === t.key ? '3px solid #1e6bb8' : '3px solid transparent', marginBottom: '-2px', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PRESCRIPTIONS TAB ── */}
      {tab === 'prescriptions' && (
        <>
          {loadingRx ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>Loading prescriptions…</p>
          ) : prescriptions.length === 0 ? (
            <div className="mp-card">
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>💊</div>
                <h3 style={{ margin: '0 0 0.5rem', color: '#64748b' }}>No pharmacy prescriptions yet</h3>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>When your doctor sends a prescription to a pharmacy, it will appear here with real-time status updates.</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {prescriptions.map(rx => {
                const pm = rx.pharmacyStatus ? (RX_STATUS_META[rx.pharmacyStatus] || null) : null;
                const meds = rx.medications || [];
                const transferredMed = meds.find(m => m.drugStatus === 'transferred' && m.transferBranchName);
                return (
                  <div key={rx.id} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', cursor: 'pointer' }}
                    onClick={() => setSelectedRx(rx)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Dr. {rx.doctorName || 'Doctor'}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>{rx.diagnosis || '—'} · {rx.date || ''}</div>
                        {rx.prescriptionRef && (
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0c4a6e', background: '#f0f9ff', padding: '2px 8px', borderRadius: 6, display: 'inline-block', marginTop: 4, fontSize: '0.82rem', border: '1px solid #bae6fd' }}>
                            {rx.prescriptionRef}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {pm && (
                          <span style={{ background: pm.bg, color: pm.color, borderRadius: 20, padding: '0.2rem 0.7rem', fontSize: '0.72rem', fontWeight: 700 }}>{pm.label}</span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{rx.pharmacyName}{rx.branchName ? ` › ${rx.branchName}` : ''}</span>
                      </div>
                    </div>

                    {/* Drug pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                      {meds.map((m, i) => {
                        const ds = DRUG_STATUS_ICONS[m.drugStatus] || DRUG_STATUS_ICONS.pending;
                        return (
                          <span key={i} style={{ background: `${ds.color}18`, color: ds.color, border: `1px solid ${ds.color}40`, borderRadius: 20, padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600 }}>
                            {ds.icon} {m.name}
                          </span>
                        );
                      })}
                    </div>
                    {meds
                      .map((m, i) => ({ m, i }))
                      .filter(({ m }) => m.drugStatus === 'transfer_requested' && m.transferRequestStatus === 'pending_patient')
                      .map(({ m, i }) => (
                      <div
                        key={`${rx.id}-transfer-pending-${i}`}
                        style={{ marginTop: '0.35rem', border: '1px solid #99f6e4', background: '#f0fdfa', borderRadius: 10, padding: '0.55rem 0.65rem' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f766e' }}>
                          Transfer request: {m.name || 'Drug'} to {m.transferRequestBranchName || 'another branch'}{m.transferRequestBranchAddress ? ` (${m.transferRequestBranchAddress})` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <button
                            className="doctor-btn doctor-btn-sm doctor-btn-outline"
                            disabled={transferActionKey === `${rx.id}:${i}:approve` || transferActionKey === `${rx.id}:${i}:reject`}
                            onClick={() => resolveTransferRequest(rx, i, true)}
                            style={{ borderColor: '#14b8a6', color: '#0f766e' }}
                          >
                            I Agree
                          </button>
                          <button
                            className="doctor-btn doctor-btn-sm doctor-btn-outline"
                            disabled={transferActionKey === `${rx.id}:${i}:approve` || transferActionKey === `${rx.id}:${i}:reject`}
                            onClick={() => resolveTransferRequest(rx, i, false)}
                            style={{ borderColor: '#fda4af', color: '#be123c' }}
                          >
                            I Reject
                          </button>
                        </div>
                      </div>
                    ))}

                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'right', marginTop: '0.25rem' }}>
                      Tap for full details
                    </div>
                    {transferredMed && (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.74rem', color: '#0369a1', fontWeight: 700 }}>
                        This drug ({transferredMed.name || 'Drug'}) is transfered to branch ({transferredMed.transferBranchName}{transferredMed.transferBranchAddress ? `, ${transferredMed.transferBranchAddress}` : ''}).
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {selectedRx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(3px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setSelectedRx(null)}>
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem', boxShadow: '0 22px 60px rgba(2,6,23,0.28)', border: '1px solid #e2e8f0' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', paddingBottom: '0.65rem', borderBottom: '1px solid #eef2f7' }}>
              <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>Prescription Details</h3>
              <button className="doctor-btn doctor-btn-sm doctor-btn-outline" style={{ borderRadius: 10 }} onClick={() => setSelectedRx(null)}>Close</button>
            </div>
            <p style={{ margin: '0 0 0.35rem', color: '#0f172a', fontWeight: 700 }}>Dr. {selectedRx.doctorName || 'Doctor'}</p>
            <p style={{ margin: '0 0 0.85rem', color: '#64748b', fontSize: '0.85rem' }}>{selectedRx.diagnosis || '—'} · {selectedRx.date || ''}</p>
            {(selectedRx.medications || []).map((m, i) => {
              const ds = DRUG_STATUS_ICONS[m.drugStatus] || DRUG_STATUS_ICONS.pending;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.6rem 0', borderBottom: i < (selectedRx.medications || []).length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div>
                    <b style={{ fontSize: '0.875rem', color: '#0f172a' }}>{m.name}</b>
                    {m.strength && <span style={{ fontSize: '0.75rem', color: '#64748b' }}> ({m.strength})</span>}
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{m.dosage} · {m.frequency} · {m.duration} {m.durationUnit}</div>
                    {m.alternativeSuggested && (
                      <div style={{ fontSize: '0.78rem', color: '#7c3aed', marginTop: 4, background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                        🔁 Alternative: {m.alternativeSuggested} {m.drugStatus === 'approved_replacement'
                          ? `(Approved · Dr. ${m.approvedByDoctorName || selectedRx.doctorName || 'Doctor'})`
                          : '(Waiting for Approval from your Doctor)'}
                        {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                      </div>
                    )}
                    {m.drugStatus === 'transferred' && m.transferBranchName && (
                      <div style={{ fontSize: '0.78rem', color: '#0369a1', marginTop: 4, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                        This drug ({m.name || 'Drug'}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
                      </div>
                    )}
                    {m.transferRequestStatus === 'superseded' && (
                      <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: 4, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 8px' }}>
                        An earlier transfer request for {m.name || 'this drug'} was withdrawn because you responded to a newer one. The pharmacy will follow up if it is still needed.
                      </div>
                    )}
                    {m.drugStatus === 'transfer_requested' && m.transferRequestStatus === 'pending_patient' && (
                      <div style={{ fontSize: '0.78rem', color: '#0f766e', marginTop: 4, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                        Awaiting your approval to transfer this drug to {m.transferRequestBranchName || 'another branch'}{m.transferRequestBranchAddress ? ` (${m.transferRequestBranchAddress})` : ''}.
                      </div>
                    )}
                    {/* Pharmacy notes reach the patient only once the doctor has approved them. */}
                    {patientVisibleNotes(m).map((n, ni) => (
                      <div key={ni} style={{ fontSize: '0.78rem', color: '#0f172a', marginTop: 4, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 8px' }}>
                        💊 <b>{n.label || 'Pharmacy note'}</b>: {n.note}
                        {n.requiresDoctorApproval && (
                          <span style={{ color: '#15803d', fontWeight: 600 }}>
                            {' '}· Approved{n.approvedByDoctorName ? ` · Dr. ${n.approvedByDoctorName}` : ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: ds.color, whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>{ds.icon} {ds.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MY PHARMACIES (saved on profile) ── */}
      {tab === 'myPharmacies' && (
        <>
          {loadingMyPh ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading your pharmacies…</p>
          ) : myPharmacies.length === 0 ? (
            <div className="mp-card">
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⭐</div>
                <h3 style={{ margin: '0 0 0.35rem', color: '#64748b' }}>No saved pharmacies</h3>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>When you or your doctor add a pharmacy branch, it will appear here. Tap − to remove.</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {myPharmacies.map((ph, idx) => {
                const rowKey = patientPharmacyKey(ph) || ph.id || String(idx);
                return (
                  <div key={rowKey} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '1rem 1.1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{ph.name}</p>
                      {ph.address ? <p style={{ margin: '0 0 2px', fontSize: '0.78rem', color: '#64748b' }}>📍 {ph.address}</p> : null}
                      {ph.phone ? <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>📞 {ph.phone}</p> : null}
                    </div>
                    <button
                      type="button"
                      title="Remove pharmacy"
                      disabled={removingPhKey === rowKey}
                      onClick={() => removeSavedPharmacy(ph)}
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
                        cursor: removingPhKey === rowKey ? 'wait' : 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <Minus size={18} strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── PHARMACIES TAB ── */}
      {tab === 'pharmacies' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.5rem 0.85rem', marginBottom: '1rem' }}>
            <Search size={16} color="#94a3b8" />
            <input placeholder="Search pharmacies by name or location…" value={searchPh} onChange={e => setSearchPh(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: '0.875rem', flex: 1, color: '#0f172a', background: 'transparent' }} />
          </div>
          {loadingPh ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading pharmacies…</p>
          ) : filteredPh.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏪</div>
              <p>{searchPh ? 'No pharmacies match your search.' : 'No active pharmacies available.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredPh.map(ph => (
                <div key={ph.id} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>🏪</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{ph.pharmacyName || ph.name}</p>
                    {ph.country && <p style={{ margin: '0 0 2px', fontSize: '0.78rem', color: '#64748b' }}>🌍 {ph.country}</p>}
                    {ph.address && <p style={{ margin: '0 0 2px', fontSize: '0.78rem', color: '#64748b' }}>📍 {ph.address}</p>}
                    {ph.phone && <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>📞 {ph.phone}</p>}
                  </div>
                  <span style={{ fontSize: '0.7rem', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>Active</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Health Timeline ──────────────────────────────────────────────────────────
function MedPatTimeline({ profile }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

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

  const FILTERS = [
    { key: 'all',  label: 'All' },
    { key: 'lab',  label: '🧪 Lab', types: ['LAB_ORDER', 'LAB_RESULT'] },
    { key: 'scan', label: '🩻 Scan', types: ['SCAN_ORDER', 'SCAN_RESULT'] },
    { key: 'rx',   label: '💊 Rx', types: ['PRESCRIPTION'] },
    { key: 'appt', label: '📅 Appt', types: ['APPOINTMENT'] },
  ];

  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'patientTimeline'), where('patientId', '==', profile.id)));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setEvents(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { if (profile?.id) load(); }, [profile]);

  const fmtTs = (ts) => {
    if (!ts?.seconds) return '—';
    const d = new Date(ts.seconds * 1000);
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const activeFilter = FILTERS.find(f => f.key === filter);
  const filtered = events.filter(e => {
    if (filter === 'all') return true;
    return activeFilter?.types?.includes(e.type);
  });

  // Group by date
  const groups = [];
  const seen = new Map();
  filtered.forEach(evt => {
    const dateKey = evt.createdAt?.seconds
      ? new Date(evt.createdAt.seconds * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown Date';
    if (!seen.has(dateKey)) { seen.set(dateKey, []); groups.push({ date: dateKey, events: seen.get(dateKey) }); }
    seen.get(dateKey).push(evt);
  });

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1 className="mp-page-title">Health Timeline</h1>
        <p className="mp-page-sub">A chronological record of all your healthcare events</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '0.4rem 1rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s',
              ...(filter === f.key
                ? { background: '#1e6bb8', color: '#fff', borderColor: '#1e6bb8' }
                : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' }),
            }}>
            {f.label}
            <span style={{ marginLeft: '0.3rem', background: 'rgba(0,0,0,0.1)', borderRadius: 10, padding: '0 0.35rem', fontSize: '0.7rem' }}>
              {f.key === 'all' ? events.length : events.filter(e => f.types?.includes(e.type)).length}
            </span>
          </button>
        ))}
        <button className="mp-btn mp-btn-outline" style={{ marginLeft: 'auto', fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
          onClick={() => { setRefreshing(true); load(); }} disabled={refreshing}>
          {refreshing ? '…' : '↻ Refresh'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>Loading timeline…</div>
      ) : filtered.length === 0 ? (
        <div className="mp-card" style={{ textAlign: 'center', padding: '4rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🕐</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>No events yet</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Your health events will appear here as you receive care.</p>
        </div>
      ) : (
        <div>
          {groups.map(group => (
            <div key={group.date} style={{ marginBottom: '1.5rem' }}>
              <p style={{ margin: '0 0 0.65rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {group.date}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {group.events.map(evt => {
                  const cfg = EVENT_CFG[evt.type] || EVENT_CFG.APPOINTMENT;
                  const sc = STATUS_COL[evt.status] || STATUS_COL.COMPLETED;
                  return (
                    <div key={evt.id} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                        {cfg.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.label}</span>
                          <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: '0.1rem 0.5rem', fontSize: '0.68rem', fontWeight: 700 }}>{evt.status}</span>
                        </div>
                        <p style={{ margin: '0 0 0.1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{evt.title}</p>
                        {evt.actor?.name && <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>by {evt.actor.name}</p>}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {evt.createdAt?.seconds ? new Date(evt.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Diagnostic Orders ────────────────────────────────────────────────────────
function MedPatDiagnostics({ profile }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewing, setViewing] = useState(null);

  const statusMetaFor = (raw) => {
    const n = normalizeDiagnosticOrderStatus(raw);
    if (n === 'COMPLETED') return { bg: '#dcfce7', color: '#14532d', label: 'Completed — Results are with your doctor' };
    if (n === 'IN_PROGRESS') return { bg: '#dbeafe', color: '#1e40af', label: 'Test in progress' };
    if (n === 'REJECTED') return { bg: '#fee2e2', color: '#991b1b', label: 'Could not complete — contact your doctor' };
    return { bg: '#fef3c7', color: '#92400e', label: 'Pending — Visit the center' };
  };

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'diagnosticOrders'), where('patientId', '==', profile.id)));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setOrders(list);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [profile]);

  const fmtDate = (ts) => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const filtered = typeFilter === 'all' ? orders : orders.filter(o => o.centerType === typeFilter);

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1 className="mp-page-title">Lab &amp; Scan Orders</h1>
        <p className="mp-page-sub">Diagnostic tests ordered by your doctor — visit the center with your National ID</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'All Orders', count: orders.length, color: '#1e6bb8', bg: '#eff6ff' },
          { label: 'Lab Tests', count: orders.filter(o => o.centerType === 'lab').length, color: '#065f46', bg: '#d1fae5' },
          { label: 'Scan Orders', count: orders.filter(o => o.centerType === 'scan').length, color: '#4c1d95', bg: '#ede9fe' },
          { label: 'Pending', count: orders.filter(o => normalizeDiagnosticOrderStatus(o.status) === 'PENDING').length, color: '#92400e', bg: '#fef3c7' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} style={{ background: 'white', borderRadius: 12, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.65rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1.5px solid #f1f5f9' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}>
              {count}
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['all','All Orders'],['lab','🧪 Lab'],['scan','🩻 Scan']].map(([key, label]) => (
          <button key={key} onClick={() => setTypeFilter(key)}
            style={{
              padding: '0.4rem 1rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s',
              ...(typeFilter === key
                ? { background: '#1e6bb8', color: '#fff', borderColor: '#1e6bb8' }
                : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' }),
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* National ID reminder */}
      {orders.some(o => normalizeDiagnosticOrderStatus(o.status) === 'PENDING') && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'flex-start', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>🪪</span>
          <div>
            <p style={{ margin: '0 0 0.2rem', fontWeight: 800, fontSize: '0.875rem', color: '#92400e' }}>Bring Your National ID</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309', lineHeight: 1.5 }}>
              You must present your National ID at the lab or imaging center to collect your diagnostic order.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>Loading orders…</div>
      ) : filtered.length === 0 ? (
        <div className="mp-card" style={{ textAlign: 'center', padding: '4rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔬</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>No orders yet</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Diagnostic orders from your doctor will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(order => {
            const isLab = order.centerType === 'lab';
            const smt = statusMetaFor(order.status);
            const norm = normalizeDiagnosticOrderStatus(order.status);
            return (
              <div key={order.id} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: isLab ? '#d1fae5' : '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>
                    {isLab ? '🧪' : '🩻'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isLab ? '#065f46' : '#4c1d95', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {isLab ? 'Lab Test' : 'Scan Order'}
                      </span>
                      <span style={{ background: smt.bg, color: smt.color, borderRadius: 20, padding: '0.15rem 0.55rem', fontSize: '0.7rem', fontWeight: 700 }}>
                        {norm === 'COMPLETED' ? 'Completed' : norm === 'IN_PROGRESS' ? 'In progress' : norm === 'REJECTED' ? 'Cancelled' : 'Pending'}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 0.2rem', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{order.testType}</p>
                    <p style={{ margin: '0 0 0.1rem', fontSize: '0.8rem', color: '#64748b' }}>📍 {order.centerName}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Ordered by Dr. {order.doctorName} · {fmtDate(order.createdAt)}</p>
                  </div>
                  <button className="mp-btn mp-btn-primary" style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem', flexShrink: 0 }}
                    onClick={() => setViewing(order)}>
                    Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {viewing && (() => {
        const isLab = viewing.centerType === 'lab';
        const smt = statusMetaFor(viewing.status);
        const vnorm = normalizeDiagnosticOrderStatus(viewing.status);
        const fmtFull = (ts) => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
            <div style={{ background: 'white', borderRadius: 20, maxWidth: 520, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              {/* Header */}
              <div style={{ background: isLab ? '#d1fae5' : '#ede9fe', borderBottom: `1.5px solid ${isLab ? '#6ee7b7' : '#c4b5fd'}`, padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>{isLab ? '🧪' : '🩻'}</span>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: isLab ? '#065f46' : '#4c1d95' }}>{isLab ? 'Laboratory Order' : 'Imaging Order'}</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>{viewing.testType}</p>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', flexShrink: 0, fontSize: '1.2rem' }} onClick={() => setViewing(null)}>✕</button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Status */}
                <div style={{ background: smt.bg, borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem' }}>{vnorm === 'PENDING' ? '⏳' : vnorm === 'IN_PROGRESS' ? '🔬' : vnorm === 'REJECTED' ? '⚠️' : '✅'}</span>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: smt.color }}>{smt.label}</p>
                </div>

                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  {[
                    ['Ordered By', `Dr. ${viewing.doctorName}`],
                    ['Order Ref', viewing.orderId],
                    ['Center', viewing.centerName],
                    ['Date Ordered', fmtFull(viewing.createdAt)],
                  ].map(([label, val]) => val ? (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '0.75rem' }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', wordBreak: 'break-all' }}>{val}</p>
                    </div>
                  ) : null)}
                </div>

                {/* Doctor notes */}
                {viewing.notes && (
                  <div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Doctor's Instructions</p>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', color: '#0f172a', lineHeight: 1.6 }}>
                      {viewing.notes}
                    </div>
                  </div>
                )}

                {/* National ID reminder */}
                {['PENDING', 'IN_PROGRESS'].includes(vnorm) && (
                  <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🪪</span>
                    <div>
                      <p style={{ margin: '0 0 0.2rem', fontWeight: 800, color: '#92400e', fontSize: '0.875rem' }}>Present Your National ID</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309', lineHeight: 1.5 }}>
                        Staff will check that the name on your ID matches this order before your {isLab ? 'lab test' : 'scan'} at <strong>{viewing.centerName}</strong>.
                      </p>
                    </div>
                  </div>
                )}
                {vnorm === 'COMPLETED' && (
                  <div style={{ background: '#ecfdf5', border: '1.5px solid #86efac', borderRadius: 12, padding: '1rem' }}>
                    <p style={{ margin: '0 0 0.35rem', fontWeight: 800, color: '#166534', fontSize: '0.875rem' }}>Results are with your doctor</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d', lineHeight: 1.5 }}>
                      The facility has completed your order. Your doctor receives the results — book a follow-up or message them if you have questions.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Dashboard Shell ──────────────────────────────────────────────────────────
export default function MedicalPatientDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();

  const NAV = [
    { path: '/dashboard',               icon: Home,         label: 'Home' },
    { path: '/dashboard/timeline',      icon: Clock,        label: 'Health Timeline' },
    { path: '/dashboard/appointments',  icon: Calendar,     label: 'Appointments' },
    { path: '/dashboard/video',         icon: Video,        label: 'Video Calls' },
    { path: '/dashboard/messages',      icon: MessageSquare,label: 'Messages' },
    { path: '/dashboard/prescriptions', icon: Pill,         label: 'Prescriptions' },
    { path: '/dashboard/diagnostics',   icon: Microscope,   label: 'Lab & Scan Orders' },
    { path: '/dashboard/history',       icon: FileText,     label: 'Medical History' },
    { path: '/dashboard/billing',       icon: CreditCard,   label: 'Billing' },
    { path: '/dashboard/insurance',     icon: Shield,       label: 'Insurance' },
    { path: '/dashboard/emergency',     icon: Phone,        label: 'Emergency Contacts' },
    { path: '/dashboard/records',       icon: Download,     label: 'Health Records' },
    { path: '/dashboard/epharmacy',     icon: Pill,         label: 'E-Pharmacy' },
    { path: '/dashboard/settings',      icon: Settings,     label: 'Settings' },
    { path: '/dashboard/support',       icon: AlertCircle,  label: 'Support & Report' },
  ];

  const isActive = (path) => path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path);
  const handleLogout = async () => { await signOut(auth); navigate('/'); };

  return (
    <div className="mp-dashboard">
      <aside className="mp-sidebar">
        <div className="mp-sidebar-header">
          <div className="mp-logo">
            <Activity size={22} />
            <span className="mp-logo-name">NessaHub</span>
            <span className="mp-logo-badge">Medical</span>
          </div>
          <div className="mp-user-card">
            <div className="mp-user-avatar">{getInitials(profile?.name)}</div>
            <div className="mp-user-info">
              <p className="mp-user-name">{profile?.name || 'Patient'}</p>
              <p className="mp-user-role">Patient Portal</p>
              <SidebarSavedLocation profile={profile} />
            </div>
          </div>
        </div>

        <nav className="mp-nav">
          <p className="mp-nav-label">MAIN MENU</p>
          {NAV.map(item => (
            <button
              key={item.path}
              className={`mp-nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mp-sidebar-footer">
          <div className="mp-hipaa-badge"><Shield size={13} /> HIPAA Compliant</div>
          <button className="mp-logout-btn" onClick={handleLogout}>
            <LogOut size={18} /> <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="mp-main">
        <ForcedPasswordChangeOverlay profile={profile} firestoreCollection="auth" />
        <Routes>
          <Route path="/"              element={<MedPatHome          profile={profile} />} />
          <Route path="/appointments"  element={<MedPatAppointments  profile={profile} />} />
          <Route path="/video"         element={<MedPatVideoCalls    profile={profile} />} />
          <Route path="/messages"      element={<MedPatMessages      profile={profile} />} />
          <Route path="/prescriptions" element={<MedPatPrescriptions profile={profile} />} />
          <Route path="/timeline"      element={<MedPatTimeline      profile={profile} />} />
          <Route path="/diagnostics"   element={<MedPatDiagnostics   profile={profile} />} />
          <Route path="/history"       element={<MedPatHistory       profile={profile} />} />
          <Route path="/billing"       element={<MedPatBilling             profile={profile} />} />
          <Route path="/insurance"     element={<MedPatInsurance           profile={profile} />} />
          <Route path="/emergency"     element={<MedPatEmergencyContacts   profile={profile} />} />
          <Route path="/records"       element={<MedPatHealthRecords       profile={profile} />} />
          <Route path="/epharmacy"     element={<MedPatEPharmacy           profile={profile} />} />
          <Route path="/settings"      element={<MedPatSettings            profile={profile} />} />
          <Route path="/support"       element={<MedPatSupport             profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
