import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Users, Calendar, Star, Clock } from 'lucide-react';
import { db } from '../../../services/firestoreShim';
import { collection, query, where, getDocs, doc, getDoc } from '../../../services/firestoreShim';
import PracticeAnalyticsPanel from '../../Common/PracticeAnalyticsPanel';

export default function DoctorAnalytics({ profile }) {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [stats, setStats] = useState({
    totalEarnings: 0, totalAppointments: 0, completedAppointments: 0,
    cancelledAppointments: 0, totalPatients: 0, avgRating: 0, totalReviews: 0,
    appointmentsByMonth: [], appointmentsByType: {}, earningsByMonth: [],
  });

  useEffect(() => {
    if (profile?.id) loadAnalytics();
  }, [profile]);

  const loadAnalytics = async () => {
    try {
      // Fetch all appointments
      const apptsQ = query(collection(db, 'doctorAppointments'), where('doctorId', '==', profile.id));
      const apptsSnap = await getDocs(apptsQ);
      const appts = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Distinct patients from the appointments themselves (the doctor/patients
      // subcollection isn't always populated).
      const patientCount = new Set(appts.map(a => a.clientId || a.patientId).filter(Boolean)).size;

      // Fetch reviews
      const reviewsQ = query(collection(db, 'doctorReviews'), where('doctorId', '==', profile.id));
      const reviewsSnap = await getDocs(reviewsQ);
      const reviews = reviewsSnap.docs.map(d => d.data());

      // The doctor's consultation fee (appointment rows don't carry a fee).
      let fee = 0;
      try {
        const docSnap = await getDoc(doc(db, 'doctors', profile.id));
        const dd = docSnap.exists() ? docSnap.data() : {};
        fee = Number(dd.consultationFee);
        if (!Number.isFinite(fee)) fee = Number(JSON.parse(dd.metadataJson || '{}').consultationFee) || 0;
      } catch { fee = 0; }

      // Compute stats
      const completed = appts.filter(a => a.status === 'completed');
      const cancelled = appts.filter(a => a.status === 'cancelled');
      const totalEarnings = completed.length * fee;
      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
        : 0;

      // Group by month
      const monthMap = {};
      const earningsMap = {};
      appts.forEach(a => {
        if (!a.date) return;
        const month = a.date.substring(0, 7); // YYYY-MM
        monthMap[month] = (monthMap[month] || 0) + 1;
        if (a.status === 'completed') {
          earningsMap[month] = (earningsMap[month] || 0) + fee;
        }
      });

      const sortedMonths = Object.keys(monthMap).sort();
      const appointmentsByMonth = sortedMonths.map(m => ({
        month: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        count: monthMap[m],
      }));
      const earningsByMonth = sortedMonths.map(m => ({
        month: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        amount: earningsMap[m] || 0,
      }));

      // Group by type
      const typeMap = {};
      appts.forEach(a => {
        const type = a.consultationType || 'video';
        typeMap[type] = (typeMap[type] || 0) + 1;
      });

      setStats({
        totalEarnings,
        totalAppointments: appts.length,
        completedAppointments: completed.length,
        cancelledAppointments: cancelled.length,
        totalPatients: patientCount,
        avgRating: avgRating.toFixed(1),
        totalReviews: reviews.length,
        appointmentsByMonth,
        appointmentsByType: typeMap,
        earningsByMonth,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const maxAppts = Math.max(...stats.appointmentsByMonth.map(m => m.count), 1);
  const maxEarnings = Math.max(...stats.earningsByMonth.map(m => m.amount), 1);

  if (loading) {
    return (
      <div className="doctor-page">
        <div className="doctor-page-header">
          <h1>Analytics</h1>
          <p>Loading your practice analytics...</p>
        </div>
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>Loading analytics data...</p>
      </div>
    );
  }

  return (
    <div className="doctor-page">
      <div className="doctor-page-header">
        <h1>Analytics</h1>
        <p>Track your practice performance and earnings</p>
      </div>

      {/* Counted server-side against the previous period; the model only
          writes the paragraph over those figures. */}
      <PracticeAnalyticsPanel scope="me" />

      {/* Top Stats */}
      <div className="doctor-stats-grid">
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <DollarSign size={24} />
          </div>
          <div>
            <p className="doctor-stat-value">${stats.totalEarnings.toLocaleString()}</p>
            <p className="doctor-stat-label">Total Earnings</p>
          </div>
        </div>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: '#e8f1fb', color: '#1e6bb8' }}>
            <Calendar size={24} />
          </div>
          <div>
            <p className="doctor-stat-value">{stats.totalAppointments}</p>
            <p className="doctor-stat-label">Total Appointments</p>
          </div>
        </div>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
            <Users size={24} />
          </div>
          <div>
            <p className="doctor-stat-value">{stats.totalPatients}</p>
            <p className="doctor-stat-label">Total Patients</p>
          </div>
        </div>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Star size={24} />
          </div>
          <div>
            <p className="doctor-stat-value">{stats.avgRating}</p>
            <p className="doctor-stat-label">Avg Rating ({stats.totalReviews} reviews)</p>
          </div>
        </div>
      </div>

      <div className="doctor-grid-2">
        {/* Appointments Chart */}
        <div className="doctor-card">
          <h3>Appointments by Month</h3>
          {stats.appointmentsByMonth.length === 0 ? (
            <div className="doctor-empty-state">
              <TrendingUp size={32} />
              <p>No appointment data yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 180, padding: '0.5rem 0' }}>
              {stats.appointmentsByMonth.slice(-12).map((m, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>{m.count}</span>
                  <div style={{
                    width: '100%', maxWidth: 40, borderRadius: '4px 4px 0 0',
                    background: 'linear-gradient(180deg, #1e6bb8, #155a9c)',
                    height: `${(m.count / maxAppts) * 140}px`,
                    minHeight: 4, transition: 'height 0.3s',
                  }} />
                  <span style={{ fontSize: '0.6rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Earnings Chart */}
        <div className="doctor-card">
          <h3>Earnings by Month</h3>
          {stats.earningsByMonth.length === 0 ? (
            <div className="doctor-empty-state">
              <DollarSign size={32} />
              <p>No earnings data yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 180, padding: '0.5rem 0' }}>
              {stats.earningsByMonth.slice(-12).map((m, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>${m.amount}</span>
                  <div style={{
                    width: '100%', maxWidth: 40, borderRadius: '4px 4px 0 0',
                    background: 'linear-gradient(180deg, #10b981, #059669)',
                    height: `${(m.amount / maxEarnings) * 140}px`,
                    minHeight: 4, transition: 'height 0.3s',
                  }} />
                  <span style={{ fontSize: '0.6rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="doctor-grid-2">
        {/* Appointment Breakdown */}
        <div className="doctor-card">
          <h3>Appointment Status Breakdown</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { label: 'Completed', value: stats.completedAppointments, color: '#10b981', bg: '#dcfce7' },
              { label: 'Cancelled', value: stats.cancelledAppointments, color: '#ef4444', bg: '#fee2e2' },
              { label: 'Pending/Confirmed', value: stats.totalAppointments - stats.completedAppointments - stats.cancelledAppointments, color: '#f59e0b', bg: '#fef3c7' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.85rem', color: '#1e293b' }}>{item.label}</span>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{item.value}</span>
                <div style={{ width: 80, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${stats.totalAppointments ? (item.value / stats.totalAppointments) * 100 : 0}%`,
                    height: '100%', background: item.color, borderRadius: 3,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Consultation Types */}
        <div className="doctor-card">
          <h3>Consultation Types</h3>
          {Object.keys(stats.appointmentsByType).length === 0 ? (
            <div className="doctor-empty-state">
              <Clock size={32} />
              <p>No consultation data yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(stats.appointmentsByType).map(([type, count]) => {
                const colors = { video: '#1e6bb8', chat: '#7c3aed', 'in-person': '#059669', inPerson: '#059669' };
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: (colors[type] || '#64748b') + '15',
                      color: colors[type] || '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                    }}>
                      {type.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </p>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{
                          width: `${(count / stats.totalAppointments) * 100}%`,
                          height: '100%', background: colors[type] || '#64748b', borderRadius: 3,
                        }} />
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
