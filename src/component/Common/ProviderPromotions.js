import React, { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * Promotions a provider has been asked to appear in.
 *
 * Admin composes the offer, but it is sent in this provider's name, so nothing
 * goes out until they agree here. Declining is a first-class choice, not a
 * hidden one — and the full message is shown before either button, because
 * agreeing to something you cannot read is not consent.
 */
export default function ProviderPromotions() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const rows = await api('/api/v1/campaigns/consent/pending');
      setPending(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || 'Could not load promotion requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const decide = async (campaignId, decision) => {
    setBusyId(campaignId); setError(''); setMessage('');
    try {
      await api(`/api/v1/campaigns/${campaignId}/consent`, {
        method: 'POST',
        body: { decision },
      });
      setMessage(decision === 'approved'
        ? 'Approved. This offer can now be sent featuring you.'
        : 'Declined. This offer will not be sent in your name.');
      load();
    } catch (e) {
      setError(e.message || 'Could not record your decision.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.35rem' }}>Promotion requests</h1>
      <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.9rem' }}>
        These offers would be sent to clients featuring you. Nothing is sent unless you approve it.
      </p>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      {loading ? (
        <div style={{ color: '#64748b' }}>Loading…</div>
      ) : pending.length === 0 ? (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
                      padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          Nothing waiting for your approval.
        </div>
      ) : <Paged items={pending}>{(pending) => pending.map((p) => (
        <div key={p.campaign_id}
          style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                   padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{p.title}</div>
          <div style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.35rem 0 0.75rem' }}>
            Subject: {p.subject}
          </div>

          {/* The exact message the client would receive. Admin-authored markup. */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}
               dangerouslySetInnerHTML={{ __html: p.body_html || '<em>No message provided.</em>' }} />

          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
            <button
              onClick={() => decide(p.campaign_id, 'approved')}
              disabled={busyId === p.campaign_id}
              style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 8,
                       padding: '0.6rem 1.1rem', fontWeight: 600, cursor: 'pointer' }}>
              {busyId === p.campaign_id ? 'Saving…' : 'Approve'}
            </button>
            <button
              onClick={() => decide(p.campaign_id, 'declined')}
              disabled={busyId === p.campaign_id}
              style={{ background: '#fff', color: '#991b1b', border: '1px solid #fecaca',
                       borderRadius: 8, padding: '0.6rem 1.1rem', fontWeight: 600, cursor: 'pointer' }}>
              Decline
            </button>
          </div>
        </div>
      ))}</Paged>}
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
