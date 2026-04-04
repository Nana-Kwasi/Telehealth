import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, Clock, CheckCircle, AlertCircle, FileText,
  Video, TrendingUp, Activity, Pill, ChevronRight, Star,
  ChevronLeft,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { db } from '../../Auth/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';

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

export default function DoctorHome({ profile }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ patients: 0, todayAppts: 0, pending: 0, completed: 0, totalRevenue: 0, weekAppts: 0 });
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [allAppts, setAllAppts] = useState([]);

  // Calendar state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  useEffect(() => { if (profile?.id) loadDashboardData(); }, [profile]);

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
    <div className="doctor-page">

      {/* ── White Welcome Banner ── */}
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '1.75rem 2rem',
        marginBottom: '1.5rem',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '1.6rem' }}>👨‍⚕️</span>
          </div>
          <div>
            <p style={{ margin: '0 0 0.2rem', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>{todayFmt}</p>
            <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {greeting}, Dr. {profile?.name?.split(' ')[0] || 'Doctor'} 👋
            </h1>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, padding: '0.25rem 0.65rem', borderRadius: 20, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                <Activity size={11} /> {profile?.specialization || 'Medical Doctor'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, padding: '0.25rem 0.65rem', borderRadius: 20, background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                <CheckCircle size={11} /> {stats.todayAppts} appt{stats.todayAppts !== 1 ? 's' : ''} today
              </span>
              {stats.pending > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, padding: '0.25rem 0.65rem', borderRadius: 20, background: '#fef9c3', color: '#b45309', border: '1px solid #fde68a' }}>
                  <Clock size={11} /> {stats.pending} pending
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
          {stats.pending > 0 && (
            <button onClick={() => navigate('/dashboard/appointments')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 1.25rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: '#f59e0b', color: 'white', boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
              <AlertCircle size={15} /> Review Pending
            </button>
          )}
          <button onClick={() => navigate('/dashboard/patients')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 1.25rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid #e2e8f0', background: 'white', color: '#334155' }}>
            <Users size={15} /> View Patients
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="doctor-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard icon={Users}       value={stats.patients}   label="Total Patients"        color="#2563eb" bg="#eff6ff" onClick={() => navigate('/dashboard/patients')} />
        <StatCard icon={Calendar}    value={stats.todayAppts} label="Today's Appointments"   color="#16a34a" bg="#dcfce7" />
        <StatCard icon={Clock}       value={stats.pending}    label="Pending Confirmations"  color="#d97706" bg="#fef9c3" onClick={() => navigate('/dashboard/appointments')} />
        <StatCard icon={CheckCircle} value={stats.completed}  label="Completed Sessions"     color="#7c3aed" bg="#f3e8ff" />
        <StatCard icon={TrendingUp}  value={fmtCurrency(stats.totalRevenue)} label="Est. Revenue" color="#059669" bg="#d1fae5" />
        <StatCard icon={Activity}    value={stats.weekAppts}  label="This Week"              color="#0284c7" bg="#e0f2fe" />
      </div>

      {/* ── Calendar + Recent Activity Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'start' }}>

      {/* Appointment Calendar */}
      <div className="doctor-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Appointment Calendar</h3>
            <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Click a highlighted date to view appointments</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button onClick={() => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); }} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', minWidth: 130, textAlign: 'center' }}>{MONTHS[calMonth]} {calYear}</span>
            <button onClick={() => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); }} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={15} />
            </button>
            <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => navigate('/dashboard/appointments')}>
              Full View <ChevronRight size={13} />
            </button>
          </div>
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
      </div>

      {/* Recent Activity (second column of the grid row) */}
      <div className="doctor-card">
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div className="doctor-empty-state">
            <Activity size={36} color="#cbd5e1" />
            <h3>No recent activity</h3>
            <p>Activity will appear as appointments are booked.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {recentActivity.map(a => {
              const cfg = {
                pending:   { msg: `${a.clientName || 'A patient'} booked an appointment`,   color: '#d97706', bg: '#fef9c3', icon: Clock },
                confirmed: { msg: `Appointment confirmed with ${a.clientName || 'patient'}`, color: '#16a34a', bg: '#dcfce7', icon: CheckCircle },
                completed: { msg: `Session completed with ${a.clientName || 'patient'}`,    color: '#2563eb', bg: '#eff6ff', icon: Star },
                cancelled: { msg: `Appointment cancelled — ${a.clientName || 'patient'}`,   color: '#dc2626', bg: '#fee2e2', icon: AlertCircle },
              };
              const { msg, color, bg, icon: Icon } = cfg[a.status] || cfg.pending;
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.85rem', borderRadius: 10, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', fontWeight: 500 }}>{msg}</p>
                    {a.date && <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>{a.date}{a.time ? ` · ${a.time}` : ''}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      </div>{/* ── end Calendar + Recent Activity row ── */}

      {/* ── Quick Actions ── */}
      <div className="doctor-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.75rem' }}>
          {[
            { icon: AlertCircle, label: `Pending (${stats.pending})`, path: '/dashboard/appointments', color: '#d97706', bg: '#fef9c3' },
            { icon: Users,       label: 'All Patients',               path: '/dashboard/patients',    color: '#2563eb', bg: '#eff6ff' },
            { icon: FileText,    label: 'Write Note',                  path: '/dashboard/notes',       color: '#7c3aed', bg: '#f3e8ff' },
            { icon: Pill,        label: 'Prescriptions',               path: '/dashboard/prescriptions', color: '#059669', bg: '#d1fae5' },
            { icon: Video,       label: 'Video Calls',                 path: '/dashboard/video',       color: '#0284c7', bg: '#e0f2fe' },
            { icon: Star,        label: 'Reviews',                     path: '/dashboard/reviews',     color: '#f59e0b', bg: '#fef3c7' },
          ].map(({ icon: Icon, label, path, color, bg }) => (
            <button key={path} onClick={() => navigate(path)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.85rem 1rem', borderRadius: 12, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = bg; e.currentTarget.style.borderColor = color + '60'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.transform = 'none'; }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 9, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} />
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Analytics Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', marginBottom: '1.25rem' }}>

        {/* Area chart — 6-month appointments trend */}
        <div className="doctor-card">
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

        {/* Pie chart — appointment status breakdown */}
        <div className="doctor-card">
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
      </div>

      {/* ── Monthly Bar Chart ── */}
      {allAppts.length > 0 && (
        <div className="doctor-card" style={{ marginBottom: '1.25rem' }}>
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

      <div className="doctor-grid-2">
        {/* Today's schedule */}
        <div className="doctor-card">
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

        {/* Recent patients */}
        <div className="doctor-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Recent Patients</h3>
            <button className="doctor-btn doctor-btn-sm doctor-btn-outline" onClick={() => navigate('/dashboard/patients')}>All patients</button>
          </div>
          {recentPatients.length === 0 ? (
            <div className="doctor-empty-state">
              <Users size={36} color="#cbd5e1" />
              <h3>No patients yet</h3>
              <p>Patients will appear once they book appointments.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentPatients.map(p => (
                <div key={p.id} onClick={() => navigate(`/dashboard/patients/${p.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #f3e8ff, #ede9fe)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
                    {(p.name || 'P')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>{p.name}</p>
                    {p.lastDate && <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>Last visit: {p.lastDate}</p>}
                  </div>
                  <ChevronRight size={15} color="#cbd5e1" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
