import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Calendar, MessageSquare, FileText, Settings,
  LogOut, Activity, ChevronLeft, ChevronRight, Send, Clock,
  CheckCircle, Video, Phone, MessageCircle, Pill,
  Bell, CreditCard, AlertCircle, TrendingUp, User,
  BarChart2, Heart, Star, Shield, Download, Plus,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db, storage } from '../../Auth/firebaseConfig';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc,
  addDoc, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import './MedicalPatientDashboard.css';

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
  const [prescriptions, setPrescriptions] = useState([]);
  const [stats, setStats] = useState({ upcoming: 0, completed: 0, pending: 0, prescriptions: 0 });
  const [loading, setLoading] = useState(true);
  const [primaryDoctor, setPrimaryDoctor] = useState(null); // first doctor from appointments
  const [patientStatus, setPatientStatus] = useState('active'); // 'active' | 'discharged'
  const [lastBookedDoctor, setLastBookedDoctor] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('th.lastBookedDoctor') || 'null'); } catch { return null; }
  });

  const TODAY = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const [apptSnap, rxSnap] = await Promise.all([
        getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id))),
        getDocs(query(collection(db, 'doctorPrescriptions'), where('patientId', '==', profile.id))),
      ]);
      const all = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const upcoming = all.filter(a => a.date >= TODAY && a.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date));
      const rx = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAppts(upcoming.slice(0, 4));
      setPrescriptions(rx.slice(0, 3));
      setStats({
        upcoming: upcoming.length,
        completed: all.filter(a => a.status === 'completed').length,
        pending: all.filter(a => a.status === 'pending').length,
        prescriptions: rx.length,
      });
      // Derive primary doctor from most recent non-cancelled appointment
      const withDoc = all.filter(a => a.doctorId && a.status !== 'cancelled').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      if (withDoc.length > 0) {
        const pd = { id: withDoc[0].doctorId, name: withDoc[0].doctorName, spec: withDoc[0].doctorSpecialization || 'Medical Doctor', photoURL: null };
        try {
          const drSnap = await getDoc(doc(db, 'doctors', pd.id));
          if (drSnap.exists()) pd.photoURL = drSnap.data().photoURL || null;
        } catch (_) {}
        setPrimaryDoctor(pd);
        sessionStorage.removeItem('th.lastBookedDoctor');
        setLastBookedDoctor(null);
      }
      // Fetch patient status
      try {
        const profSnap = await getDoc(doc(db, 'patientProfiles', profile.id));
        if (profSnap.exists()) setPatientStatus(profSnap.data().status || 'active');
      } catch (_) {}
      setLoading(false);
    })();
  }, [profile]);

  const nextAppt = appts[0];
  const todayAppts = appts.filter(a => a.date === TODAY);
  const hasConfirmedToday = todayAppts.some(a => a.status === 'confirmed');

  return (
    <div className="mp-page">
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
            <button className="mp-btn mp-btn-outline" style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.4)', color: 'white' }} onClick={() => navigate('/dashboard/appointments')}>
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

      {/* ── Main 2-Column Layout ── */}
      <div className="mp-home-main-grid">

        {/* LEFT COLUMN: appointments + prescriptions */}
        <div className="mp-home-left">

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
                  {nextAppt.status === 'confirmed' && (
                    <button className="mp-btn mp-btn-primary" onClick={() => navigate('/dashboard/video')}>
                      <Video size={14} /> Join Call
                    </button>
                  )}
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

        {/* Care Team */}
        <div className="mp-card">
          <div className="mp-card-header"><h3>My Care Team</h3></div>
          {loading ? <p className="mp-loading-text">Loading…</p> : (() => {
            const seen = new Set();
            const doctors = [];
            appts.forEach(a => {
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
          {loading ? <p className="mp-loading-text">Loading…</p> : appts.length === 0 ? (
            <div className="mp-empty-small"><Activity size={32} /><p>No activity yet</p></div>
          ) : (
            <div className="mp-activity-feed">
              {appts.slice(0, 5).map((a, i) => {
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
      </div>{/* end mp-home-grid */}
    </div>{/* end mp-home-left */}

    {/* RIGHT COLUMN */}
    <div className="mp-home-right">

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

    </div>{/* end mp-home-right */}
    </div>{/* end mp-home-main-grid */}

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
                      if (hasAppts) setModalDay(dateStr);
                      else if (!isPast) { setScheduleDay(dateStr); setConflict(null); setSForm(f => ({...f})); }
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
                    {a.status==='confirmed' && (
                      <button className="mp-btn mp-btn-primary mp-btn-sm" onClick={() => navigate('/dashboard/video')}>
                        <Video size={12}/> Join Call
                      </button>
                    )}
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

  return (
    <div className="mp-page">
      <div className="mp-page-header">
        <h1>Prescriptions</h1>
        <p>Medications prescribed by your doctors</p>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {prescriptions.map(rx => {
            // Support both medications array (from DoctorPrescriptions) and flat fields
            const meds = Array.isArray(rx.medications) && rx.medications.length > 0
              ? rx.medications
              : rx.medication || rx.medicationName
                ? [{ name: rx.medication || rx.medicationName, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }]
                : [];
            return (
              <div key={rx.id} className="mp-rx-card">
                <div className="mp-rx-card-header">
                  <div className="mp-rx-card-icon"><Pill size={20} /></div>
                  <div style={{ flex: 1 }}>
                    <p className="mp-rx-card-name">{meds[0]?.name || 'Prescription'}</p>
                    {rx.diagnosis && <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>Diagnosis: {rx.diagnosis}</p>}
                    <p className="mp-rx-card-doctor">Prescribed by Dr. {rx.doctorName || 'Doctor'}</p>
                  </div>
                  <span className="mp-rx-status-badge">Active</span>
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
              </div>
            );
          })}
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
  const endRef = useRef(null);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const q = query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id));
      const snap = await getDocs(q);
      const appts = snap.docs.map(d => d.data());
      const seen = new Set();
      const docList = [];
      for (const a of appts) {
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
    const q = query(collection(db, 'doctor_chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [activeDoctor, profile]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeDoctor) return;
    const chatId = [profile.id, activeDoctor.id].sort().join('_');
    await addDoc(collection(db, 'doctor_chats', chatId, 'messages'), {
      text: newMsg.trim(), from: profile.id, fromName: profile.name || 'Patient',
      to: activeDoctor.id, toName: activeDoctor.name,
      timestamp: serverTimestamp(), type: 'text',
    });
    setNewMsg('');
  };

  return (
    <div className="mp-page">
      <div className="mp-page-header"><h1>Messages</h1><p>Secure messaging with your doctors</p></div>
      <div className="mp-messages-layout">
        <div className="mp-card mp-conv-list">
          <h3>My Doctors</h3>
          {loading ? <p className="mp-loading-text">Loading…</p> : doctors.length === 0 ? (
            <div className="mp-empty"><MessageSquare size={32} /><p>No doctors yet</p></div>
          ) : doctors.map(d => (
            <div key={d.id} className={`mp-conv-item ${activeDoctor?.id === d.id ? 'active' : ''}`} onClick={() => setActiveDoctor(d)}>
              <div className="mp-conv-avatar">{getInitials(d.name)}</div>
              <div><p className="mp-conv-name">Dr. {d.name}</p>{d.specialization && <p className="mp-conv-spec">{d.specialization}</p>}</div>
            </div>
          ))}
        </div>
        <div className="mp-card mp-chat-area">
          {!activeDoctor ? (
            <div className="mp-empty" style={{ flex: 1, justifyContent: 'center' }}>
              <MessageSquare size={48} /><h3>Select a doctor</h3><p>Choose from the list on the left</p>
            </div>
          ) : (
            <>
              <div className="mp-chat-header">
                <div className="mp-conv-avatar">{getInitials(activeDoctor.name)}</div>
                <div><p className="mp-conv-name">Dr. {activeDoctor.name}</p>{activeDoctor.specialization && <p className="mp-conv-spec">{activeDoctor.specialization}</p>}</div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#16a34a', padding: '0.2rem 0.55rem', borderRadius: 6, fontWeight: 600 }}>
                    <Shield size={11} style={{ display: 'inline', marginRight: 3 }} />Secure
                  </span>
                </div>
              </div>
              <div className="mp-chat-messages">
                {messages.length === 0 ? (
                  <p className="mp-empty-text">No messages yet. Start the conversation.</p>
                ) : messages.map(m => {
                  const isMe = m.from === profile.id;
                  return (
                    <div key={m.id} className={`mp-msg-wrap ${isMe ? 'me' : 'them'}`}>
                      <div className={`mp-msg-bubble ${isMe ? 'me' : 'them'}`}>
                        <p>{m.text}</p>
                        <span className="mp-msg-time">{m.timestamp?.toDate ? m.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div className="mp-chat-input-row">
                <input className="mp-chat-input" placeholder="Type a message…" value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
                <button className="mp-btn mp-btn-primary mp-send-btn" onClick={sendMessage} disabled={!newMsg.trim()}><Send size={18} /></button>
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
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('visits');

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const [apptSnap, notesSnap] = await Promise.all([
        getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', profile.id))),
        getDocs(query(collection(db, 'doctorNotes'), where('patientId', '==', profile.id))),
      ]);
      const all = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.status === 'completed')
        .sort((a, b) => b.date?.localeCompare(a.date || '') || 0);
      setHistory(all);
      const noteList = notesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotes(noteList);
      setLoading(false);
    })();
  }, [profile]);

  const noteTypeColors = {
    consultation: '#1e6bb8', followup: '#7c3aed', prescription: '#059669',
    referral: '#d97706', general: '#64748b', discharge: '#dc2626',
  };

  return (
    <div className="mp-page">
      <div className="mp-page-header"><h1>Medical History</h1><p>Your complete health record and clinical notes</p></div>

      <div className="mp-view-toggle" style={{ marginBottom: '1.25rem' }}>
        <button className={`mp-toggle-btn ${tab === 'visits' ? 'active' : ''}`} onClick={() => setTab('visits')}>
          <CheckCircle size={16} /> Visit History ({history.length})
        </button>
        <button className={`mp-toggle-btn ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
          <FileText size={16} /> Doctor Notes ({notes.length})
        </button>
      </div>

      <div className="mp-card">
        {loading ? <p className="mp-loading-text">Loading…</p> : tab === 'visits' ? (
          history.length === 0 ? (
            <div className="mp-empty"><FileText size={40} /><h3>No visit history yet</h3><p>Completed consultations will appear here.</p></div>
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
        ) : (
          notes.length === 0 ? (
            <div className="mp-empty"><FileText size={40} /><h3>No notes yet</h3><p>Clinical notes from your doctor will appear here.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {notes.map(n => {
                const color = noteTypeColors[n.type] || '#64748b';
                return (
                  <div key={n.id} style={{ padding: '1rem 1.25rem', background: '#f8fafc', borderRadius: 10, borderLeft: `4px solid ${color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{n.title}</p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                          <span style={{ background: color + '18', color, padding: '0.1rem 0.45rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>
                            {n.type ? n.type.charAt(0).toUpperCase() + n.type.slice(1) : 'Note'}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Dr. {n.doctorName || 'Doctor'}</span>
                          {n.createdAt?.toDate && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{n.createdAt.toDate().toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {n.content?.length > 400 ? n.content.slice(0, 400) + '…' : n.content}
                    </p>
                  </div>
                );
              })}
            </div>
          )
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
const HR_TYPES = ['Lab Result', 'X-Ray', 'MRI / CT Scan', 'Vaccination', 'Surgery Report', 'Allergy Test', 'Blood Test', 'Ultrasound', 'Prescription', 'Other'];
const emptyRecord = { name: '', type: 'Lab Result', date: '', notes: '', fileUrl: '', fileName: '' };

function MedPatHealthRecords({ profile }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [form, setForm] = useState(emptyRecord);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef(null);

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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const sRef = storageRef(storage, `healthRecords/${profile.id}/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const downloadURL = await getDownloadURL(sRef);
      setForm(f => ({ ...f, fileUrl: downloadURL, fileName: file.name }));
    } catch (err) {
      console.error('Upload error:', err);
      setError('File upload failed. Please try again.');
    }
    setUploading(false);
    e.target.value = '';
  };

  const openAdd = () => { setForm(emptyRecord); setEditIndex(null); setError(''); setShowModal(true); };
  const openEdit = (idx) => { setForm({ ...records[idx] }); setEditIndex(idx); setError(''); setShowModal(true); };

  const handleSaveRecord = async () => {
    if (!form.name.trim()) { setError('Record name is required.'); return; }
    setSaving(true);
    try {
      const entry = { ...form, savedAt: new Date().toISOString() };
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

  const typeColors = { 'Lab Result': '#2563eb', 'X-Ray': '#7c3aed', 'MRI / CT Scan': '#7c3aed', 'Vaccination': '#16a34a', 'Surgery Report': '#dc2626', 'Blood Test': '#dc2626', 'Prescription': '#059669', default: '#64748b' };
  const typeColor = (t) => typeColors[t] || typeColors.default;

  if (loading) return <div className="mp-page"><p className="mp-loading-text">Loading…</p></div>;

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
          {records.map((r, idx) => (
            <div key={idx} className="mp-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1rem 1.25rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={20} color="#1e6bb8" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>{r.name}</p>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ background: '#eff6ff', color: typeColor(r.type), fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{r.type}</span>
                  {r.date && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{r.date}</span>}
                </div>
                {r.notes && <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>{r.notes}</p>}
                {r.fileUrl && (
                  <a href={r.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#16a34a', fontWeight: 600, marginTop: 4 }}>
                    <Download size={13} /> {r.fileName || 'Download file'}
                  </a>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button className="mp-btn mp-btn-outline mp-btn-sm" onClick={() => openEdit(idx)}>Edit</button>
                <button className="mp-btn mp-btn-sm" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }} onClick={() => handleDelete(idx)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="mp-btn mp-btn-outline" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: 800 }}>
        <Plus size={16} /> Add Health Record
      </button>

      <input ref={fileInputRef} type="file" accept=".pdf,image/*,.doc,.docx" style={{ display: 'none' }} onChange={handleFileChange} />

      {showModal && (
        <div className="mp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="mp-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="mp-modal-header">
              <h3>{editIndex !== null ? 'Edit Record' : 'New Record'}</h3>
              <button className="mp-modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="mp-field-group">
                <label className="mp-label">Record Name *</label>
                <input className="mp-input" placeholder="e.g., Complete Blood Count – March 2026" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="mp-field-group">
                <label className="mp-label">Record Type</label>
                <select className="mp-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {HR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="mp-field-group">
                <label className="mp-label">Date</label>
                <input className="mp-input" placeholder="e.g., March 15, 2026" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="mp-field-group">
                <label className="mp-label">Notes</label>
                <textarea className="mp-input" rows={3} style={{ resize: 'vertical' }} placeholder="Key findings, doctor comments, follow-up needed…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="mp-field-group">
                <label className="mp-label">Attach Document (optional)</label>
                <button
                  type="button"
                  className="mp-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : form.fileName ? <><Download size={15} /> {form.fileName}</> : <><Plus size={15} /> Upload from Device (PDF, Image, Doc)</>}
                </button>
                {form.fileUrl && (
                  <div className="mp-upload-success">
                    <CheckCircle size={14} color="#16a34a" /> File uploaded successfully
                    <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }} onClick={() => setForm(f => ({ ...f, fileUrl: '', fileName: '' }))}>✕</button>
                  </div>
                )}
              </div>
              {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}
              <button className="mp-btn mp-btn-primary" onClick={handleSaveRecord} disabled={saving || uploading}>
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
function MedPatSettings({ profile }) {
  const [form, setForm] = useState({ name: profile?.name || '', email: profile?.email || '', phone: profile?.phone || '', dob: profile?.dob || '', bloodType: profile?.bloodType || '', allergies: profile?.allergies || '', emergencyContact: profile?.emergencyContact || '' });
  const [saved, setSaved] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="mp-page">
      <div className="mp-page-header"><h1>My Profile</h1><p>Manage your personal information and preferences</p></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div className="mp-card">
          <h3 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1rem' }}>Personal Information</h3>
          <form onSubmit={handleSave} className="mp-settings-form">
            <div className="mp-field-group"><label className="mp-label">Full Name</label><input className="mp-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="mp-field-group"><label className="mp-label">Email Address</label><input className="mp-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="mp-field-group"><label className="mp-label">Phone Number</label><input className="mp-input" type="tel" placeholder="+1 (555) 000-0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="mp-field-group"><label className="mp-label">Date of Birth</label><input className="mp-input" type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} /></div>
            {saved && <p className="mp-save-success">Profile saved successfully.</p>}
            <button className="mp-btn mp-btn-primary" type="submit">Save Changes</button>
          </form>
        </div>
        <div className="mp-card">
          <h3 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1rem' }}>Health Information</h3>
          <form className="mp-settings-form">
            <div className="mp-field-group"><label className="mp-label">Blood Type</label>
              <select className="mp-input" value={form.bloodType} onChange={e => setForm(f => ({ ...f, bloodType: e.target.value }))}>
                <option value="">Select blood type</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="mp-field-group"><label className="mp-label">Known Allergies</label><textarea className="mp-input" rows={3} placeholder="e.g. Penicillin, Peanuts…" value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            <div className="mp-field-group"><label className="mp-label">Emergency Contact</label><input className="mp-input" placeholder="Name · Relationship · Phone" value={form.emergencyContact} onChange={e => setForm(f => ({ ...f, emergencyContact: e.target.value }))} /></div>
          </form>
        </div>
      </div>
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
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Shell ──────────────────────────────────────────────────────────
export default function MedicalPatientDashboard({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();

  const NAV = [
    { path: '/dashboard',               icon: Home,         label: 'Home' },
    { path: '/dashboard/appointments',  icon: Calendar,     label: 'Appointments' },
    { path: '/dashboard/video',         icon: Video,        label: 'Video Calls' },
    { path: '/dashboard/messages',      icon: MessageSquare,label: 'Messages' },
    { path: '/dashboard/prescriptions', icon: Pill,         label: 'Prescriptions' },
    { path: '/dashboard/history',       icon: FileText,     label: 'Medical History' },
    { path: '/dashboard/billing',       icon: CreditCard,   label: 'Billing' },
    { path: '/dashboard/insurance',     icon: Shield,       label: 'Insurance' },
    { path: '/dashboard/emergency',     icon: Phone,        label: 'Emergency Contacts' },
    { path: '/dashboard/records',       icon: Download,     label: 'Health Records' },
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
        <Routes>
          <Route path="/"              element={<MedPatHome          profile={profile} />} />
          <Route path="/appointments"  element={<MedPatAppointments  profile={profile} />} />
          <Route path="/video"         element={<MedPatVideoCalls    profile={profile} />} />
          <Route path="/messages"      element={<MedPatMessages      profile={profile} />} />
          <Route path="/prescriptions" element={<MedPatPrescriptions profile={profile} />} />
          <Route path="/history"       element={<MedPatHistory       profile={profile} />} />
          <Route path="/billing"       element={<MedPatBilling             profile={profile} />} />
          <Route path="/insurance"     element={<MedPatInsurance           profile={profile} />} />
          <Route path="/emergency"     element={<MedPatEmergencyContacts   profile={profile} />} />
          <Route path="/records"       element={<MedPatHealthRecords       profile={profile} />} />
          <Route path="/settings"      element={<MedPatSettings            profile={profile} />} />
          <Route path="/support"       element={<MedPatSupport             profile={profile} />} />
        </Routes>
      </main>
    </div>
  );
}
