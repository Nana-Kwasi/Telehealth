import React, { useState, useEffect, useMemo } from 'react';
import ScheduleCallModal from './ScheduleCallModal';
import ClientEPharmacyModal from './ClientEPharmacyModal';
import clinicianHero from '../../../assets/clinician-hero.jpg';
import {
  DashboardGrid, HeroBanner, StatTile, Panel, ScoreRing, MetricTile,
  PersonRow, ActivityRow, ShortcutTile, PromoCard, Empty,
  TopBar, Spark, BarRow, ProgressRow,
} from '../../Common/dashboard/DashboardKit';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, FileText, TrendingUp, ChevronRight, Clock, CheckCircle, Activity,
  Heart, Video, ClipboardList, BookOpen, ShoppingBag, Pill,
} from 'lucide-react';
import { auth, db } from '../../../services/firestoreShim';
import {
  collection, query, where, getDocs, orderBy, limit, onSnapshot, doc, getDoc, updateDoc, Timestamp
} from '../../../services/firestoreShim';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import './Home.css';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import { api } from '../../../services/apiClient';
import { calculateClientProgress, progressLabel } from '../../../utils/clientProgress';
import { buildProgressMetrics, overallProgressScore } from '../../../utils/clientDashboardMetrics';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../../utils/locationProfile';
import WeatherCard from '../../Common/WeatherCard';
import ClinicianStatus, { clinicianStatusOf } from '../../Common/ClinicianStatus';
import DailyBrief from '../../Common/DailyBrief';
import SessionsToReview from '../../Common/SessionsToReview';
import InboxTriagePanel from '../../Common/InboxTriagePanel';
import PracticeAnalyticsPanel from '../../Common/PracticeAnalyticsPanel';
import { getJoinWindow } from '../../../utils/sessionJoinWindow';
import FaqSection from '../../Common/FaqSection';
import {
  enrichClientRecord,
  getClientDisplayName,
  toFirestoreDate,
} from '../../../utils/clientTherapyMetrics';


/* ── Render helpers ───────────────────────────────────────────────────────
   Small, local, and all reading REAL appointment records — nothing here
   invents a figure. Each one is defensive about shape because appointments
   arrive from three different endpoints with three different date fields. */

const APPT_WHEN = (a) => a?.scheduledTime || a?.scheduledAt || a?.startsAt || a?.date;

function apptDate(a) {
  const raw = APPT_WHEN(a);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "today at 14:30" / "Tue 3 Oct, 09:00" — never a raw ISO string. */
function whenLabel(a) {
  const d = apptDate(a);
  if (!d) return 'Time not set';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today · ${time}`;
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${time}`;
}

function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';
}

function statusLabel(a) {
  const s = String(a?.status || '').toLowerCase();
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'pending')   return 'Needs confirming';
  if (s === 'completed') return 'Completed';
  return 'Scheduled';
}

function statusTone(a) {
  const s = String(a?.status || '').toLowerCase();
  if (s === 'confirmed') return 'confirmed';
  if (s === 'pending')   return 'alert';
  return 'scheduled';
}

function activityIcon(act) {
  const t = String(act?.type || act?.action || '').toLowerCase();
  if (t.includes('note'))    return FileText;
  if (t.includes('mood'))    return Heart;
  if (t.includes('session') || t.includes('call')) return Video;
  if (t.includes('client'))  return Users;
  return Activity;
}

