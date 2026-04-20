import React, { useState, useEffect } from 'react';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

export default function AdminOverview() {
  const [stats, setStats] = useState({ patients: 0, doctors: 0, therapists: 0, pharmacies: 0, prescriptions: 0, appointments: 0 });
  const [alerts, setAlerts] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [pats, docs, thers, pharmas, rxs, appts] = await Promise.all([
        getDocs(collection(db, 'auth')),
        getDocs(collection(db, 'doctors')),
        getDocs(query(collection(db, 'therapists'), where('role', '!=', 'admin'))),
        getDocs(collection(db, 'pharmacies')),
        getDocs(collection(db, 'doctorPrescriptions')),
        getDocs(collection(db, 'doctorAppointments')),
      ]);

      setStats({
        patients: pats.size,
        doctors: docs.size,
        therapists: thers.size,
        pharmacies: pharmas.size,
        prescriptions: rxs.size,
        appointments: appts.size,
      });

      // Build alerts
      const alertList = [];
      const pendingPharm = pharmas.docs.filter(d => d.data().status === 'pending');
      if (pendingPharm.length > 0)
        alertList.push({ type: 'warn', text: `${pendingPharm.length} pharmacy approval(s) pending review` });

      const suspiciousRx = rxs.docs.filter(d => (d.data().warnings?.length || 0) > 0);
      if (suspiciousRx.length > 0)
        alertList.push({ type: 'danger', text: `${suspiciousRx.length} prescription(s) flagged with safety warnings` });

      const suspendedDocs = docs.docs.filter(d => d.data().status === 'suspended');
      if (suspendedDocs.length > 0)
        alertList.push({ type: 'info', text: `${suspendedDocs.length} suspended doctor account(s)` });

      setAlerts(alertList);

      // Recent prescriptions as activity
      const recent = rxs.docs.slice(0, 5).map(d => ({
        text: `Prescription for ${d.data().patientName || 'Patient'} by Dr. ${d.data().doctorName || 'Doctor'}`,
        date: d.data().date || '—',
        status: d.data().status || 'active',
      }));
      setRecentActivity(recent);
    } catch (e) {
      console.error('AdminOverview load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const STAT_CARDS = [
    { key: 'patients',      label: 'Total Patients',      icon: '👥', bg: '#eff6ff', color: '#1d4ed8' },
    { key: 'doctors',       label: 'Total Doctors',       icon: '🩺', bg: '#f0fdf4', color: '#16a34a' },
    { key: 'therapists',    label: 'Total Therapists',    icon: '🧠', bg: '#fdf4ff', color: '#9333ea' },
    { key: 'pharmacies',    label: 'Total Pharmacies',    icon: '💊', bg: '#fff7ed', color: '#ea580c' },
    { key: 'prescriptions', label: 'Prescriptions',       icon: '📋', bg: '#f0fdf4', color: '#16a34a' },
    { key: 'appointments',  label: 'Appointments',        icon: '📅', bg: '#fefce8', color: '#ca8a04' },
  ];

  if (loading) return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading overview…</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">System Overview</h1>
        <p className="admin-page-sub">Real-time metrics across the NessaHub platform</p>
      </div>

      {/* Stats */}
      <div className="admin-stats-grid">
        {STAT_CARDS.map(card => (
          <div key={card.key} className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: card.bg }}>
              {card.icon}
            </div>
            <div className="admin-stat-value" style={{ color: card.color }}>{stats[card.key]}</div>
            <div className="admin-stat-label">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>System Alerts</h2>
          {alerts.map((a, i) => (
            <div key={i} className={`admin-alert admin-alert-${a.type}`}>
              <span>{a.type === 'warn' ? '⚠️' : a.type === 'danger' ? '🚨' : 'ℹ️'}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent Activity */}
      <div className="admin-table-card">
        <div className="admin-table-header">
          <p className="admin-table-title">Recent Prescriptions</p>
        </div>
        {recentActivity.length === 0 ? (
          <div className="admin-empty"><p>No recent prescriptions.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((a, i) => (
                <tr key={i}>
                  <td>{a.text}</td>
                  <td>{a.date}</td>
                  <td>
                    <span className={`badge ${a.status === 'active' ? 'badge-green' : a.status === 'cancelled' ? 'badge-red' : 'badge-gray'}`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
