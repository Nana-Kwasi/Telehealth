import React, { useState, useEffect, useCallback } from 'react';
import { addDoc, collection, query, where, getDocs, serverTimestamp } from '../../../services/firestoreShim';
import { db } from '../../../services/firestoreShim';

const CATEGORIES = ['complaint', 'feedback', 'technical', 'billing', 'emergency', 'other'];

const STATUS_META = {
  open:        { label: 'Open',        bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  in_progress: { label: 'In progress', bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
  resolved:    { label: 'Resolved',    bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
  closed:      { label: 'Closed',      bg: '#f8fafc', border: '#e2e8f0', color: '#475569' },
};

const SEVERITY_COLOR = {
  low: '#16a34a', medium: '#d97706', high: '#dc2626', critical: '#7c1d1d',
};

function statusMeta(status) {
  const key = String(status || 'open').toLowerCase().replace(/[\s-]/g, '_');
  return STATUS_META[key] || STATUS_META.open;
}

function fmtDate(v) {
  if (!v) return '—';
  const d = v?.seconds ? new Date(v.seconds * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export default function GlobalReportForm({ profile, reporterType = 'user' }) {
  const [form, setForm] = useState({ category: 'complaint', subject: '', message: '', severity: 'medium' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [selected, setSelected] = useState(null);

  const reporterId = profile?.id || null;

  const loadReports = useCallback(async () => {
    if (!reporterId) { setLoadingReports(false); return; }
    setLoadingReports(true);
    try {
      const snap = await getDocs(query(collection(db, 'globalReports'), where('reporterId', '==', reporterId)));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const tb = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });
      setReports(list);
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, [reporterId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // The admin can change a report's status or reply at any time. This screen used to
  // fetch only on mount, so those updates stayed invisible until a full page reload.
  useEffect(() => {
    const refresh = () => { if (!document.hidden) loadReports(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadReports]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      await addDoc(collection(db, 'globalReports'), {
        category: form.category,
        subject: form.subject.trim(),
        message: form.message.trim(),
        severity: form.severity,
        status: 'open',
        source: 'dashboard',
        contextPath: window.location.pathname || '',
        reporterId: profile?.id || null,
        reporterName: profile?.name || profile?.fullName || profile?.pharmacyName || profile?.branchName || 'User',
        reporterEmail: profile?.email || '',
        reporterType,
        metadata: {
          country: profile?.country || null,
          branchId: profile?.branchId || profile?.id || null,
          pharmacyId: profile?.pharmacyId || null,
        },
        adminReplies: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({ category: 'complaint', subject: '', message: '', severity: 'medium' });
      setMsg('Report submitted to Super Admin.');
      loadReports();
    } catch {
      setMsg('Failed to submit report. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Report an Issue</h1>
          <p className="admin-page-sub">Send complaints, incidents, and feedback directly to Super Admin.</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={loadReports}
          disabled={loadingReports}
        >
          {loadingReports ? 'Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      <form onSubmit={submit} className="admin-table-card" style={{ padding: '1.25rem', maxWidth: 760 }}>
        <div className="admin-form-grid">
          <div className="admin-field">
            <label>Category</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="admin-field">
            <label>Severity</label>
            <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </div>
          <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
            <label>Subject</label>
            <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} required />
          </div>
          <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
            <label>Details</label>
            <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={6} required />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Sending…' : 'Submit Report'}
          </button>
          {msg ? <span style={{ fontSize: '0.82rem', color: '#0369a1' }}>{msg}</span> : null}
        </div>
      </form>

      {/* ── My reports ── */}
      <div className="admin-table-card" style={{ padding: '1.25rem', maxWidth: 980, marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>My Reports</h2>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
        </div>

        {loadingReports ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>Loading your reports…</p>
        ) : reports.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>You haven't submitted any reports yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Subject</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => {
                  const sm = statusMeta(r.status);
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(r)} title="View report details">
                      <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.82rem' }}>{fmtDate(r.createdAt)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.category || '—'}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{r.subject || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 700, textTransform: 'capitalize', color: SEVERITY_COLOR[String(r.severity || '').toLowerCase()] || '#64748b' }}>
                          {r.severity || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: sm.bg, border: `1px solid ${sm.border}`, color: sm.color }}>
                          {sm.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detail modal ── */}
      {selected && (() => {
        const sm = statusMeta(selected.status);
        const rows = [
          ['Category', selected.category],
          ['Severity', selected.severity],
          ['Submitted', fmtDate(selected.createdAt)],
          ['Last updated', fmtDate(selected.updatedAt)],
          ['Reference', selected.id],
          ['Page', selected.contextPath],
        ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 998, padding: '1rem' }}
            onClick={() => setSelected(null)}>
            <div
              style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 22px 60px rgba(2,6,23,0.28)', border: '1px solid #e2e8f0', overflow: 'hidden' }}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '1.15rem 1.25rem', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(180deg,#f8fbff,#ffffff)' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{selected.subject || 'Report'}</h2>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: sm.bg, border: `1px solid ${sm.border}`, color: sm.color }}>{sm.label}</span>
                    {selected.category && <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', textTransform: 'capitalize' }}>{selected.category}</span>}
                    {selected.severity && <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: '#fff', border: '1px solid #e2e8f0', color: SEVERITY_COLOR[String(selected.severity).toLowerCase()] || '#64748b', textTransform: 'capitalize' }}>{selected.severity}</span>}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.38rem 0.78rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', color: '#475569', flexShrink: 0 }}>Close</button>
              </div>

              {/* Body */}
              <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '0.6rem 1.1rem', marginBottom: '1rem' }}>
                  {rows.map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
                      <div style={{ fontSize: '0.85rem', color: '#0f172a', wordBreak: 'break-word', textTransform: k === 'Category' || k === 'Severity' ? 'capitalize' : 'none' }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>Details</div>
                  <div style={{ fontSize: '0.88rem', color: '#334155', whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '0.75rem 0.9rem' }}>{selected.message || '—'}</div>
                </div>

                {(selected.adminNote || (Array.isArray(selected.adminReplies) && selected.adminReplies.length > 0)) && (
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>Admin response</div>
                    {selected.adminNote && (
                      <div style={{ fontSize: '0.88rem', color: '#0c4a6e', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '0.75rem 0.9rem', whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{selected.adminNote}</div>
                    )}
                    {Array.isArray(selected.adminReplies) && selected.adminReplies.map((rep, i) => (
                      <div key={i} style={{ fontSize: '0.85rem', color: '#0c4a6e', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '0.6rem 0.85rem', marginBottom: '0.4rem', whiteSpace: 'pre-wrap' }}>
                        {typeof rep === 'string' ? rep : (rep.message || rep.note || rep.text || JSON.stringify(rep))}
                      </div>
                    ))}
                  </div>
                )}

                {!selected.adminNote && !(Array.isArray(selected.adminReplies) && selected.adminReplies.length > 0) && (
                  <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
                    No admin response yet. You'll be able to see updates here once the Super Admin reviews this report.
                  </p>
                )}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.85rem 1.25rem', borderTop: '1px solid #eef2f7', background: '#fbfdff' }}>
                <button onClick={() => setSelected(null)} className="btn btn-primary">Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
