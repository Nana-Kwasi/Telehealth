import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../services/apiClient';
import { resolveFileUrl } from '../../../utils/fileUrl';
import Paged from '../../Common/Paged';

/**
 * Promotional campaigns.
 *
 * The rule this screen exists to honour: an admin may compose an offer that
 * features a doctor or therapist, but it does not go out on their behalf until
 * THEY approve it. So the flow is compose → name providers → wait for their
 * decisions → send, and the send button stays shut until at least one has said
 * yes. The backend refuses it regardless; this screen just makes that visible.
 */

const AUDIENCES = [
  { key: 'all_clients',  label: 'Therapy clients' },
  { key: 'all_patients', label: 'Medical patients' },
];

export default function AdminPromotions() {
  const [campaigns, setCampaigns] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [message, setMessage]     = useState('');
  const [detail, setDetail]       = useState(null);
  const [reach, setReach]         = useState(null);

  const [form, setForm] = useState({
    title: '', subject: '', bodyHtml: '', audience: 'all_clients', providerIds: [],
  });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, therapists, doctors] = await Promise.all([
        api('/api/v1/campaigns?type=promotional'),
        api('/api/v1/admin/users?type=therapists&limit=200').catch(() => []),
        api('/api/v1/admin/users?type=doctors&limit=200').catch(() => []),
      ]);
      setCampaigns(Array.isArray(list) ? list : []);
      setProviders([...(therapists || []), ...(doctors || [])]);
    } catch (e) {
      setError(e.message || 'Could not load promotions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Show how many people this would actually reach before anyone commits.
  useEffect(() => {
    if (!creating) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api(
          `/api/v1/campaigns/audience-preview?audience=${encodeURIComponent(form.audience)}&category=marketing`,
        );
        if (!cancelled) setReach(r);
      } catch { if (!cancelled) setReach(null); }
    })();
    return () => { cancelled = true; };
  }, [creating, form.audience]);

  const toggleProvider = (id) => {
    setForm((f) => ({
      ...f,
      providerIds: f.providerIds.includes(id)
        ? f.providerIds.filter((p) => p !== id)
        : [...f.providerIds, id],
    }));
  };

  const create = async () => {
    if (!form.title.trim() || !form.subject.trim() || !form.bodyHtml.trim()) {
      setError('Give the promotion a name, a subject and a message.');
      return;
    }
    if (!form.providerIds.length) {
      setError('Choose at least one provider. A promotion is sent on their behalf, so they have to agree to it.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      await api('/api/v1/campaigns', { method: 'POST', body: { ...form, campaignType: 'promotional' } });
      setMessage('Created. Each provider now has to approve before it can be sent.');
      setCreating(false);
      setForm({ title: '', subject: '', bodyHtml: '', audience: 'all_clients', providerIds: [] });
      load();
    } catch (e) {
      setError(e.message || 'Could not create the promotion.');
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id) => {
    setError(''); setMessage('');
    try {
      setDetail(await api(`/api/v1/campaigns/${id}`));
    } catch (e) {
      setError(e.message || 'Could not open that promotion.');
    }
  };

  const send = async (id) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await api(`/api/v1/campaigns/${id}/send`, { method: 'POST' });
      setMessage(
        `Sent to ${res.sent} of ${res.audienceSize}.` +
        (res.skipped ? ` ${res.skipped} skipped — they have not opted in to promotional email.` : ''),
      );
      load();
      openDetail(id);
    } catch (e) {
      setError(e.message || 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    setBusy(true); setError('');
    try {
      await api(`/api/v1/campaigns/${id}`, { method: 'DELETE' });
      setMessage('Promotion cancelled.');
      setDetail(null);
      load();
    } catch (e) {
      setError(e.message || 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  };

  const approvals = useMemo(() => {
    if (!detail?.providers) return { approved: 0, pending: 0, declined: 0 };
    return detail.providers.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, { approved: 0, pending: 0, declined: 0 });
  }, [detail]);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Promotions</h1>
          <p className="admin-page-sub">
            Offers featuring a doctor or therapist. Each named provider approves before anything is sent
            on their behalf.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setCreating(!creating); setError(''); }}>
          {creating ? 'Close' : '+ New promotion'}
        </button>
      </div>

      {error   ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      {creating ? (
        <div className="admin-table-card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.05rem' }}>New promotion</h2>

          <Field label="Internal name">
            <input style={inputStyle} value={form.title} placeholder="e.g. September 20% off"
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>

          <Field label="Email subject">
            <input style={inputStyle} value={form.subject} placeholder="e.g. 20% off your first consultation"
              onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>

          <Field label="Message">
            <textarea style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.8rem' }}
              rows={6} value={form.bodyHtml} placeholder="<p>Book this month and save 20%.</p>"
              onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })} />
          </Field>

          <Field label="Who receives it">
            <select style={inputStyle} value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              {AUDIENCES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            {reach ? (
              <div style={{ fontSize: '0.78rem', color: reach.willingToReceive ? '#166534' : '#9a3412', marginTop: '0.4rem' }}>
                {reach.total} in this audience · <strong>{reach.willingToReceive}</strong> have opted in to
                promotional email{reach.optedOut ? ` · ${reach.optedOut} have not` : ''}.
                {reach.willingToReceive === 0
                  ? ' Nobody will receive this until people opt in to marketing email.'
                  : ''}
              </div>
            ) : null}
          </Field>

          <Field label="Providers featured — each must approve">
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.5rem' }}>
              {providers.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.83rem', padding: '0.5rem' }}>No providers found.</div>
              ) : <Paged items={providers}>{(providers) => providers.map((p) => {
                const id = p.id || p.userId;
                const on = form.providerIds.includes(id);
                return (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem',
                                           padding: '0.4rem 0.35rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={on} onChange={() => toggleProvider(id)} />
                    {p.photoURL ? (
                      <img src={resolveFileUrl(p.photoURL)} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : null}
                    <span style={{ fontWeight: 600 }}>{p.fullName || p.name || p.email}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{p.role}</span>
                  </label>
                );
              })}</Paged>}
            </div>
          </Field>

          <button className="btn btn-primary" onClick={create} disabled={busy} style={{ marginTop: '1rem' }}>
            {busy ? 'Creating…' : 'Create and request approval'}
          </button>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
        <div className="admin-table-card" style={{ padding: '0.5rem' }}>
          {loading ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>Loading…</div>
          ) : campaigns.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
              No promotions yet.
            </div>
          ) : <Paged items={campaigns}>{(campaigns) => campaigns.map((c) => (
            <button key={c.id} onClick={() => openDetail(c.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                       background: detail?.campaign?.id === c.id ? '#e9f3ec' : 'transparent',
                       borderRadius: 8, padding: '0.7rem', marginBottom: 2 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.title}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>
                <StatusPill status={c.status} /> · sent to {c.sent_count ?? 0}
              </div>
            </button>
          ))}</Paged>}
        </div>

        {detail ? (
          <div className="admin-table-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem' }}>{detail.campaign.title}</h2>
            <div style={{ marginBottom: '0.75rem' }}><StatusPill status={detail.campaign.status} /></div>
            <div style={{ fontSize: '0.85rem', color: '#334155' }}><strong>Subject:</strong> {detail.campaign.subject}</div>

            <div style={{ marginTop: '1rem', fontWeight: 700, fontSize: '0.85rem' }}>
              Provider approvals — {approvals.approved || 0} approved, {approvals.pending || 0} waiting,
              {' '}{approvals.declined || 0} declined
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              {(detail.providers || []).map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between',
                                         padding: '0.45rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                  <span>{p.full_name || p.email}</span>
                  <StatusPill status={p.status} />
                </div>
              ))}
            </div>

            {(detail.delivery || []).length ? (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Delivery</div>
                {detail.delivery.map((d, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: '#475569' }}>
                    {d.status}{d.skip_reason ? ` (${d.skip_reason.replace(/_/g, ' ')})` : ''}: {d.count}
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={busy || (approvals.approved || 0) === 0 || detail.campaign.status === 'sent'}
                onClick={() => send(detail.campaign.id)}>
                {detail.campaign.status === 'sent' ? 'Already sent' : 'Send now'}
              </button>
              {detail.campaign.status !== 'sent' ? (
                <button className="btn" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}
                  disabled={busy} onClick={() => cancel(detail.campaign.id)}>Cancel</button>
              ) : null}
            </div>
            {(approvals.approved || 0) === 0 && detail.campaign.status !== 'sent' ? (
              <div style={{ fontSize: '0.78rem', color: '#9a3412', marginTop: '0.5rem' }}>
                Waiting on provider approval — nothing can be sent on their behalf until at least one agrees.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="admin-table-card" style={{ padding: '1.5rem', color: '#64748b' }}>
            Choose a promotion to see approvals and delivery.
          </div>
        )}
      </div>
    </div>
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

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.3rem' }}>{label}</label>
      {children}
    </div>
  );
}

function StatusPill({ status }) {
  const tones = {
    approved: ['#f0fdf4', '#166534'], sent: ['#f0fdf4', '#166534'],
    pending: ['#fffbeb', '#92400e'], pending_consent: ['#fffbeb', '#92400e'],
    declined: ['#fef2f2', '#991b1b'], cancelled: ['#f1f5f9', '#475569'],
    draft: ['#f1f5f9', '#475569'],
  };
  const [bg, fg] = tones[status] || ['#f1f5f9', '#475569'];
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: '2px 9px',
                   fontSize: '0.72rem', fontWeight: 700 }}>
      {String(status || '').replace(/_/g, ' ')}
    </span>
  );
}

const inputStyle = {
  width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1',
  borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box',
};
