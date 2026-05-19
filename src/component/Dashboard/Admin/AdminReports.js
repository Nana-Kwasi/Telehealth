import React, { useState, useEffect } from 'react';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

export default function AdminReports() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState('30d');
  const [focus, setFocus]     = useState('all');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pats, docs, thers, pharmas, rxs, appts, therapyCalls, hcNurses, hcBookings, labs, scans, diagOrders] = await Promise.all([
        getDocs(collection(db, 'auth')),
        getDocs(collection(db, 'doctors')),
        getDocs(collection(db, 'therapists')),
        getDocs(collection(db, 'pharmacies')),
        getDocs(collection(db, 'doctorPrescriptions')),
        getDocs(collection(db, 'doctorAppointments')),
        getDocs(collection(db, 'scheduledCalls')),
        getDocs(collection(db, 'homeCareNurses')),
        getDocs(collection(db, 'homeCareBookings')),
        getDocs(collection(db, 'labs')),
        getDocs(collection(db, 'scanCenters')),
        getDocs(collection(db, 'diagnosticOrders')),
      ]);

      const allRx    = rxs.docs.map(d => ({ id: d.id, ...d.data() }));
      const allAppts = appts.docs.map(d => ({ id: d.id, ...d.data() }));
      const allScheduledCalls = therapyCalls.docs.map((d) => ({ id: d.id, ...d.data() }));
      const allHcBookings = hcBookings.docs.map((d) => ({ id: d.id, ...d.data() }));
      const allDiag  = diagOrders.docs.map(d => ({ id: d.id, ...d.data() }));
      const allPats  = pats.docs.map(d => ({ id: d.id, ...d.data() }));

      const bumpDoctorOrTherapyStatus = (apptStatus, rawStatus) => {
        const s = (rawStatus || 'upcoming').toLowerCase();
        if (s === 'completed') apptStatus.completed += 1;
        else if (s === 'cancelled') apptStatus.cancelled += 1;
        else if (s === 'no-show') apptStatus['no-show'] += 1;
        else if (['upcoming', 'pending', 'confirmed', 'scheduled'].includes(s)) apptStatus.upcoming += 1;
        else apptStatus.upcoming += 1;
      };

      const apptStatus = { upcoming: 0, completed: 0, cancelled: 0, 'no-show': 0 };
      allAppts.forEach((a) => bumpDoctorOrTherapyStatus(apptStatus, a.status));
      allScheduledCalls.forEach((sc) => bumpDoctorOrTherapyStatus(apptStatus, sc.status));
      const hcActive = new Set(['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'ongoing']);
      allHcBookings.forEach((b) => {
        const s = (b.status || 'pending').toLowerCase();
        if (s === 'completed') apptStatus.completed += 1;
        else if (s === 'cancelled' || s === 'declined') apptStatus.cancelled += 1;
        else if (s === 'no-show') apptStatus['no-show'] += 1;
        else if (hcActive.has(s)) apptStatus.upcoming += 1;
        else apptStatus.upcoming += 1;
      });

      const hcBookingStatus = { pending: 0, active: 0, completed: 0, cancelled: 0, other: 0 };
      allHcBookings.forEach((b) => {
        const s = (b.status || 'pending').toLowerCase();
        if (s === 'pending') hcBookingStatus.pending += 1;
        else if (s === 'completed') hcBookingStatus.completed += 1;
        else if (s === 'cancelled' || s === 'declined') hcBookingStatus.cancelled += 1;
        else if (hcActive.has(s) && s !== 'pending') hcBookingStatus.active += 1;
        else hcBookingStatus.other += 1;
      });

      // Monthly registration counts (last 6 months)
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { label: d.toLocaleString('default', { month: 'short', year: '2-digit' }), year: d.getFullYear(), month: d.getMonth() };
      });

      const patsByMonth = months.map(m =>
        allPats.filter(p => {
          if (!p.createdAt?.seconds) return false;
          const d = new Date(p.createdAt.seconds * 1000);
          return d.getFullYear() === m.year && d.getMonth() === m.month;
        }).length
      );

      // Prescription status breakdown
      const rxStatus = { active: 0, completed: 0, cancelled: 0, expired: 0 };
      allRx.forEach(rx => { const s = rx.status || 'active'; if (s in rxStatus) rxStatus[s]++; });

      // Diagnostic order breakdown
      const diagByType = { lab: 0, scan: 0 };
      allDiag.forEach(o => { const t = o.centerType || 'lab'; if (t in diagByType) diagByType[t]++; });

      // Top doctors by prescription count
      const docPrescCount = {};
      allRx.forEach(rx => {
        if (rx.doctorName) {
          docPrescCount[rx.doctorName] = (docPrescCount[rx.doctorName] || 0) + 1;
        }
      });
      const topDocs = Object.entries(docPrescCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Flagged prescriptions
      const flaggedRx = allRx.filter(rx => (rx.warnings?.length || 0) > 0).length;

      // Pharmacy approval stats
      const pharmStats = {
        total: pharmas.size,
        active: pharmas.docs.filter(d => d.data().status === 'active').length,
        pending: pharmas.docs.filter(d => d.data().status === 'pending').length,
        suspended: pharmas.docs.filter(d => d.data().status === 'suspended').length,
      };

      const docApptCompleted = allAppts.filter((a) => (a.status || '').toLowerCase() === 'completed').length;
      const therapyCompleted = allScheduledCalls.filter((c) => (c.status || '').toLowerCase() === 'completed').length;
      const hcCompleted = allHcBookings.filter((b) => (b.status || '').toLowerCase() === 'completed').length;
      const apptDenom = allAppts.length + allScheduledCalls.length + allHcBookings.length;

      setData({
        raw: { allRx, allAppts, allScheduledCalls, allHcBookings, allDiag, allPats },
        totals: {
          patients: pats.size, doctors: docs.size, therapists: thers.size,
          pharmacies: pharmas.size, labs: labs.size, scans: scans.size,
          prescriptions: rxs.size,
          appointments: appts.size + therapyCalls.size + hcBookings.size,
          doctorAppointments: appts.size,
          therapyScheduledCalls: therapyCalls.size,
          homeCareBookings: hcBookings.size,
          homeCareNurses: hcNurses.size,
          diagnosticOrders: allDiag.length,
        },
        months: months.map(m => m.label),
        patsByMonth,
        rxStatus,
        apptStatus,
        hcBookingStatus,
        diagByType,
        topDocs,
        flaggedRx,
        pharmStats,
        completionRate: apptDenom
          ? Math.round(((docApptCompleted + therapyCompleted + hcCompleted) / apptDenom) * 100)
          : 0,
        flagRate: allRx.length ? Math.round((flaggedRx / allRx.length) * 100) : 0,
      });
    } catch (e) {
      console.error('Reports load error:', e);
    } finally { setLoading(false); }
  };

  if (loading) return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Analytics & Reports</h1>
      </div>
      <div className="admin-empty"><p>Loading report data…</p></div>
    </div>
  );

  if (!data) return null;

  const cutoffMs = period === 'all' ? 0 : Date.now() - ((period === '7d' ? 7 : period === '30d' ? 30 : 90) * 24 * 60 * 60 * 1000);
  const inWindow = (row, field = 'createdAt') => {
    const ms = row?.[field]?.seconds ? row[field].seconds * 1000 : 0;
    if (!cutoffMs) return true;
    return ms >= cutoffMs;
  };
  const inWindowScheduledCall = (row) => {
    let ms = row?.createdAt?.seconds ? row.createdAt.seconds * 1000 : 0;
    if (!ms && row?.scheduledTime?.seconds) ms = row.scheduledTime.seconds * 1000;
    if (!cutoffMs) return true;
    return ms >= cutoffMs;
  };
  const fRx = (data.raw?.allRx || []).filter(r => inWindow(r, 'createdAt'));
  const fAppts = (data.raw?.allAppts || []).filter(a => inWindow(a, 'createdAt'));
  const fScheduledCalls = (data.raw?.allScheduledCalls || []).filter(inWindowScheduledCall);
  const fHcBookings = (data.raw?.allHcBookings || []).filter((b) => inWindow(b, 'createdAt'));
  const fDiag = (data.raw?.allDiag || []).filter(o => inWindow(o, 'createdAt'));
  const fPats = (data.raw?.allPats || []).filter(p => inWindow(p, 'createdAt'));
  const maxBar = Math.max(...data.patsByMonth, 1);

  const focusCards = {
    users: [
      { label: 'Total Patients', val: cutoffMs ? fPats.length : data.totals.patients, icon: '👥', color: '#1d4ed8', bg: '#eff6ff' },
      { label: 'Total Doctors', val: data.totals.doctors, icon: '🩺', color: '#16a34a', bg: '#f0fdf4' },
      { label: 'Total Therapists', val: data.totals.therapists, icon: '🧠', color: '#9333ea', bg: '#fdf4ff' },
      { label: 'Home Care Nurses', val: data.totals.homeCareNurses ?? 0, icon: '🏠', color: '#0d9488', bg: '#f0fdfa' },
    ],
    activity: [
      { label: 'Prescriptions', val: cutoffMs ? fRx.length : data.totals.prescriptions, icon: '📋', color: '#9333ea', bg: '#fdf4ff' },
      { label: 'Appts + therapy + HC', val: cutoffMs ? fAppts.length + fScheduledCalls.length + fHcBookings.length : data.totals.appointments, icon: '📅', color: '#d97706', bg: '#fffbeb' },
      { label: 'Diagnostic Orders', val: cutoffMs ? fDiag.length : data.totals.diagnosticOrders, icon: '🔬', color: '#0891b2', bg: '#ecfeff' },
    ],
    transactions: [
      { label: 'Visit / appt completion', val: `${data.completionRate}%`, icon: '✅', color: '#059669', bg: '#f0fdf4' },
      { label: 'Flagged Rx Rate', val: `${data.flagRate}%`, icon: '⚠️', color: data.flagRate > 10 ? '#dc2626' : '#d97706', bg: '#fffbeb' },
      { label: 'Platform Providers', val: data.totals.doctors + data.totals.therapists + data.totals.pharmacies + data.totals.labs + data.totals.scans + (data.totals.homeCareNurses || 0), icon: '🏥', color: '#6d28d9', bg: '#faf5ff' },
    ],
  };
  const cards = focus === 'users' ? focusCards.users : focus === 'activity' ? focusCards.activity : focus === 'transactions' ? focusCards.transactions : [...focusCards.users, ...focusCards.activity, ...focusCards.transactions];

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Analytics & Reports</h1>
          <p className="admin-page-sub">Platform-wide metrics, trends, and performance indicators</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '0.45rem 0.65rem', borderRadius: 8, border: '1px solid #d1d5db' }}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <select value={focus} onChange={e => setFocus(e.target.value)} style={{ padding: '0.45rem 0.65rem', borderRadius: 8, border: '1px solid #d1d5db' }}>
            <option value="all">All Sections</option>
            <option value="users">Users</option>
            <option value="activity">Activity</option>
            <option value="transactions">Transactions</option>
          </select>
          <button className="btn btn-primary" onClick={loadData}>↻ Refresh</button>
        </div>
      </div>

      {/* KPI Cards */}
      <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>Summary KPIs</p>
      <div className="admin-stats-grid" style={{ marginBottom: '1.75rem' }}>
        {cards.map(s => (
          <div key={s.label} className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="admin-stat-value" style={{ color: s.color }}>{s.val}</div>
              <div className="admin-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Patient Growth Chart */}
        <div className="admin-table-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            📈 Patient Registrations — Last 6 Months
          </h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', height: 140 }}>
            {data.patsByMonth.map((count, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8' }}>{count}</span>
                <div style={{
                  width: '100%', borderRadius: '4px 4px 0 0',
                  height: `${Math.max((count / maxBar) * 110, count > 0 ? 8 : 0)}px`,
                  background: 'linear-gradient(to top, #2563eb, #93c5fd)',
                  transition: 'height 0.4s ease',
                }} />
                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{data.months[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Prescription status */}
        <div className="admin-table-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            💊 Prescription Status Breakdown
          </h3>
          {[
            { label: 'Active',    val: data.rxStatus.active,    color: '#16a34a' },
            { label: 'Completed', val: data.rxStatus.completed, color: '#1d4ed8' },
            { label: 'Cancelled', val: data.rxStatus.cancelled, color: '#dc2626' },
            { label: 'Expired',   val: data.rxStatus.expired,   color: '#94a3b8' },
          ].map(row => {
            const total = Object.values(data.rxStatus).reduce((a, b) => a + b, 0) || 1;
            return (
              <div key={row.label} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>{row.label}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: row.color }}>{row.val} ({Math.round((row.val / total) * 100)}%)</span>
                </div>
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(row.val / total) * 100}%`, background: row.color, borderRadius: 10, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1.5rem' }}>
        {/* Appointment breakdown */}
        <div className="admin-table-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            📅 Appointment outcomes (doctor + therapy + home care)
          </h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', color: '#64748b' }}>
            Doctor + therapy (scheduledCalls) statuses merged with home care bookings (active pipeline → Upcoming).
          </p>
          {[
            { label: 'Upcoming',  val: data.apptStatus.upcoming,   color: '#d97706' },
            { label: 'Completed', val: data.apptStatus.completed,  color: '#16a34a' },
            { label: 'Cancelled', val: data.apptStatus.cancelled,  color: '#dc2626' },
            { label: 'No-Show',   val: data.apptStatus['no-show'], color: '#ef4444' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.82rem', color: '#475569' }}>{row.label}</span>
              <span style={{ fontWeight: 700, color: row.color, fontSize: '0.9rem' }}>{row.val}</span>
            </div>
          ))}
        </div>

        <div className="admin-table-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            🏠 Home care bookings (status)
          </h3>
          {[
            { label: 'Pending', val: data.hcBookingStatus.pending, color: '#d97706' },
            { label: 'Active visit', val: data.hcBookingStatus.active, color: '#0d9488' },
            { label: 'Completed', val: data.hcBookingStatus.completed, color: '#16a34a' },
            { label: 'Cancelled / declined', val: data.hcBookingStatus.cancelled, color: '#dc2626' },
            { label: 'Other', val: data.hcBookingStatus.other, color: '#64748b' },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.82rem', color: '#475569' }}>{row.label}</span>
              <span style={{ fontWeight: 700, color: row.color, fontSize: '0.9rem' }}>{row.val}</span>
            </div>
          ))}
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.72rem', color: '#64748b' }}>
            Nurses on file: <strong>{data.totals.homeCareNurses}</strong> · Bookings: <strong>{data.totals.homeCareBookings}</strong>
          </p>
        </div>

        {/* Diagnostic orders */}
        <div className="admin-table-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            🔬 Diagnostic Orders
          </h3>
          {[
            { label: 'Lab Orders',  val: data.diagByType.lab,  color: '#059669', icon: '🧪' },
            { label: 'Scan Orders', val: data.diagByType.scan, color: '#7c3aed', icon: '🩻' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.82rem', color: '#475569' }}>{row.icon} {row.label}</span>
              <span style={{ fontWeight: 700, color: row.color, fontSize: '1.1rem' }}>{row.val}</span>
            </div>
          ))}
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#065f46' }}>
              Total: {data.totals.diagnosticOrders} diagnostic orders processed
            </p>
          </div>
        </div>

        {/* Top prescribing doctors */}
        <div className="admin-table-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            🏆 Top Prescribing Doctors
          </h3>
          {data.topDocs.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No prescription data yet.</p>
          ) : data.topDocs.map((d, i) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', width: 18 }}>#{i + 1}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>Dr. {d.name}</p>
                <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, marginTop: 4 }}>
                  <div style={{ height: '100%', background: '#2563eb', borderRadius: 4, width: `${(d.count / (data.topDocs[0]?.count || 1)) * 100}%` }} />
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563eb' }}>{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pharmacy approval stats */}
      <div className="admin-table-card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>💊 Pharmacy Network Status</h3>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Total', val: data.pharmStats.total, color: '#1d4ed8' },
            { label: 'Active', val: data.pharmStats.active, color: '#16a34a' },
            { label: 'Pending Approval', val: data.pharmStats.pending, color: '#d97706' },
            { label: 'Suspended', val: data.pharmStats.suspended, color: '#dc2626' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
