import React, { useState, useEffect } from 'react';
import { db } from '../../../services/firestoreShim';
import { collection, getDocs, query, orderBy, limit } from '../../../services/firestoreShim';
import useSystemConfig, { cfg } from '../../../hooks/useSystemConfig';
import Paged from '../../Common/Paged';

const ACTION_PALETTE = {
  LOGIN_SUCCESS:           { color: '#16a34a', bg: '#f0fdf4', icon: '🔓' },
  LOGIN_FAILED:            { color: '#dc2626', bg: '#fff1f2', icon: '🚫' },
  LOGOUT:                  { color: '#94a3b8', bg: '#f8fafc', icon: '🔒' },
  APPOINTMENT_BOOKED:      { color: '#3f7a55', bg: '#e9f3ec', icon: '📅' },
  APPOINTMENT_CANCELLED:   { color: '#dc2626', bg: '#fff1f2', icon: '❌' },
  APPOINTMENT_RESCHEDULED: { color: '#d97706', bg: '#fff7ed', icon: '🔄' },
  APPOINTMENT_COMPLETED:   { color: '#059669', bg: '#f0fdf4', icon: '✅' },
  PRESCRIPTION_CREATED:    { color: '#7c3aed', bg: '#faf5ff', icon: '💊' },
  PRESCRIPTION_UPDATED:    { color: '#9333ea', bg: '#faf5ff', icon: '✏️' },
  PRESCRIPTION_CANCELLED:  { color: '#dc2626', bg: '#fff1f2', icon: '🗑️' },
  SESSION_SCHEDULED:       { color: '#0891b2', bg: '#ecfeff', icon: '🧠' },
  SESSION_COMPLETED:       { color: '#059669', bg: '#f0fdf4', icon: '✅' },
  SESSION_CANCELLED:       { color: '#dc2626', bg: '#fff1f2', icon: '❌' },
  LAB_ORDER_CREATED:       { color: '#065f46', bg: '#f0fdf4', icon: '🧪' },
  SCAN_ORDER_CREATED:      { color: '#6d28d9', bg: '#faf5ff', icon: '🩻' },
  REPORT_SUBMITTED:        { color: '#f59e0b', bg: '#fffbeb', icon: '📩' },
  REPORT_RESPONDED:        { color: '#3f7a55', bg: '#e9f3ec', icon: '💬' },
  ADMIN_USER_STATUS_CHANGED: { color: '#d97706', bg: '#fff7ed', icon: '⚙️' },
  ADMIN_USER_DELETED:      { color: '#b91c1c', bg: '#fff1f2', icon: '🗑️' },
  ADMIN_USER_EDITED:       { color: '#7c3aed', bg: '#faf5ff', icon: '✏️' },
  ADMIN_USER_APPROVED:     { color: '#059669', bg: '#f0fdf4', icon: '✅' },
  ADMIN_CONFIG_CHANGED:    { color: '#7c3aed', bg: '#faf5ff', icon: '⚙️' },
  ADMIN_NOTIFICATION_SENT: { color: '#0891b2', bg: '#ecfeff', icon: '📣' },
  DOCTOR_ONBOARDED:        { color: '#16a34a', bg: '#f0fdf4', icon: '🩺' },
  THERAPIST_ONBOARDED:     { color: '#7c3aed', bg: '#faf5ff', icon: '🧠' },
  PHARMACY_CREATED:        { color: '#ea580c', bg: '#fff7ed', icon: '💊' },
  LAB_CREATED:             { color: '#065f46', bg: '#f0fdf4', icon: '🧪' },
  PASSWORD_RESET_SENT:     { color: '#d97706', bg: '#fff7ed', icon: '🔑' },
  PROFILE_UPDATED:         { color: '#3f7a55', bg: '#e9f3ec', icon: '👤' },
};

const DEFAULT_PALETTE = { color: '#64748b', bg: '#f8fafc', icon: '📋' };

const PLATFORM_LABELS = { web: { label: 'Web', color: '#3f7a55' }, mobile: { label: 'Mobile', color: '#7c3aed' } };

const ACTION_GROUPS = {
  'Auth':          ['LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','PASSWORD_RESET_SENT'],
  'Appointments':  ['APPOINTMENT_BOOKED','APPOINTMENT_CANCELLED','APPOINTMENT_RESCHEDULED','APPOINTMENT_COMPLETED'],
  'Prescriptions': ['PRESCRIPTION_CREATED','PRESCRIPTION_UPDATED','PRESCRIPTION_CANCELLED'],
  'Sessions':      ['SESSION_SCHEDULED','SESSION_COMPLETED','SESSION_CANCELLED'],
  'Diagnostics':   ['LAB_ORDER_CREATED','SCAN_ORDER_CREATED'],
  'Reports':       ['REPORT_SUBMITTED','REPORT_RESPONDED'],
  'Admin':         ['ADMIN_USER_STATUS_CHANGED','ADMIN_USER_DELETED','ADMIN_USER_EDITED','ADMIN_USER_APPROVED','ADMIN_CONFIG_CHANGED','ADMIN_NOTIFICATION_SENT'],
  'Onboarding':    ['DOCTOR_ONBOARDED','THERAPIST_ONBOARDED','PHARMACY_CREATED','LAB_CREATED'],
};

function ActionBadge({ action }) {
  const p = ACTION_PALETTE[action] || DEFAULT_PALETTE;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.2rem 0.6rem', borderRadius: 20,
      fontSize: '0.7rem', fontWeight: 700,
      background: p.bg, color: p.color,
      border: `1.5px solid ${p.color}30`,
      whiteSpace: 'nowrap',
    }}>
      <span>{p.icon}</span>
      {action?.replace(/_/g, ' ') || '—'}
    </span>
  );
}

