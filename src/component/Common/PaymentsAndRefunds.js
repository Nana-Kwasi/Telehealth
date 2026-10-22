import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import { nessaHubPolicyUrl } from '../../constants/nessaHubPolicies';
import './CareTransfers.css';

/**
 * A patient's payments, each with "Request a refund". Before sending, the
 * patient sees exactly what the refund policy gives for their situation — a
 * full or partial refund straight away, a review by our team, or why it cannot
 * be refunded — so nobody is surprised afterwards.
 */
const GHS = (v) => `GHS ${Number(v || 0).toFixed(2)}`;
const fmt = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const SERVICE = { consultation: 'Doctor consultation', therapy: 'Therapy session', psychiatry: 'Psychiatry', other: 'Payment' };
const REFUND = {
  UNDER_REVIEW: ['Refund under review', '#d97706'], APPROVED: ['Refund approved', '#4f46e5'], PROCESSING: ['Refund being sent', '#0891b2'],
  REFUNDED: ['Refunded', '#16a34a'], DECLINED: ['Refund declined', '#64748b'], FAILED: ['Refund delayed', '#d97706'],
};

export default function PaymentsAndRefunds() {
  const [payments, setPayments] = useState(null);
  const [refunds, setRefunds] = useState([]);
  const [reasons, setReasons] = useState({});
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    api('/api/v1/finance/my-payments').then(setPayments).catch(() => setPayments([]));
    api('/api/v1/finance/refunds/mine').then(setRefunds).catch(() => setRefunds([]));
  }, []);
  useEffect(() => {
    load();
    api('/api/v1/finance/refunds/reasons').then(setReasons).catch(() => setReasons({}));
  }, [load]);

  if (!payments) return null;
  if (payments.length === 0 && refunds.length === 0) return null;
  return (
    <section className="ct-card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Payments and refunds</h3>
      <p className="ct-meta">
        Cancel at least 24 hours before for a full refund; later cancellations may get part back.{' '}
        <a href={nessaHubPolicyUrl('refund-cancellation-policy')} target="_blank" rel="noreferrer">Refund & cancellation policy</a>
      </p>
      <div className="ct-list" style={{ marginTop: 10 }}>
        {payments.map((p) => {
          const [label, color] = REFUND[p.refundStatus] || [];
          const left = Number(p.paid) - Number(p.refunded);
          const canAsk = !p.free && left > 0 && !['UNDER_REVIEW', 'APPROVED', 'PROCESSING'].includes(p.refundStatus);
          return (
            <div key={p.reference} className="ct-card" style={{ boxShadow: 'none' }}>
              <div className="ct-card-row">
                <div>
                  <strong>{SERVICE[p.serviceType] || 'Payment'}{p.providerName ? ` with ${p.providerName}` : ''}</strong>
                  <p className="ct-meta">Paid {GHS(p.paid)} on {fmt(p.paidAt)}{p.serviceAt ? ` · session ${fmt(p.serviceAt)}` : ''}</p>
                  {Number(p.refunded) > 0 ? <p className="ct-meta">Refunded {GHS(p.refunded)}</p> : null}
                </div>
                {label ? <span className="ct-badge" style={{ background: color, color: '#fff' }}>{label}</span> : null}
              </div>
              {canAsk ? (
                open === p.reference
                  ? <RefundForm p={p} reasons={reasons} onDone={() => { setOpen(null); load(); }} onCancel={() => setOpen(null)} />
                  : <button type="button" className="ct-btn ghost" onClick={() => setOpen(p.reference)}>Request a refund</button>
              ) : null}
              {refunds.filter((r) => r.reference === p.reference).slice(0, 1).map((r) => (
                <p key={r.id} className="ct-meta" style={{ marginTop: 6 }}>{r.decisionNote || r.policyNote}</p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RefundForm({ p, reasons, onDone, onCancel }) {
  const [reason, setReason] = useState('CHANGE_OF_MIND');
  const [details, setDetails] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPreview(null);
    api(`/api/v1/finance/refunds/preview?reference=${encodeURIComponent(p.reference)}&reason=${reason}`)
      .then(setPreview).catch((e) => setPreview({ outcome: 'NONE', note: e.message, amount: 0 }));
  }, [p.reference, reason]);

  const send = async () => {
    setBusy(true); setError('');
    try { await api('/api/v1/finance/refunds', { method: 'POST', body: { reference: p.reference, reason, details } }); onDone(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const needsDetails = reason !== 'CHANGE_OF_MIND';
  const outcomeText = !preview ? 'Checking…'
    : preview.outcome === 'FULL' ? `You will be refunded ${GHS(preview.amount)} in full.`
      : preview.outcome === 'PARTIAL' ? `You will be refunded ${GHS(preview.amount)}.`
        : preview.outcome === 'REVIEW' ? 'Our team will review this.' : 'This cannot be refunded.';
  return (
    <div className="ct-section">
      <div className="ct-field">
        <label htmlFor={`rr-${p.reference}`}>Why are you asking for a refund?</label>
        <select id={`rr-${p.reference}`} value={reason} onChange={(e) => setReason(e.target.value)}>
          {Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {needsDetails ? (
        <div className="ct-field">
          <label htmlFor={`rd-${p.reference}`}>Tell us what happened</label>
          <textarea id={`rd-${p.reference}`} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
      ) : null}
      <div className={preview?.outcome === 'NONE' ? 'ct-error' : 'ct-status-note'} style={{ marginBottom: 8 }}>
        <strong>{outcomeText}</strong> {preview?.note}
        {reason === 'CHANGE_OF_MIND' && ['FULL', 'PARTIAL'].includes(preview?.outcome) ? ' Your booking will be cancelled.' : ''}
      </div>
      {error ? <div className="ct-error">{error}</div> : null}
      <div className="ct-actions">
        <button type="button" className="ct-btn primary" disabled={busy || !preview || preview.outcome === 'NONE' || (needsDetails && !details.trim())} onClick={send}>
          {busy ? 'Sending…' : preview?.outcome === 'REVIEW' ? 'Send for review' : 'Cancel and refund'}
        </button>
        <button type="button" className="ct-btn" onClick={onCancel}>Back</button>
      </div>
      <p className="ct-meta">Refunds go back to the card or mobile money wallet you paid with and usually arrive within 3 to 10 working days.</p>
    </div>
  );
}
