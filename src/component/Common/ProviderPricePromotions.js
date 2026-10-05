import React, { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';

/**
 * Promotions on MY fee — a doctor or therapist deciding whether to take part.
 *
 * The rule: an admin may compose a discount that names a provider, but it does
 * not touch that provider's fee until they say yes. Nothing here is a
 * formality — declining leaves their rate exactly as it was, and a promotion
 * with no approvals cannot go live at all.
 *
 * So the screen leads with what it costs them, in money, before it asks.
 */
const money = (n) => `GHS ${Number(n || 0).toFixed(2)}`;

export default function ProviderPricePromotions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [declining, setDeclining] = useState(null);
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const list = await api('/api/v1/promotions/mine');
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || 'Could not load promotions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const decide = async (promotionId, decision, declineNote) => {
    setBusy(promotionId); setError(''); setMessage('');
    try {
      await api(`/api/v1/promotions/${promotionId}/consent`, {
        method: 'POST',
        body: { decision, note: declineNote || null },
      });
      setMessage(decision === 'approve'
        ? 'Approved. The discount will show on your profile while the offer runs.'
        : 'Declined. Your fee is unchanged.');
      setDeclining(null); setNote('');
      await load();
    } catch (e) {
      setError(e?.message || 'Could not send your decision.');
    } finally {
      setBusy(null);
    }
  };

  /** What this promotion takes off a typical session at my rate. */
  const effect = (r) => {
    if (r.discount_type === 'percent') {
      const cap = r.max_discount_amount ? ` (never more than ${money(r.max_discount_amount)})` : '';
      return `${Number(r.value)}% off each session${cap}`;
    }
    if (r.discount_type === 'fixed_amount') return `${money(r.value)} off each session`;
    return `Each session priced at ${money(r.value)}`;
  };

  if (loading) return <div style={S.loading}>Loading…</div>;

  const pending = rows.filter((r) => r.my_status === 'pending');
  const answered = rows.filter((r) => r.my_status !== 'pending');

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Promotions on your fee</h1>
      <p style={S.lead}>
        An administrator can propose a discount that features you. It does not change
        what you are paid until you approve it here, and declining leaves your rate
        exactly as it is.
      </p>

      {error ? <div style={S.error}>{error}</div> : null}
      {message ? <div style={S.ok}>{message}</div> : null}

      {pending.length > 0 ? (
        <>
          <h2 style={S.h2}>Waiting for your decision</h2>
          {pending.map((r) => (
            <div key={r.id} style={S.card}>
              <div style={S.cardTop}>
                <span style={S.name}>{r.name}</span>
                <span style={S.pillWait}>Needs your answer</span>
              </div>
              {r.description ? <p style={S.desc}>{r.description}</p> : null}

              <div style={S.effect}>{effect(r)}</div>

              <div style={S.meta}>
                Runs {new Date(r.starts_at).toLocaleDateString()} to{' '}
                {new Date(r.ends_at).toLocaleDateString()}
                {r.service_types ? ` · ${r.service_types}` : ''}
                {Number(r.min_final_amount) > 0
                  ? ` · never below ${money(r.min_final_amount)}` : ''}
              </div>

              {declining === r.id ? (
                <div style={S.declineBox}>
                  <label style={S.label}>Why? (optional — the admin will see this)</label>
                  <input style={S.input} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. my rate is already at the lower end" />
                  <div style={S.actions}>
                    <button style={S.danger} disabled={busy === r.id}
                      onClick={() => decide(r.id, 'decline', note)}>
                      {busy === r.id ? 'Sending…' : 'Confirm decline'}
                    </button>
                    <button style={S.ghost} onClick={() => { setDeclining(null); setNote(''); }}>
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <div style={S.actions}>
                  <button style={S.primary} disabled={busy === r.id}
                    onClick={() => decide(r.id, 'approve')}>
                    {busy === r.id ? 'Sending…' : 'Approve'}
                  </button>
                  <button style={S.ghost} onClick={() => setDeclining(r.id)}>Decline</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : null}

      <h2 style={S.h2}>{pending.length ? 'Already decided' : 'Your promotions'}</h2>
      {answered.length === 0 ? (
        <p style={S.empty}>
          {pending.length
            ? 'Nothing decided yet.'
            : 'No promotion names you at the moment. Nothing is affecting your fee.'}
        </p>
      ) : (
        answered.map((r) => (
          <div key={r.id} style={S.card}>
            <div style={S.cardTop}>
              <span style={S.name}>{r.name}</span>
              <span style={r.my_status === 'approved' ? S.pillOk : S.pillNo}>
                You {r.my_status}
              </span>
              {r.live && r.my_status === 'approved'
                ? <span style={S.pillLive}>Live now</span> : null}
            </div>
            <div style={S.effect}>{effect(r)}</div>
            <div style={S.meta}>
              {new Date(r.starts_at).toLocaleDateString()} to{' '}
              {new Date(r.ends_at).toLocaleDateString()}
              {new Date(r.ends_at) < new Date() ? ' · ended — your normal fee applies' : ''}
            </div>
            {r.my_status === 'approved' && !r.live ? (
              <div style={S.meta}>Not running right now.</div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

const S = {
  page: { padding: '1.5rem', maxWidth: 780, margin: '0 auto' },
  loading: { padding: '2rem', color: '#545a6b' },
  h1: { margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f1424' },
  h2: { margin: '1.6rem 0 0.8rem', fontSize: '0.82rem', fontWeight: 800, color: '#2b3142', textTransform: 'uppercase', letterSpacing: '0.06em' },
  lead: { margin: '0.4rem 0 0', fontSize: '0.87rem', lineHeight: 1.6, color: '#545a6b' },
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 14, padding: '1.1rem', marginBottom: '0.8rem' },
  cardTop: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' },
  name: { fontSize: '1rem', fontWeight: 750, color: '#0f1424' },
  desc: { margin: '0 0 0.6rem', fontSize: '0.84rem', lineHeight: 1.55, color: '#545a6b' },
  effect: { padding: '0.6rem 0.8rem', borderRadius: 10, background: '#f7f9fc', border: '1px solid #e4e7ee', fontSize: '0.88rem', fontWeight: 650, color: '#16203a', marginBottom: '0.55rem' },
  meta: { fontSize: '0.76rem', color: '#6b7283', lineHeight: 1.55 },
  declineBox: { marginTop: '0.8rem', padding: '0.8rem', borderRadius: 10, background: '#fafbfd', border: '1px solid #e4e7ee' },
  label: { display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#2b3142', marginBottom: '0.3rem' },
  input: { width: '100%', padding: '0.55rem 0.7rem', borderRadius: 9, border: '1.5px solid #d8dce6', fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box', color: '#0f1424' },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' },
  primary: { padding: '0.6rem 1.15rem', borderRadius: 10, border: 'none', background: '#166534', color: '#fff', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer' },
  danger: { padding: '0.6rem 1.15rem', borderRadius: 10, border: 'none', background: '#991b1b', color: '#fff', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer' },
  ghost: { padding: '0.6rem 1.15rem', borderRadius: 10, border: '1.5px solid #d8dce6', background: '#fff', color: '#2b3142', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer' },
  error: { padding: '0.7rem 0.9rem', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem', margin: '1rem 0' },
  ok: { padding: '0.7rem 0.9rem', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.85rem', margin: '1rem 0' },
  empty: { fontSize: '0.85rem', color: '#6b7283' },
  pillWait: { padding: '0.12rem 0.5rem', borderRadius: 999, background: '#fffbeb', color: '#8a4b09', fontSize: '0.68rem', fontWeight: 800 },
  pillOk: { padding: '0.12rem 0.5rem', borderRadius: 999, background: '#dcfce7', color: '#14532d', fontSize: '0.68rem', fontWeight: 800 },
  pillNo: { padding: '0.12rem 0.5rem', borderRadius: 999, background: '#f1f3f8', color: '#454b5c', fontSize: '0.68rem', fontWeight: 800 },
  pillLive: { padding: '0.12rem 0.5rem', borderRadius: 999, background: '#e8f1fb', color: '#12507f', fontSize: '0.68rem', fontWeight: 800 },
};
