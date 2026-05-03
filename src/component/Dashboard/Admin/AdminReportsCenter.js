import React, { useState, useEffect } from 'react';
import { db } from '../../Auth/firebaseConfig';
import {
  collection, getDocs, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';

const CATEGORIES = ['complaint', 'feedback', 'technical', 'billing', 'emergency', 'other'];
const REPORTER_TYPES = ['', 'patient', 'client', 'doctor', 'therapist', 'pharmacy', 'pharmacy_parent', 'pharmacy_branch', 'lab', 'scan'];

const CAT_COLORS = {
  complaint:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  feedback:   { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  technical:  { bg: '#faf5ff', color: '#7c3aed', border: '#ddd6fe' },
  billing:    { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  emergency:  { bg: '#fff1f2', color: '#be123c', border: '#fecdd3' },
  other:      { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
};

const STATUS_COLORS = {
  open:        { bg: '#fef2f2', color: '#dc2626' },
  'in-review': { bg: '#fffbeb', color: '#d97706' },
  resolved:    { bg: '#f0fdf4', color: '#16a34a' },
  closed:      { bg: '#f8fafc', color: '#475569' },
};

export default function AdminReportsCenter() {
  const [reports, setReports]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [reply, setReply]           = useState('');
  const [sending, setSending]       = useState(false);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');

  useEffect(() => { loadReports(); }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [globalSnap, userSnap, supportSnap, therapistSnap] = await Promise.all([
        getDocs(collection(db, 'globalReports')),
        getDocs(collection(db, 'userReports')),
        getDocs(collection(db, 'supportTickets')),
        getDocs(collection(db, 'therapistReports')),
      ]);
      const globalList = globalSnap.docs.map(d => ({ id: d.id, sourceCollection: 'globalReports', ...d.data() }));
      const userList = userSnap.docs.map(d => ({ id: d.id, sourceCollection: 'userReports', ...d.data() }));
      const supportList = supportSnap.docs.map(d => ({
        id: d.id,
        sourceCollection: 'supportTickets',
        category: d.data().issueType === 'billing' ? 'billing' : d.data().issueType === 'app_bug' ? 'technical' : 'complaint',
        subject: d.data().subject || d.data().title || 'Support Ticket',
        message: d.data().description || '',
        reporterName: d.data().userName || d.data().clientName || 'User',
        reporterEmail: d.data().userEmail || '',
        reporterType: d.data().reporterType || (d.data().clientId ? 'patient' : 'client'),
        status: d.data().status || 'open',
        createdAt: d.data().createdAt,
        updatedAt: d.data().updatedAt || d.data().createdAt || null,
        adminReplies: d.data().adminReplies || [],
        ...d.data(),
      }));
      const therapistList = therapistSnap.docs.map(d => ({
        id: d.id,
        sourceCollection: 'therapistReports',
        category: 'complaint',
        subject: d.data().subject || 'Therapist Incident Report',
        message: d.data().description || d.data().details || '',
        reporterName: d.data().clientName || d.data().reporterName || 'Client',
        reporterEmail: d.data().reporterEmail || '',
        reporterType: 'client',
        status: d.data().status || 'open',
        createdAt: d.data().createdAt,
        updatedAt: d.data().updatedAt || d.data().createdAt || null,
        adminReplies: d.data().adminReplies || [],
        ...d.data(),
      }));
      const list = [...globalList, ...userList, ...supportList, ...therapistList];
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReports(list);
    } catch (e) {
      console.error('Reports load error:', e);
    } finally { setLoading(false); }
  };

  const setStatus = async (report, status) => {
    try {
      const col = report.sourceCollection || 'userReports';
      await updateDoc(doc(db, col, report.id), { status, updatedAt: serverTimestamp() });
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status } : r));
      if (selected?.id === report.id) setSelected(s => ({ ...s, status }));
    } catch { alert('Failed to update status.'); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      const adminReply = {
        text: reply.trim(),
        sentAt: serverTimestamp(),
        sentBy: 'Admin',
      };
      const existing = selected.adminReplies || [];
      await updateDoc(doc(db, selected.sourceCollection || 'userReports', selected.id), {
        adminReplies: [...existing, adminReply],
        status: 'in-review',
        updatedAt: serverTimestamp(),
      });
      const updated = { ...selected, adminReplies: [...existing, { ...adminReply, sentAt: { seconds: Date.now() / 1000 } }], status: 'in-review' };
      setReports(prev => prev.map(r => r.id === selected.id ? updated : r));
      setSelected(updated);
      setReply('');
    } catch { alert('Failed to send reply.'); }
    finally { setSending(false); }
  };

  const filtered = reports.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (catFilter && r.category !== catFilter) return false;
    if (typeFilter && r.reporterType !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [r.subject, r.message, r.reporterName, r.reporterEmail, r.category]
        .some(v => (v || '').toLowerCase().includes(q));
    }
    return true;
  });

  const stats = {
    total:     reports.length,
    open:      reports.filter(r => r.status === 'open').length,
    inReview:  reports.filter(r => r.status === 'in-review').length,
    resolved:  reports.filter(r => r.status === 'resolved').length,
    emergency: reports.filter(r => r.category === 'emergency').length,
  };

  const fmtDate = ts => ts?.seconds
    ? new Date(ts.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const fmtShort = ts => ts?.seconds
    ? new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Reports & Feedback Center</h1>
          <p className="admin-page-sub">Unified queue for global reports, support tickets, and incident reports from all roles</p>
        </div>
        <button className="btn btn-primary" onClick={loadReports}>↻ Refresh</button>
      </div>

      {/* Stats */}
      <div className="admin-stats-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Reports',   val: stats.total,     color: '#1d4ed8', bg: '#eff6ff', icon: '📋' },
          { label: 'Open',            val: stats.open,      color: '#dc2626', bg: '#fef2f2', icon: '🔴' },
          { label: 'In Review',       val: stats.inReview,  color: '#d97706', bg: '#fffbeb', icon: '🟡' },
          { label: 'Resolved',        val: stats.resolved,  color: '#16a34a', bg: '#f0fdf4', icon: '🟢' },
          { label: 'Emergency',       val: stats.emergency, color: '#be123c', bg: '#fff1f2', icon: '🚨' },
        ].map(s => (
          <div key={s.label} className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="admin-stat-value" style={{ color: s.color }}>{s.val}</div>
              <div className="admin-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Emergency alert */}
      {stats.emergency > 0 && (
        <div className="admin-alert admin-alert-danger" style={{ marginBottom: '1.25rem' }}>
          🚨 {stats.emergency} emergency report{stats.emergency !== 1 ? 's' : ''} require immediate attention!
          <button className="btn btn-sm btn-danger" style={{ marginLeft: '1rem' }}
            onClick={() => { setCatFilter('emergency'); setStatusFilter(''); }}>
            View Emergency Reports
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div className="admin-search" style={{ maxWidth: 260 }}>
          <span>🔍</span>
          <input placeholder="Search reports…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {[['', 'All'], ['open', '🔴 Open'], ['in-review', '🟡 In Review'], ['resolved', '🟢 Resolved'], ['closed', '⚫ Closed']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              style={{
                padding: '0.38rem 0.75rem', borderRadius: 8, border: '1.5px solid',
                borderColor: statusFilter === v ? '#2563eb' : '#e2e8f0',
                background: statusFilter === v ? '#eff6ff' : '#fff',
                color: statusFilter === v ? '#2563eb' : '#64748b',
                fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
              }}>{l}</button>
          ))}
        </div>

        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.82rem', background: '#fff', color: '#0f172a' }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.82rem', background: '#fff', color: '#0f172a' }}>
          <option value="">All Reporter Types</option>
          {REPORTER_TYPES.filter(Boolean).map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>

        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b' }}>{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="admin-empty"><p>Loading reports…</p></div>
      ) : reports.length === 0 ? (
        <div className="admin-table-card">
          <div className="admin-empty" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
            <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem' }}>No reports yet</p>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', maxWidth: 400, textAlign: 'center', margin: 0 }}>
              Reports submitted by medical patients, therapy clients, doctors, and therapists will appear here.
              They can submit reports from their respective dashboards.
            </p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty"><p>No reports match your filters.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 420px' : '1fr', gap: '1.5rem' }}>
          {/* Report list */}
          <div className="admin-table-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Subject</th>
                  <th>Reporter</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Replies</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const cc = CAT_COLORS[r.category] || CAT_COLORS.other;
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS.open;
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer', background: selected?.id === r.id ? '#f0f7ff' : undefined }}
                      onClick={() => setSelected(r)}>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: cc.bg, color: cc.color, border: `1px solid ${cc.border}` }}>
                          {r.category || 'other'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.subject || '(No subject)'}
                        </div>
                        {r.category === 'emergency' && <span style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 800 }}>⚠️ URGENT</span>}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{r.reporterName || '—'}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.reporterEmail || ''}</div>
                      </td>
                      <td>
                        <span className="badge badge-blue" style={{ fontSize: '0.68rem' }}>
                          {r.reporterType || 'user'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.sourceCollection || 'userReports'}</td>
                      <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{fmtShort(r.createdAt)}</td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: sc.bg, color: sc.color }}>
                          {r.status || 'open'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {(r.adminReplies || []).length} reply{(r.adminReplies || []).length !== 1 ? 's' : ''}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setSelected(r); }}>Open →</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="admin-table-card" style={{ height: 'fit-content', position: 'sticky', top: '1rem' }}>
              <div className="admin-table-header">
                <p className="admin-table-title" style={{ fontSize: '0.85rem' }}>Report Detail</p>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
              </div>

              <div style={{ padding: '1rem' }}>
                {/* Category + status */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                  {(() => {
                    const cc = CAT_COLORS[selected.category] || CAT_COLORS.other;
                    return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: cc.bg, color: cc.color, border: `1px solid ${cc.border}` }}>{selected.category || 'other'}</span>;
                  })()}
                  {(() => {
                    const sc = STATUS_COLORS[selected.status] || STATUS_COLORS.open;
                    return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: sc.bg, color: sc.color }}>{selected.status || 'open'}</span>;
                  })()}
                  <span className="badge badge-blue" style={{ fontSize: '0.68rem' }}>{selected.reporterType || 'user'}</span>
                </div>

                <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                  {selected.subject || '(No subject)'}
                </p>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                  {selected.reporterName || '—'} · {selected.reporterEmail || '—'} · {fmtDate(selected.createdAt)}
                </p>

                {/* Message */}
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '0.85rem', marginBottom: '1rem', fontSize: '0.82rem', lineHeight: 1.6, color: '#334155', whiteSpace: 'pre-wrap' }}>
                  {selected.message || '(No message provided)'}
                </div>

                {/* Previous replies */}
                {(selected.adminReplies || []).length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Admin Replies</p>
                    {(selected.adminReplies || []).map((rp, i) => (
                      <div key={i} style={{ background: '#eff6ff', borderRadius: 8, padding: '0.65rem', marginBottom: '0.4rem', fontSize: '0.8rem' }}>
                        <p style={{ margin: '0 0 2px', fontWeight: 700, color: '#1d4ed8' }}>Admin</p>
                        <p style={{ margin: 0, color: '#334155' }}>{rp.text}</p>
                        <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>{fmtDate(rp.sentAt)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply box */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: '0.4rem' }}>REPLY TO REPORTER</label>
                  <textarea value={reply} onChange={e => setReply(e.target.value)} rows={4}
                    placeholder="Type your response here…"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.82rem', resize: 'vertical', boxSizing: 'border-box' }} />
                  <button className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem', width: '100%' }}
                    disabled={sending || !reply.trim()} onClick={sendReply}>
                    {sending ? 'Sending…' : '📨 Send Reply'}
                  </button>
                </div>

                {/* Status actions */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>CHANGE STATUS</p>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {[
                      ['open',       '#fef2f2', '#dc2626'],
                      ['in-review',  '#fffbeb', '#d97706'],
                      ['resolved',   '#f0fdf4', '#16a34a'],
                      ['closed',     '#f8fafc', '#475569'],
                    ].map(([s, bg, color]) => (
                      <button key={s} onClick={() => setStatus(selected, s)}
                        disabled={selected.status === s}
                        style={{
                          padding: '0.3rem 0.7rem', borderRadius: 20, border: `1.5px solid ${color}40`,
                          background: selected.status === s ? bg : '#fff',
                          color: color, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                          opacity: selected.status === s ? 1 : 0.7,
                        }}>
                        {s.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
