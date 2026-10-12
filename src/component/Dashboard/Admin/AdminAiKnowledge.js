import React, { useState, useEffect } from 'react';
import { api } from '../../../services/apiClient';

/**
 * The knowledge the AI assistant answers from.
 *
 * Why this exists: anything the model says from its own training cannot be
 * reviewed, corrected or dated. Anything it says from here was written by your
 * organisation and approved by a person — so the guidance patients receive is
 * auditable and can be changed without touching a model.
 *
 * Approval is separate from authoring on purpose. Writing an entry and
 * releasing it to patients are different decisions. Editing an approved entry
 * revokes its approval, so nobody can rewrite signed-off guidance while it
 * keeps its badge.
 */

const SERVICES = [
  { key: 'general',        label: 'All services' },
  { key: 'medical',        label: 'Medical Consultation' },
  { key: 'psychiatry',     label: 'Psychiatry' },
  { key: 'psychology',     label: 'Psychology & Counseling' },
  { key: 'second_opinion', label: 'Second Opinion' },
];

const CATEGORIES = ['education', 'guideline', 'protocol', 'emergency', 'medication', 'faq'];

const BLANK = {
  title: '', body: '', service: 'general', category: 'education', tags: '', source: '', enabled: true,
};

export default function AdminAiKnowledge() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // id, or 'new'
  const [form, setForm]       = useState(BLANK);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter]   = useState('');
  const [probe, setProbe]     = useState({ q: '', result: null });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const rows = await api(`/api/v1/admin/ai-knowledge${filter ? `?service=${filter}` : ''}`);
      setEntries(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || 'Could not load the knowledge base.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filter]);

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError('An entry needs a title and content.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      if (editing === 'new') {
        await api('/api/v1/admin/ai-knowledge', { method: 'POST', body: form });
        setMessage('Created. It will not be used until you approve it.');
      } else {
        await api(`/api/v1/admin/ai-knowledge/${editing}`, { method: 'PUT', body: form });
        setMessage('Saved. Editing removed its approval — approve again to put it back in use.');
      }
      setEditing(null); setForm(BLANK); load();
    } catch (e) {
      setError(e.message || 'Could not save.');
    } finally { setBusy(false); }
  };

  const setApproval = async (id, approve) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/api/v1/admin/ai-knowledge/${id}/${approve ? 'approve' : 'unapprove'}`, { method: 'POST' });
      setMessage(approve ? 'Approved — the assistant can now use this.' : 'Withdrawn from use.');
      load();
    } catch (e) { setError(e.message || 'Could not update.'); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    setBusy(true); setError('');
    try {
      await api(`/api/v1/admin/ai-knowledge/${id}`, { method: 'DELETE' });
      setMessage('Deleted.'); setEditing(null); load();
    } catch (e) { setError(e.message || 'Could not delete.'); }
    finally { setBusy(false); }
  };

  const runProbe = async () => {
    if (!probe.q.trim()) return;
    try {
      const r = await api(
        `/api/v1/admin/ai-knowledge/preview?q=${encodeURIComponent(probe.q)}${filter ? `&service=${filter}` : ''}`,
      );
      setProbe((p) => ({ ...p, result: r }));
    } catch (e) { setError(e.message || 'Could not run the preview.'); }
  };

  const approvedCount = entries.filter((e) => e.approved).length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">AI Knowledge Base</h1>
          <p className="admin-page-sub">
            Approved guidance the assistant answers from. {approvedCount} of {entries.length} approved
            and in use.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing('new'); setForm(BLANK); setError(''); }}>
          + New entry
        </button>
      </div>

      {error   ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <Chip on={filter === ''} onClick={() => setFilter('')}>Everything</Chip>
        {SERVICES.filter((s) => s.key !== 'general').map((s) => (
          <Chip key={s.key} on={filter === s.key} onClick={() => setFilter(s.key)}>{s.label}</Chip>
        ))}
      </div>

      {/* Shows exactly what a patient question would retrieve — the fastest way
          to tell whether an entry is actually reachable. */}
      <div className="admin-table-card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Test retrieval
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input style={input} placeholder="Ask what a patient might ask…"
            value={probe.q} onChange={(e) => setProbe({ q: e.target.value, result: null })}
            onKeyDown={(e) => e.key === 'Enter' && runProbe()} />
          <button className="btn" style={{ background: '#f1f5f9', color: '#334155', whiteSpace: 'nowrap' }}
            onClick={runProbe}>Preview</button>
        </div>
        {probe.result ? (
          probe.result.matched ? (
            <pre style={{ marginTop: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0',
                          borderRadius: 8, padding: '0.8rem', fontSize: '0.78rem',
                          whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto' }}>
              {probe.result.passages}
            </pre>
          ) : (
            <div style={{ marginTop: '0.6rem', fontSize: '0.82rem', color: '#9a3412' }}>
              Nothing approved matches that. The assistant would answer from its own general
              knowledge instead.
            </div>
          )
        ) : null}
      </div>

      {editing ? (
        <div className="admin-table-card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.05rem' }}>
            {editing === 'new' ? 'New entry' : 'Edit entry'}
          </h2>
          <Field label="Title">
            <input style={input} value={form.title}
              placeholder="e.g. Warning signs of a serious headache"
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Content — this is what the assistant will draw on">
            <textarea rows={8} style={{ ...input, fontFamily: 'inherit', lineHeight: 1.55 }}
              value={form.body}
              placeholder="Write it as guidance, not as a note to yourself. The assistant is told to prefer this over its own knowledge."
              onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Service">
              <select style={input} value={form.service}
                onChange={(e) => setForm({ ...form, service: e.target.value })}>
                {SERVICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select style={input} value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Keywords — helps retrieval find this when patients phrase things differently">
            <input style={input} value={form.tags} placeholder="headache red flag thunderclap urgent"
              onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </Field>
          <Field label="Source — so a reviewer can check where this came from">
            <input style={input} value={form.source} placeholder="e.g. NessaHub clinical protocol v1"
              onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </Field>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" style={{ background: '#f1f5f9', color: '#334155' }}
              onClick={() => { setEditing(null); setForm(BLANK); }}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="admin-table-card" style={{ padding: '0.5rem' }}>
        {loading ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            No entries yet. Without any, the assistant answers purely from the model's own
            knowledge — which cannot be reviewed or corrected.
          </div>
        ) : entries.map((e) => (
          <div key={e.id} style={{ padding: '0.85rem', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{e.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>
                  {(SERVICES.find((s) => s.key === e.service) || {}).label || e.service} · {e.category}
                  {e.source ? ` · ${e.source}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{
                  background: e.approved ? '#f0fdf4' : '#fffbeb',
                  color: e.approved ? '#166534' : '#92400e',
                  borderRadius: 999, padding: '2px 9px', fontSize: '0.72rem', fontWeight: 700,
                }}>{e.approved ? 'in use' : 'awaiting approval'}</span>
                <button className="btn" style={ghost} onClick={() => {
                  setEditing(e.id);
                  setForm({ title: e.title, body: e.body, service: e.service, category: e.category,
                            tags: e.tags || '', source: e.source || '', enabled: e.enabled });
                }}>Edit</button>
                <button className="btn" style={ghost} disabled={busy}
                  onClick={() => setApproval(e.id, !e.approved)}>
                  {e.approved ? 'Withdraw' : 'Approve'}
                </button>
                <button className="btn" style={{ ...ghost, color: '#991b1b', borderColor: '#fecaca' }}
                  disabled={busy} onClick={() => remove(e.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.3rem' }}>{label}</label>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      border: 'none', cursor: 'pointer', borderRadius: 999, padding: '0.35rem 0.85rem',
      fontSize: '0.8rem', fontWeight: 600,
      background: on ? '#2f5e40' : '#f1f5f9', color: on ? '#fff' : '#475569',
    }}>{children}</button>
  );
}

function Banner({ tone, children }) {
  const ok = tone === 'ok';
  return (
    <div style={{
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      color: ok ? '#166534' : '#991b1b',
      padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem',
    }}>{children}</div>
  );
}

const input = {
  width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1',
  borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box',
};

const ghost = {
  background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8,
  padding: '0.35rem 0.8rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem',
};
