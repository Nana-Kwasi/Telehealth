import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import {
  RefreshCw, TrendingUp, TrendingDown, UserPlus, CalendarDays, Brain, Pill, FlaskConical, MessageSquare,
  BadgeCheck, Inbox, Radar, Clock, ChevronRight, Stethoscope, Building2, Users, Bell, FileDown,
  LogIn, ShieldAlert, Activity, CheckCircle2,
} from 'lucide-react';
import { api } from '../../../services/apiClient';
import PracticeAnalyticsPanel from '../../Common/PracticeAnalyticsPanel';
import WeatherCard from '../../Common/WeatherCard';
import AdminLocationCard from './AdminLocationCard';
import AdminBriefing from './AdminBriefing';
import { subscribeLocationUpdate, applyLocationPatch } from '../../../utils/locationBus';
import './AdminOverview.css';

/**
 * Super admin home.
 *
 * One request (GET /api/v1/admin/overview) counted in the database, replacing
 * fourteen whole collections pulled into the browser. Leads with what is
 * waiting on an admin, then how the platform is moving, then who is on it.
 */
const KPI_META = {
  signups:       { icon: UserPlus,      color: '#3f7a55', series: 'signups' },
  appointments:  { icon: CalendarDays,  color: '#1e6bb8', series: 'appointments' },
  sessions:      { icon: Brain,         color: '#5046bd', series: 'sessions' },
  prescriptions: { icon: Pill,          color: '#b8860b', series: 'prescriptions' },
  orders:        { icon: FlaskConical,  color: '#0d9488', series: null },
  messages:      { icon: MessageSquare, color: '#c2410c', series: null },
};

const ROLES = [
  ['CLIENT', 'Therapy clients', '#5046bd'],
  ['PATIENT', 'Medical patients', '#1e6bb8'],
  ['THERAPIST', 'Therapists', '#8b7fe0'],
  ['DOCTOR', 'Doctors', '#3f7a55'],
  ['PHARMACY', 'Pharmacies', '#b8860b'],
  ['LAB', 'Labs & scan centres', '#0d9488'],
  ['HOME_CARE_NURSE', 'Home-care nurses', '#e07a5f'],
  ['ADMIN', 'Admins', '#64748b'],
];

