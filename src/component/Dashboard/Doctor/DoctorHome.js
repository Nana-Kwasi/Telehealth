import React, { useState, useEffect, useMemo } from 'react';
import {
  DashboardGrid, HeroBanner, StatTile, Panel, ScoreRing, MetricTile,
  PersonRow, ActivityRow, ShortcutTile, PromoCard, Empty,
  TopBar, Spark, BarRow,
} from '../../Common/dashboard/DashboardKit';
import WeatherCard from '../../Common/WeatherCard';
import DailyBrief from '../../Common/DailyBrief';
import SessionsToReview from '../../Common/SessionsToReview';
import InboxTriagePanel from '../../Common/InboxTriagePanel';
import clinicianHero from '../../../assets/clinician-hero.jpg';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, Clock, CheckCircle, AlertCircle, FileText,
  Video, TrendingUp, Activity, Pill, ChevronRight, Star,
  ChevronLeft, ShoppingBag, Search, X, FlaskConical, ClipboardList,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { db } from '../../../services/firestoreShim';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from '../../../services/firestoreShim';
import LocationSummaryCard from '../../Common/LocationSummaryCard';
import { dedupePatientPharmacies, hasPatientPharmacy } from '../../../utils/patientPharmacyDedupe';

import FaqSection from '../../Common/FaqSection';
const TODAY = new Date().toISOString().split('T')[0];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function StatCard({ icon: Icon, value, label, color, bg, onClick }) {
  return (
    <div className="doctor-stat-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="doctor-stat-icon" style={{ background: bg, color }}><Icon size={24} /></div>
      <div>
        <p className="doctor-stat-value">{value}</p>
        <p className="doctor-stat-label">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { pending: ['#fef3c7','#b45309'], confirmed: ['#dcfce7','#15803d'], completed: ['#f1f5f9','#475569'], cancelled: ['#fee2e2','#b91c1c'] };
  const [bg, color] = map[status] || map.pending;
  return (
    <span style={{ background: bg, color, padding: '0.15rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      {status || 'pending'}
    </span>
  );
}


/* ── Render helpers ───────────────────────────────────────────────────────
   All reading REAL appointment records. Defensive about shape because
   appointments arrive with three different date field names. */

function dApptDate(a) {
  const raw = a?.scheduledAt || a?.scheduledTime || a?.appointmentDate || a?.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function apptWhen(a) {
  const d = dApptDate(a);
  if (!d) return 'Time not set';
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today · ${time}`;
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${time}`;
}

function apptInitials(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';
}

function apptStatusLabel(a) {
  const s = String(a?.status || '').toLowerCase();
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'pending')   return 'Needs confirming';
  if (s === 'completed') return 'Completed';
  return 'Scheduled';
}

function apptStatusTone(a) {
  const s = String(a?.status || '').toLowerCase();
  if (s === 'confirmed') return 'confirmed';
  if (s === 'pending')   return 'alert';
  return 'scheduled';
}

function docActivityIcon(act) {
  const t = String(act?.type || act?.action || '').toLowerCase();
  if (t.includes('prescri')) return Pill;
  if (t.includes('lab') || t.includes('scan') || t.includes('diagnos')) return FlaskConical;
  if (t.includes('note'))    return FileText;
  if (t.includes('appoint') || t.includes('consult')) return Calendar;
  return Activity;
}

function docActivityTone(act) {
  const t = String(act?.type || act?.action || '').toLowerCase();
  if (t.includes('prescri')) return 'lilac';
  if (t.includes('lab') || t.includes('scan')) return 'teal';
  if (t.includes('note'))    return 'green';
  return 'blue';
}

export default function DoctorHome({ profile }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ patients: 0, todayAppts: 0, pending: 0, completed: 0, totalRevenue: 0, weekAppts: 0 });

  // Ticking clock for the hero. Declared with the other hooks so it can never
  // sit below an early return.
  const [clockNow, setClockNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [todayAppointments, setTodayAppointments] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [allAppts, setAllAppts] = useState([]);

  // E-Pharmacy modal
  const [showEPharmacy, setShowEPharmacy] = useState(false);
  const [ephForm, setEphForm] = useState({ name: '', address: '', phone: '' });
  const [selectedPatientIds, setSelectedPatientIds] = useState(new Set());
  const [ephSearch, setEphSearch] = useState('');
  const [savingEph, setSavingEph] = useState(false);
  const [ephSource, setEphSource] = useState('platform');
  const [ephPharmacies, setEphPharmacies] = useState([]);
  const [ephBranches, setEphBranches] = useState([]);
  const [ephPharmacyId, setEphPharmacyId] = useState('');
  const [ephPharmacyName, setEphPharmacyName] = useState('');
  const [ephBranchId, setEphBranchId] = useState('');
  const [ephBranchName, setEphBranchName] = useState('');
  const [ephLoadingPh, setEphLoadingPh] = useState(false);
  const [ephLoadingBranches, setEphLoadingBranches] = useState(false);

  // Calendar state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const greetingWord = (() => {
    const h = clockNow.getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();


  /** Soonest future consultation across everything loaded. */
  const nextAppt = useMemo(() => {
    const all = [...(todayAppointments || []), ...(allAppts || [])];
    const seen = new Set();
    return all
      .filter((a) => {
        if (!a?.id || seen.has(a.id)) return false;
        seen.add(a.id);
        const d = dApptDate(a);
        return d && d.getTime() > Date.now() - 3600000
          && String(a.status || '').toLowerCase() !== 'completed';
      })
      .sort((x, y) => dApptDate(x) - dApptDate(y))[0] || null;
  }, [todayAppointments, allAppts]);

  // Completed as a share of everything that is not still pending — the same
  // definition the analytics screen uses, so the two cannot disagree.
  const completionRate = (() => {
    const done = Number(stats.completed) || 0;
    const total = done + (Number(stats.pending) || 0) + (Number(stats.todayAppts) || 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  })();

  // Declared AFTER the state it reads. These sat above the useState calls,
  // so `allAppts` was in its temporal dead zone and the page threw
  // "Cannot access 'allAppts' before initialization" on first render.
  const doctorName = profile?.name || profile?.fullName || 'Doctor';

  /** Consultations grouped by month, newest twelve. Built from the real
      appointment records already loaded, not a second fetch. */
  const monthlyAppts = useMemo(() => {
    const buckets = new Map();
    (allAppts || []).forEach((a) => {
      const d = dApptDate(a);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { month: 'short' });
      const cur = buckets.get(key) || { label, count: 0 };
      cur.count += 1;
      buckets.set(key, cur);
    });
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12).map(([, v]) => v);
  }, [allAppts]);

  const maxMonthlyAppts = useMemo(
    () => Math.max(1, ...monthlyAppts.map((m) => m.count)),
    [monthlyAppts],
  );

  useEffect(() => { if (profile?.id) loadDashboardData(); }, [profile]);

  useEffect(() => {
    if (!showEPharmacy) return;
    let cancelled = false;
    (async () => {
      setEphLoadingPh(true);
      try {
        const snap = await getDocs(query(collection(db, 'pharmacies'), where('status', '==', 'active')));
        if (!cancelled) setEphPharmacies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        if (!cancelled) setEphPharmacies([]);
      } finally {
        if (!cancelled) setEphLoadingPh(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showEPharmacy]);

  const loadEphBranches = async (pharmacyId) => {
    if (!pharmacyId) {
      setEphBranches([]);
      return;
    }
    setEphLoadingBranches(true);
    setEphBranches([]);
    try {
      const snap = await getDocs(query(
        collection(db, 'pharmacyBranches'),
        where('pharmacyId', '==', pharmacyId),
        where('status', '==', 'active'),
      ));
      setEphBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      setEphBranches([]);
    } finally {
      setEphLoadingBranches(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const apptsQ = query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id));
      const apptsSnap = await getDocs(apptsQ);
      const appts = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const todayAppts = appts.filter(a => a.date === TODAY).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const pendingAppts = appts.filter(a => a.status === 'pending');
      const completedAppts = appts.filter(a => a.status === 'completed');

      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = weekEnd.toISOString().split('T')[0];
      const weekAppts = appts.filter(a => a.date >= TODAY && a.date <= weekEndStr && a.status !== 'cancelled');

      const totalRevenue = completedAppts.reduce((sum, a) => sum + (Number(a.consultationFee) || 0), 0);

      const patientMap = new Map();
      for (const a of appts) {
        if (a.clientId && !patientMap.has(a.clientId)) {
          patientMap.set(a.clientId, { id: a.clientId, name: a.clientName || 'Patient', lastDate: a.date || '' });
        }
        if (a.clientId && a.date > (patientMap.get(a.clientId)?.lastDate || '')) {
          patientMap.get(a.clientId).lastDate = a.date;
        }
      }
      const allPatients = Array.from(patientMap.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));

      const activity = [...appts]
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 6);

      setStats({
        patients: patientMap.size,
        todayAppts: todayAppts.length,
        pending: pendingAppts.length,
        completed: completedAppts.length,
        totalRevenue,
        weekAppts: weekAppts.length,
      });
      setTodayAppointments(todayAppts);
      setRecentPatients(allPatients.slice(0, 5));
      setRecentActivity(activity);
      setAllAppts(appts);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  };

  // ── E-Pharmacy helpers ─────────────────────────────────────────
  const allPatientsList = useMemo(() => {
    const patMap = new Map();
    allAppts.forEach(a => {
      if (!a.clientId) return;
      if (!patMap.has(a.clientId)) patMap.set(a.clientId, { id: a.clientId, name: a.clientName || 'Patient' });
    });
    return Array.from(patMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allAppts]);

  const ephPatients = useMemo(() => {
    if (!ephSearch.trim()) return allPatientsList;
    const q = ephSearch.toLowerCase();
    return allPatientsList.filter(p => p.name.toLowerCase().includes(q));
  }, [allPatientsList, ephSearch]);

  const toggleEphPatient = (id) => setSelectedPatientIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const openEPharmacy = () => {
    setEphForm({ name: '', address: '', phone: '' });
    setSelectedPatientIds(new Set());
    setEphSearch('');
    setEphSource('platform');
    setEphPharmacyId('');
    setEphPharmacyName('');
    setEphBranchId('');
    setEphBranchName('');
    setEphBranches([]);
    setShowEPharmacy(true);
  };

  const saveEPharmacy = async () => {
    if (selectedPatientIds.size === 0) { alert('Select at least one patient.'); return; }

    let pharmacy;
    if (ephSource === 'platform') {
      if (!ephPharmacyId || !ephBranchId) {
        alert('Select a pharmacy and branch from the platform directory.');
        return;
      }
      const ph = ephPharmacies.find(p => p.id === ephPharmacyId);
      const br = ephBranches.find(b => b.id === ephBranchId);
      const lineName = [ephBranchName, ephPharmacyName].filter(Boolean).join(' · ');
      pharmacy = {
        name: lineName,
        address: (br?.address || ph?.address || '').trim(),
        country: (br?.country || ph?.country || br?.location?.country || ph?.location?.country || '').trim(),
        city: (br?.city || ph?.city || br?.location?.city || ph?.location?.city || '').trim(),
        area: (br?.area || ph?.area || br?.location?.area || ph?.location?.area || '').trim(),
        region: (br?.region || ph?.region || br?.location?.region || ph?.location?.region || '').trim(),
        street: (br?.street || ph?.street || br?.location?.street || ph?.location?.street || '').trim(),
        ghanaDigitalAddress: (br?.ghanaDigitalAddress || ph?.ghanaDigitalAddress || '').trim(),
        latitude: Number.isFinite(Number(br?.latitude ?? ph?.latitude ?? br?.location?.latitude ?? ph?.location?.latitude))
          ? Number(br?.latitude ?? ph?.latitude ?? br?.location?.latitude ?? ph?.location?.latitude)
          : null,
        longitude: Number.isFinite(Number(br?.longitude ?? ph?.longitude ?? br?.location?.longitude ?? ph?.location?.longitude))
          ? Number(br?.longitude ?? ph?.longitude ?? br?.location?.longitude ?? ph?.location?.longitude)
          : null,
        phone: (br?.phone || ph?.phone || '').trim(),
        pharmacyId: ephPharmacyId,
        branchId: ephBranchId,
        pharmacyName: ephPharmacyName,
        branchName: ephBranchName,
        source: 'platform',
        addedByDoctor: true,
        addedAt: new Date().toISOString(),
      };
    } else {
      if (!ephForm.name.trim()) { alert('Pharmacy name is required.'); return; }
      pharmacy = {
        name: ephForm.name.trim(),
        address: ephForm.address.trim(),
        country: '',
        city: '',
        area: '',
        region: '',
        street: '',
        ghanaDigitalAddress: '',
        latitude: null,
        longitude: null,
        phone: ephForm.phone.trim(),
        source: 'manual',
        addedByDoctor: true,
        addedAt: new Date().toISOString(),
      };
    }

    setSavingEph(true);
    try {
      let added = 0;
      let skippedDup = 0;
      for (const patientId of selectedPatientIds) {
        const patRef = doc(db, 'patientProfiles', patientId);
        const snap = await getDoc(patRef);
        const cleaned = dedupePatientPharmacies(snap.exists() ? (snap.data().pharmacies || []) : []);
        if (hasPatientPharmacy(cleaned, pharmacy)) {
          skippedDup += 1;
          continue;
        }
        await setDoc(patRef, { pharmacies: [...cleaned, pharmacy] }, { merge: true });
        added += 1;
      }
      setShowEPharmacy(false);
      const parts = [];
      if (added) parts.push(`Added to ${added} patient${added > 1 ? 's' : ''}.`);
      if (skippedDup) parts.push(`${skippedDup} skipped (branch already on file).`);
      alert(parts.join(' ') || 'No changes.');
    } catch (err) {
      console.error('E-Pharmacy save error:', err);
      alert('Failed to save. Please try again.');
    }
    setSavingEph(false);
  };

  // ── Calendar helpers ─────────────────────────────────────────
  const apptsByDate = allAppts.reduce((acc, a) => {
    if (!a.date || a.status === 'cancelled') return acc;
    acc[a.date] = (acc[a.date] || []);
    acc[a.date].push(a);
    return acc;
  }, {});

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDOW = (y, m) => new Date(y, m, 1).getDay();
  const toDS = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const calCells = () => {
    const cells = [];
    for (let i = 0; i < firstDOW(calYear, calMonth); i++) cells.push(null);
    for (let d = 1; d <= daysInMonth(calYear, calMonth); d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  // ── Charts data ──────────────────────────────────────────────
  const buildMonthlyTrend = () => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();
      const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
      const monthAppts = allAppts.filter(a => a.date?.startsWith(prefix));
      months.push({
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        appointments: monthAppts.length,
        completed: monthAppts.filter(a => a.status === 'completed').length,
        patients: new Set(monthAppts.map(a => a.clientId)).size,
      });
    }
    return months;
  };

  const buildStatusPie = () => {
    const groups = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    allAppts.forEach(a => { if (groups[a.status] !== undefined) groups[a.status]++; });
    return [
      { name: 'Completed', value: groups.completed, color: '#2563eb' },
      { name: 'Confirmed', value: groups.confirmed, color: '#16a34a' },
      { name: 'Pending',   value: groups.pending,   color: '#f59e0b' },
      { name: 'Cancelled', value: groups.cancelled,  color: '#ef4444' },
    ].filter(s => s.value > 0);
  };

  const monthlyData = buildMonthlyTrend();
  const pieData = buildStatusPie();

  const fmtCurrency = (n) => n > 0 ? `$${n.toLocaleString()}` : '$0';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayFmt = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="dashboard-home nd-home">
      <TopBar
        placeholder="Search patients, prescriptions or appointments…"
        onSearch={(q) => navigate(`/dashboard/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`)}
        pill={{ Icon: Activity, title: 'Your clinic', subtitle: 'at a glance' }}
        avatar={profile?.photoURL}
        name={doctorName}
        onAvatar={() => navigate('/dashboard/settings')}
      />

      <DashboardGrid>
        {/* ── Hero ── */}
        <HeroBanner
          greeting={greetingWord}
          name={doctorName}
          headline="Your clinic"
          accent="at a glance"
          body={
            nextAppt
              ? `Your next consultation is with ${nextAppt.patientName || 'a patient'} ${apptWhen(nextAppt)}.`
              : 'No consultations booked yet. Patients who book will appear here.'
          }
          actions={[
            { label: 'Start a consultation', Icon: Video, onClick: () => navigate('/dashboard/video') },
            { label: 'Appointments', Icon: Calendar, onClick: () => navigate('/dashboard/appointments') },
          ]}
          wide
          art={clinicianHero}
          aside={
            <div className="nd-hero-meta">
              <div className="nd-hero-clock">
                <span className="nd-hero-time">
                  {clockNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="nd-hero-date">
                  {clockNow.toLocaleDateString(undefined,
                    { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
              {/* Weather moved here from the stat rail. */}
              <div className="nd-hero-weather">
                <WeatherCard profile={profile} compact />
              </div>
            </div>
          }
        />

        {/* Counted server-side; the model only writes the sentence over those
            figures, so the card is right even when the model is not there. */}
        <DailyBrief role="DOCTOR" />

        {/* Transcribed consultations whose notes are not saved yet. */}
        <SessionsToReview />

        {/* The companion to the brief's unread count: which of them need you
            first. Sorted on request, because it costs a model call per message. */}
        <InboxTriagePanel />

        {/* ── Clinic overview ── */}
        <Panel
          title="Clinic overview"
          subtitle="How your consultations are running."
          action={{ label: 'Analytics', onClick: () => navigate('/dashboard/analytics') }}
        >
          <div className="nd-overview">
            <ScoreRing
              value={completionRate}
              label="Completion rate"
              caption="Consultations completed"
              tone="#5b5bd6"
            />
            <div className="nd-metrics">
              <MetricTile Icon={Calendar} tone="blue"   label="Today"
                          value={stats.todayAppts} />
              <MetricTile Icon={CheckCircle} tone="green" label="Completed"
                          value={stats.completed} />
              <MetricTile Icon={Clock} tone="amber"     label="Pending"
                          value={stats.pending} />
              <MetricTile Icon={Activity} tone="lilac"  label="This week"
                          value={stats.weekAppts} />
            </div>
          </div>
        </Panel>

        {/* ── Today's consultations ── */}
        <Panel
          title="Today's consultations"
          action={{ onClick: () => navigate('/dashboard/appointments') }}
        >
          {(todayAppointments || []).length === 0 ? (
            <Empty>Nothing booked for today.</Empty>
          ) : todayAppointments.slice(0, 4).map((a) => (
            <PersonRow
              key={a.id}
              initials={apptInitials(a.patientName)}
              name={a.patientName || 'Patient'}
              meta={a.reason || a.type || 'Consultation'}
              when={apptWhen(a)}
              status={apptStatusLabel(a)}
              statusTone={apptStatusTone(a)}
              onClick={() => navigate('/dashboard/appointments')}
            />
          ))}
        </Panel>

        {/* ── Start a consultation ── */}
        <PromoCard
          Icon={Video}
          title="Start a consultation"
          body="Open a secure video room with a patient without scheduling ahead."
          action={{ label: 'Open video', onClick: () => navigate('/dashboard/video') }}
        />

        {/* ── Recent activity ── */}
        <Panel title="Recent activity">
          {(recentActivity || []).length === 0 ? (
            <Empty>Nothing yet. Activity appears here as you work.</Empty>
          ) : recentActivity.slice(0, 5).map((act, i) => (
            <ActivityRow
              key={act.id || i}
              Icon={docActivityIcon(act)}
              tone={docActivityTone(act)}
              title={act.title || act.action || 'Activity'}
              subtitle={act.subtitle || act.detail || act.patientName}
              time={act.timeAgo || act.time || ''}
            />
          ))}
        </Panel>

        {/* ── Tools ── */}
        <Panel title="Your tools" subtitle="Everything you use between consultations.">
          <div className="nd-shortcuts">
            <ShortcutTile Icon={Pill} tone="violet" label="Prescriptions"
              count="Write & review" onClick={() => navigate('/dashboard/prescriptions')} />
            <ShortcutTile Icon={FlaskConical} tone="teal" label="Lab & scans"
              count="Order tests" onClick={() => navigate('/dashboard/diagnostic-order')} />
            <ShortcutTile Icon={FileText} tone="green" label="Notes"
              count="Consultation notes" onClick={() => navigate('/dashboard/notes')} />
            <ShortcutTile Icon={ClipboardList} tone="gold" label="Check-ins"
              count="Follow-ups" onClick={() => navigate('/dashboard/check-ins')} />
          </div>
        </Panel>

        <Panel title="Quick actions">
          <div className="nd-quick">
            {/* One colour per action, so a doctor reaching for the same thing
                twice finds it by colour before they read the label. Every pair
                is measured against its own circle — see dashboard.css. */}
            {[
              { Icon: AlertCircle, label: 'Pending', badge: stats.pending, path: '/dashboard/appointments', tone: 'amber' },
              { Icon: Users,       label: 'Patients',      path: '/dashboard/patients',      tone: 'blue' },
              { Icon: FileText,    label: 'Write note',    path: '/dashboard/notes',         tone: 'violet' },
              { Icon: Pill,        label: 'Prescriptions', path: '/dashboard/prescriptions', tone: 'green' },
              { Icon: Video,       label: 'Video calls',   path: '/dashboard/video',         tone: 'sky' },
              { Icon: Star,        label: 'Reviews',       path: '/dashboard/reviews',       tone: 'gold' },
              { Icon: ShoppingBag, label: 'E-Pharmacy',    onPress: openEPharmacy,           tone: 'teal' },
            ].map(({ Icon, label, badge, path, onPress, tone }) => (
              <button
                key={label}
                type="button"
                className="nd-quick-btn"
                onClick={() => (onPress ? onPress() : navigate(path))}
                title={label}
              >
                <span className={`nd-quick-circle nd-circle-${tone}`}>
                  <Icon size={19} />
                  {/* Only drawn when there is something waiting — a "0" badge
                      is noise that trains people to ignore the real one. */}
                  {badge > 0 ? <span className="nd-quick-badge">{badge}</span> : null}
                </span>
                <span className="nd-quick-label">{label}</span>
              </button>
            ))}
          </div>
        </Panel>

        {/* ── Consultation activity ── */}
        {/* ── Rail ──
            Moved down from beside the hero, which is now full width, to sit
            with the activity charts. ── */}
        <div className="nd-rail">
          <StatTile
            Icon={Clock} tone="lilac" label="Next consultation"
            value={nextAppt ? (nextAppt.patientName || 'Patient') : 'None booked'}
            meta={nextAppt ? apptWhen(nextAppt) : 'Open your appointments'}
            onClick={() => navigate('/dashboard/appointments')}
          />
          <StatTile
            Icon={Users} tone="green" label="Patients"
            value={stats.patients} meta="Under your care"
            onClick={() => navigate('/dashboard/patients')}
            trend={<Spark points={monthlyAppts.map((m) => m.count)} tone="#15803d" />}
          />
          <StatTile
            Icon={CheckCircle} tone={stats.pending > 0 ? 'amber' : 'blue'}
            label="Pending confirmations"
            value={stats.pending}
            meta={stats.pending > 0 ? 'Waiting on you' : 'All confirmed'}
            onClick={() => navigate('/dashboard/appointments')}
          />
        </div>

        <Panel
          title="Consultation activity"
          subtitle="Consultations per month."
          span={1}
          action={{ label: 'Analytics', onClick: () => navigate('/dashboard/analytics') }}
        >
          {monthlyAppts.length === 0 ? (
            <Empty>No consultations recorded yet.</Empty>
          ) : (
            <div className="nd-bars">
              {monthlyAppts.map((m) => (
                <BarRow key={m.label} label={m.label} value={m.count}
                        max={maxMonthlyAppts} tone="#5b5bd6" />
              ))}
            </div>
          )}
        </Panel>

        {/* Today's schedule fills the third column of that row. */}
        <div className="nd-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Today's Schedule</h3>
            <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => navigate('/dashboard/appointments')}>View all</button>
          </div>
          {todayAppointments.length === 0 ? (
            <div className="doctor-empty-state">
              <Calendar size={36} color="#cbd5e1" />
              <h3>No appointments today</h3>
              <p>Check pending bookings or update your availability.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {todayAppointments.map(appt => (
                <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.8rem', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>{appt.time?.split(':')[0] || '--'}</p>
                    <p style={{ margin: 0, fontSize: '0.6rem', color: '#93c5fd', fontWeight: 600 }}>{appt.time?.includes(':') ? ':' + appt.time.split(':')[1] : 'AM'}</p>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appt.clientName || 'Patient'}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', textTransform: 'capitalize' }}>{appt.consultationType || 'Video'} &bull; {appt.doctorSpecialization || profile?.specialization || ''}</p>
                  </div>
                  <StatusBadge status={appt.status} />
                  {appt.status === 'confirmed' && (
                    <button className="doctor-btn doctor-btn-primary doctor-btn-sm" onClick={() => navigate('/dashboard/video')} style={{ padding: '0.4rem 0.7rem', gap: 0 }}>
                      <Video size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>


        {/* ── Appointment calendar ──
            Doctor-specific and removed in the conversion. Restored: it is the
            only place a doctor sees which days have appointments at a glance,
            and the therapist dashboard has no equivalent because their
            calendar lives on its own screen. */}
        <Panel
          title="Appointment calendar"
          subtitle="Highlighted dates have appointments."
          span={2}
          action={{ label: 'Appointments', onClick: () => navigate('/dashboard/appointments') }}
        >
          <div className="nd-cal-head">
            <button
              type="button"
              className="nd-cal-nav"
              onClick={() => { if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); } else setCalMonth((m) => m - 1); }}
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="nd-cal-month">{MONTHS[calMonth]} {calYear}</span>
            <button
              type="button"
              className="nd-cal-nav"
              onClick={() => { if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); } else setCalMonth((m) => m + 1); }}
              aria-label="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', padding: '0.25rem 0' }}>{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {calCells().map((day, idx) => {
            if (!day) return <div key={idx} />;
            const ds = toDS(calYear, calMonth, day);
            const dayAppts = apptsByDate[ds] || [];
            const isToday = ds === TODAY;
            const hasPending = dayAppts.some(a => a.status === 'pending');
            const hasConfirmed = dayAppts.some(a => a.status === 'confirmed');
            const hasCompleted = dayAppts.some(a => a.status === 'completed');
            const dotColor = hasPending ? '#f59e0b' : hasConfirmed ? '#16a34a' : hasCompleted ? '#2563eb' : null;

            return (
              <div
                key={idx}
                onClick={() => dayAppts.length > 0 && navigate('/dashboard/appointments')}
                style={{
                  minHeight: 56,
                  borderRadius: 10,
                  padding: '0.4rem 0.3rem',
                  background: isToday ? '#eff6ff' : dayAppts.length > 0 ? '#f8fafc' : 'white',
                  border: isToday ? '2px solid #2563eb' : dayAppts.length > 0 ? '1.5px solid #e2e8f0' : '1px solid #f1f5f9',
                  cursor: dayAppts.length > 0 ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                }}
                onMouseEnter={e => { if (dayAppts.length > 0) e.currentTarget.style.background = '#eff6ff'; }}
                onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = dayAppts.length > 0 ? '#f8fafc' : 'white'; }}
              >
                <span style={{ fontSize: '0.78rem', fontWeight: isToday ? 800 : 500, color: isToday ? '#2563eb' : '#0f172a' }}>{day}</span>
                {dayAppts.length > 0 && (
                  <>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: dotColor || '#64748b', background: dotColor ? dotColor + '20' : '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>
                      {dayAppts.length} appt{dayAppts.length > 1 ? 's' : ''}
                    </span>
                    {dayAppts.slice(0, 2).map((a, i) => (
                      <div key={i} style={{ width: '100%', background: '#eff6ff', borderRadius: 4, padding: '1px 3px', fontSize: '0.58rem', color: '#1e40af', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.time || '—'} {(a.clientName || 'Patient').split(' ')[0]}
                      </div>
                    ))}
                    {dayAppts.length > 2 && <span style={{ fontSize: '0.58rem', color: '#94a3b8' }}>+{dayAppts.length - 2} more</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {[['#f59e0b','Pending'],['#16a34a','Confirmed'],['#2563eb','Completed']].map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#64748b' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{label}
            </div>
          ))}
        </div>
        </Panel>

        {/* ── Quick actions ──
            Also doctor-specific: it is the only route to the E-Pharmacy modal,
            which has no therapist counterpart. */}


        {/* ── Recent patients ── */}
        <Panel title="Recent patients" action={{ onClick: () => navigate('/dashboard/patients') }}>
          {(recentPatients || []).length === 0 ? (
            <Empty>No patients yet.</Empty>
          ) : recentPatients.slice(0, 5).map((p, i) => (
            <PersonRow
              key={p.id || i}
              initials={apptInitials(p.name || p.fullName)}
              name={p.name || p.fullName || 'Patient'}
              meta={p.email || p.condition || ''}
              onClick={() => navigate('/dashboard/patients')}
            />
          ))}
        </Panel>


        {/* ── Appointment trends (2) + Session breakdown (1) = a full row ── */}
        <div className="nd-panel nd-span-2">
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Appointment Trends (6 months)</h3>
          {allAppts.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="apptGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem' }} />
                <Area type="monotone" dataKey="appointments" name="Appointments" stroke="#2563eb" strokeWidth={2} fill="url(#apptGrad)" dot={{ r: 3, fill: '#2563eb' }} />
                <Area type="monotone" dataKey="patients" name="Unique Patients" stroke="#7c3aed" strokeWidth={2} fill="url(#patGrad)" dot={{ r: 3, fill: '#7c3aed' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="doctor-empty-state" style={{ height: 200 }}>
              <TrendingUp size={36} color="#cbd5e1" /><p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>No data yet — trends will appear as appointments are booked.</p>
            </div>
          )}
        </div>

        <div className="nd-panel">
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Session Breakdown</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.78rem' }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                {pieData.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#475569' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                      {s.name}
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="doctor-empty-state" style={{ height: 200 }}>
              <Activity size={36} color="#cbd5e1" /><p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>No appointment data yet.</p>
            </div>
          )}
        </div>

      {allAppts.length > 0 && (
        <div className="nd-panel nd-span-3">
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Monthly Completed vs Pending</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem' }} />
              <Bar dataKey="completed" name="Completed" fill="#2563eb" radius={[4,4,0,0]} />
              <Bar dataKey="appointments" name="Total Booked" fill="#bfdbfe" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}




      </DashboardGrid>

      {showEPharmacy && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowEPharmacy(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShoppingBag size={20} color="#0f766e" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Add E-Pharmacy</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Assign a pharmacy to your patients</p>
              </div>
              <button onClick={() => setShowEPharmacy(false)} style={{ width: 34, height: 34, borderRadius: 17, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#64748b" />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setEphSource('platform')}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: 10, border: ephSource === 'platform' ? '2px solid #0f766e' : '1.5px solid #e2e8f0', background: ephSource === 'platform' ? '#f0fdfa' : '#fff', fontWeight: 700, fontSize: '0.78rem', color: ephSource === 'platform' ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                  Platform directory
                </button>
                <button type="button" onClick={() => setEphSource('manual')}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: 10, border: ephSource === 'manual' ? '2px solid #0f766e' : '1.5px solid #e2e8f0', background: ephSource === 'manual' ? '#f0fdfa' : '#fff', fontWeight: 700, fontSize: '0.78rem', color: ephSource === 'manual' ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                  Enter manually
                </button>
              </div>

              {/* Pharmacy details */}
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                  {ephSource === 'platform' ? 'Choose e-pharmacy (onboarded)' : 'Pharmacy details'}
                </p>
                {ephSource === 'platform' ? (
                  <>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.45 }}>Same directory as when routing prescriptions — only admin-approved (<code style={{ fontSize: '0.7rem' }}>active</code>) pharmacies and branches.</p>
                    {ephLoadingPh ? <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Loading pharmacies…</p>
                      : ephPharmacies.length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309' }}>No active pharmacies. Use &quot;Enter manually&quot; or ask admin to approve the pharmacy in Account Approvals.</p>
                      ) : (
                        <>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Pharmacy</label>
                          <select
                            value={ephPharmacyId}
                            onChange={e => {
                              const id = e.target.value;
                              const ph = ephPharmacies.find(p => p.id === id);
                              setEphPharmacyId(id);
                              setEphPharmacyName(ph ? (ph.pharmacyName || ph.name || '') : '');
                              setEphBranchId('');
                              setEphBranchName('');
                              loadEphBranches(id);
                            }}
                            style={{ border: '1.5px solid #bae6fd', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff' }}
                          >
                            <option value="">— Select pharmacy —</option>
                            {ephPharmacies.map(ph => (
                              <option key={ph.id} value={ph.id}>{ph.pharmacyName || ph.name || 'Pharmacy'}</option>
                            ))}
                          </select>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginTop: 4 }}>Branch</label>
                          <select
                            value={ephBranchId}
                            disabled={!ephPharmacyId || ephLoadingBranches}
                            onChange={e => {
                              const id = e.target.value;
                              const br = ephBranches.find(b => b.id === id);
                              setEphBranchId(id);
                              setEphBranchName(br ? (br.branchName || '') : '');
                            }}
                            style={{ border: '1.5px solid #bae6fd', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff', opacity: !ephPharmacyId ? 0.55 : 1 }}
                          >
                            <option value="">{ephLoadingBranches ? 'Loading…' : !ephPharmacyId ? 'Select pharmacy first' : ephBranches.length === 0 ? 'No active branches' : '— Select branch —'}</option>
                            {ephBranches.map(br => (
                              <option key={br.id} value={br.id}>{br.branchName || 'Branch'}</option>
                            ))}
                          </select>
                        </>
                      )}
                  </>
                ) : (
                  <>
                    <input style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.875rem', fontSize: '0.875rem', color: '#0f172a', outline: 'none', background: '#fff' }}
                      placeholder="Pharmacy name *" value={ephForm.name} onChange={e => setEphForm(f => ({ ...f, name: e.target.value }))} />
                    <input style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.875rem', fontSize: '0.875rem', color: '#0f172a', outline: 'none', background: '#fff' }}
                      placeholder="Address (optional)" value={ephForm.address} onChange={e => setEphForm(f => ({ ...f, address: e.target.value }))} />
                    <input style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.875rem', fontSize: '0.875rem', color: '#0f172a', outline: 'none', background: '#fff' }}
                      placeholder="Phone number (optional)" value={ephForm.phone} onChange={e => setEphForm(f => ({ ...f, phone: e.target.value }))} />
                  </>
                )}
              </div>

              {/* Patient selection */}
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>Select Patients</p>
                  {selectedPatientIds.size > 0 && (
                    <span style={{ background: '#0f766e', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: 12 }}>{selectedPatientIds.size} selected</span>
                  )}
                </div>
                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.5rem 0.75rem', marginBottom: '0.625rem' }}>
                  <Search size={14} color="#94a3b8" />
                  <input style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.875rem', color: '#0f172a', background: 'transparent' }}
                    placeholder="Search patients…" value={ephSearch} onChange={e => setEphSearch(e.target.value)} />
                </div>
                {/* Patient list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 240, overflowY: 'auto' }}>
                  {allPatientsList.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '1rem 0' }}>No patients found</p>
                  ) : ephPatients.map(p => {
                    const isSel = selectedPatientIds.has(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => toggleEphPatient(p.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 10, border: `1.5px solid ${isSel ? '#5eead4' : '#e2e8f0'}`, background: isSel ? '#f0fdfa' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 17, background: isSel ? '#0f766e' : '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSel ? '#fff' : '#0284c7' }}>{(p.name || 'P')[0].toUpperCase()}</span>
                        </div>
                        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: isSel ? '#0f766e' : '#334155' }}>{p.name}</span>
                        <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isSel ? '#0f766e' : '#cbd5e1'}`, background: isSel ? '#0f766e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSel && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={saveEPharmacy}
                disabled={
                  savingEph
                  || selectedPatientIds.size === 0
                  || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId))
                  || (ephSource === 'manual' && !ephForm.name.trim())
                }
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem', borderRadius: 12, border: 'none',
                  background: (selectedPatientIds.size === 0 || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId)) || (ephSource === 'manual' && !ephForm.name.trim())) ? '#e2e8f0' : '#0f766e',
                  color: (selectedPatientIds.size === 0 || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId)) || (ephSource === 'manual' && !ephForm.name.trim())) ? '#94a3b8' : '#fff',
                  fontWeight: 700, fontSize: '0.9rem',
                  cursor: (selectedPatientIds.size === 0 || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId)) || (ephSource === 'manual' && !ephForm.name.trim())) ? 'not-allowed' : 'pointer',
                  opacity: savingEph ? 0.65 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <ShoppingBag size={16} />
                {savingEph ? 'Saving…'
                  : selectedPatientIds.size === 0 ? 'Select patients first'
                    : ephSource === 'manual' && !ephForm.name.trim() ? 'Enter pharmacy name'
                      : ephSource === 'platform' && (!ephPharmacyId || !ephBranchId) ? 'Select pharmacy & branch'
                        : `Add to ${selectedPatientIds.size} Patient${selectedPatientIds.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared FAQ (backend /api/v1/faq) — same answers as the website and the app. */}
      <FaqSection compact audience="clinician" title="Questions & answers" />
    </div>
  );
}
