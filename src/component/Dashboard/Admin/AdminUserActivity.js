import React, { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { api } from '../../../services/apiClient';
import { CATEGORIES, CAT_COLOR, when, device, Pill, Outcome, Kpi, Card, downloadActivityCsv, input, btn } from './activityUi';
import Paged from '../../Common/Paged';

/**
 * One user's activity trail for the super admin: everything they did (and
 * everything admins did to their account), with charts, filters and a CSV
 * report; and their security picture — sign-ins, password resets, two-step,
 * devices and IP addresses. Health content is never part of the trail.
 */
export default function AdminUserActivity({ userId, name, view = 'trail' }) {
  const [days, setDays] = useState(30);
  const [sum, setSum] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ category: '', outcome: '', q: '', from: '', to: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!userId) return;
    api(`/api/v1/admin/activity/summary?userId=${userId}&days=${days}`).then(setSum).catch((e) => setErr(e?.message || 'Could not load the summary.'));
  }, [userId, days]);

  const load = useCallback(async (offset = 0) => {
    if (!userId) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ userId, limit: 100, offset, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
      const d = await api(`/api/v1/admin/activity?${qs}`);
      setTotal(d.total || 0);
      setRows((r) => (offset ? [...r, ...(d.rows || [])] : d.rows || []));
    } catch (e) { setErr(e?.message || 'Could not load the activity.'); } finally { setBusy(false); }
  }, [userId, f]);
  useEffect(() => {
    if (view !== 'trail') return undefined;
    const t = setTimeout(() => load(0), 300);   // typing in search waits a moment
    return () => clearTimeout(t);
  }, [load, view]);

  if (!userId) return <Card title="Activity">No account id for this user.</Card>;
  const k = sum?.kpis || {};
  const all = sum?.allTime || {};

  if (view === 'security') {
    return (
      <div>
        {err ? <p style={{ color: '#b91c1c' }}>{err}</p> : null}
        <div style={grid}>
          <Kpi label="Sign-ins (all time)" value={all.sign_ins} color="#16a34a" />
          <Kpi label="Failed sign-ins" value={all.failed_sign_ins} color={Number(all.failed_sign_ins) > 5 ? '#dc2626' : '#0f172a'} />
          <Kpi label="Password reset links" value={all.password_reset_requests} color="#b45309" sub={`${all.password_resets_completed ?? 0} completed`} />
          <Kpi label="Password changes" value={all.password_changes} />
          <Kpi label="Two-step changes" value={all.two_factor_changes} />
          <Kpi label="First seen" value={all.first_seen ? new Date(all.first_seen).toLocaleDateString() : '—'} sub={`last ${when(all.last_seen)}`} />
        </div>
        <Card title="Security events" right={<button type="button" style={btn} onClick={() => downloadActivityCsv({ userId, category: 'security' }).catch((e) => alert(e.message))}>⬇ Export</button>}>
          <Table rows={sum?.security || []} empty="No security events recorded." cols={['createdAt', 'summary', 'outcome', 'platform', 'ip', 'userAgent']} />
        </Card>
        <Card title="Devices & sessions">
          {(sum?.devices || []).length === 0 ? <Empty>No sessions recorded.</Empty> : (
            <table style={table}><thead><tr><th style={th}>Device</th><th style={th}>IP</th><th style={th}>First used</th><th style={th}>Last used</th><th style={th}>Sessions</th><th style={th}>Now</th></tr></thead>
              <tbody>{sum.devices.map((d, i) => (
                <tr key={i}><td style={td}><b>{device(d.device)}</b><div style={muted} title={d.device}>{String(d.device).slice(0, 60)}</div></td><td style={td}>{d.ip || '—'}</td>
                  <td style={td}>{when(d.firstUsed)}</td><td style={td}>{when(d.lastUsed)}</td><td style={td}>{d.sessions}</td>
                  <td style={td}>{d.signedIn ? <span style={{ color: '#16a34a', fontWeight: 800 }}>signed in</span> : <span style={muted}>ended</span>}</td></tr>))}</tbody></table>)}
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          <Card title="IP addresses">
            {(sum?.ipAddresses || []).length === 0 ? <Empty>None recorded.</Empty> : sum.ipAddresses.map((r) => (
              <div key={r.ip} style={row}><span style={{ fontFamily: 'monospace', flex: 1 }}>{r.ip}</span><span style={muted}>{r.platforms}</span><b>{r.n}</b><span style={muted}>{when(r.lastSeen)}</span></div>))}
          </Card>
          <Card title="Admin actions on this account">
            {(sum?.adminActionsOnAccount || []).length === 0 ? <Empty>No admin has changed this account.</Empty> : sum.adminActionsOnAccount.map((r, i) => (
              <div key={i} style={row}><span style={{ flex: 1 }}>{r.summary}</span><span style={muted}>by {r.byName || 'admin'}</span><span style={muted}>{when(r.createdAt)}</span></div>))}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      {err ? <p style={{ color: '#b91c1c' }}>{err}</p> : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        <p style={{ margin: 0, color: '#475569', fontSize: '0.85rem' }}>Everything {name || 'this user'} did on NessaHub, and what admins did to the account. What was done is recorded — never the health content of it.</p>
        <div style={{ display: 'flex', gap: 6 }}>{[7, 30, 90, 365].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} style={{ ...btn, background: days === d ? '#0f172a' : '#fff', color: days === d ? '#fff' : '#0f172a' }}>{d === 365 ? '1 year' : `${d} days`}</button>))}</div>
      </div>
      <div style={grid}>
        <Kpi label={`Actions (${days}d)`} value={k.actions} />
        <Kpi label="Sign-ins" value={k.sign_ins} color="#16a34a" />
        <Kpi label="Failed sign-ins" value={k.failed_sign_ins} color={Number(k.failed_sign_ins) > 3 ? '#dc2626' : '#0f172a'} />
        <Kpi label="Password events" value={k.password_events} color="#b45309" />
        <Kpi label="Denied attempts" value={k.denied} color={Number(k.denied) > 0 ? '#b45309' : '#0f172a'} sub="tried something not allowed" />
        <Kpi label="Last seen" value={k.last_seen ? new Date(k.last_seen).toLocaleDateString() : '—'} sub={`${k.ip_addresses ?? 0} IP address(es)`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <Card title="Activity by day">
          <div style={{ height: 200 }}><ResponsiveContainer><BarChart data={sum?.byDay || []}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="n" name="Actions" fill="#1d4ed8" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="What kind of activity">
          <div style={{ height: 200, display: 'flex' }}>
            <ResponsiveContainer width="55%"><PieChart><Pie data={sum?.byCategory || []} dataKey="n" nameKey="category" innerRadius={45} outerRadius={80}>{(sum?.byCategory || []).map((c) => <Cell key={c.category} fill={CAT_COLOR[c.category] || '#94a3b8'} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
            <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.8rem' }}>{(sum?.byCategory || []).map((c) => (
              <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', cursor: 'pointer' }} onClick={() => setF({ ...f, category: c.category })}><Pill category={c.category} /><b>{c.n}</b></div>))}</div>
          </div>
        </Card>
        <Card title="Most frequent actions">
          {(sum?.topActions || []).length === 0 ? <Empty>Nothing yet.</Empty> : sum.topActions.map((a) => (
            <div key={a.action} style={row}><span style={{ flex: 1 }}>{a.summary}</span><b>{a.n}</b></div>))}
          <div style={{ ...muted, marginTop: 6 }}>Apps: {(sum?.byPlatform || []).map((p) => `${p.platform} ${p.n}`).join(' · ') || '—'}</div>
        </Card>
      </div>
      <Card title={`Full trail (${total})`} right={
        <button type="button" style={btn} onClick={() => downloadActivityCsv({ userId, ...f }).catch((e) => alert(e.message))}>⬇ Export report (CSV)</button>}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <select style={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}</select>
          <select style={input} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option value="">Any outcome</option><option value="OK">OK</option><option value="DENIED">Denied</option><option value="FAILED">Failed</option></select>
          <input style={{ ...input, minWidth: 200, flex: 1 }} placeholder="Search: password, prescription, IP…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <input type="date" style={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} title="From" />
          <input type="date" style={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} title="To" />
          {Object.values(f).some(Boolean) ? <button type="button" style={btn} onClick={() => setF({ category: '', outcome: '', q: '', from: '', to: '' })}>Clear</button> : null}
        </div>
        <Table rows={rows} empty={busy ? 'Loading…' : 'No activity matches.'} cols={['createdAt', 'actor', 'category', 'summary', 'outcome', 'target', 'platform', 'ip']} self={userId} />
        {rows.length < total ? <button type="button" style={{ ...btn, marginTop: 8 }} disabled={busy} onClick={() => load(rows.length)}>{busy ? 'Loading…' : `Load more (${total - rows.length} left)`}</button> : null}
      </Card>
    </div>
  );
}

function Table({ rows, cols, empty, self }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const head = { createdAt: 'When', actor: 'Who', category: 'Kind', summary: 'What', outcome: 'Result', target: 'Record', platform: 'App', ip: 'IP', userAgent: 'Device' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}><thead><tr>{cols.map((c) => <th key={c} style={th}>{head[c]}</th>)}</tr></thead>
        <tbody><Paged items={rows} table>{(rows) => rows.map((r) => (
          <tr key={r.id}>{cols.map((c) => (
            <td key={c} style={td}>{
              c === 'createdAt' ? <span style={{ whiteSpace: 'nowrap' }}>{when(r.createdAt)}</span>
                : c === 'actor' ? (String(r.userId) === String(self) ? <span style={muted}>this user</span> : <b>{r.userName || 'someone'} <span style={muted}>({String(r.role || '').toLowerCase()})</span></b>)
                : c === 'category' ? <Pill category={r.category} />
                : c === 'outcome' ? <Outcome outcome={r.outcome} />
                : c === 'target' ? (r.targetType ? <span style={muted}>{r.targetType}{r.targetId ? ` · ${String(r.targetId).slice(0, 8)}` : ''}</span> : '—')
                : c === 'userAgent' ? <span style={muted}>{device(r.userAgent)}</span>
                : c === 'summary' ? <span>{r.summary}</span>
                : <span style={muted}>{r[c] || '—'}</span>
            }</td>))}</tr>))}</Paged></tbody></table>
    </div>
  );
}

const Empty = ({ children }) => <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>{children}</p>;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' };
const th = { textAlign: 'left', padding: '0.45rem 0.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td = { padding: '0.5rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
const muted = { color: '#64748b', fontSize: '0.76rem' };
const row = { display: 'flex', gap: 10, alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem' };
