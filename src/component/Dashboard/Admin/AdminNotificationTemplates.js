import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../services/apiClient';

/**
 * Edit the wording of every notification the platform sends.
 *
 * The one thing worth understanding here: a template OVERRIDES the wording
 * compiled into the backend, it does not replace the send. A template with no
 * body of its own falls back to the built-in message, which is why "Built-in"
 * is shown as a normal state rather than an error — most templates start there.
 */

const CATEGORY_META = {
  account:      { label: 'Account',      icon: '👤' },
  appointments: { label: 'Appointments', icon: '📅' },
  therapy:      { label: 'Therapy',      icon: '🧠' },
  payments:     { label: 'Payments',     icon: '💳' },
  wellness:     { label: 'Wellness',     icon: '🌿' },
  marketing:    { label: 'Marketing',    icon: '📣' },
  system:       { label: 'System',       icon: '⚙️' },
};

/** Plausible values so a preview reads like a real message, not "{{firstName}}". */
const SAMPLE_VALUES = {
  firstName: 'Ama', fullName: 'Ama Boateng', role: 'Therapy Client',
  email: 'ama@example.com', patientName: 'Ama Boateng', clientName: 'Ama Boateng',
  providerName: 'Dr Joana Mensah', therapistName: 'Joana Mensah',
  senderName: 'Joana Mensah', recipientName: 'Ama Boateng',
  when: 'Tuesday, 9 September at 2:00 PM', type: 'Video consultation',
  hoursBefore: '24', medication: 'Sertraline 50mg', testType: 'Full blood count',
  partnerAName: 'Ama', partnerBName: 'Kofi', relationshipType: 'Married',
  inviteUrl: 'https://nessahub.example/couple/join?token=…',
  preview: 'Hello, I wanted to ask about…', subject: 'Trouble signing in',
  reply: 'Thanks for getting in touch — here is what to do…',
  userName: 'Ama Boateng', reporterName: 'Ama Boateng', reporterEmail: 'ama@example.com',
  body: 'I cannot open my appointment.',
};

