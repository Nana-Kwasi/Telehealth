import React, { useState, useEffect, useCallback } from 'react';
import AppointmentRiskPanel from '../../Common/AppointmentRiskPanel';
import {
  Calendar, Check, X, List, ChevronLeft, ChevronRight,
  Clock, Video, Phone, MessageCircle, AlertTriangle, Plus,
  User, UserCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../services/firestoreShim';
import {
  collection, query, where, getDocs, doc, getDoc, updateDoc,
  setDoc, addDoc, serverTimestamp,
} from '../../../services/firestoreShim';
import { logAction, A } from '../../../utils/auditLogger';
import { VisitTranscriptChip } from '../../Common/PatientTranscripts';
import Paged from '../../Common/Paged';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const TODAY = new Date().toISOString().split('T')[0];

const STATUS_CONFIG = {
  pending:   { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', label: 'Pending'   },
  confirmed: { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Confirmed' },
  completed: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Completed' },
  cancelled: { bg: '#fff1f2', border: '#fecdd3', text: '#be123c', label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '0.2rem 0.65rem', borderRadius: 20,
      fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
      background: cfg.bg, color: cfg.text, border: `1.5px solid ${cfg.border}`,
    }}>{cfg.label}</span>
  );
}

function ConsultIcon({ type }) {
  if (type === 'video') return <Video size={14} />;
  if (type === 'audio') return <Phone size={14} />;
  return <MessageCircle size={14} />;
}

function fmtLong(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  if (!name) return 'P';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

export default function DoctorAppointments({ profile }) {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);          // deduplicated patient list
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('calendar');

  // Calendar
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [modalDay, setModalDay] = useState(null);        // view appointments modal
  const [scheduleDay, setScheduleDay] = useState(null);  // schedule new appointment modal

  // Schedule form
  const [sForm, setSForm] = useState({ patientId: '', patientName: '', time: '09:00', type: 'video', reason: '' });
  const [sSaving, setSSaving] = useState(false);
  const [sError, setSError] = useState('');

  // List
  const [filter, setFilter] = useState('all');
  const [detailAppt, setDetailAppt] = useState(null);    // list-row detail modal

  // Reschedule
  const [rescheduleAppt, setRescheduleAppt] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  useEffect(() => { if (profile?.id) loadData(); }, [profile]);

  const loadData = async () => {
    try {
      const q = query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id));
      const snap = await getDocs(q);
      const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Current first: upcoming (today onward) soonest→latest, then past most-recent first.
      appts.sort((a, b) => {
        const ad = a.date || '', bd = b.date || '';
        const aUp = ad >= TODAY, bUp = bd >= TODAY;
        if (aUp !== bUp) return aUp ? -1 : 1;
        if (aUp) return ad.localeCompare(bd) || (a.time || '').localeCompare(b.time || '');
        return bd.localeCompare(ad);
      });

      // Build unique patient list and enrich names missing or stored as "Patient"
      const seen = new Set();
      const rawPts = [];
      for (const a of appts) {
        if (a.clientId && !seen.has(a.clientId)) {
          seen.add(a.clientId);
          rawPts.push({ id: a.clientId, name: a.clientName || '' });
        }
      }
      const enrichedPts = await Promise.all(rawPts.map(async p => {
        if (!p.name || p.name === 'Patient') {
          try {
            const authSnap = await getDoc(doc(db, 'auth', p.id));
            if (authSnap.exists()) {
              const d = authSnap.data();
              const name = d.name || d.displayName || d.fullName || null;
              if (name) return { ...p, name };
            }
          } catch (_) {}
        }
        return { ...p, name: p.name || 'Patient' };
      }));

      // Build a lookup so appointment rows also show enriched names
      const nameById = Object.fromEntries(enrichedPts.map(p => [p.id, p.name]));
      const enrichedAppts = appts.map(a => ({
        ...a,
        clientName: (a.clientName && a.clientName !== 'Patient') ? a.clientName : (nameById[a.clientId] || a.clientName || 'Patient'),
      }));

      setAppointments(enrichedAppts);
      setPatients(enrichedPts);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleStatus = async (id, newStatus, appt) => {
    await updateDoc(doc(db, 'doctorAppointments', id), { status: newStatus });
    if (newStatus === 'confirmed' && appt.clientId) {
      await setDoc(doc(db, 'doctors', profile.id, 'patients', appt.clientId), {
        patientId: appt.clientId, name: appt.clientName || 'Patient', addedAt: serverTimestamp(),
      }, { merge: true });
    }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    setDetailAppt(prev => prev && prev.id === id ? { ...prev, status: newStatus } : prev);
  };

  // A doctor's patient list is built from people who have booked with them. With
  // none, the schedule form's patient picker is empty and submitting can only ever
  // fail on "Please select a patient" — say so up front instead.
  const canSchedule = patients.length > 0;

  const openScheduleDay = (dateStr) => {
    if (!canSchedule) {
      alert('You can schedule appointments once a patient has booked with you.');
      return;
    }
    setScheduleDay(dateStr);
  };

  const handleScheduleNew = async () => {
    if (!sForm.patientId) { setSError('Please select a patient.'); return; }
    if (!sForm.time) { setSError('Please enter a time.'); return; }
    setSSaving(true); setSError('');
    try {
      const newAppt = {
        doctorId: profile.id,
        doctorName: profile.name,
        doctorSpecialization: profile.specialization || '',
        clientId: sForm.patientId,
        clientName: sForm.patientName,
        date: scheduleDay,
        time: sForm.time,
        consultationType: sForm.type,
        reason: sForm.reason,
        status: 'confirmed',
        scheduledByDoctor: true,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'doctorAppointments'), newAppt);
      await logAction(A.APPOINTMENT_BOOKED, {
        appointmentId: ref.id,
        patientId: sForm.patientId,
        patientName: sForm.patientName,
        date: scheduleDay,
        type: sForm.type,
      }, 'doctor');
      const created = { id: ref.id, ...newAppt };
      setAppointments(prev => [...prev, created].sort((a, b) => (a.date || '').localeCompare(b.date || '')));
      setScheduleDay(null);
      setSForm({ patientId: '', patientName: '', time: '09:00', type: 'video', reason: '' });
    } catch (err) {
      console.error(err);
      setSError('Failed to schedule. Please try again.');
    } finally { setSSaving(false); }
  };

  const openReschedule = (appt) => {
    setDetailAppt(null);
    setModalDay(null);
    setRescheduleAppt(appt);
    setRescheduleDate(appt.date || '');
    setRescheduleTime(appt.time || '');
    setRescheduleError('');
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) { setRescheduleError('Please enter a new date.'); return; }
    if (!rescheduleTime) { setRescheduleError('Please enter a new time.'); return; }
    if (rescheduleDate < TODAY) { setRescheduleError('Please choose a future date.'); return; }
    setRescheduleSaving(true);
    setRescheduleError('');
    try {
      await updateDoc(doc(db, 'doctorAppointments', rescheduleAppt.id), {
        date: rescheduleDate,
        time: rescheduleTime,
        status: 'pending',
        rescheduledAt: serverTimestamp(),
        rescheduledBy: 'doctor',
      });
      setAppointments(prev =>
        prev.map(a => a.id === rescheduleAppt.id
          ? { ...a, date: rescheduleDate, time: rescheduleTime, status: 'pending' }
          : a
        ).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      );
      setRescheduleAppt(null);
      setModalDay(null);
    } catch (err) {
      console.error('Reschedule error:', err);
      setRescheduleError('Failed to reschedule. Please try again.');
    } finally { setRescheduleSaving(false); }
  };

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const toDateStr = useCallback((d) =>
    `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  [calYear, calMonth]);

  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const calCells = [];
  for (let i = 0; i < firstDayOfMonth; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d);
  while (calCells.length % 7 !== 0) calCells.push(null);

  const apptsByDate = {};
  for (const a of appointments) {
    if (!a.date) continue;
    if (!apptsByDate[a.date]) apptsByDate[a.date] = [];
    apptsByDate[a.date].push(a);
  }

  const modalAppts = modalDay
    ? (apptsByDate[modalDay] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    : [];

  const prevMonth = () => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); setModalDay(null); };
  const nextMonth = () => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); setModalDay(null); };

  // counts
  const filterCounts = {
    all:       appointments.length,
    today:     appointments.filter(a => a.date === TODAY).length,
    upcoming:  appointments.filter(a => a.date >= TODAY && a.status !== 'cancelled').length,
    pending:   appointments.filter(a => a.status === 'pending').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    completed: appointments.filter(a => a.status === 'completed').length,
  };

  const filtered = appointments.filter(a => {
    if (filter === 'today')    return a.date === TODAY;
    if (filter === 'upcoming') return a.date >= TODAY && a.status !== 'cancelled';
    if (filter !== 'all')      return a.status === filter;
    return true;
  });

  const ActionBtns = ({ appt }) => (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {appt.status === 'pending' && (<>
        <button className="doctor-btn doctor-btn-success doctor-btn-sm" onClick={() => handleStatus(appt.id, 'confirmed', appt)}><Check size={13} /> Accept</button>
        <button className="doctor-btn doctor-btn-danger doctor-btn-sm" onClick={() => handleStatus(appt.id, 'cancelled', appt)}><X size={13} /> Reject</button>
      </>)}
      {appt.status === 'confirmed' && (<>
        <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => { setModalDay(null); navigate('/dashboard/video'); }}>
          <Video size={13} /> Start Call
        </button>
        <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => handleStatus(appt.id, 'completed', appt)}>
          <Check size={13} /> Complete
        </button>
      </>)}
      {/* Past visits: open the transcript of the call, if it was transcribed. */}
      {(appt.status === 'completed' || (appt.date && appt.date <= TODAY && appt.status !== 'cancelled')) && <VisitTranscriptChip visitId={appt.id} />}
      {(appt.status === 'pending' || appt.status === 'confirmed') && (
        <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => openReschedule(appt)} style={{ color: '#7c3aed', borderColor: '#7c3aed' }}>
          <Clock size={13} /> Reschedule
        </button>
      )}
    </div>
  );

  return (
    <div className="doctor-page">
      {/* Which of these is worth a reminder, and why. Hides itself when
          nothing is worth chasing. */}
      <AppointmentRiskPanel />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.25rem' }}>Appointments</h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`doctor-btn doctor-btn-sm ${view === 'calendar' ? 'doctor-btn-primary' : 'doctor-btn-outline'}`} onClick={() => setView('calendar')}><Calendar size={15} /> Calendar</button>
          <button className={`doctor-btn doctor-btn-sm ${view === 'list' ? 'doctor-btn-primary' : 'doctor-btn-outline'}`} onClick={() => setView('list')}><List size={15} /> List</button>
        </div>
      </div>

      {/* Pending banner */}
      {filterCounts.pending > 0 && (
        <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 14, padding: '0.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <AlertTriangle size={18} color="#ea580c" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#9a3412' }}>
            <strong>{filterCounts.pending}</strong> appointment{filterCounts.pending !== 1 ? 's' : ''} awaiting your confirmation.{' '}
            <button style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }} onClick={() => { setView('list'); setFilter('pending'); }}>Review now →</button>
          </p>
        </div>
      )}

      {/* ══════════════ CALENDAR VIEW ══════════════ */}
      {view === 'calendar' && (
        <div style={{ background: 'white', borderRadius: 20, border: '1.5px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

          {/* Calendar header gradient */}
          <div style={{ background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)', padding: '1.5rem 1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={prevMonth} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'white' }}>{MONTHS[calMonth]}</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{calYear}</p>
            </div>
            <button onClick={nextMonth} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Mini stats row */}
          <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
            {[['Upcoming', filterCounts.upcoming, '#2563eb'], ['Pending', filterCounts.pending, '#d97706'], ['Confirmed', filterCounts.confirmed, '#16a34a'], ['Completed', filterCounts.completed, '#64748b']].map(([label, count, color]) => (
              <div key={label} style={{ flex: 1, padding: '0.75rem', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color }}>{count}</p>
                <p style={{ margin: 0, fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>{label}</p>
              </div>
            ))}
          </div>

          <div style={{ padding: '1.25rem 1.5rem 1.5rem' }}>
            {/* Day labels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '0.5rem' }}>
              {DAYS_SHORT.map((d, i) => (
                <div key={d} style={{
                  textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, padding: '0.35rem 0',
                  color: i === 0 || i === 6 ? '#f87171' : '#94a3b8',
                }}>{d}</div>
              ))}
            </div>

            {/* Date grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {calCells.map((d, i) => {
                if (!d) return <div key={`empty-${i}`} />;
                const dateStr = toDateStr(d);
                const dayAppts = apptsByDate[dateStr] || [];
                const isPast = dateStr < TODAY;
                const isToday = dateStr === TODAY;
                const isWeekend = (i % 7 === 0) || (i % 7 === 6);
                const hasPending = dayAppts.some(a => a.status === 'pending');
                const hasConfirmed = dayAppts.some(a => a.status === 'confirmed');
                const hasAppts = dayAppts.length > 0;

                let cellBg = 'transparent';
                let cellBorder = '1.5px solid transparent';
                if (isToday) { cellBg = '#eff6ff'; cellBorder = '2px solid #2563eb'; }
                else if (!isPast && hasConfirmed) { cellBg = '#f0fdf4'; cellBorder = '1.5px solid #86efac'; }
                else if (!isPast && hasPending) { cellBg = '#fffbeb'; cellBorder = '1.5px solid #fde68a'; }
                else if (hasAppts && isPast) { cellBg = '#f8fafc'; cellBorder = '1.5px solid #e2e8f0'; }

                return (
                  <button
                    key={dateStr}
                    onClick={() => {
                      if (isPast && !hasAppts) return;
                      if (hasAppts) setModalDay(dateStr);
                      else if (!isPast) openScheduleDay(dateStr);
                    }}
                    style={{
                      minHeight: 88,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                      padding: '0.5rem 0.3rem 0.3rem',
                      borderRadius: 12,
                      border: cellBorder,
                      background: cellBg,
                      cursor: (isPast && !hasAppts) ? 'default' : 'pointer',
                      opacity: isPast && !hasAppts ? 0.35 : 1,
                      transition: 'all 0.12s',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!(isPast && !hasAppts)) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
                  >
                    {/* Day number */}
                    <div style={{
                      width: 28, height: 28,
                      borderRadius: '50%',
                      background: isToday ? '#2563eb' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: hasAppts ? 4 : 0,
                    }}>
                      <span style={{
                        fontSize: '0.875rem',
                        fontWeight: isToday || hasAppts ? 700 : 400,
                        color: isToday ? 'white' : isWeekend && !isPast ? '#ef4444' : isPast ? '#94a3b8' : '#0f172a',
                      }}>{d}</span>
                    </div>

                    {/* Appointment pills */}
                    {dayAppts.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', padding: '0 2px' }}>
                        {dayAppts.slice(0, 2).map(a => {
                          const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
                          return (
                            <div key={a.id} style={{
                              fontSize: '0.6rem', fontWeight: 600,
                              padding: '2px 4px', borderRadius: 5,
                              background: cfg.bg, color: cfg.text,
                              border: `1px solid ${cfg.border}`,
                              textAlign: 'left', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {a.time ? a.time.slice(0, 5) : ''} {(a.clientName || 'Pt').split(' ')[0].slice(0, 7)}
                            </div>
                          );
                        })}
                        {dayAppts.length > 2 && (
                          <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 600, textAlign: 'center' }}>
                            +{dayAppts.length - 2} more
                          </div>
                        )}
                      </div>
                    )}

                    {/* Empty future day — plus hint */}
                    {!hasAppts && !isPast && (
                      <div style={{ position: 'absolute', bottom: 5, right: 5, opacity: 0, transition: 'opacity 0.15s' }} className="da-plus-hint">
                        <Plus size={12} color="#94a3b8" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>LEGEND</span>
              {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#475569' }}>
                  <span style={{ width: 22, height: 14, borderRadius: 4, background: cfg.bg, border: `1.5px solid ${cfg.border}`, display: 'inline-block' }} />
                  {cfg.label}
                </div>
              ))}
              <div style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#94a3b8' }}>
                Click empty date to schedule · Click busy date to view
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ LIST VIEW ══════════════ */}
      {view === 'list' && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {[['all','All'],['today','Today'],['upcoming','Upcoming'],['pending','Pending'],['confirmed','Confirmed'],['completed','Completed']].map(([f, label]) => (
              <button key={f} className={`doctor-btn doctor-btn-sm ${filter === f ? 'doctor-btn-primary' : 'doctor-btn-outline'}`} onClick={() => setFilter(f)}>
                {label} ({filterCounts[f] ?? 0})
              </button>
            ))}
          </div>
          <div className="doctor-card">
            {loading ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="doctor-empty-state">
                <Calendar size={40} /><h3>No {filter !== 'all' ? filter : ''} appointments</h3>
                <p>Appointments will appear here when patients book with you.</p>
              </div>
            ) : (
              <table className="doctor-table doctor-table--stack">
                <thead><tr><th>Patient</th><th>Date</th><th>Time</th><th>Type</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  <Paged items={filtered} table>{(filtered) => filtered.map(appt => (
                    <tr key={appt.id} style={{ cursor: 'pointer' }} onClick={() => setDetailAppt(appt)} title="View appointment details">
                      <td data-label="Patient" style={{ fontWeight: 600 }}>{appt.clientName || 'Patient'}</td>
                      <td data-label="Date">{appt.date || '—'}</td>
                      <td data-label="Time">{appt.time || '—'}</td>
                      <td data-label="Type" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <ConsultIcon type={appt.consultationType} />
                        {(appt.consultationType || 'video').charAt(0).toUpperCase() + (appt.consultationType || 'video').slice(1)}
                      </td>
                      <td data-label="Reason" style={{ maxWidth: 160, fontSize: '0.8rem', color: '#64748b', fontStyle: appt.reason ? 'italic' : 'normal' }}>
                        {appt.reason ? `"${appt.reason.slice(0, 50)}${appt.reason.length > 50 ? '…' : ''}"` : '—'}
                      </td>
                      <td data-label="Status"><StatusBadge status={appt.status} /></td>
                      <td data-label="Actions" className="doctor-table-actions" onClick={e => e.stopPropagation()}><ActionBtns appt={appt} /></td>
                    </tr>
                  ))}</Paged>
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══════════════ VIEW APPOINTMENTS MODAL ══════════════ */}
      {modalDay && (
        <div className="da-modal-overlay" onClick={() => setModalDay(null)}>
          <div className="da-modal" onClick={e => e.stopPropagation()}>
            <div className="da-modal-header">
              <div>
                <h3>{fmtLong(modalDay)}</h3>
                <p>{modalAppts.length} appointment{modalAppts.length !== 1 ? 's' : ''} scheduled</p>
              </div>
              <button className="da-modal-close" onClick={() => setModalDay(null)}>✕</button>
            </div>
            <div className="da-modal-body">
              {modalAppts.length === 0 ? (
                <div className="doctor-empty-state" style={{ padding: '1.5rem' }}>
                  <Clock size={32} /><p>No appointments on this day.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <Paged items={modalAppts}>{(modalAppts) => modalAppts.map(appt => (
                    <div key={appt.id} className="da-modal-appt-card" style={{ borderLeft: `4px solid ${STATUS_CONFIG[appt.status]?.border || '#e2e8f0'}` }}>
                      <div className="da-modal-appt-header">
                        <div className="da-modal-appt-avatar">{getInitials(appt.clientName)}</div>
                        <div style={{ flex: 1 }}>
                          <p className="da-modal-patient-name">{appt.clientName || 'Patient'}</p>
                          <div className="da-modal-meta-row">
                            <Clock size={12} /><span>{appt.time || 'TBD'}</span>
                            <ConsultIcon type={appt.consultationType} />
                            <span>{(appt.consultationType || 'video').charAt(0).toUpperCase() + (appt.consultationType || 'video').slice(1)}</span>
                          </div>
                          {appt.reason && <p className="da-modal-reason">"{appt.reason}"</p>}
                        </div>
                        <StatusBadge status={appt.status} />
                      </div>
                      <div className="da-modal-appt-actions"><ActionBtns appt={appt} /></div>
                    </div>
                  ))}</Paged>
                </div>
              )}
            </div>
            <div className="da-modal-footer">
              <button
                className="doctor-btn doctor-btn-outline"
                style={{ flex: 1, justifyContent: 'center', ...(canSchedule ? {} : { opacity: 0.45, cursor: 'not-allowed' }) }}
                disabled={!canSchedule}
                title={canSchedule ? '' : 'No patients yet'}
                onClick={() => { setModalDay(null); openScheduleDay(modalDay); }}
              >
                <Plus size={15} /> Add Appointment This Day
              </button>
              <button className="doctor-btn doctor-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setModalDay(null); navigate('/dashboard/video'); }}>
                <Video size={15} /> Manage Video Calls
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ APPOINTMENT DETAIL MODAL (list row) ══════════════ */}
      {detailAppt && (
        <div className="da-modal-overlay" onClick={() => setDetailAppt(null)}>
          <div className="da-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="da-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="da-modal-appt-avatar">{getInitials(detailAppt.clientName)}</div>
                <div>
                  <h3>{detailAppt.clientName || 'Patient'}</h3>
                  <p>{fmtLong(detailAppt.date)} {detailAppt.time ? `· ${detailAppt.time}` : ''}</p>
                </div>
              </div>
              <button className="da-modal-close" onClick={() => setDetailAppt(null)}>✕</button>
            </div>
            <div className="da-modal-body">
              <div style={{ marginBottom: '1rem' }}><StatusBadge status={detailAppt.status} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem 1.25rem' }}>
                {[
                  ['Date', detailAppt.date || '—'],
                  ['Time', detailAppt.time || '—'],
                  ['Consultation', (detailAppt.consultationType || 'video').charAt(0).toUpperCase() + (detailAppt.consultationType || 'video').slice(1)],
                  ['Status', (detailAppt.status || 'pending').charAt(0).toUpperCase() + (detailAppt.status || 'pending').slice(1)],
                  ['Patient email', detailAppt.clientEmail || '—'],
                  ['Patient phone', detailAppt.clientPhone || detailAppt.patientPhone || '—'],
                  ['Booked on', detailAppt.createdAt?.seconds ? new Date(detailAppt.createdAt.seconds * 1000).toLocaleString() : (detailAppt.createdAt || '—')],
                  ['Reference', detailAppt.prescriptionRef || detailAppt.appointmentRef || detailAppt.id || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
                    <div style={{ fontSize: '0.88rem', color: '#0f172a', wordBreak: 'break-word' }}>{v}</div>
                  </div>
                ))}
              </div>
              {detailAppt.reason && (
                <div style={{ marginTop: '1rem', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '0.75rem 0.9rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Reason for visit</div>
                  <div style={{ fontSize: '0.88rem', color: '#334155', fontStyle: 'italic' }}>"{detailAppt.reason}"</div>
                </div>
              )}
              {detailAppt.notes && (
                <div style={{ marginTop: '0.75rem', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '0.75rem 0.9rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Notes</div>
                  <div style={{ fontSize: '0.88rem', color: '#334155' }}>{detailAppt.notes}</div>
                </div>
              )}
              <div className="da-modal-appt-actions" style={{ marginTop: '1.25rem' }}>
                <ActionBtns appt={detailAppt} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ SCHEDULE NEW APPOINTMENT MODAL ══════════════ */}
      {scheduleDay && (
        <div className="da-modal-overlay" onClick={() => { setScheduleDay(null); setSError(''); }}>
          <div className="da-modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="da-modal-header" style={{ background: 'linear-gradient(135deg, #1e40af, #2563eb)', borderRadius: '20px 20px 0 0' }}>
              <div>
                <h3 style={{ color: 'white' }}>Schedule Appointment</h3>
                <p style={{ color: 'rgba(255,255,255,0.75)' }}>{fmtLong(scheduleDay)}</p>
              </div>
              <button className="da-modal-close" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }} onClick={() => { setScheduleDay(null); setSError(''); }}>✕</button>
            </div>

            <div className="da-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Patient selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <UserCheck size={14} /> Select Patient
                </label>
                {patients.length === 0 ? (
                  <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 10, fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                    No existing patients. Patients will appear here after they book with you.
                  </div>
                ) : (
                  <select
                    value={sForm.patientId}
                    onChange={e => {
                      const pt = patients.find(p => p.id === e.target.value);
                      setSForm(f => ({ ...f, patientId: e.target.value, patientName: pt?.name || '' }));
                    }}
                    style={{ padding: '0.7rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', background: 'white', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">— Choose a patient —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>

              {/* Time + Type row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={14} /> Time
                  </label>
                  <input
                    type="time"
                    value={sForm.time}
                    onChange={e => setSForm(f => ({ ...f, time: e.target.value }))}
                    style={{ padding: '0.7rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Video size={14} /> Type
                  </label>
                  <select
                    value={sForm.type}
                    onChange={e => setSForm(f => ({ ...f, type: e.target.value }))}
                    style={{ padding: '0.7rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', background: 'white', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="video">Video Call</option>
                    <option value="audio">Audio Call</option>
                    <option value="chat">Chat</option>
                  </select>
                </div>
              </div>

              {/* Reason */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151' }}>Reason / Notes <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                <textarea
                  value={sForm.reason}
                  onChange={e => setSForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Briefly describe the reason for this appointment…"
                  rows={3}
                  style={{ padding: '0.7rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.875rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* Info box */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <Video size={15} color="#2563eb" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.5 }}>
                  Doctor-scheduled appointments are automatically confirmed. The patient will be notified and a video call link will be available.
                </p>
              </div>

              {sError && <p style={{ margin: 0, fontSize: '0.83rem', color: '#dc2626', background: '#fef2f2', padding: '0.6rem 0.9rem', borderRadius: 8 }}>{sError}</p>}
            </div>

            <div className="da-modal-footer" style={{ gap: '0.75rem' }}>
              <button className="doctor-btn doctor-btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setScheduleDay(null); setSError(''); }}>Cancel</button>
              <button
                className="doctor-btn doctor-btn-primary"
                style={{ flex: 2, justifyContent: 'center' }}
                onClick={handleScheduleNew}
                disabled={sSaving || patients.length === 0}
              >
                <Video size={15} /> {sSaving ? 'Scheduling…' : 'Confirm Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ RESCHEDULE MODAL ══════════════ */}
      {rescheduleAppt && (
        <div className="da-modal-overlay" onClick={() => setRescheduleAppt(null)}>
          <div className="da-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="da-modal-header" style={{ background: 'linear-gradient(135deg, #6d28d9, #7c3aed)', borderRadius: '20px 20px 0 0' }}>
              <div>
                <h3 style={{ color: 'white' }}>Reschedule Appointment</h3>
                <p style={{ color: 'rgba(255,255,255,0.75)', margin: 0 }}>{rescheduleAppt.clientName || 'Patient'}</p>
              </div>
              <button className="da-modal-close" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }} onClick={() => setRescheduleAppt(null)}>✕</button>
            </div>

            <div className="da-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.35rem' }}>New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={TODAY}
                  onChange={e => setRescheduleDate(e.target.value)}
                  style={{ width: '100%', padding: '0.7rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.35rem' }}>New Time</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={e => setRescheduleTime(e.target.value)}
                  style={{ width: '100%', padding: '0.7rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#6d28d9', lineHeight: 1.5 }}>
                The appointment status will reset to <strong>Pending</strong> and the patient will be notified of the change.
              </div>
              {rescheduleError && (
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#dc2626', background: '#fef2f2', padding: '0.6rem 0.9rem', borderRadius: 8 }}>{rescheduleError}</p>
              )}
            </div>

            <div className="da-modal-footer" style={{ gap: '0.75rem' }}>
              <button className="doctor-btn doctor-btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setRescheduleAppt(null)}>Cancel</button>
              <button
                className="doctor-btn"
                style={{ flex: 2, justifyContent: 'center', background: '#7c3aed', color: 'white', border: 'none' }}
                onClick={handleReschedule}
                disabled={rescheduleSaving}
              >
                <Clock size={15} /> {rescheduleSaving ? 'Saving…' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .da-modal-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.6);
          z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1rem;
          backdrop-filter: blur(6px);
        }
        .da-modal {
          background: white; border-radius: 20px; width: 100%; max-width: 560px;
          max-height: 90vh; display: flex; flex-direction: column;
          box-shadow: 0 25px 80px rgba(0,0,0,0.25);
          animation: da-slide-in 0.2s ease;
        }
        @keyframes da-slide-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .da-modal-header {
          padding: 1.5rem; border-bottom: 1px solid #e2e8f0;
          display: flex; align-items: flex-start; justify-content: space-between;
        }
        .da-modal-header h3 { margin: 0 0 0.2rem; font-size: 1.1rem; font-weight: 800; color: #0f172a; }
        .da-modal-header p { margin: 0; font-size: 0.8rem; color: #64748b; }
        .da-modal-close {
          width: 32px; height: 32px; border-radius: 50%; border: none;
          background: #f1f5f9; color: #64748b; cursor: pointer;
          display: flex; align-items: center; justify-content: center; font-size: 1rem;
          flex-shrink: 0; transition: all 0.15s;
        }
        .da-modal-close:hover { background: #e2e8f0; }
        .da-modal-body { flex: 1; overflow-y: auto; padding: 1.25rem; }
        .da-modal-footer { padding: 1rem 1.25rem; border-top: 1px solid #e2e8f0; display: flex; gap: 0.5rem; }
        .da-modal-appt-card {
          background: #f8fafc; border-radius: 12px; padding: 1rem;
          border: 1.5px solid #e2e8f0; border-left-width: 4px;
        }
        .da-modal-appt-header { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.75rem; }
        .da-modal-appt-avatar {
          width: 42px; height: 42px; border-radius: 50%;
          background: linear-gradient(135deg, #1e40af, #2563eb);
          color: white; display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 1rem; flex-shrink: 0;
        }
        .da-modal-patient-name { margin: 0 0 0.25rem; font-weight: 700; font-size: 0.95rem; color: #0f172a; }
        .da-modal-meta-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: #64748b; flex-wrap: wrap; }
        .da-modal-reason { margin: 0.3rem 0 0; font-size: 0.78rem; color: #64748b; font-style: italic; }
        .da-modal-appt-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .da-plus-hint { opacity: 0; }
        button:hover .da-plus-hint { opacity: 1; }
      `}</style>
    </div>
  );
}
