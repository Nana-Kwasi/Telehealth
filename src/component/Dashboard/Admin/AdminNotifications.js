import React, { useState } from 'react';
import { db } from '../../../services/firestoreShim';
import { collection, addDoc, serverTimestamp, getDocs } from '../../../services/firestoreShim';

const AUDIENCE_OPTIONS = [
  { value: 'all',         label: 'All Users',        icon: '👥' },
  { value: 'patients',    label: 'Patients Only',    icon: '🤒' },
  { value: 'doctors',     label: 'Doctors Only',     icon: '🩺' },
  { value: 'therapists',  label: 'Therapists Only',  icon: '🧠' },
  { value: 'pharmacies',  label: 'Pharmacies Only',  icon: '💊' },
  { value: 'labs',        label: 'Lab Centers Only', icon: '🧪' },
];

const TYPE_OPTIONS = [
  { value: 'info',        label: 'Information',   color: '#2f5e40', bg: '#e9f3ec' },
  { value: 'warning',     label: 'Warning',       color: '#d97706', bg: '#fffbeb' },
  { value: 'critical',    label: 'Critical',      color: '#dc2626', bg: '#fef2f2' },
  { value: 'maintenance', label: 'Maintenance',   color: '#7c3aed', bg: '#faf5ff' },
  { value: 'promotion',   label: 'Promotion',     color: '#059669', bg: '#f0fdf4' },
];

const HISTORY_LIMIT = 20;

export default function AdminNotifications() {
  const [form, setForm] = useState({
    title: '', body: '', audience: 'all', type: 'info', link: '', priority: 'normal',
  });
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [history, setHistory]   = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histLoaded, setHistLoaded]   = useState(false);

  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const snap = await getDocs(collection(db, 'adminNotifications'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0));
      setHistory(list.slice(0, HISTORY_LIMIT));
      setHistLoaded(true);
    } catch { }
    finally { setHistLoading(false); }
  };

  const handleSend = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      alert('Title and message body are required.'); return;
    }
    setSending(true);
    try {
      await addDoc(collection(db, 'adminNotifications'), {
        ...form,
        sentAt: serverTimestamp(),
        read: false,
      });
      setSent(true);
      setForm({ title: '', body: '', audience: 'all', type: 'info', link: '', priority: 'normal' });
      setTimeout(() => setSent(false), 4000);
      if (histLoaded) loadHistory();
    } catch { alert('Failed to send notification. Please try again.'); }
    finally { setSending(false); }
  };

  const fmtDate = ts => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const typeInfo = TYPE_OPTIONS.find(t => t.value === form.type) || TYPE_OPTIONS[0];

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Notification Center</h1>
          <p className="admin-page-sub">Send platform-wide alerts, announcements, and targeted messages</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Compose */}
        <div className="admin-table-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Compose Notification
          </h3>

          {/* Audience */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>TARGET AUDIENCE</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {AUDIENCE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setForm(f => ({ ...f, audience: opt.value }))}
                  style={{
                    padding: '0.35rem 0.8rem', borderRadius: 20, border: '1.5px solid',
                    borderColor: form.audience === opt.value ? '#2f5e40' : '#e2e8f0',
                    background: form.audience === opt.value ? '#e9f3ec' : '#fff',
                    color: form.audience === opt.value ? '#2f5e40' : '#64748b',
                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                  }}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>NOTIFICATION TYPE</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {TYPE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setForm(f => ({ ...f, type: opt.value }))}
                  style={{
                    padding: '0.35rem 0.8rem', borderRadius: 20, border: '1.5px solid',
                    borderColor: form.type === opt.value ? opt.color : '#e2e8f0',
                    background: form.type === opt.value ? opt.bg : '#fff',
                    color: form.type === opt.value ? opt.color : '#64748b',
                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>PRIORITY</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {['low', 'normal', 'high', 'urgent'].map(p => (
                <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                  style={{
                    padding: '0.3rem 0.7rem', borderRadius: 20, border: '1.5px solid',
                    borderColor: form.priority === p ? '#7c3aed' : '#e2e8f0',
                    background: form.priority === p ? '#faf5ff' : '#fff',
                    color: form.priority === p ? '#7c3aed' : '#64748b',
                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: '0.85rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>TITLE *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Notification headline…"
              style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>

          {/* Body */}
          <div style={{ marginBottom: '0.85rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>MESSAGE *</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={5}
              placeholder="Write your message here…"
              style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {/* Link */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>ACTION LINK (optional)</label>
            <input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
              placeholder="/dashboard/path or external URL"
              style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}
              style={{ minWidth: 140 }}>
              {sending ? 'Sending…' : '📣 Send Now'}
            </button>
            {sent && <span style={{ color: '#16a34a', fontSize: '0.875rem', fontWeight: 600 }}>Notification sent!</span>}
          </div>
        </div>

        {/* Preview + History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Live preview */}
          <div className="admin-table-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>Preview</h3>
            <div style={{
              border: `1.5px solid ${typeInfo.color}`, borderRadius: 10, padding: '1rem',
              background: typeInfo.bg, position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <div style={{ fontSize: '1.3rem', flexShrink: 0 }}>
                  {form.type === 'warning' ? '⚠️' : form.type === 'critical' ? '🚨' : form.type === 'maintenance' ? '🔧' : form.type === 'promotion' ? '🎉' : 'ℹ️'}
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.9rem', color: typeInfo.color }}>
                    {form.title || 'Notification title will appear here'}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#374151' }}>
                    {form.body || 'Your message body will appear here…'}
                  </p>
                </div>
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', fontSize: '0.72rem', color: '#64748b' }}>
                <span>To: {AUDIENCE_OPTIONS.find(a => a.value === form.audience)?.label}</span>
                <span>·</span>
                <span>Priority: {form.priority}</span>
              </div>
            </div>
          </div>

          {/* History */}
          <div className="admin-table-card" style={{ flex: 1 }}>
            <div className="admin-table-header">
              <p className="admin-table-title">Sent History</p>
              <button className="btn btn-ghost btn-sm" onClick={loadHistory} disabled={histLoading}>
                {histLoading ? 'Loading…' : 'Load History'}
              </button>
            </div>
            {!histLoaded ? (
              <div className="admin-empty" style={{ padding: '2rem' }}>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Click "Load History" to view past notifications</p>
              </div>
            ) : history.length === 0 ? (
              <div className="admin-empty"><p>No notifications sent yet.</p></div>
            ) : (
              <div>
                {history.map(n => {
                  const tc = TYPE_OPTIONS.find(t => t.value === n.type) || TYPE_OPTIONS[0];
                  return (
                    <div key={n.id} className="admin-feed-item">
                      <div className="admin-feed-dot" style={{ background: tc.color }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>{n.title}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                          {n.audience} · {n.type} · {n.priority}
                        </p>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0 }}>{fmtDate(n.sentAt)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