function activityTone(act) {
  const t = String(act?.type || act?.action || '').toLowerCase();
  if (t.includes('note'))    return 'lilac';
  if (t.includes('mood'))    return 'rose';
  if (t.includes('session') || t.includes('call')) return 'green';
  return 'blue';
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const [completingId, setCompletingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  /**
   * Everything that is not "what needs me now" starts collapsed.
   *
   * The screen used to stack eight sections: location, an admin banner, the
   * greeting, triage, five KPIs, two charts, a calendar, upcoming sessions and
   * a client-progress grid. A therapist between clients reads none of that —
   * they read the first screenful. Charts and history are still one click away,
   * which is the point of disclosure rather than deletion.
   */
  // Which day the schedule modal is opening on, or null. Clicking a calendar
  // cell used to navigate to '/dashboard/schedule' — a route the therapist
  // dashboard does not define — so it landed on a blank page.
  const [scheduleDate, setScheduleDate] = useState(null);
  // Psychiatry: the doctor home's E-Pharmacy action, for psychiatry clients.
  const [showEPharmacy, setShowEPharmacy] = useState(false);

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
          // Was a function of how many notes the THERAPIST had written — it rose
          // with admin activity and kept rising while a client deteriorated.
          // Measure the change in the client's own wellbeing readings; null when
          // there aren't enough to say anything honest.
          const [moodRows, noteRows, goalRows, sessionRows] = await Promise.all([
            api(`/api/v1/patients/${cid}/daily-feelings`).catch(() => []),
            api(`/api/v1/clinical-notes?clientId=${cid}`).catch(() => []),
            api(`/api/v1/therapy-management/goals?clientId=${cid}`).catch(() => []),
            api(`/api/v1/scheduled-calls?clientId=${cid}`).catch(() => []),
          ]);

          // ── One number, computed the same way on both dashboards ───────────
          // This showed a mood-trend percentage while the CLIENT saw the
          // composite of four dimensions, so the same client read differently
          // on each screen — and this one went null ("No client data yet")
          // whenever there were too few readings.
          const metrics = buildProgressMetrics({
            moodEntries: moodRows,
            notes: noteRows,
            goals: Array.isArray(goalRows) ? goalRows : [],
            sessions: Array.isArray(sessionRows) ? sessionRows : [],
          });
          const progress = overallProgressScore(metrics);
          // Retained for the trend wording, which the composite cannot express.
          const progressStat = calculateClientProgress(moodRows, noteRows);
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
        const row = d.data();
        // `scheduledTime?.toDate?.() || new Date()` put EVERY session in the
        // current month: the REST API returns ISO strings, which have no
        // toDate(), so the fallback fired every time and the chart collapsed
        // into a single column.
        const dt = asDate(row.scheduledTime || row.scheduledAt);
        if (!dt) return;
        // Sortable key kept apart from the display label, so the buckets come
        // back in date order rather than in the order they happened to arrive.
        const sortKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const label = dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (!monthMap[sortKey]) monthMap[sortKey] = { day: label, sessions: 0, notes: 0 };
        monthMap[sortKey].sessions++;
        if (row.status === 'completed') monthMap[sortKey].notes++;
      });
      const monthKeys = Object.keys(monthMap).sort();
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
        const dt = asDate(data.scheduledTime || data.scheduledAt);
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
          const dt = asDate(data.createdAt);
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

  /**
   * Accepts a Firestore Timestamp, an ISO string, or a Date.
   *
   * The REST API returns ISO strings, which have no `.toDate()`, so callers
   * doing `x?.toDate?.() || new Date()` silently fell back to NOW and every
   * activity rendered as "Just now".
   */
  const asDate = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) || d.getTime() <= 0 ? null : d;
  };

  const timeAgo = (date) => {
    if (!date) return '';
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

  // Mark a session complete. Nothing in the platform ever moved a scheduled call
  // out of 'scheduled'/'in_progress', so Completion Rate here and "Sessions
  // Completed" on the client dashboard were permanently 0. The backend PATCH
  // already accepts the status and enforces therapist/client ownership.
  const markSessionComplete = async (appt) => {
    if (!appt?.id || completingId) return;
    setCompletingId(appt.id);
    try {
      await updateDoc(doc(db, 'scheduledCalls', appt.id), {
        status: 'completed',
        updatedBy: currentUser?.uid || null,
      });
      // Reflect it immediately in both lists rather than waiting for a refetch.
      const applyDone = (list) => list.map(a => (a.id === appt.id ? { ...a, status: 'completed' } : a));
      setTodayAppointments(applyDone);
      setUpcomingAppointments(applyDone);
      setKpis(prev => {
        const done = Math.round((prev.completionRate / 100) * prev.totalSessions) + 1;
        return {
          ...prev,
          completionRate: prev.totalSessions > 0 ? Math.round((done / prev.totalSessions) * 100) : 0,
        };
      });
    } catch (e) {
      console.error('Could not mark session complete:', e);
      alert('Could not mark this session complete. Please try again.');
    } finally {
      setCompletingId(null);
    }
  };

  const getSessionStatus = (appt) => {
    if (appt.status === 'completed') return 'completed';
    const dt = appt.scheduledTime?.toDate ? appt.scheduledTime.toDate() : new Date(appt.scheduledTime);
    return dt > new Date() ? 'upcoming' : 'scheduled';
  };

  /**
   * Clicking a day on the mini calendar. The cells used to be inert divs, so a
   * therapist could see a free day here but had no way to act on it — mobile
   * has always opened a booking from an empty day. The full Calendar page
   * already implements that flow, so this hands the date to it: an empty future
   * day opens the booking form, a day with sessions opens that day's detail.
   */
  const openDay = (date, hasAppt) => {
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    // A day that already has sessions goes to the full Calendar page to review
    // them; an empty day opens the booking modal right here, which is what
    // mobile has always done.
    if (hasAppt) {
      navigate('/dashboard/calendar', { state: { focusDate: ymd } });
      return;
    }
    setScheduleDate(ymd);
  };

  /**
   * "What needs me now" — the triage model behind the panel at the top.
   *
   * The screen used to open on six equal tiles of all-time totals (Total
   * Sessions, Total Notes, Completion Rate). None of them answer the question a
   * therapist actually has in the ninety seconds between clients, which is who
   * needs something from them today. These are the things that are actionable,
   * each one a link to the place it gets resolved.
   *
   * Severity drives colour, and nothing else on the screen uses red — an alert
   * palette spent on decoration is how alarm fatigue starts.
   */
  const attentionItems = useMemo(() => {
    const items = [];
    const now = new Date();

    const unconfirmed = upcomingAppointments.filter(
      (a) => String(a.status || '').toLowerCase() === 'pending',
    );
    if (unconfirmed.length) {
      items.push({
        key: 'confirm',
        severity: 'high',
        icon: Clock,
        label: `${unconfirmed.length} session${unconfirmed.length > 1 ? 's' : ''} awaiting your confirmation`,
        detail: 'Clients cannot join until you confirm.',
        // Was '/dashboard/schedule', which this dashboard does not route —
        // the same dead link the calendar cells used. Appointments is where a
        // session actually gets confirmed.
        to: '/dashboard/appointments',
      });
    }

    if (kpis.pendingNotes > 0) {
      items.push({
        key: 'notes',
        severity: 'medium',
        icon: FileText,
        label: `${kpis.pendingNotes} clinical note${kpis.pendingNotes > 1 ? 's' : ''} to finish`,
        detail: 'Drafts saved but not completed.',
        to: '/dashboard/notes',
      });
    }

    // Falling wellbeing, from the client's own readings — not from how much the
    // therapist has written about them.
    const declining = clientProgress.filter(
      (c) => c.progress !== null && c.progress !== undefined && c.progress < 40,
    );
    if (declining.length) {
      items.push({
        key: 'declining',
        severity: 'high',
        icon: TrendingUp,
        label: `${declining.length} client${declining.length > 1 ? 's' : ''} trending down`,
        detail: declining.slice(0, 3).map((c) => c.name).join(', ')
          + (declining.length > 3 ? ` +${declining.length - 3} more` : ''),
        to: '/dashboard/clients',
      });
    }

    // Assigned but not seen in a month — quietly drifting out of care.
    const stale = clientProgress.filter((c) => {
      if (!c.lastSession || c.lastSession === 'No sessions yet') return false;
      const d = new Date(c.lastSession);
      if (Number.isNaN(d.getTime())) return false;
      return (now - d) / 86400000 > 30;
    });
    if (stale.length) {
      items.push({
        key: 'stale',
        severity: 'low',
        icon: Users,
        label: `${stale.length} client${stale.length > 1 ? 's' : ''} not seen in over a month`,
        detail: stale.slice(0, 3).map((c) => c.name).join(', ')
          + (stale.length > 3 ? ` +${stale.length - 3} more` : ''),
        to: '/dashboard/clients',
      });
    }

    const order = { high: 0, medium: 1, low: 2 };
    return items.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [upcomingAppointments, kpis.pendingNotes, clientProgress]);

  /** The very next session, for the spotlight. */
  const nextSession = useMemo(() => {
    const now = Date.now();
    return [...todayAppointments, ...upcomingAppointments]
      .filter((a) => {
        const t = new Date(a.scheduledTime?.toDate?.() || a.scheduledTime).getTime();
        return !Number.isNaN(t) && t >= now - 30 * 60000
          && String(a.status || '').toLowerCase() !== 'cancelled';
      })
      .sort((a, b) => new Date(a.scheduledTime?.toDate?.() || a.scheduledTime)
        - new Date(b.scheduledTime?.toDate?.() || b.scheduledTime))[0] || null;
  }, [todayAppointments, upcomingAppointments]);

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

  /** Months that actually have data — the loader seeds a "No sessions yet"
      placeholder row, which must not be drawn as a bar. */
  const monthlySessions = useMemo(
    () => (weeklyData || []).filter((w) => w && w.day !== 'No sessions yet'),
    [weeklyData],
  );
  const maxMonthlySessions = useMemo(
    () => Math.max(1, ...monthlySessions.map((m) => Number(m.sessions) || 0)),
    [monthlySessions],
  );

  const greetingWord = (() => {
    const h = currentTime.getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  /** Soonest-first, future only, across both lists the loader populates. */
  const upcomingSessions = useMemo(() => {
    const all = [...(todayAppointments || []), ...(upcomingAppointments || [])];
    const seen = new Set();
    return all
      .filter((a) => {
        if (!a?.id || seen.has(a.id)) return false;
        seen.add(a.id);
        const d = apptDate(a);
        return d && d.getTime() > Date.now() - 3600000;
      })
      .sort((x, y) => apptDate(x) - apptDate(y))
      .slice(0, 4);
  }, [todayAppointments, upcomingAppointments]);

  if (isLoading) {
    return (
      <div className="loading-screen" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'80vh', gap:'1rem' }}>
        <div className="loading-spinner" style={{ width:44, height:44, borderRadius:'50%', border:'4px solid #e2e8f0', borderTopColor:'#4f46e5', animation:'spin 0.9s linear infinite' }} />
        <p style={{ color:'#64748b', fontWeight:500 }}>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-home nd-home">
      {isAdminTherapist ? (
        <div className="th-home-admin-banner">
          Platform overview — showing therapy data across all clients and sessions
          (admin therapist view).
        </div>
      ) : null}

      {/* ── Top bar ──
          Search routes to the screen that can answer the query rather than
          being decoration. */}
      <TopBar
        placeholder="Search clients, notes or sessions…"
        onSearch={(q) => navigate(`/dashboard/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`)}
        pill={{ Icon: Heart, title: 'Your practice', subtitle: 'matters' }}
        avatar={therapistProfile?.photoURL || profile?.photoURL}
        name={displayName}
        onAvatar={() => navigate('/dashboard/settings')}
        // No weather in the top bar: it fell back to a made-up "☀️ 29°C Clear
        // sky" whenever no live reading was attached. The real card is below.
        status={
          clinicianStatusOf(therapistProfile)
            ? {
                label: 'Available',
                note: 'shown to your clients',
              }
            : null
        }
        onStatusClick={() => navigate('/dashboard/settings')}
      />

      <DashboardGrid>
        {/* ── Hero ── */}
        <HeroBanner
          greeting={greetingWord}
          name={displayName}
          headline="Your practice"
          accent="at a glance"
          body={
            nextSession
              ? `Your next session is with ${nextSession.clientName || 'a client'} ${whenLabel(nextSession)}.`
              : 'Nothing scheduled yet. Pick a free day on the calendar to book a session.'
          }
          actions={[
            { label: 'Start a session', Icon: Video, onClick: () => navigate('/dashboard/video') },
            { label: 'Schedule', Icon: Calendar, onClick: () => setScheduleDate(todayYmd()) },
            // Psychiatry: same shortcuts the doctor home offers.
            { label: 'Prescriptions', Icon: Pill, onClick: () => navigate('/dashboard/prescriptions') },
            { label: 'E-Pharmacy', Icon: ShoppingBag, onClick: () => setShowEPharmacy(true) },
          ]}
          wide
          art={clinicianHero}
        />

        <ClientEPharmacyModal
          open={showEPharmacy}
          onClose={() => setShowEPharmacy(false)}
          therapistId={profile?.id || auth.currentUser?.uid}
        />

        {/* Real conditions at the therapist's saved location (Common/WeatherCard). */}
        <WeatherCard profile={locationProfile || profile} />

        {/* Counted server-side; the model only writes the sentence over those
            figures, so the card is right even when the model is not there. */}
        <DailyBrief role="THERAPIST" />

        {/* Transcribed sessions whose notes are not saved yet. */}
        <SessionsToReview />

        {/* The companion to the brief's unread count: which of them need you
            first. Sorted on request, because it costs a model call per message. */}
        <InboxTriagePanel />

        {/* Therapists have no analytics page; this is their period-on-period
            view, counted from scheduled sessions and clinical notes. */}
        <PracticeAnalyticsPanel scope="me" />

        {/* ── Practice overview ── */}
        <Panel
          title="Practice overview"
          subtitle="How your caseload is running."
          action={{ label: 'Clients', onClick: () => navigate('/dashboard/clients') }}
        >
          <div className="nd-overview">
            <ScoreRing
              value={kpis.completionRate}
              label="Completion rate"
              caption="Sessions completed, all time"
              tone="#5b5bd6"
            />
            <div className="nd-metrics">
              <MetricTile Icon={Calendar} tone="blue"  label="Today's sessions"
                          value={kpis.todaySessions} />
              <MetricTile Icon={Users} tone="green"    label="Active clients"
                          value={kpis.activeClients} />
              <MetricTile Icon={FileText} tone="amber" label="Notes written"
                          value={kpis.totalNotes} />
              <MetricTile Icon={Activity} tone="lilac" label="Total sessions"
                          value={kpis.totalSessions} />
            </div>
          </div>
        </Panel>

        {/* ── Upcoming sessions ── */}
        <Panel
          title="Upcoming sessions"
          action={{ onClick: () => navigate('/dashboard/appointments') }}
        >
          {upcomingSessions.length === 0 ? (
            <Empty>Nothing booked yet. Use “Schedule” above to add one.</Empty>
          ) : upcomingSessions.map((a) => (
            <PersonRow
              key={a.id}
              initials={initialsOf(a.clientName)}
              name={a.clientName || 'Client'}
              meta={a.therapyType || a.type || 'Therapy session'}
              when={whenLabel(a)}
              status={statusLabel(a)}
              statusTone={statusTone(a)}
              onClick={() => navigate('/dashboard/appointments')}
            />
          ))}
        </Panel>

        {/* ── Start a session ── */}
        <PromoCard
          Icon={Video}
          title="Start a session now"
          body="Open a secure video room with any of your clients, without scheduling ahead."
          action={{ label: 'Open video', onClick: () => navigate('/dashboard/video') }}
        />

        {/* ── Recent activity ── */}
        <Panel title="Recent activity" action={{ onClick: () => navigate('/dashboard/logs') }}>
          {recentActivities.length === 0 ? (
            <Empty>Nothing yet. Activity appears here as you work.</Empty>
          ) : recentActivities.slice(0, 5).map((act, i) => (
            <ActivityRow
              key={act.id || i}
              Icon={activityIcon(act)}
              tone={activityTone(act)}
              title={act.text || 'Activity'}
              time={act.time || ''}
            />
          ))}
        </Panel>

        {/* ── Tools, with real counts ── */}
        <Panel title="Your tools" subtitle="Everything you use between sessions.">
          <div className="nd-shortcuts">
            <ShortcutTile Icon={FileText} tone="violet" label="Notes"
              count={`${kpis.totalNotes} written`} onClick={() => navigate('/dashboard/notes')} />
            <ShortcutTile Icon={Heart} tone="rose" label="Client moods"
              count={`${clientProgress.length} tracked`} onClick={() => navigate('/dashboard/mood')} />
            <ShortcutTile Icon={ClipboardList} tone="teal" label="Check-ins"
              count="Follow-ups" onClick={() => navigate('/dashboard/check-ins')} />
            <ShortcutTile Icon={BookOpen} tone="gold" label="Resources"
              count="Share with clients" onClick={() => navigate('/dashboard/resources')} />
          </div>
        </Panel>

        {/* ── Needs attention ── */}
        <Panel title="Needs your attention">
          {attentionItems.length === 0 ? (
            <Empty>
              You are all clear — no unconfirmed sessions, unfinished notes or clients at risk.
            </Empty>
          ) : attentionItems.map((item) => (
            <ActivityRow
              key={item.key}
              Icon={item.icon}
              tone={item.severity === 'high' ? 'rose' : 'amber'}
              title={item.label}
              subtitle={item.detail}
              onClick={() => navigate(item.to)}
            />
          ))}
        </Panel>

        {/* ── Rail ──
            Moved down from beside the hero, which is now full width. These
            three sit with the charts so the row reads as one block of
            "how the practice is doing". ── */}
        <div className="nd-rail">
          <StatTile
            Icon={Clock} tone="lilac" label="Next session"
            value={nextSession ? (nextSession.clientName || 'Client') : 'None booked'}
            meta={nextSession ? whenLabel(nextSession) : 'Tap to open your calendar'}
            onClick={() => navigate('/dashboard/calendar')}
          />
          <StatTile
            Icon={Users} tone="green" label="Active clients"
            value={kpis.activeClients}
            meta="Currently assigned"
            onClick={() => navigate('/dashboard/clients')}
            trend={<Spark points={(weeklyData || []).map((w) => w.sessions)} tone="#15803d" />}
          />
          <StatTile
            Icon={FileText} tone={kpis.pendingNotes > 0 ? 'amber' : 'blue'}
            label="Notes to finish"
            value={kpis.pendingNotes}
            meta={kpis.pendingNotes > 0 ? 'Unsigned' : 'All caught up'}
            onClick={() => navigate('/dashboard/notes')}
          />
        </div>

        {/* ── Session activity ──
            The area chart was dropped in the first pass. It is real data —
            sessions per month — and drawn here as bars so the panel carries
            no charting dependency of its own. */}
        <Panel
          title="Session activity"
          subtitle="Sessions per month."
          span={1}
          action={{ label: 'Reports', onClick: () => navigate('/dashboard/reports') }}
        >
          {monthlySessions.length === 0 ? (
            <Empty>No sessions recorded yet.</Empty>
          ) : (
            <div className="nd-bars">
              {monthlySessions.map((m) => (
                <BarRow key={m.day} label={m.day} value={m.sessions}
                        max={maxMonthlySessions} tone="#5b5bd6" />
              ))}
            </div>
          )}
        </Panel>

        {/* ── Client progress ──
            Also dropped in the first pass, and it is the panel that answers
            "how are my people actually doing". */}
        <Panel
          title="Client progress"
          subtitle="Where each client is trending."
          action={{ label: 'Moods', onClick: () => navigate('/dashboard/mood') }}
        >
          {(clientProgress || []).length === 0 ? (
            <Empty>No progress recorded yet.</Empty>
          ) : clientProgress.slice(0, 6).map((c, i) => {
            // `progress` is the OBJECT calculateClientProgress returns —
            // { percent, direction, reliable } — not a number. progressLabel
            // destructures it, so passing a bare number silently rendered
            // "Not enough data" for every client.
            const pct = Number(c.progress?.percent ?? 0);
            const declining = c.progress?.direction === 'declining';
            const tone = declining ? '#a52121' : pct >= 50 ? '#12602f' : '#9a4f08';
            return (
              <ProgressRow
                key={c.cid || c.id || i}
                name={c.name || c.clientName || 'Client'}
                label={progressLabel(c.progress)}
                value={pct}
                tone={tone}
              />
            );
          })}
        </Panel>
      </DashboardGrid>

      <ScheduleCallModal
        open={!!scheduleDate}
        initialDate={scheduleDate}
        onClose={() => setScheduleDate(null)}
        onScheduled={() => { setScheduleDate(null); loadDashboardData(); }}
      />

      {/* Shared FAQ (backend /api/v1/faq) — same answers as the website and the app. */}
      <FaqSection compact audience="clinician" title="Questions & answers" />
    </div>
  );
}
