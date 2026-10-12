import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { api } from '../../../services/apiClient';
import { CATEGORIES, CAT_COLOR, when, Pill, Outcome, Kpi, Card, downloadActivityCsv, input, btn } from './activityUi';
import Paged from '../../Common/Paged';

/**
 * Everything everyone does on NessaHub, for the super admin: live activity,
 * who is most active, failed sign-ins, denied attempts, and a filterable,
 * exportable report of every action. Health content is never in the trail.
 */
const ROLES = ['', 'PATIENT', 'CLIENT', 'DOCTOR', 'THERAPIST', 'PHARMACY', 'LAB', 'SCAN_CENTER', 'HOME_CARE_NURSE', 'INSURER', 'FACILITY', 'ADMIN'];
const profilePath = (role, id) => `/dashboard/users/${({ DOCTOR: 'doctors', THERAPIST: 'therapists', HOME_CARE_NURSE: 'homeCareNurses', PHARMACY: 'pharmacies', LAB: 'labs', SCAN_CENTER: 'scanCenters' })[String(role || '').toUpperCase()] || 'auth'}/${id}`;

export default function AdminActivityMonitor() {
  const navigate = useNavigate();
  const [days, setDays] = useState(7);
  const [sum, setSum] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ category: '', role: '', outcome: '', q: '', from: '', to: '' });
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadSummary = useCallback(() => api(`/api/v1/admin/activity/summary?days=${days}`).then(setSum).catch(() => {}), [days]);
  const load = useCallback(async (offset = 0) => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ limit: 100, offset, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
      const d = await api(`/api/v1/admin/activity?${qs}`);
      setTotal(d.total || 0);
      setRows((r) => (offset ? [...r, ...(d.rows || [])] : d.rows || []));
    } catch { /* keep what is shown */ } finally { setBusy(false); }
  }, [f]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { const t = setTimeout(() => load(0), 300); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { loadSummary(); load(0); }, 30000);
    return () => clearInterval(t);
  }, [live, load, loadSummary]);

  const k = sum?.kpis || {};
  return (
    <div className="admin-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Activity monitor</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Every action by every user on web and mobile — sign-ins, password resets, changes, records opened. Append-only; health content is never recorded.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {[1, 7, 30, 90].map((d) => <button key={d} type="button" onClick={() => setDays(d)} style={{ ...btn, background: days === d ? '#0f172a' : '#fff', color: days === d ? '#fff' : '#0f172a' }}>{d === 1 ? 'Today' : `${d} days`}</button>)}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', fontWeight: 700 }}><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live</label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <Kpi label="Actions" value={k.actions} />
        <Kpi label="People active" value={k.people} color="#1d4ed8" />
        <Kpi label="Sign-ins" value={k.sign_ins} color="#16a34a" />
        <Kpi label="Failed sign-ins" value={k.failed_sign_ins} color={Number(k.failed_sign_ins) > 10 ? '#dc2626' : '#0f172a'} />
        <Kpi label="Password events" value={k.password_events} color="#b45309" />
        <Kpi label="Denied attempts" value={k.denied} color={Number(k.denied) > 0 ? '#b45309' : '#0f172a'} sub="tried something not allowed" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <Card title="Actions per day">
          <div style={{ height: 210 }}><ResponsiveContainer><BarChart data={sum?.byDay || []}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="n" name="Actions" fill="#1d4ed8" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="By kind">
          <div style={{ height: 210, display: 'flex' }}>
            <ResponsiveContainer width="55%"><PieChart><Pie data={sum?.byCategory || []} dataKey="n" nameKey="category" innerRadius={45} outerRadius={82}>{(sum?.byCategory || []).map((c) => <Cell key={c.category} fill={CAT_COLOR[c.category] || '#94a3b8'} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
            <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.8rem' }}>{(sum?.byCategory || []).map((c) => (
              <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', cursor: 'pointer' }} onClick={() => setF({ ...f, category: c.category })}><Pill category={c.category} /><b>{c.n}</b></div>))}</div>
          </div>
        </Card>
        <Card title="By role">
          {(sum?.byRole || []).map((r) => (
            <div key={r.role} style={rowS} onClick={() => setF({ ...f, role: r.role === 'unknown' ? '' : r.role })}><span style={{ flex: 1, cursor: 'pointer' }}>{String(r.role).toLowerCase().replace('_', ' ')}</span><b>{r.n}</b></div>))}
          <div style={{ color: '#64748b', fontSize: '0.76rem', marginTop: 6 }}>Apps: {(sum?.byPlatform || []).map((p) => `${p.platform} ${p.n}`).join(' · ') || '—'}</div>
        </Card>
        <Card title="Most active people">
          {(sum?.mostActive || []).map((p) => (
            <div key={p.userId} style={{ ...rowS, cursor: 'pointer' }} onClick={() => navigate(profilePath(p.role, p.userId))}>
              <span style={{ flex: 1 }}><b>{p.name || 'Unknown'}</b> <span style={{ color: '#64748b', fontSize: '0.76rem' }}>{String(p.role || '').toLowerCase()}</span></span><b>{p.n}</b></div>))}
        </Card>
        <Card title="Failed sign-ins by account">
          {(sum?.failedByAccount || []).length === 0 ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>None in this period.</p> : sum.failedByAccount.map((p, i) => (
            <div key={i} style={{ ...rowS, cursor: p.userId ? 'pointer' : 'default' }} onClick={() => p.userId && navigate(profilePath(null, p.userId))}><span style={{ flex: 1 }}>{p.name}</span><b style={{ color: Number(p.n) > 5 ? '#dc2626' : '#0f172a' }}>{p.n}</b></div>))}
        </Card>
        <Card title="Top actions">
          {(sum?.topActions || []).map((a) => <div key={a.action} style={rowS}><span style={{ flex: 1 }}>{a.summary}</span><b>{a.n}</b></div>)}
        </Card>
      </div>

      <Card title={`All activity (${total})`} right={<button type="button" style={btn} onClick={() => downloadActivityCsv(f).catch((e) => alert(e.message))}>⬇ Export report (CSV)</button>}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <select style={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}</select>
          <select style={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r || 'all'} value={r}>{r ? r.toLowerCase().replace('_', ' ') : 'Any role'}</option>)}</select>
          <select style={input} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option value="">Any outcome</option><option value="OK">OK</option><option value="DENIED">Denied</option><option value="FAILED">Failed</option></select>
          <input style={{ ...input, minWidth: 220, flex: 1 }} placeholder="Search name, action, IP… e.g. password reset" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <input type="date" style={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} title="From" />
          <input type="date" style={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} title="To" />
          {Object.values(f).some(Boolean) ? <button type="button" style={btn} onClick={() => setF({ category: '', role: '', outcome: '', q: '', from: '', to: '' })}>Clear</button> : null}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr>{['When', 'Who', 'Kind', 'What', 'Result', 'Record', 'App', 'IP'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{rows.length === 0 ? <tr><td colSpan={8} style={{ ...td, color: '#94a3b8' }}>{busy ? 'Loading…' : 'No activity matches.'}</td></tr> : <Paged items={rows} table>{(rows) => rows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(r.createdAt)}</td>
                <td style={td}>{r.userId ? <button type="button" onClick={() => navigate(profilePath(r.role, r.userId))} style={{ border: 'none', background: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>{r.userName || 'Unknown'}</button> : (r.userName || 'Unknown account')}
                  <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{String(r.role || '').toLowerCase()}</div></td>
                <td style={td}><Pill category={r.category} /></td>
                <td style={td}>{r.summary}</td>
                <td style={td}><Outcome outcome={r.outcome} /></td>
                <td style={{ ...td, color: '#64748b', fontSize: '0.76rem' }}>{r.targetType ? `${r.targetType}${r.targetId ? ` · ${String(r.targetId).slice(0, 8)}` : ''}` : '—'}</td>
                <td style={{ ...td, color: '#64748b', fontSize: '0.76rem' }}>{r.platform || '—'}</td>
                <td style={{ ...td, color: '#64748b', fontSize: '0.76rem', fontFamily: 'monospace' }}>{r.ip || '—'}</td>
              </tr>))}</Paged>}</tbody>
          </table>
        </div>
        {rows.length < total ? <button type="button" style={{ ...btn, marginTop: 8 }} disabled={busy} onClick={() => load(rows.length)}>{busy ? 'Loading…' : `Load more (${total - rows.length} left)`}</button> : null}
      </Card>
    </div>
  );
}

const th = { textAlign: 'left', padding: '0.45rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td = { padding: '0.5rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
const rowS = { display: 'flex', gap: 10, alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem' };