export default function AdminNotificationTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(null);
  const [saving, setSaving]       = useState(false);
  const [message, setMessage]     = useState('');
  const [error, setError]         = useState('');
  const [preview, setPreview]     = useState(null);
  const [testTo, setTestTo]       = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api('/api/v1/admin/notification-templates');
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const g = {};
    templates.forEach((t) => {
      const c = t.category || 'system';
      (g[c] = g[c] || []).push(t);
    });
    return g;
  }, [templates]);

  const openTemplate = (t) => {
    setSelected(t.template_key);
    setForm({
      subject:   t.subject || '',
      bodyHtml:  t.body_html || '',
      pushTitle: t.push_title || '',
      pushBody:  t.push_body || '',
      enabled:   t.enabled !== false,
    });
    setPreview(null);
    setMessage('');
    setError('');
  };

  const current = templates.find((t) => t.template_key === selected) || null;

  const variables = useMemo(() => {
    if (!current?.variables_json) return [];
    try {
      const v = JSON.parse(current.variables_json);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }, [current]);

  const save = async () => {
    if (!current) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const updated = await api(`/api/v1/admin/notification-templates/${current.template_key}`, {
        method: 'PUT',
        body: form,
      });
      setTemplates((prev) => prev.map((t) => (t.template_key === updated.template_key ? updated : t)));
      setMessage('Saved. New messages will use this wording.');
    } catch (e) {
      setError(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    if (!current) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const updated = await api(`/api/v1/admin/notification-templates/${current.template_key}/reset`, {
        method: 'POST',
      });
      setTemplates((prev) => prev.map((t) => (t.template_key === updated.template_key ? updated : t)));
      openTemplate(updated);
      setMessage('Reverted to the original wording.');
    } catch (e) {
      setError(e.message || 'Could not reset.');
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    setError('');
    try {
      const res = await api('/api/v1/admin/notification-templates/preview', {
        method: 'POST',
        body: { subject: form.subject || '(no subject)', bodyHtml: form.bodyHtml, vars: SAMPLE_VALUES },
      });
      setPreview(res);
    } catch (e) {
      setError(e.message || 'Could not build a preview.');
    }
  };

  const sendTest = async () => {
    if (!current) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const res = await api(`/api/v1/admin/notification-templates/${current.template_key}/test-send`, {
        method: 'POST',
        body: { to: testTo, vars: SAMPLE_VALUES },
      });
      setMessage(res.sent ? `Test sent to ${res.to}.` : res.reason || 'Nothing was sent.');
    } catch (e) {
      setError(e.message || 'Could not send the test.');
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (name) => {
    setForm((f) => ({ ...f, bodyHtml: `${f.bodyHtml || ''}{{${name}}}` }));
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Notification Templates</h1>
          <p className="admin-page-sub">
            Edit what every automated message says. Leave a template on “Built-in” to keep the
            original wording.
          </p>
        </div>
        <button className="btn btn-primary" onClick={load}>Refresh</button>
      </div>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                      padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>{error}</div>
      ) : null}
      {message ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
                      padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>{message}</div>
      ) : null}

      {loading ? (
        <div className="admin-table-card" style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>

          {/* ── Template list, grouped by category ── */}
          <div className="admin-table-card" style={{ padding: '0.75rem', position: 'sticky', top: '1rem' }}>
            {Object.keys(grouped).sort().map((cat) => {
              const meta = CATEGORY_META[cat] || { label: cat, icon: '•' };
              return (
                <div key={cat} style={{ marginBottom: '0.9rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em',
                                textTransform: 'uppercase', color: '#64748b', padding: '0.35rem 0.5rem' }}>
                    {meta.icon} {meta.label}
                  </div>
                  {grouped[cat].map((t) => {
                    const active = t.template_key === selected;
                    // Three distinct states, because "has a body" and "an admin
                    // changed it" are not the same thing: a reset restores the
                    // seeded body, which is not a customisation.
                    const state = t.is_custom
                      ? 'Customised'
                      : (t.body_html ? 'Default wording' : 'Built-in');
                    return (
                      <button key={t.template_key} onClick={() => openTemplate(t)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                          background: active ? '#2f5e40' : 'transparent',
                          color: active ? '#fff' : '#334155',
                          borderRadius: 8, padding: '0.5rem 0.6rem', marginBottom: 2, fontSize: '0.83rem',
                        }}>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: '0.7rem', opacity: active ? 0.85 : 0.7, marginTop: 2 }}>
                          {state}
                          {t.enabled === false ? ' · disabled' : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* ── Editor ── */}
          {!current || !form ? (
            <div className="admin-table-card" style={{ padding: '2rem', color: '#64748b' }}>
              Choose a notification on the left to edit what it says.
            </div>
          ) : (
            <div className="admin-table-card" style={{ padding: '1.5rem' }}>
              <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>{current.name}</h2>
              <p style={{ margin: '0 0 0.25rem', color: '#64748b', fontSize: '0.85rem' }}>{current.description}</p>
              <code style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{current.template_key}</code>

              {!current.body_html ? (
                <div style={{ marginTop: '1rem', background: '#e9f3ec', border: '1px solid #c4dccb',
                              color: '#2f5e40', padding: '0.7rem 0.9rem', borderRadius: 8, fontSize: '0.82rem' }}>
                  This message currently uses its built-in wording. Type a body below to take over —
                  you can always revert.
                </div>
              ) : null}

              <label style={{ display: 'block', marginTop: '1.25rem', fontWeight: 600, fontSize: '0.82rem' }}>Email subject</label>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                style={inputStyle} placeholder="e.g. Your appointment is confirmed" />

              <label style={{ display: 'block', marginTop: '1rem', fontWeight: 600, fontSize: '0.82rem' }}>Email body</label>
              <textarea value={form.bodyHtml} onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
                rows={9} style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.8rem' }}
                placeholder="<p>Hi {{firstName}}, …</p>" />

              {variables.length ? (
                <div style={{ marginTop: '0.6rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.35rem' }}>
                    Available values — click to insert. Anything unknown is left blank rather than shown to the recipient.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {variables.map((v) => (
                      <button key={v} type="button" onClick={() => insertVariable(v)}
                        style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999,
                                 padding: '0.2rem 0.6rem', fontSize: '0.73rem', cursor: 'pointer', color: '#334155' }}>
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem' }}>Push title</label>
                  <input value={form.pushTitle} onChange={(e) => setForm({ ...form, pushTitle: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem' }}>Push message</label>
                  <input value={form.pushBody} onChange={(e) => setForm({ ...form, pushBody: e.target.value })} style={inputStyle} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Use this wording (uncheck to fall back to the built-in message)
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn" onClick={runPreview} disabled={saving}
                  style={{ background: '#f1f5f9', color: '#334155' }}>Preview</button>
                <button className="btn" onClick={resetToDefault} disabled={saving}
                  style={{ background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>
                  Revert to original
                </button>
              </div>

              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem' }}>Send a test</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com"
                    style={{ ...inputStyle, marginTop: 0 }} />
                  <button className="btn" onClick={sendTest} disabled={saving || !testTo}
                    style={{ background: '#f1f5f9', color: '#334155', whiteSpace: 'nowrap' }}>Send test</button>
                </div>
                <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                  Sends one real email using sample values. Save first if you want to test your latest edit.
                </div>
              </div>

              {preview ? (
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Preview</div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Subject</div>
                    <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>{preview.subject}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Body</div>
                    {/* Admin-authored markup, rendered with sample values already
                        substituted and escaped server-side. */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.9rem', marginTop: '0.3rem' }}
                         dangerouslySetInnerHTML={{ __html: preview.bodyHtml || '<em>No body — the built-in wording is used.</em>' }} />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', marginTop: '0.35rem', padding: '0.6rem 0.75rem',
  border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box',
};
