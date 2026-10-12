import React, { useState, useEffect } from 'react';
import { Search, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../services/firestoreShim';
import { collection, getDocs, getDoc, doc, query, where } from '../../../services/firestoreShim';
import Paged from '../../Common/Paged';

const PANEL_TABS = ['All', 'Active', 'Inactive', 'Discharged'];

const STATUS_STYLE = {
  active:     { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', label: 'Active' },
  inactive:   { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', label: 'Inactive' },
  discharged: { bg: '#fef2f2', color: '#b91c1c', border: '#fecdd3', label: 'Discharged' },
};

export default function DoctorPatientPanel({ profile }) {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');

  useEffect(() => {
    if (profile?.id) loadPatients();
  }, [profile]);

  const loadPatients = async () => {
    try {
      const apptsQ = query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id));
      const apptsSnap = await getDocs(apptsQ);
      const appts = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const patientMap = new Map();
      for (const a of appts) {
        if (!a.clientId) continue;
        if (!patientMap.has(a.clientId)) {
          patientMap.set(a.clientId, { id: a.clientId, name: a.clientName || '', email: a.clientEmail || '', appointments: [] });
        }
        patientMap.get(a.clientId).appointments.push(a);
      }

      for (const [uid, patient] of patientMap) {
        if (!patient.name || patient.name === 'Patient') {
          try {
            const authSnap = await getDoc(doc(db, 'auth', uid));
            if (authSnap.exists()) {
              const d = authSnap.data();
              patient.name = d.name || d.displayName || patient.name || 'Unknown Patient';
              if (!patient.email && d.email) patient.email = d.email;
            } else { patient.name = patient.name || 'Unknown Patient'; }
          } catch (_) { patient.name = patient.name || 'Unknown Patient'; }
        }
      }

      const list = Array.from(patientMap.values()).map(p => {
        const sorted = [...p.appointments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return {
          ...p,
          appointmentCount: p.appointments.length,
          completedCount: p.appointments.filter(a => a.status === 'completed').length,
          lastVisit: sorted[0]?.date || null,
        };
      });

      const statusResults = await Promise.all(
        list.map(p => getDoc(doc(db, 'patientProfiles', p.id))
          .then(snap => ({ id: p.id, status: snap.exists() ? (snap.data().status || 'active') : 'active' }))
          .catch(() => ({ id: p.id, status: 'active' })))
      );
      const statusMap = Object.fromEntries(statusResults.map(r => [r.id, r.status]));
      const listWithStatus = list.map(p => ({ ...p, patientStatus: statusMap[p.id] || 'active' }));
      listWithStatus.sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
      setPatients(listWithStatus);
    } catch (err) {
      console.error('Error loading patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filtered = patients.filter(p => {
    if (activeTab !== 'All' && (p.patientStatus || 'active') !== activeTab.toLowerCase()) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.name && p.name.toLowerCase().includes(q)) || (p.email && p.email.toLowerCase().includes(q));
  });

  const tabCount = (tab) => tab === 'All'
    ? patients.length
    : patients.filter(p => (p.patientStatus || 'active') === tab.toLowerCase()).length;

  const TAB_COLORS = {
    All:        { active: '#1e6bb8', badge: 'rgba(255,255,255,0.25)' },
    Active:     { active: '#15803d', badge: 'rgba(255,255,255,0.25)' },
    Inactive:   { active: '#c2410c', badge: 'rgba(255,255,255,0.25)' },
    Discharged: { active: '#b91c1c', badge: 'rgba(255,255,255,0.25)' },
  };

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Patient Panel</h1>
        <p>Tap a patient name for a full overview (visits, labs, Rx, notes). Change status from that screen.</p>
      </div>

      {/* Status Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'All Patients', count: patients.length, color: '#1e6bb8', bg: '#eff6ff' },
          { label: 'Active', count: tabCount('Active'), color: '#15803d', bg: '#f0fdf4' },
          { label: 'Inactive', count: tabCount('Inactive'), color: '#c2410c', bg: '#fff7ed' },
          { label: 'Discharged', count: tabCount('Discharged'), color: '#b91c1c', bg: '#fef2f2' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} style={{ background: 'white', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer', border: `1.5px solid ${activeTab === label || (label === 'All Patients' && activeTab === 'All') ? color : 'transparent'}` }}
            onClick={() => setActiveTab(label === 'All Patients' ? 'All' : label)}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={16} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{count}</p>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Panel Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {PANEL_TABS.map(tab => {
          const isActive = activeTab === tab;
          const tabColor = TAB_COLORS[tab]?.active || '#1e6bb8';
          const count = tabCount(tab);
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.45rem 1rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                border: '1.5px solid', transition: 'all 0.15s',
                ...(isActive
                  ? { background: tabColor, color: '#fff', borderColor: tabColor }
                  : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' })
              }}>
              {tab}
              <span style={{
                background: isActive ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                color: isActive ? '#fff' : '#64748b',
                padding: '0 0.4rem', borderRadius: 10, fontSize: '0.72rem',
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="doctor-search">
        <Search size={18} color="#94a3b8" />
        <input type="text" placeholder="Search patients by name or email..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)} />
        <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{filtered.length} patient{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Tab context help */}
      {activeTab !== 'All' && (
        <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', background: activeTab === 'Active' ? '#f0fdf4' : activeTab === 'Inactive' ? '#fff7ed' : '#fef2f2', borderRadius: 10, fontSize: '0.8rem', color: activeTab === 'Active' ? '#15803d' : activeTab === 'Inactive' ? '#c2410c' : '#b91c1c', fontWeight: 600 }}>
          {activeTab === 'Active' && 'Active patients under your care. Open overview to manage status or orders.'}
          {activeTab === 'Inactive' && 'Inactive patients. Open overview to reactivate or discharge.'}
          {activeTab === 'Discharged' && 'Discharged patients. Open overview to reactivate.'}
        </div>
      )}

      <div className="doctor-card">
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading patients...</p>
        ) : filtered.length === 0 ? (
          <div className="doctor-empty-state">
            <Users size={40} />
            <h3>{searchQuery ? 'No patients match your search' : `No ${activeTab.toLowerCase()} patients`}</h3>
            <p>Patients appear here when they book appointments with you.</p>
          </div>
        ) : (
          <table className="doctor-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Email</th>
                <th>Appointments</th>
                <th>Last Visit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <Paged items={filtered} table>{(filtered) => filtered.map(patient => {
                const ss = STATUS_STYLE[patient.patientStatus] || STATUS_STYLE.active;
                return (
                  <tr key={patient.id} style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/dashboard/patient-overview/${patient.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e8f1fb', color: '#1e6bb8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>
                          {(patient.name || 'P')[0].toUpperCase()}
                        </div>
                        <div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#1e293b' }}>{patient.name}</p>
                          {patient.completedCount > 0 && (
                            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{patient.completedCount} completed</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.875rem' }}>{patient.email || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{patient.appointmentCount}</td>
                    <td style={{ fontSize: '0.875rem', color: '#64748b' }}>{fmtDate(patient.lastVisit)}</td>
                    <td>
                      <span style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`, padding: '0.2rem 0.65rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 }}>
                        {ss.label}
                      </span>
                    </td>
                  </tr>
                );
              })}</Paged>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
