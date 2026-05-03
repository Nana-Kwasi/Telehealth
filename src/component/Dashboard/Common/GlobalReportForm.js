import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../Auth/firebaseConfig';

const CATEGORIES = ['complaint', 'feedback', 'technical', 'billing', 'emergency', 'other'];

export default function GlobalReportForm({ profile, reporterType = 'user' }) {
  const [form, setForm] = useState({ category: 'complaint', subject: '', message: '', severity: 'medium' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

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
    </div>
  );
}