const STATUS_COLORS = {
  confirmed: '#3f7a55', completed: '#1e6bb8', pending: '#b8860b', requested: '#b8860b',
  cancelled: '#c0262d', missed: '#c2410c', no_show: '#c2410c',
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function pct(cur, prev) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const ACTION_LABELS = {
  LOGIN_SUCCESS: ['Signed in', '#3f7a55'],
  LOGIN_FAILED: ['Failed sign-in', '#c0262d'],
  LOGOUT: ['Signed out', '#64748b'],
  ADMIN_USER_EDITED: ['Account edited by admin', '#1e6bb8'],
  ADMIN_USER_DELETED: ['Account deleted by admin', '#c0262d'],
  ADMIN_TEMP_PASSWORD_SET: ['Temporary password set', '#b8860b'],
  APPOINTMENT_BOOKED: ['Appointment booked', '#1e6bb8'],
};

export default function AdminOverview({ profile }) {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  // The admin's own profile, kept current when the location is changed here.
  const [me, setMe] = useState(profile);
  useEffect(() => { setMe(profile); }, [profile]);
  useEffect(() => subscribeLocationUpdate((patch) => setMe((p) => applyLocationPatch(p, patch))), []);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const d = await api(`/api/v1/admin/overview?days=${days}`);
      setData(d);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e?.message || 'The overview could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const series = useMemo(() => (data?.series || []).map((r) => ({
    ...r,
    label: new Date(`${r.day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  })), [data]);

  const roleSlices = useMemo(() => ROLES
    .map(([key, label, color]) => ({ key, label, color, value: Number(data?.people?.[key] || 0) }))
    .filter((r) => r.value > 0), [data]);

  const queues = data?.queues || {};
  const attention = [
    { key: 'approvals', label: 'Accounts to approve', icon: BadgeCheck, path: '/dashboard/approvals', tone: 'gold' },
    { key: 'reports', label: 'Open reports & tickets', icon: Inbox, path: '/dashboard/reports-center', tone: 'red' },
    { key: 'riskAlerts', label: 'Patterns to review', icon: Radar, path: '/dashboard/risk-alerts', tone: 'purple' },
    { key: 'pendingOrders', label: 'Lab & scan orders waiting', icon: FlaskConical, path: '/dashboard/reports', tone: 'teal' },
  ];
  const waiting = attention.reduce((n, a) => n + Number(queues[a.key] || 0), 0);
  const name = (profile?.name || profile?.fullName || '').split(' ')[0];

  const statusRows = data?.appointmentStatus || [];
  const statusTotal = statusRows.reduce((n, r) => n + Number(r.n || 0), 0);
  const logins = data?.logins24h || {};
  const loginTotal = Number(logins.success || 0) + Number(logins.failed || 0);
  const failRate = loginTotal ? Math.round((Number(logins.failed || 0) / loginTotal) * 100) : 0;

  return (
    <div className="admin-page ov">
      {/* ── Header ── */}
      <header className="ov-hero">
        <div>
          <p className="ov-eyebrow">Super admin</p>
          <h1>{greeting()}{name ? `, ${name}` : ''}</h1>
          <p className="ov-hero-sub">
            {waiting
              ? `${waiting} item${waiting === 1 ? '' : 's'} need${waiting === 1 ? 's' : ''} your attention.`
              : 'Nothing is waiting on you right now.'}
            {' '}Here is how NessaHub has moved over the last {days} days.
          </p>
        </div>
        <div className="ov-hero-actions">
          <div className="ov-period" role="tablist" aria-label="Period">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" role="tab" aria-selected={days === d}
                className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={busy}>
            <RefreshCw size={14} className={busy ? 'ov-spin' : ''} /> Refresh
          </button>
          {updatedAt ? <span className="ov-updated">Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : null}
        </div>
      </header>

      {error ? <div className="admin-alert admin-alert-danger">{error}</div> : null}

      {/* ── Where you are, and the weather there ── */}
      <section className="ov-context">
        <AdminLocationCard profile={me} onSaved={(patch) => setMe((p) => applyLocationPatch(p, patch))} />
        <div className="ov-weather"><WeatherCard profile={me} compact /></div>
      </section>

      {/* ── Needs attention ── */}
      <section className="ov-attention">
        {attention.map((a) => {
          const n = Number(queues[a.key] || 0);
          return (
            <button key={a.key} type="button" className={`ov-attn ${n ? `tone-${a.tone}` : 'clear'}`} onClick={() => navigate(a.path)}>
              <span className="ov-attn-icon"><a.icon size={18} /></span>
              <span className="ov-attn-body">
                <strong>{data ? n : '–'}</strong>
                <span>{a.label}</span>
              </span>
              {n ? <ChevronRight size={16} className="ov-attn-go" /> : <CheckCircle2 size={16} className="ov-attn-ok" />}
            </button>
          );
        })}
      </section>

      {/* ── AI briefing ── */}
      <AdminBriefing days={days} />

      {/* ── KPIs ── */}
      <section className="ov-kpis">
        {(data?.kpis || Object.keys(KPI_META).map((key) => ({ key, label: '', current: null }))).map((k) => {
          const meta = KPI_META[k.key] || KPI_META.signups;
          const change = k.current == null ? null : pct(k.current, k.previous);
          const spark = meta.series ? series.map((r) => ({ v: Number(r[meta.series] || 0) })) : null;
          return (
            <div key={k.key} className="ov-kpi">
              <div className="ov-kpi-top">
                <span className="ov-kpi-icon" style={{ background: `${meta.color}14`, color: meta.color }}><meta.icon size={18} /></span>
                {change === null || k.current == null ? (
                  <span className="ov-delta flat">{k.current == null ? '' : 'new'}</span>
                ) : (
                  <span className={`ov-delta ${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}`}>
                    {change > 0 ? <TrendingUp size={13} /> : change < 0 ? <TrendingDown size={13} /> : null}
                    {change > 0 ? '+' : ''}{change}%
                  </span>
                )}
              </div>
              <div className="ov-kpi-value">{k.current == null ? <span className="ov-skel" /> : k.current.toLocaleString()}</div>
              <div className="ov-kpi-label">{k.label || ' '}</div>
              <div className="ov-kpi-foot">
                {k.current == null ? '' : `vs ${Number(k.previous || 0).toLocaleString()} before · ${Number(k.total || 0).toLocaleString()} all time`}
              </div>
              {spark && spark.length > 1 ? (
                <div className="ov-spark" aria-hidden="true">
                  <ResponsiveContainer width="100%" height={36}>
                    <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`sp-${k.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={meta.color} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke={meta.color} strokeWidth={2} fill={`url(#sp-${k.key})`} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      {/* ── Outcomes, sign-ins, quick actions ── */}
      <section className="ov-row ov-row-3">
        <div className="ov-card">
          <div className="ov-card-head">
            <div>
              <h2>Appointment outcomes</h2>
              <p>Doctor appointments created in the last {days} days</p>
            </div>
          </div>
          {statusRows.length === 0 ? (
            <p className="ov-muted">No appointments in this period.</p>
          ) : (
            <ul className="ov-bars">
              {statusRows.map((r) => {
                const n = Number(r.n || 0);
                const color = STATUS_COLORS[r.status] || '#64748b';
                return (
                  <li key={r.status}>
                    <div className="ov-bar-label">
                      <span>{String(r.status).replace(/_/g, ' ')}</span>
                      <strong>{n}</strong>
                    </div>
                    <div className="ov-bar-track"><div className="ov-bar-fill" style={{ width: `${(n / statusTotal) * 100}%`, background: color }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="ov-card">
          <div className="ov-card-head">
            <div>
              <h2>Sign-in health</h2>
              <p>Last 24 hours</p>
            </div>
          </div>
          <div className="ov-logins">
            <div className="ov-login ok">
              <LogIn size={18} />
              <strong>{Number(logins.success || 0)}</strong>
              <span>successful</span>
            </div>
            <div className={`ov-login ${Number(logins.failed || 0) ? 'bad' : 'ok'}`}>
              <ShieldAlert size={18} />
              <strong>{Number(logins.failed || 0)}</strong>
              <span>failed</span>
            </div>
          </div>
          <p className={`ov-note ${failRate >= 25 ? 'warn' : ''}`}>
            {loginTotal
              ? failRate >= 25
                ? `${failRate}% of sign-ins failed — check the audit log for repeated attempts.`
                : `${failRate}% of sign-ins failed. Nothing unusual.`
              : 'No sign-ins recorded in the last day.'}
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/audit-log')}>
            Open audit log <ChevronRight size={14} />
          </button>
        </div>

        <div className="ov-card">
          <div className="ov-card-head">
            <div>
              <h2>Quick actions</h2>
              <p>Common admin tasks</p>
            </div>
          </div>
          <div className="ov-quick">
            {[
              ['Onboard doctor', Stethoscope, '/dashboard/onboard-doctor', '#3f7a55'],
              ['Onboard therapist', Brain, '/dashboard/onboard-therapist', '#5046bd'],
              ['Create pharmacy', Building2, '/dashboard/create-pharmacy', '#b8860b'],
              ['Create lab / scan', FlaskConical, '/dashboard/create-lab-scan', '#0d9488'],
              ['Send notification', Bell, '/dashboard/notifications', '#1e6bb8'],
              ['Export PDF report', FileDown, '/dashboard/system-pdf-export', '#c2410c'],
            ].map(([label, Icon, path, color]) => (
              <button key={label} type="button" onClick={() => navigate(path)}>
                <span style={{ background: `${color}14`, color }}><Icon size={17} /></span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trend + people ── */}
      <section className="ov-row ov-row-2-1">
        <div className="ov-card">
          <div className="ov-card-head">
            <div>
              <h2>Activity</h2>
              <p>New appointments, therapy sessions, prescriptions and accounts, day by day.</p>
            </div>
          </div>
          <div className="ov-chart">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  {[['appointments', '#1e6bb8'], ['sessions', '#5046bd'], ['prescriptions', '#b8860b'], ['signups', '#3f7a55']].map(([k, c]) => (
                    <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={c} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8edf2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5b6577' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5b6577' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e3e8ef', fontSize: 12 }} />
                <Area isAnimationActive={false} type="monotone" name="Appointments" dataKey="appointments" stroke="#1e6bb8" strokeWidth={2} fill="url(#g-appointments)" />
                <Area isAnimationActive={false} type="monotone" name="Therapy sessions" dataKey="sessions" stroke="#5046bd" strokeWidth={2} fill="url(#g-sessions)" />
                <Area isAnimationActive={false} type="monotone" name="Prescriptions" dataKey="prescriptions" stroke="#b8860b" strokeWidth={2} fill="url(#g-prescriptions)" />
                <Area isAnimationActive={false} type="monotone" name="New accounts" dataKey="signups" stroke="#3f7a55" strokeWidth={2} fill="url(#g-signups)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="ov-legend">
            {[['Appointments', '#1e6bb8'], ['Therapy sessions', '#5046bd'], ['Prescriptions', '#b8860b'], ['New accounts', '#3f7a55']].map(([l, c]) => (
              <span key={l}><i style={{ background: c }} />{l}</span>
            ))}
          </div>
        </div>

        <div className="ov-card">
          <div className="ov-card-head">
            <div>
              <h2>People on NessaHub</h2>
              <p>{Number(data?.people?.TOTAL || 0).toLocaleString()} accounts in total</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/users')}>
              <Users size={14} /> Manage
            </button>
          </div>
          <div className="ov-donut">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={roleSlices} dataKey="value" nameKey="label" innerRadius={58} outerRadius={86} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {roleSlices.map((r) => <Cell key={r.key} fill={r.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e3e8ef', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="ov-donut-center">
              <strong>{Number(data?.people?.TOTAL || 0).toLocaleString()}</strong>
              <span>accounts</span>
            </div>
          </div>
          <ul className="ov-roles">
            {roleSlices.map((r) => (
              <li key={r.key}>
                <i style={{ background: r.color }} />
                <span>{r.label}</span>
                <strong>{r.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Recent activity + platform figures ── */}
      <section className="ov-row ov-row-1-2">
        <div className="ov-card">
          <div className="ov-card-head">
            <div>
              <h2>Recent activity</h2>
              <p>Latest events across the platform</p>
            </div>
            <Activity size={16} className="ov-muted-icon" />
          </div>
          {(data?.recent || []).length === 0 ? <p className="ov-muted">No recent events.</p> : (
            <ul className="ov-feed">
              {data.recent.map((e, i) => {
                const [label, color] = ACTION_LABELS[e.action] || [String(e.action || 'Event').replace(/_/g, ' ').toLowerCase(), '#64748b'];
                return (
                  <li key={i}>
                    <i style={{ background: color }} />
                    <div>
                      <strong>{label}</strong>
                      <span>{[e.user_name, e.user_type, e.platform].filter(Boolean).join(' · ')}</span>
                    </div>
                    <time><Clock size={11} /> {timeAgo(e.at)}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="ov-figures">
          <PracticeAnalyticsPanel scope="platform" />
        </div>
      </section>
    </div>
  );
}