function PlatformBadge({ platform }) {
  const p = PLATFORM_LABELS[platform] || { label: platform || '—', color: '#94a3b8' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem', borderRadius: 10,
      fontSize: '0.65rem', fontWeight: 700,
      background: `${p.color}15`, color: p.color,
      border: `1px solid ${p.color}30`,
    }}>{p.label}</span>
  );
}

export default function AdminAuditLog() {
  const sysConfig = useSystemConfig();
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [selected, setSelected]   = useState(null);

  useEffect(() => { loadLogs(); }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'auditLogs'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setLogs(list.slice(0, 500));
    } catch (e) {
      console.error('Audit log load error:', e);
    } finally { setLoading(false); }
  };

  const groupActions = groupFilter ? (ACTION_GROUPS[groupFilter] || []) : null;
  const retentionDays = Math.max(1, Number(cfg(sysConfig, 'dataRetention', 'auditLogRetentionDays', 365)) || 365);
  const retentionCutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

  const filtered = logs.filter(l => {
    const ms = l.timestamp?.seconds ? l.timestamp.seconds * 1000 : 0;
    if (ms && ms < retentionCutoff) return false;
    if (platformFilter && l.platform !== platformFilter) return false;
    if (groupActions && !groupActions.includes(l.action)) return false;
    if (actionFilter && l.action !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [l.action, l.userName, l.userEmail, l.userType, JSON.stringify(l.details)]
        .some(v => (v || '').toLowerCase().includes(q));
    }
    return true;
  });

  const fmtDate = ts => ts?.seconds
    ? new Date(ts.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const stats = {
    total: logs.length,
    web: logs.filter(l => l.platform === 'web').length,
    mobile: logs.filter(l => l.platform === 'mobile').length,
    today: logs.filter(l => {
      if (!l.timestamp?.seconds) return false;
      const d = new Date(l.timestamp.seconds * 1000);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length,
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Audit Log</h1>
          <p className="admin-page-sub">Full activity trail — all users, all platforms</p>
        </div>
        <button className="btn btn-primary" onClick={loadLogs}>Refresh</button>
      </div>

      {/* Stats */}
      <div className="admin-alert admin-alert-info" style={{ marginBottom: '1rem' }}>
        Data retention policy applied: showing audit events from the last {retentionDays} day{retentionDays > 1 ? 's' : ''}.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Events', val: stats.total, color: '#2f5e40', bg: '#e9f3ec' },
          { label: 'Today',        val: stats.today, color: '#059669', bg: '#f0fdf4' },
          { label: 'Web Events',   val: stats.web,   color: '#3f7a55', bg: '#e9f3ec' },
          { label: 'Mobile Events',val: stats.mobile,color: '#7c3aed', bg: '#faf5ff' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '0.85rem 1rem', border: `1px solid ${s.color}20` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <div className="admin-search" style={{ flex: 1, minWidth: 220 }}>
          <span>🔍</span>
          <input placeholder="Search user, action, details…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <select value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setActionFilter(''); }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', color: '#374151', background: '#fff' }}>
          <option value="">All Categories</option>
          {Object.keys(ACTION_GROUPS).map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', color: '#374151', background: '#fff' }}>
          <option value="">All Platforms</option>
          <option value="web">Web</option>
          <option value="mobile">Mobile</option>
        </select>

        <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
          {filtered.length} of {logs.length}
        </span>
      </div>

      {/* Table */}
      <div className="admin-table-card">
        {loading ? (
          <div className="admin-empty">
            <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#3f7a55', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '0.5rem' }} />
            <p>Loading audit log…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            <p style={{ fontSize: '1.1rem' }}>📋</p>
            <p>No audit entries found.</p>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Actions taken by users on web and mobile will appear here.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>User</th>
                <th>Platform</th>
                <th>Details</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <Paged items={filtered} table>{(filtered) => filtered.map(log => (
                <tr key={log.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(log)}>
                  <td style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(log.timestamp)}</td>
                  <td><ActionBadge action={log.action} /></td>
                  <td>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>{log.userName || '—'}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{log.userEmail || log.userType || ''}</div>
                  </td>
                  <td><PlatformBadge platform={log.platform} /></td>
                  <td style={{ fontSize: '0.75rem', color: '#475569', maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof log.details === 'object' && log.details
                        ? Object.entries(log.details).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')
                        : log.details || '—'}
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setSelected(log); }}>View</button>
                  </td>
                </tr>
              ))}</Paged>
            </tbody>
          </table>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="admin-modal-overlay" onClick={() => setSelected(null)}>
          <div className="admin-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Audit Entry</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '0.85rem', background: '#f8fafc', borderRadius: 10 }}>
              <span style={{ fontSize: '1.8rem' }}>{(ACTION_PALETTE[selected.action] || DEFAULT_PALETTE).icon}</span>
              <div>
                <ActionBadge action={selected.action} />
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>{fmtDate(selected.timestamp)}</div>
              </div>
              <PlatformBadge platform={selected.platform} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
              {[
                ['User',       selected.userName],
                ['Email',      selected.userEmail],
                ['User Type',  selected.userType],
                ['User ID',    selected.userId],
                ['Session',    selected.sessionId || '—'],
                ['Platform',   selected.platform],
              ].map(([label, val]) => (
                <div key={label} style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginTop: 2, wordBreak: 'break-all' }}>{val || '—'}</div>
                </div>
              ))}
            </div>

            {selected.details && typeof selected.details === 'object' && Object.keys(selected.details).length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.85rem', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Details</p>
                {Object.entries(selected.details).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748b', minWidth: 110, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: '#0f172a', fontWeight: 600, wordBreak: 'break-all' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
