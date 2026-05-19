import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import {
  isMedicalPatientAuthDoc,
  buildTherapyLinkedAuthUidSet,
  buildHomeCareNurseUidSet,
} from '../../../utils/authUserFilters';

const QUICK_ACTIONS = [
  { icon: '🩺', label: 'Onboard Doctor',    path: '/dashboard/onboard-doctor' },
  { icon: '🧠', label: 'Onboard Therapist', path: '/dashboard/onboard-therapist' },
  { icon: '💊', label: 'Create Pharmacy',   path: '/dashboard/create-pharmacy' },
  { icon: '🧪', label: 'Create Lab/Scan',   path: '/dashboard/create-lab-scan' },
  { icon: '✅', label: 'Approvals',         path: '/dashboard/approvals' },
  { icon: '👥', label: 'Manage Users',      path: '/dashboard/users' },
  { icon: '📊', label: 'View Reports',      path: '/dashboard/reports' },
  { icon: '📩', label: 'Reports & Feedback',path: '/dashboard/reports-center' },
];

export default function AdminOverview() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    patients: 0, doctors: 0, therapists: 0, nurses: 0, pharmacies: 0,
    labs: 0, scanCenters: 0, prescriptions: 0, appointments: 0,
    doctorAppointments: 0, therapyScheduledCalls: 0, homeCareBookings: 0,
    labOrders: 0, scanOrders: 0,
  });
  const [alerts, setAlerts]             = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [location, setLocation]         = useState({ country: '—', city: '—', ip: '—', flag: '' });
  const [loading, setLoading]           = useState(true);
  const [now, setNow]                   = useState(new Date());
  const [analyticsPeriod, setAnalyticsPeriod] = useState('30d');
  const [analyticsRaw, setAnalyticsRaw] = useState({
    allRx: [],
    allHcBookings: [],
    allScheduledCalls: [],
    providerBase: { doctors: 0, therapists: 0, pharmacies: 0, labs: 0, scans: 0, homeCareNurses: 0 },
  });
  const [analytics, setAnalytics]       = useState({
    line: [],
    pie: [],
    bar: [],
    topDoctors: [],
    topPharmacies: [],
  });
  const [locationCoverage, setLocationCoverage] = useState([]);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // IP-based location
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(d => setLocation({
        country: d.country_name || '—',
        city: d.city || '—',
        region: d.region || '',
        ip: d.ip || '—',
        flag: d.country_code ? `https://flagcdn.com/24x18/${d.country_code.toLowerCase()}.png` : '',
        timezone: d.timezone || '',
        currency: d.currency || '',
        org: d.org || '',
      }))
      .catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (
      analyticsRaw.allRx.length ||
      analyticsRaw.allHcBookings?.length ||
      analyticsRaw.allScheduledCalls?.length ||
      Object.values(analyticsRaw.providerBase).some(Boolean)
    ) {
      setAnalytics(
        buildAnalytics(
          analyticsRaw.allRx,
          analyticsRaw.allHcBookings || [],
          analyticsRaw.allScheduledCalls || [],
          analyticsRaw.providerBase,
          analyticsPeriod
        )
      );
    }
  }, [analyticsPeriod, analyticsRaw]);

  const getWindowStartMs = (period) => {
    const nowMs = Date.now();
    if (period === '7d') return nowMs - (7 * 24 * 60 * 60 * 1000);
    if (period === '30d') return nowMs - (30 * 24 * 60 * 60 * 1000);
    if (period === '90d') return nowMs - (90 * 24 * 60 * 60 * 1000);
    return 0;
  };

  const therapyActivityMs = (c = {}) => {
    if (c?.createdAt?.seconds) return c.createdAt.seconds * 1000;
    if (c?.scheduledTime?.seconds) return c.scheduledTime.seconds * 1000;
    return 0;
  };

  const buildAnalytics = (allRx = [], allHcBookings = [], allScheduledCalls = [], providerBase = {}, period = '30d') => {
    const windowStartMs = getWindowStartMs(period);
    const filteredRx = !windowStartMs
      ? allRx
      : allRx.filter((rx) => {
          const ms = rx?.createdAt?.seconds ? rx.createdAt.seconds * 1000 : 0;
          return ms >= windowStartMs;
        });
    const filteredHc = !windowStartMs
      ? allHcBookings
      : allHcBookings.filter((b) => {
          const ms = b?.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
          return ms >= windowStartMs;
        });
    const filteredTh = !windowStartMs
      ? allScheduledCalls
      : allScheduledCalls.filter((c) => therapyActivityMs(c) >= windowStartMs);

    const dayCount = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 14;
    const tick = period === '7d' ? 1 : period === '30d' ? 5 : period === '90d' ? 15 : 1;
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const lineBuckets = Array.from({ length: dayCount }, (_, i) => {
      const dt = new Date();
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() - (dayCount - 1 - i));
      const dayStart = dt.getTime();
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      const rxCount = filteredRx.filter((rx) => {
        const ms = rx?.createdAt?.seconds ? rx.createdAt.seconds * 1000 : 0;
        return ms >= dayStart && ms < dayEnd;
      }).length;
      const hcCount = filteredHc.filter((b) => {
        const ms = b?.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
        return ms >= dayStart && ms < dayEnd;
      }).length;
      const thCount = filteredTh.filter((c) => {
        const ms = therapyActivityMs(c);
        return ms >= dayStart && ms < dayEnd;
      }).length;
      const value = rxCount + hcCount + thCount;
      const label = (i % tick === 0 || i === dayCount - 1) ? weekDays[dt.getDay()] : '';
      return { label, value };
    });

    const pieMap = { active: 0, completed: 0, partially_fulfilled: 0, cancelled: 0, other: 0 };
    filteredRx.forEach((rx) => {
      const s = String(rx.status || 'active').toLowerCase();
      if (s in pieMap) pieMap[s] += 1;
      else pieMap.other += 1;
    });
    const pie = [
      { label: 'Active', value: pieMap.active, color: '#16a34a' },
      { label: 'Completed', value: pieMap.completed, color: '#2563eb' },
      { label: 'Partial', value: pieMap.partially_fulfilled, color: '#f59e0b' },
      { label: 'Cancelled', value: pieMap.cancelled, color: '#ef4444' },
      { label: 'Other', value: pieMap.other, color: '#64748b' },
    ];

    const bar = [
      { label: 'Doctors', value: providerBase.doctors || 0, color: '#22c55e', path: '/dashboard/users' },
      { label: 'Therapists', value: providerBase.therapists || 0, color: '#a855f7', path: '/dashboard/users' },
      { label: 'Pharmacies', value: providerBase.pharmacies || 0, color: '#fb923c', path: '/dashboard/users' },
      { label: 'Labs', value: providerBase.labs || 0, color: '#10b981', path: '/dashboard/users' },
      { label: 'Scans', value: providerBase.scans || 0, color: '#8b5cf6', path: '/dashboard/users' },
    ];

    const topDoctorMap = {};
    const topPharmacyMap = {};
    filteredRx.forEach((rx) => {
      const docName = rx?.doctorName || 'Unknown doctor';
      topDoctorMap[docName] = (topDoctorMap[docName] || 0) + 1;
      const pharmName = rx?.branchName || rx?.pharmacyName || 'Unassigned';
      topPharmacyMap[pharmName] = (topPharmacyMap[pharmName] || 0) + 1;
    });
    const topDoctors = Object.entries(topDoctorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    const topPharmacies = Object.entries(topPharmacyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return { line: lineBuckets, pie, bar, topDoctors, topPharmacies };
  };

  const loadData = async () => {
    try {
      const [pats, docs, thers, nurses, pharmas, rxs, appts, therapyCalls, hcBookings, labs, scans, labOrders, scanOrders, clientsSnap] = await Promise.all([
        getDocs(collection(db, 'auth')),
        getDocs(collection(db, 'doctors')),
        getDocs(collection(db, 'therapists')),
        getDocs(collection(db, 'homeCareNurses')),
        getDocs(collection(db, 'pharmacies')),
        getDocs(collection(db, 'doctorPrescriptions')),
        getDocs(collection(db, 'doctorAppointments')),
        getDocs(collection(db, 'scheduledCalls')),
        getDocs(collection(db, 'homeCareBookings')),
        getDocs(collection(db, 'labs')),
        getDocs(collection(db, 'scanCenters')),
        getDocs(query(collection(db, 'diagnosticOrders'), where('centerType', '==', 'lab'))),
        getDocs(query(collection(db, 'diagnosticOrders'), where('centerType', '==', 'scan'))),
        getDocs(collection(db, 'clients')),
      ]);

      const therapyUids = buildTherapyLinkedAuthUidSet(clientsSnap);
      const nurseUids = buildHomeCareNurseUidSet(nurses);

      const medicalAuthDocs = pats.docs.filter((d) =>
        isMedicalPatientAuthDoc({ id: d.id, ...d.data() }, therapyUids, nurseUids)
      );

      const hcBookingCount = hcBookings.size;
      const drApptCount = appts.size;
      const therapyCount = therapyCalls.size;
      setStats({
        patients:      medicalAuthDocs.length,
        doctors:       docs.size,
        therapists:    thers.docs.filter(d => (d.data()?.role || '') !== 'admin').length,
        nurses:        nurses.size,
        pharmacies:    pharmas.size,
        prescriptions: rxs.size,
        appointments:  drApptCount + therapyCount + hcBookingCount,
        doctorAppointments: drApptCount,
        therapyScheduledCalls: therapyCount,
        homeCareBookings: hcBookingCount,
        labs:          labs.size,
        scanCenters:   scans.size,
        labOrders:     labOrders.size,
        scanOrders:    scanOrders.size,
      });

      // Build alerts
      const alertList = [];
      const pendingPharm = pharmas.docs.filter(d => d.data().status === 'pending');
      if (pendingPharm.length)
        alertList.push({ type: 'warn', icon: '⚠️', text: `${pendingPharm.length} pharmacy account(s) pending approval` });
      const flaggedRx = rxs.docs.filter(d => (d.data().warnings?.length || 0) > 0);
      if (flaggedRx.length)
        alertList.push({ type: 'danger', icon: '🚨', text: `${flaggedRx.length} prescription(s) flagged with drug interaction warnings` });
      const suspDocs = docs.docs.filter(d => d.data().status === 'suspended');
      if (suspDocs.length)
        alertList.push({ type: 'info', icon: 'ℹ️', text: `${suspDocs.length} suspended doctor account(s) require attention` });
      const pendingOrders = [...labOrders.docs, ...scanOrders.docs].filter(d => d.data().status === 'PENDING');
      if (pendingOrders.length)
        alertList.push({ type: 'warn', icon: '🔬', text: `${pendingOrders.length} diagnostic order(s) awaiting lab/scan center action` });
      const pendingHcNurses = nurses.docs.filter((d) => (d.data().accountStatus || 'pending') === 'pending').length;
      if (pendingHcNurses)
        alertList.push({ type: 'info', icon: '🏠', text: `${pendingHcNurses} home care nurse account(s) pending approval` });
      setAlerts(alertList);

      // Recent prescriptions
      const rxList = rxs.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 8);
      const hcFeed = hcBookings.docs
        .map((d) => ({ id: d.id, _feedType: 'hc', ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 8);
      const therapyFeed = therapyCalls.docs
        .map((d) => ({ id: d.id, _feedType: 'therapy', ...d.data() }))
        .sort((a, b) => {
          const as = a.createdAt?.seconds || a.scheduledTime?.seconds || 0;
          const bs = b.createdAt?.seconds || b.scheduledTime?.seconds || 0;
          return bs - as;
        })
        .slice(0, 8);
      const feedSortSec = (row) =>
        row.createdAt?.seconds || row.scheduledTime?.seconds || 0;
      const mergedFeed = [...rxList.map((r) => ({ ...r, _feedType: 'rx' })), ...hcFeed, ...therapyFeed]
        .sort((a, b) => feedSortSec(b) - feedSortSec(a))
        .slice(0, 8);
      setRecentActivity(mergedFeed);

      const allRx = rxs.docs.map(d => ({ id: d.id, ...d.data() }));
      const allHcBookings = hcBookings.docs.map((d) => ({ id: d.id, ...d.data() }));
      const allScheduledCalls = therapyCalls.docs.map((d) => ({ id: d.id, ...d.data() }));
      const providerBase = {
        doctors: docs.size,
        therapists: thers.docs.filter(d => (d.data()?.role || '') !== 'admin').length,
        pharmacies: pharmas.size,
        labs: labs.size,
        scans: scans.size,
        homeCareNurses: nurses.size,
      };
      setAnalyticsRaw({ allRx, allHcBookings, allScheduledCalls, providerBase });
      setAnalytics(buildAnalytics(allRx, allHcBookings, allScheduledCalls, providerBase, analyticsPeriod));

      const hasLocation = (row = {}) => {
        const lat = Number(row?.latitude ?? row?.locationMeta?.latitude ?? row?.location?.latitude);
        const lng = Number(row?.longitude ?? row?.locationMeta?.longitude ?? row?.location?.longitude);
        const structured = !!(row?.country || row?.city || row?.area || row?.region || row?.street || row?.locationMeta?.country || row?.locationMeta?.city);
        return Number.isFinite(lat) && Number.isFinite(lng) && structured;
      };
      const authRows = medicalAuthDocs.map((d) => d.data());
      const doctorRows = docs.docs.map(d => d.data());
      const therapistRows = thers.docs.map(d => d.data()).filter(d => (d?.role || '') !== 'admin');
      const pharmacyRows = pharmas.docs.map(d => d.data());
      const labRows = labs.docs.map(d => d.data());
      const scanRows = scans.docs.map(d => d.data());
      const nurseRows = nurses.docs.map((d) => d.data());
      const rows = [
        { label: 'Patients', items: authRows },
        { label: 'Doctors', items: doctorRows },
        { label: 'Therapists', items: therapistRows },
        { label: 'Home care nurses', items: nurseRows },
        { label: 'Pharmacies', items: pharmacyRows },
        { label: 'Labs', items: labRows },
        { label: 'Scans', items: scanRows },
      ].map(({ label, items }) => {
        const total = items.length;
        const withLocation = items.filter(hasLocation).length;
        const missing = Math.max(0, total - withLocation);
        return { label, total, withLocation, missing, pct: total ? Math.round((withLocation / total) * 100) : 0 };
      });
      setLocationCoverage(rows);
    } catch (e) {
      console.error('AdminOverview error:', e);
    } finally {
      setLoading(false);
    }
  };

  const STAT_CARDS = [
    { key: 'patients',      label: 'Medical Patients',     icon: '👥', bg: '#eff6ff', color: '#1d4ed8' },
    { key: 'doctors',       label: 'Doctors',              icon: '🩺', bg: '#f0fdf4', color: '#16a34a' },
    { key: 'therapists',    label: 'Therapists',           icon: '🧠', bg: '#fdf4ff', color: '#9333ea' },
    { key: 'nurses',        label: 'Home Care Nurses',     icon: '🏠', bg: '#f0fdfa', color: '#0d9488' },
    { key: 'pharmacies',    label: 'Pharmacies',           icon: '💊', bg: '#fff7ed', color: '#ea580c' },
    { key: 'labs',          label: 'Lab Centers',          icon: '🧪', bg: '#f0fdf4', color: '#065f46' },
    { key: 'scanCenters',   label: 'Imaging Centers',      icon: '🩻', bg: '#faf5ff', color: '#7c3aed' },
    { key: 'prescriptions', label: 'Prescriptions',        icon: '📋', bg: '#f0fdf4', color: '#16a34a' },
    { key: 'appointments',  label: 'Appts + therapy + HC',   icon: '📅', bg: '#fefce8', color: '#ca8a04' },
    { key: 'labOrders',     label: 'Lab Orders',           icon: '🔬', bg: '#f0fdf4', color: '#059669' },
    { key: 'scanOrders',    label: 'Scan Orders',          icon: '📡', bg: '#faf5ff', color: '#6d28d9' },
  ];

  const fmtTime = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtTs   = (ts) => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  const pieTotal = analytics.pie.reduce((sum, x) => sum + x.value, 0);
  const pieCirc = 2 * Math.PI * 54;
  let pieOffset = 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: '0.75rem' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      Loading system overview…
    </div>
  );

  return (
    <div className="admin-page">
      {/* Location + Clock Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', boxShadow: '0 4px 20px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {location.flag && <img src={location.flag} alt="" style={{ height: 22, borderRadius: 3, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Current Location</span>
            </div>
            <p style={{ margin: 0, fontWeight: 800, color: '#fff', fontSize: '1rem' }}>
              {location.city}{location.region ? `, ${location.region}` : ''} — <span style={{ color: '#93c5fd' }}>{location.country}</span>
            </p>
            {location.timezone && <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>Timezone: {location.timezone} · IP: {location.ip}</p>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 800, color: '#93c5fd', letterSpacing: '0.05em' }}>{fmtTime(now)}</p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>{fmtDate(now)}</p>
        </div>
      </div>

      {/* Page header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">System Overview</h1>
          <p className="admin-page-sub">Real-time metrics and platform health — NessaHub Telehealth</p>
        </div>
        <button className="btn btn-primary" onClick={loadData}>↻ Refresh</button>
      </div>

      {/* Stats grid */}
      <div className="admin-stats-grid">
        {STAT_CARDS.map(card => (
          <div key={card.key} className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: card.bg }}>
              {card.icon}
            </div>
            <div>
              <div className="admin-stat-value" style={{ color: card.color }}>{stats[card.key]}</div>
              <div className="admin-stat-label">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <p className="admin-section-title">🔔 System Alerts</p>
          {alerts.map((a, i) => (
            <div key={i} className={`admin-alert admin-alert-${a.type}`}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{a.icon}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ marginBottom: '1.75rem' }}>
        <p className="admin-section-title">⚡ Quick Actions</p>
        <div className="admin-quick-grid">
          {QUICK_ACTIONS.map(a => (
            <div key={a.path} className="admin-quick-card" onClick={() => navigate(a.path)}>
              <div className="admin-quick-icon">{a.icon}</div>
              <div className="admin-quick-label">{a.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts + tables */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
          <p className="admin-section-title" style={{ marginBottom: 0 }}>📈 Analytics Snapshot</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {[
              ['7d', 'Last 7d'],
              ['30d', 'Last 30d'],
              ['90d', 'Last 90d'],
              ['all', 'All'],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`btn btn-sm ${analyticsPeriod === k ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAnalyticsPeriod(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div className="admin-table-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <p className="admin-table-title" style={{ margin: 0 }}>Line Graph: Rx + therapy + home care ({analyticsPeriod === 'all' ? 'All' : analyticsPeriod})</p>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/dashboard/reports?focus=activity&period=${analyticsPeriod}`)}>Open Report</button>
            </div>
            <svg viewBox="0 0 560 220" style={{ width: '100%', height: 220, display: 'block' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <line key={i} x1="40" y1={35 + i * 45} x2="535" y2={35 + i * 45} stroke="#e2e8f0" strokeWidth="1" />
              ))}
              {(() => {
                const max = Math.max(...analytics.line.map(p => p.value), 1);
                const points = analytics.line.map((p, i) => {
                  const x = 55 + i * 78;
                  const y = 190 - ((p.value / max) * 145);
                  return { x, y, label: p.label, value: p.value };
                });
                const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                return (
                  <>
                    <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
                    {points.map((p) => (
                      <g key={`${p.label}-${p.x}`} onClick={() => navigate(`/dashboard/reports?focus=activity&period=${analyticsPeriod}`)} style={{ cursor: 'pointer' }}>
                        <circle cx={p.x} cy={p.y} r="4" fill="#2563eb" />
                        <text x={p.x} y={210} textAnchor="middle" fontSize="11" fill="#64748b">{p.label}</text>
                        <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fill="#1e3a8a" fontWeight="700">{p.value}</text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>

          <div className="admin-table-card" style={{ padding: '1rem' }}>
            <p className="admin-table-title" style={{ margin: '0 0 0.75rem' }}>Pie Chart: Rx Status Mix</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <svg viewBox="0 0 140 140" width="140" height="140" style={{ flexShrink: 0 }}>
                <circle cx="70" cy="70" r="54" fill="none" stroke="#e2e8f0" strokeWidth="18" />
                {analytics.pie.map((slice) => {
                  const len = pieTotal ? ((slice.value / pieTotal) * pieCirc) : 0;
                  const node = (
                    <circle
                      key={slice.label}
                      cx="70"
                      cy="70"
                      r="54"
                      fill="none"
                      stroke={slice.color}
                      strokeWidth="18"
                      strokeDasharray={`${len} ${pieCirc - len}`}
                      strokeDashoffset={-pieOffset}
                      transform="rotate(-90 70 70)"
                      strokeLinecap="butt"
                      onClick={() => navigate(`/dashboard/reports?focus=activity&period=${analyticsPeriod}`)}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                  pieOffset += len;
                  return node;
                })}
                <text x="70" y="66" textAnchor="middle" fontSize="12" fill="#64748b">Total</text>
                <text x="70" y="84" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">{pieTotal}</text>
              </svg>
              <div style={{ display: 'grid', gap: 6 }}>
                {analytics.pie.map((slice) => (
                  <div key={slice.label} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => navigate(`/dashboard/reports?focus=activity&period=${analyticsPeriod}`)}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: slice.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.79rem', color: '#334155', minWidth: 72 }}>{slice.label}</span>
                    <b style={{ fontSize: '0.79rem', color: '#0f172a' }}>{slice.value}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="admin-table-card" style={{ padding: '1rem' }}>
            <p className="admin-table-title" style={{ margin: '0 0 0.75rem' }}>Bar Chart: Provider & Partner Base</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.55rem', height: 170 }}>
              {(() => {
                const max = Math.max(...analytics.bar.map(b => b.value), 1);
                return analytics.bar.map((b) => (
                  <div key={b.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => navigate(b.path)}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>{b.value}</span>
                    <div style={{ width: '100%', maxWidth: 54, borderRadius: '8px 8px 0 0', background: b.color, height: Math.max((b.value / max) * 120, b.value > 0 ? 10 : 0), transition: 'height 0.3s ease' }} />
                    <span style={{ fontSize: '0.68rem', color: '#64748b', textAlign: 'center' }}>{b.label}</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          <div className="admin-table-card">
            <div className="admin-table-header">
              <p className="admin-table-title">Table: Top Doctors by Rx Volume</p>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Prescriptions</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topDoctors.length === 0 ? (
                  <tr><td colSpan={2} style={{ color: '#94a3b8' }}>No data</td></tr>
                ) : analytics.topDoctors.map((row) => (
                  <tr key={row.name} onClick={() => navigate(`/dashboard/reports?focus=activity&period=${analyticsPeriod}`)} style={{ cursor: 'pointer' }}>
                    <td>{row.name}</td>
                    <td><span className="badge badge-blue">{row.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-table-card" style={{ marginTop: '1rem' }}>
          <div className="admin-table-header">
            <p className="admin-table-title">Table: Top Pharmacy Branches / Routing Targets</p>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Branch / Pharmacy</th>
                <th>Routed Prescriptions</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topPharmacies.length === 0 ? (
                <tr><td colSpan={2} style={{ color: '#94a3b8' }}>No routing data yet.</td></tr>
              ) : analytics.topPharmacies.map((row) => (
                <tr key={row.name} onClick={() => navigate('/dashboard/users')} style={{ cursor: 'pointer' }}>
                  <td>{row.name}</td>
                  <td><span className="badge badge-purple">{row.count}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform breakdown + Recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Platform health */}
        <div className="admin-table-card">
          <div className="admin-table-header">
            <p className="admin-table-title">Platform Breakdown</p>
          </div>
          <div style={{ padding: '0.75rem 1.1rem' }}>
            {[
              { label: 'Medical Patients', val: stats.patients, color: '#1d4ed8', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Home Care Nurses', val: stats.nurses, color: '#0d9488', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Doctors', val: stats.doctors, color: '#16a34a', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Therapists', val: stats.therapists, color: '#9333ea', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Pharmacies', val: stats.pharmacies, color: '#ea580c', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Lab Centers', val: stats.labs, color: '#065f46', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Imaging Centers', val: stats.scanCenters, color: '#7c3aed', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Therapy sessions', val: stats.therapyScheduledCalls, color: '#a855f7', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Doctor appointments', val: stats.doctorAppointments, color: '#ca8a04', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
              { label: 'Home care bookings', val: stats.homeCareBookings, color: '#0f766e', max: Math.max(stats.patients, stats.nurses, stats.appointments, 1) },
            ].map(row => (
              <div key={row.label} style={{ marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>{row.label}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: row.color }}>{row.val}</span>
                </div>
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: row.color, borderRadius: 10, width: `${Math.min((row.val / row.max) * 100, 100)}%`, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent prescriptions */}
        <div className="admin-table-card">
          <div className="admin-table-header">
            <p className="admin-table-title">Recent activity</p>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/prescriptions')}>Prescriptions</button>
          </div>
          {recentActivity.length === 0 ? (
            <div className="admin-empty"><p>No recent prescriptions, therapy sessions, or home care bookings.</p></div>
          ) : recentActivity.map((row, i) => (
            <div key={`${row._feedType}-${row.id || i}`} className="admin-feed-item">
              <div
                className="admin-feed-dot"
                style={{
                  background:
                    row._feedType === 'hc'
                      ? '#0d9488'
                      : row._feedType === 'therapy'
                        ? '#a855f7'
                        : row.status === 'active'
                          ? '#16a34a'
                          : row.status === 'completed'
                            ? '#1d4ed8'
                            : '#94a3b8',
                }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.825rem', fontWeight: 600, color: '#0f172a' }}>
                  {row._feedType === 'hc'
                    ? `${row.bookingType === 'emergency' ? 'Emergency' : 'Home care'} · ${row.careType || 'visit'}`
                    : row._feedType === 'therapy'
                      ? `Therapy · ${row.sessionType || 'session'}`
                      : (row.medications?.[0]?.name || row.medication || 'Prescription')}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                  {row._feedType === 'hc'
                    ? `${row.patientName || 'Patient'} · ${row.nurseName || 'Nurse TBD'}`
                    : row._feedType === 'therapy'
                      ? `${row.clientName || row.patientName || 'Client'} · ${row.therapistName || '—'}`
                      : `${row.patientName || '—'} · Dr. ${row.doctorName || '—'}`}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span
                  className={`badge badge-${
                    row._feedType === 'hc'
                      ? 'green'
                      : row._feedType === 'therapy'
                        ? 'purple'
                        : row.status === 'active'
                          ? 'green'
                          : row.status === 'completed'
                            ? 'blue'
                            : 'gray'
                  }`}
                >
                  {row._feedType === 'hc' || row._feedType === 'therapy'
                    ? (row.status || 'pending')
                    : (row.status || 'active')}
                </span>
                <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>
                  {fmtTs(row.createdAt?.seconds ? row.createdAt : row.scheduledTime)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Location coverage audit */}
      <div className="admin-table-card">
        <div className="admin-table-header">
          <p className="admin-table-title">Location Coverage Audit</p>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/users')}>Review Users</button>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Total</th>
              <th>With Location</th>
              <th>Coverage</th>
              <th>Missing</th>
            </tr>
          </thead>
          <tbody>
            {locationCoverage.length === 0 ? (
              <tr><td colSpan={5} style={{ color: '#94a3b8' }}>No coverage data.</td></tr>
            ) : locationCoverage.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.total}</td>
                <td>{r.withLocation}</td>
                <td><span className={`badge ${r.pct >= 90 ? 'badge-green' : r.pct >= 70 ? 'badge-yellow' : 'badge-red'}`}>{r.pct}%</span></td>
                <td><span className={`badge ${r.missing === 0 ? 'badge-green' : 'badge-orange'}`}>{r.missing}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* System info footer */}
      <div style={{ marginTop: '1.75rem', background: '#f8fafc', borderRadius: 12, padding: '1.1rem 1.35rem', border: '1px solid #e2e8f0', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        {[
          ['Platform', 'NessaHub Telehealth v2.0'],
          ['Environment', 'Production'],
          ['Database', 'Firebase Firestore'],
          ['Auth', 'Firebase Auth'],
          ['Currency', location.currency || '—'],
          ['Network Org', location.org || '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
