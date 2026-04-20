import React, { useState, useEffect } from 'react';
import { db } from '../../Auth/firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function PharmacyOverview({ profile }) {
  const [stats, setStats] = useState({ branches: 0, incoming: 0, active: 0, completed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const pharmacyId = profile?.id;

      const branchSnap = await getDocs(query(collection(db, 'pharmacyBranches'), where('pharmacyId', '==', pharmacyId)));

      const rxSnap = await getDocs(query(collection(db, 'doctorPrescriptions'), where('pharmacyId', '==', pharmacyId)));
      const rxList = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      setStats({
        branches: branchSnap.size,
        incoming: rxList.filter(r => r.pharmacyStatus === 'sent' || !r.pharmacyStatus).length,
        active: rxList.filter(r => ['accepted', 'partially_fulfilled'].includes(r.pharmacyStatus)).length,
        completed: rxList.filter(r => ['ready', 'delivered'].includes(r.pharmacyStatus)).length,
      });
    } catch (e) {
      console.error('PharmacyOverview load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const CARDS = [
    { label: 'Branches',           value: stats.branches,  icon: '🏪', bg: '#e0f2fe', color: '#0369a1' },
    { label: 'Incoming Rx',        value: stats.incoming,  icon: '📥', bg: '#fef9c3', color: '#a16207' },
    { label: 'Active Orders',      value: stats.active,    icon: '⚡', bg: '#dcfce7', color: '#15803d' },
    { label: 'Completed Orders',   value: stats.completed, icon: '✅', bg: '#f0fdf4', color: '#16a34a' },
  ];

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading…</div>;

  return (
    <div className="pharmacy-page">
      <h1 className="pharmacy-page-title">Dashboard Overview</h1>
      <p className="pharmacy-page-sub">{profile?.pharmacyName || 'Your Pharmacy'} — All Branches</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {CARDS.map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 12, padding: '1.25rem', border: '1px solid #e0f2fe' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              {c.icon}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0f2fe', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700, color: '#0c4a6e' }}>Quick Links</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a href="#/dashboard/branches" style={{ textDecoration: 'none' }}>
            <button style={{ padding: '0.6rem 1.2rem', borderRadius: 8, background: '#0ea5e9', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
              🏪 Manage Branches
            </button>
          </a>
          <a href="#/dashboard/prescriptions" style={{ textDecoration: 'none' }}>
            <button style={{ padding: '0.6rem 1.2rem', borderRadius: 8, background: '#0c4a6e', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
              💊 View Prescriptions
            </button>
          </a>
        </div>
      </div>
    </div>
  );
}
