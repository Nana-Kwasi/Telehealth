import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, MessageSquare, FileText, TrendingUp, Bell, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle, Activity } from 'lucide-react';
import { auth, db } from '../../Auth/firebaseConfig';
import {
  collection, query, where, getDocs, orderBy, limit, onSnapshot, doc, getDoc, Timestamp
} from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import './Home.css';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../../utils/locationProfile';
import {
  enrichClientRecord,
  getClientDisplayName,
  toFirestoreDate,
} from '../../../utils/clientTherapyMetrics';

export default function TherapistHome({ profile }) {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [therapistProfile, setTherapistProfile] = useState(null);
  const [locationProfile, setLocationProfile] = useState(null);
  const [kpis, setKpis] = useState({ activeClients: 0, todaySessions: 0, pendingNotes: 0, completionRate: 0, totalSessions: 0, totalNotes: 0 });
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [clientProgress, setClientProgress] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [calDate, setCalDate] = useState(new Date());
  const [appointmentDays, setAppointmentDays] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = auth.currentUser;

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isAdminTherapist =
    profile?.role === 'admin' ||
    profile?.isAdminTherapist === true ||
    therapistProfile?.role === 'admin';

  // Load all dashboard data
  useEffect(() => {
    if (!currentUser) return;
    loadDashboardData();
    const unsubNotifs = loadNotifications();
    return () => { if (unsubNotifs) unsubNotifs(); };
  }, [currentUser, profile?.role, profile?.isAdminTherapist]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    const adminView =
      profile?.role === 'admin' ||
      profile?.isAdminTherapist === true;
    await Promise.allSettled([
      loadTherapistProfile(),
      loadKPIs(adminView),
      loadTodaySchedule(adminView),
      loadUpcomingAppointments(adminView),
      loadClientProgress(adminView),
      loadWeeklyData(adminView),
      loadRecentActivities(adminView),
    ]);
    setIsLoading(false);
  };

  const loadTherapistProfile = async () => {
    const snap = await getDoc(doc(db, 'therapists', currentUser.uid));
    const roleData = snap.exists() ? snap.data() : null;
    setTherapistProfile(roleData);
    const authLoc = await fetchAuthLocationProfile(currentUser.uid);
    setLocationProfile(mergeLocationProfile(profile, authLoc, roleData));
  };

  const loadKPIs = async (adminView = false) => {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

      let activeClients = 0;
      if (adminView) {
        const clientsSnap = await getDocs(collection(db, 'clients'));
        activeClients = clientsSnap.size;
      } else {
        const clientsSnap = await getDocs(collection(db, 'therapists', currentUser.uid, 'clients'));
        activeClients = clientsSnap.size;
      }

      const todayQ = adminView
        ? query(
            collection(db, 'scheduledCalls'),
            where('scheduledTime', '>=', Timestamp.fromDate(todayStart)),
            where('scheduledTime', '<=', Timestamp.fromDate(todayEnd)),
          )
        : query(
            collection(db, 'scheduledCalls'),
            where('therapistId', '==', currentUser.uid),
            where('scheduledTime', '>=', Timestamp.fromDate(todayStart)),
            where('scheduledTime', '<=', Timestamp.fromDate(todayEnd)),
          );
      const todaySnap = await getDocs(todayQ);

      let pendingNotes = 0;
      try {
        const notesQ = adminView
          ? query(collection(db, 'clinicalNotes'), where('isDraft', '==', true))
          : query(
              collection(db, 'clinicalNotes'),
              where('therapistId', '==', currentUser.uid),
              where('isDraft', '==', true),
            );
        const notesSnap = await getDocs(notesQ);
        pendingNotes = notesSnap.size;
      } catch (notesErr) {
        console.warn('Pending notes KPI:', notesErr);
      }

      const allQ = adminView
        ? query(collection(db, 'scheduledCalls'), orderBy('scheduledTime', 'desc'), limit(500))
        : query(collection(db, 'scheduledCalls'), where('therapistId', '==', currentUser.uid));
      const allSnap = await getDocs(allQ);
      const total = allSnap.size;
      const done = allSnap.docs.filter((d) => d.data().status === 'completed').length;
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

      let totalNotes = 0;
      try {
        const allNotesQ = adminView
          ? query(collection(db, 'clinicalNotes'), limit(500))
          : query(collection(db, 'clinicalNotes'), where('therapistId', '==', currentUser.uid));
        const allNotesSnap = await getDocs(allNotesQ);
        totalNotes = allNotesSnap.size;
      } catch (notesErr) {
        console.warn('Total notes KPI:', notesErr);
      }

      setKpis({
        activeClients,
        todaySessions: todaySnap.size,
        pendingNotes,
        completionRate,
        totalSessions: total,
        totalNotes,
      });
    } catch (e) {
      console.error('KPI error:', e);
    }
  };

  const loadTodaySchedule = async (adminView = false) => {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const q = adminView
        ? query(
            collection(db, 'scheduledCalls'),
            where('scheduledTime', '>=', Timestamp.fromDate(todayStart)),
            where('scheduledTime', '<=', Timestamp.fromDate(todayEnd)),
            orderBy('scheduledTime', 'asc'),
          )
        : query(
            collection(db, 'scheduledCalls'),
            where('therapistId', '==', currentUser.uid),
            where('scheduledTime', '>=', Timestamp.fromDate(todayStart)),
            where('scheduledTime', '<=', Timestamp.fromDate(todayEnd)),
            orderBy('scheduledTime', 'asc'),
          );
      const snap = await getDocs(q);
      const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTodayAppointments(appts);
    } catch (e) {
      console.error('Today schedule error:', e);
    }
  };

  const loadUpcomingAppointments = async (adminView = false) => {
    try {
      const now = new Date();
      const q = adminView
        ? query(
            collection(db, 'scheduledCalls'),
            where('scheduledTime', '>=', Timestamp.fromDate(now)),
            orderBy('scheduledTime', 'asc'),
            limit(5),
          )
        : query(
            collection(db, 'scheduledCalls'),
            where('therapistId', '==', currentUser.uid),
            where('scheduledTime', '>=', Timestamp.fromDate(now)),
            orderBy('scheduledTime', 'asc'),
            limit(5),
          );
      const snap = await getDocs(q);
      const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUpcomingAppointments(appts);
      // Build set of days that have appointments (for mini calendar)
      const days = new Set(appts.map(a => {
        const dt = a.scheduledTime?.toDate ? a.scheduledTime.toDate() : new Date(a.scheduledTime);
        return dt.getDate();
      }));
      setAppointmentDays(days);
    } catch (e) {
      console.error('Upcoming appointments error:', e);
    }
  };

  const loadClientProgress = async (adminView = false) => {
    try {
      let clientIds = [];
      if (adminView) {
        const allClientsSnap = await getDocs(query(collection(db, 'clients'), limit(50)));
        clientIds = allClientsSnap.docs.map((d) => d.id);
      } else {
        try {
          const subSnap = await getDocs(collection(db, 'therapists', currentUser.uid, 'clients'));
          clientIds = subSnap.docs.map((d) => d.data().clientId || d.data().id || d.id).filter(Boolean);
        } catch (_) {}

        if (clientIds.length === 0) {
          try {
            const directSnap = await getDocs(
              query(collection(db, 'clients'), where('therapistId', '==', currentUser.uid)),
            );
            clientIds = directSnap.docs.map((d) => d.id);
          } catch (_) {}
        }
      }

      if (clientIds.length === 0) {
        setClientProgress([]);
        return;
      }

      const therapistNameById = {};
      try {
        const tSnap = await getDocs(collection(db, 'therapists'));
        tSnap.docs.forEach((t) => {
          therapistNameById[t.id] = t.data().name || t.data().displayName || 'Therapist';
        });
      } catch (_) {}

      const progressList = [];
      for (const cid of clientIds.slice(0, 6)) {
        try {
          const clientSnap = await getDoc(doc(db, 'clients', cid));
          if (!clientSnap.exists()) continue;
          const enriched = await enrichClientRecord(cid, { id: cid, ...clientSnap.data() });
          const noteCount = enriched.noteCount ?? 0;
          const progress = Math.min(95, 20 + noteCount * 7);
          const lastDt = toFirestoreDate(enriched.lastSession);
          const lastSession = lastDt
            ? lastDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'No sessions yet';
          const therapistLabel = enriched.therapistId
            ? therapistNameById[enriched.therapistId] || enriched.assignedTherapistName || 'Assigned'
            : enriched.assignedTherapistName || 'Unassigned';
          const therapyLabel = enriched.therapyTypeLabel || 'Not set';

          progressList.push({
            cid,
            name: enriched.name || getClientDisplayName(enriched),
            progress,
            lastSession,
            noteCount,
            therapistName: therapistLabel,
            therapyType: therapyLabel,
          });
        } catch (_) {}
      }
      setClientProgress(progressList);
    } catch (e) {
      console.error('Client progress error:', e);
    }
  };

  // Load ALL sessions, grouped by month (last 6 months or all time)
  const loadWeeklyData = async (adminView = false) => {
    try {
      const snap = await getDocs(
        adminView
          ? query(collection(db, 'scheduledCalls'), orderBy('scheduledTime', 'asc'), limit(500))
          : query(
              collection(db, 'scheduledCalls'),
              where('therapistId', '==', currentUser.uid),
              orderBy('scheduledTime', 'asc'),
            ),
      );
      const monthMap = {};
      snap.docs.forEach(d => {
        const dt = d.data().scheduledTime?.toDate?.() || new Date();
        const key = dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (!monthMap[key]) monthMap[key] = { day: key, sessions: 0, notes: 0 };
        monthMap[key].sessions++;
        if (d.data().status === 'completed') monthMap[key].notes++;
      });
      const monthKeys = Object.keys(monthMap);
      if (monthKeys.length === 0) {
        setWeeklyData([{ day: 'No sessions yet', sessions: 0, notes: 0 }]);
        return;
      }
      setWeeklyData(monthKeys.slice(-12).map(k => monthMap[k]));
    } catch (e) {
      console.error('Weekly chart error:', e);
      setWeeklyData([{ day: 'No sessions yet', sessions: 0, notes: 0 }]);
    }
  };

  const loadRecentActivities = async (adminView = false) => {
    try {
      const activities = [];

      const q = adminView
        ? query(collection(db, 'scheduledCalls'), orderBy('scheduledTime', 'desc'), limit(5))
        : query(
            collection(db, 'scheduledCalls'),
            where('therapistId', '==', currentUser.uid),
            orderBy('scheduledTime', 'desc'),
            limit(5),
          );
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const data = d.data();
        const dt = data.scheduledTime?.toDate?.() || new Date();
        activities.push({
          icon: '📅',
          text: `Session with ${data.clientName || 'client'} ${data.status === 'completed' ? 'completed' : 'scheduled'}`,
          time: timeAgo(dt),
          type: 'session'
        });
      });

      // Recent clinical notes
      try {
        const notesQ = adminView
          ? query(collection(db, 'clinicalNotes'), orderBy('createdAt', 'desc'), limit(3))
          : query(
              collection(db, 'clinicalNotes'),
              where('therapistId', '==', currentUser.uid),
              orderBy('createdAt', 'desc'),
              limit(3),
            );
        const notesSnap = await getDocs(notesQ);
        notesSnap.docs.forEach(d => {
          const data = d.data();
          const dt = data.createdAt?.toDate?.() || new Date();
          activities.push({
            icon: '📝',
            text: `Note saved for ${data.clientName || 'client'}`,
            time: timeAgo(dt),
            type: 'note'
          });
        });
      } catch (_) {}

      activities.sort((a, b) => 0); // already ordered by Firebase
      setRecentActivities(activities.slice(0, 8));
    } catch (e) {
      console.error('Recent activities error:', e);
    }
  };

  const loadNotifications = () => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('targetId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const unsub = onSnapshot(q, snap => {
        const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setNotifications(notifs);
        setUnreadNotifications(notifs.filter(n => !n.read).length);
      }, () => {});
      return unsub;
    } catch (e) { return null; }
  };

  const timeAgo = (date) => {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const formatTime12 = (timestamp) => {
    const dt = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDateShort = (timestamp) => {
    const dt = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) return 'Today';
    const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
    if (dt.toDateString() === tmrw.toDateString()) return 'Tomorrow';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getSessionStatus = (appt) => {
    if (appt.status === 'completed') return 'completed';
    const dt = appt.scheduledTime?.toDate ? appt.scheduledTime.toDate() : new Date(appt.scheduledTime);
    return dt > new Date() ? 'upcoming' : 'scheduled';
  };

  // Mini calendar helpers
  const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();

  const calCells = () => {
    const total = daysInMonth(calDate);
    const firstDay = firstDayOfMonth(calDate);
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    return cells;
  };

  const greeting = () => {
    const h = currentTime.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const displayName = therapistProfile?.name || profile?.name || 'Therapist';

  if (isLoading) {
    return (
      <div className="loading-screen" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'80vh', gap:'1rem' }}>
        <div className="loading-spinner" style={{ width:44, height:44, borderRadius:'50%', border:'4px solid #e2e8f0', borderTopColor:'#4f46e5', animation:'spin 0.9s linear infinite' }} />
        <p style={{ color:'#64748b', fontWeight:500 }}>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-home">
      <LocationSummaryCard
        profile={locationProfile || mergeLocationProfile(profile, therapistProfile)}
        onEdit={() => navigate('/dashboard/settings')}
      />

      {isAdminTherapist && (
        <div className="th-home-admin-banner">
          Platform overview — showing therapy data across all clients and sessions (admin therapist view).
        </div>
      )}

      {/* ── Welcome Banner ── */}
      <div className="enhanced-header">
        <div className="header-content">
          <div className="greeting-section">
            <div className="therapist-avatar-wrap" style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,#4f46e5,#818cf8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'1.3rem', fontWeight:700, flexShrink:0 }}>
              {displayName[0]?.toUpperCase()}
            </div>
            <div>
              <p style={{ margin:0, fontSize:'0.78rem', color:'#94a3b8', fontWeight:500 }}>{greeting()},</p>
              <h1 className="greeting">{displayName}</h1>
              {therapistProfile?.specialization && (
                <p style={{ margin:0, fontSize:'0.78rem', color:'#64748b' }}>{therapistProfile.specialization}</p>
              )}
            </div>
          </div>

          <div className="time-display">
            <span className="current-time">
              {currentTime.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', second:'2-digit', hour12:true })}
            </span>
            <span className="current-date">
              {currentTime.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
            </span>
          </div>

          <div style={{ position:'relative' }}>
            <button className="notification-icon" onClick={() => setShowNotifications(v => !v)}>
              <Bell size={20} />
              {unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications}</span>}
            </button>
            {showNotifications && (
              <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:320, background:'white', border:'1.5px solid #e2e8f0', borderRadius:14, boxShadow:'0 12px 32px rgba(0,0,0,0.12)', zIndex:200, overflow:'hidden' }}>
                <div style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:700, fontSize:'0.875rem', color:'#0f172a' }}>Notifications</span>
                  {unreadNotifications > 0 && <span style={{ fontSize:'0.7rem', color:'#4f46e5', fontWeight:600 }}>{unreadNotifications} new</span>}
                </div>
                <div style={{ maxHeight:280, overflowY:'auto' }}>
                  {notifications.length === 0 ? (
                    <p style={{ padding:'1.5rem', textAlign:'center', color:'#94a3b8', fontSize:'0.85rem' }}>No notifications</p>
                  ) : notifications.map(n => (
                    <div key={n.id} style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #f8fafc', background: n.read ? 'transparent' : '#f0f7ff' }}>
                      <p style={{ margin:0, fontSize:'0.82rem', color:'#334155', fontWeight: n.read ? 400 : 600 }}>{n.message || n.title}</p>
                      <span style={{ fontSize:'0.7rem', color:'#94a3b8' }}>{n.createdAt?.toDate ? timeAgo(n.createdAt.toDate()) : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI Stats ── */}
      <div className="stats-section">
        <div className="stats-grid">
          {[
            { label:'Active Clients',     value: kpis.activeClients,    change:'Currently assigned',    icon: Users,       bg:'bg-blue-100',   ic:'text-blue-500' },
            { label:"Today's Sessions",   value: kpis.todaySessions,    change:'Scheduled today',       icon: Calendar,    bg:'bg-green-100',  ic:'text-green-500' },
            { label:'Total Sessions',     value: kpis.totalSessions,    change:'All time',              icon: Activity,    bg:'bg-teal-100',   ic:'text-teal-500' },
            { label:'Total Notes',        value: kpis.totalNotes,       change:'Clinical notes written', icon: FileText,   bg:'bg-indigo-100', ic:'text-indigo-500' },
            { label:'Pending Notes',      value: kpis.pendingNotes,     change:'Drafts to complete',    icon: Clock,       bg:'bg-purple-100', ic:'text-purple-500' },
            { label:'Completion Rate',    value:`${kpis.completionRate}%`, change:'All time',           icon: TrendingUp,  bg:'bg-orange-100', ic:'text-orange-500' },
          ].map(({ label, value, change, icon: Icon, bg, ic }) => (
            <div className="stat-card" key={label}>
              <div className={`stat-icon ${bg}`}><Icon className={ic} size={22} /></div>
              <div className="stat-content">
                <h3 className="stat-value">{value}</h3>
                <p className="stat-label">{label}</p>
                <span className="stat-change">{change}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="th-home-charts-grid">
        {/* Weekly Sessions Chart */}
        <div className="th-home-chart-card" style={{ gridColumn: 'span 2' }}>
          <div className="th-home-chart-header">
            <h3 className="th-home-chart-title">Session Activity (All Time)</h3>
            <span style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:500 }}>By month</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius:10, border:'1px solid #e2e8f0', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }} />
              <Area type="monotone" dataKey="sessions" stroke="#4f46e5" strokeWidth={2.5} fill="url(#sessGrad)" dot={{ fill:'#4f46e5', strokeWidth:0, r:3 }} name="Sessions" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Session breakdown */}
        <div className="th-home-chart-card">
          <div className="th-home-chart-header">
            <h3 className="th-home-chart-title">Session Breakdown</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyData} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius:10, border:'1px solid #e2e8f0' }} />
              <Bar dataKey="sessions" fill="#4f46e5" radius={[4,4,0,0]} name="Sessions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Schedule + Activities + Calendar ── */}
      <div className="schedule-section">
        <div className="schedule-grid-three">

          {/* Today's Schedule */}
          <div className="schedule-card">
            <h3 className="card-title" style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <Calendar size={16} style={{ color:'#4f46e5' }} /> Today's Schedule
            </h3>
            <div className="appointments-list">
              {todayAppointments.length === 0 ? (
                <div className="no-appointments">No sessions scheduled for today</div>
              ) : todayAppointments.map(appt => {
                const status = getSessionStatus(appt);
                return (
                  <div key={appt.id} className={`appointment-item ${status}`}>
                    <div className="appointment-time">
                      <div className="time">{formatTime12(appt.scheduledTime)}</div>
                      <div className="date">Today</div>
                    </div>
                    <div className="appointment-content">
                      <h4 className="appointment-client">{appt.clientName || 'Client'}</h4>
                      <p className="appointment-type">{appt.sessionType || appt.callType || 'Individual'} • {appt.duration || 50}min</p>
                    </div>
                    <div className="appointment-status">
                      {status === 'completed' ? <CheckCircle size={16} color="#10b981" /> : <Clock size={16} color="#4f46e5" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mini Calendar */}
          <div className="schedule-card cal-card">
            <div className="cal-header">
              <button className="cal-nav-btn" onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}>‹</button>
              <span className="cal-month-label">
                {calDate.toLocaleDateString('en-US', { month:'long', year:'numeric' })}
              </span>
              <button className="cal-nav-btn" onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}>›</button>
            </div>
            <div className="cal-grid">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} className="cal-day-label">{d}</div>
              ))}
              {calCells().map((day, i) => {
                const isToday = day && calDate.getMonth() === new Date().getMonth() && calDate.getFullYear() === new Date().getFullYear() && day === new Date().getDate();
                const hasAppt = day && appointmentDays.has(day);
                return (
                  <div key={i} className={`cal-cell ${!day ? 'empty' : ''} ${isToday ? 'today' : ''} ${hasAppt && !isToday ? 'has-appt' : ''}`}>
                    {day && <span className="cal-day-num">{day}</span>}
                    {hasAppt && <span className="cal-appt-dot">•</span>}
                  </div>
                );
              })}
            </div>
            <div className="cal-legend">
              <div className="cal-legend-dot" />
              <span className="cal-legend-text">Has appointment</span>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="activities-card">
            <h3 className="card-title" style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <Activity size={16} style={{ color:'#4f46e5' }} /> Recent Activity
            </h3>
            <div className="activities-list">
              {recentActivities.length === 0 ? (
                <div className="no-activities">No recent activity</div>
              ) : recentActivities.map((a, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-icon">{a.icon}</div>
                  <div className="activity-content">
                    <p className="activity-text">{a.text}</p>
                    <span className="activity-time">{a.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Upcoming Sessions ── */}
      {upcomingAppointments.length > 0 && (
        <div className="progress-section" style={{ marginBottom:'1.5rem' }}>
          <h2 className="section-title" style={{ marginBottom:'1rem' }}>
            <Calendar size={18} style={{ color:'#4f46e5', marginRight:6 }} />
            Upcoming Sessions
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:'0.85rem' }}>
            {upcomingAppointments.map(appt => (
              <div key={appt.id} style={{ background:'#f8fafc', borderRadius:12, padding:'0.9rem 1.1rem', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'0.85rem', transition:'all 0.15s' }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,#4f46e5,#818cf8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'1rem', flexShrink:0 }}>
                  {(appt.clientName||'?')[0].toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontWeight:700, fontSize:'0.875rem', color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{appt.clientName || 'Client'}</p>
                  <p style={{ margin:0, fontSize:'0.72rem', color:'#64748b' }}>{formatDateShort(appt.scheduledTime)} · {formatTime12(appt.scheduledTime)}</p>
                  <p style={{ margin:0, fontSize:'0.68rem', color:'#94a3b8', textTransform:'capitalize' }}>{appt.sessionType || 'Individual'}</p>
                </div>
                <div style={{ fontSize:'0.65rem', fontWeight:700, padding:'0.2rem 0.5rem', borderRadius:20, background:'#eff6ff', color:'#4f46e5', textTransform:'uppercase', letterSpacing:'0.04em', flexShrink:0 }}>
                  {formatDateShort(appt.scheduledTime) === 'Today' ? 'Today' : 'Upcoming'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Client Progress Overview ── */}
      <div className="progress-section">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
          <p className="section-title" style={{ margin:0, display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <TrendingUp size={18} style={{ color:'#4f46e5' }} />
            Client Progress Overview
          </p>
          {clientProgress.length > 0 && (
            <span style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:500 }}>{clientProgress.length} client{clientProgress.length !== 1 ? 's' : ''} tracked</span>
          )}
        </div>
        {clientProgress.length === 0 ? (
          <div style={{ textAlign:'center', padding:'2.5rem 1rem', color:'#94a3b8' }}>
            <TrendingUp size={36} style={{ opacity:0.3, marginBottom:'0.75rem', display:'block', margin:'0 auto 0.75rem' }} />
            <p style={{ margin:'0 0 0.25rem', fontWeight:600, color:'#64748b', fontSize:'0.9rem' }}>No client data yet</p>
            <p style={{ margin:0, fontSize:'0.8rem' }}>Progress will appear here once clients have therapy notes</p>
          </div>
        ) : (
          <div className="progress-grid">
            {clientProgress.map((c) => {
              const pct = c.progress;
              const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#4f46e5';
              return (
                <div key={c.cid} className="client-progress-card">
                  <div className="client-header">
                    <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg,${color},${color}99)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'0.75rem', flexShrink:0 }}>
                        {(c.name||'?')[0].toUpperCase()}
                      </div>
                      <h4 className="client-name" style={{ margin:0 }}>{c.name}</h4>
                    </div>
                    <span className="progress-percentage" style={{ color }}>{pct}%</span>
                  </div>
                  <div className="progress-bar" style={{ marginTop:'0.5rem' }}>
                    <div className="progress-fill" style={{ width:`${pct}%`, background:`linear-gradient(90deg, ${color}, ${color}bb)`, transition:'width 0.6s ease' }} />
                  </div>
                  <div className="client-sessions client-sessions-stacked" style={{ marginTop:'0.4rem' }}>
                    <span className="last-session">Therapy: {c.therapyType || '—'}</span>
                    <span className="last-session">Therapist: {c.therapistName || '—'}</span>
                    <div className="client-sessions-row">
                      <span className="last-session">Last: {c.lastSession}</span>
                      <span className="next-session">{c.noteCount} note{c.noteCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
