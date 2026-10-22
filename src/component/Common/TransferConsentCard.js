import React, { useCallback, useEffect, useState } from 'react';
import { getStoredUserId } from '../../services/apiClient';
import { consentToTransfer, fmtWhen, getTransfer, listTransfers } from '../../services/careTransfers';
import './CareTransfers.css';

/**
 * Top of the patient's Home: a transfer of their care that needs their consent,
 * and a short status line for one in progress or just completed.
 *
 * The exact consent wording comes from the server and is what gets stored with
 * the decision (with its time), so what the patient reads is what they agreed to.
 */
export default function TransferConsentCard({ kind }) {
  const me = getStoredUserId();
  const [pending, setPending] = useState([]);
  const [recent, setRecent] = useState(null);

  const load = useCallback(async () => {
    try {
      const rows = (await listTransfers()).filter((t) => t.patientId === me && (!kind || t.kind === kind));
      const waiting = rows.filter((t) => t.status === 'AWAITING_PATIENT_CONSENT');
      setPending(await Promise.all(waiting.map((t) => getTransfer(t.id).catch(() => t))));
      const weekAgo = Date.now() - 7 * 86400000;
      setRecent(rows.find((t) => ['AWAITING_RECIPIENT', 'REJECTED_AWAITING_REASSIGN'].includes(t.status)
        || (t.status === 'COMPLETED' && new Date(t.completedAt).getTime() > weekAgo)) || null);
    } catch {
      setPending([]);
    }
  }, [me, kind]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      {pending.map((t) => <ConsentRequest key={t.id} t={t} onDone={load} />)}
      {pending.length === 0 && recent ? (
        <div className="ct-status-note" role="status">
          {recent.status === 'COMPLETED'
            ? `Your care was transferred to ${recent.toName} on ${fmtWhen(recent.completedAt)}${recent.autoReassigned ? ' (NessaHub matched them for you)' : ''}. Your records moved with you.`
            : recent.status === 'AWAITING_RECIPIENT'
              ? `You agreed to transfer your care to ${recent.toName}. We are waiting for them to accept and will let you know.`
              : 'Your transfer is still in progress: we are arranging another clinician and will let you know who.'}
        </div>
      ) : null}
    </>
  );
}

function ConsentRequest({ t, onDone }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const role = t.kind === 'MEDICAL' ? 'doctor' : 'therapist';

  const decide = async (agree) => {
    setBusy(true); setError('');
    try { await consentToTransfer(t.id, agree, agree ? null : reason); onDone(); }
    catch (e) { setError(e.message || 'Your answer could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="ct-consent" aria-labelledby={`ct-consent-${t.id}`}>
      <h3 id={`ct-consent-${t.id}`}>Your {role} would like to transfer your care</h3>
      <p>
        <strong>{t.fromName}</strong> has asked to transfer your {t.kind === 'MEDICAL' ? 'medical care' : 'therapy'} to{' '}
        <strong>{t.toName}</strong>. Reason: {t.reasonLabel}{t.reasonDetails ? ` — ${t.reasonDetails}` : ''}.
      </p>
      <p>Nothing changes unless you agree.</p>
      {t.consentText ? <blockquote>{t.consentText}</blockquote> : null}
      {declining ? (
        <div className="ct-field">
          <label htmlFor={`ct-decline-${t.id}`}>Would you like to tell {t.fromName} why? (optional)</label>
          <textarea id={`ct-decline-${t.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      ) : null}
      {error ? <div className="ct-error">{error}</div> : null}
      <div className="ct-actions">
        {declining ? (
          <>
            <button type="button" className="ct-btn danger" disabled={busy} onClick={() => decide(false)}>Decline the transfer</button>
            <button type="button" className="ct-btn" onClick={() => setDeclining(false)}>Back</button>
          </>
        ) : (
          <>
            <button type="button" className="ct-btn primary" disabled={busy} onClick={() => decide(true)}>I agree</button>
            <button type="button" className="ct-btn" disabled={busy} onClick={() => setDeclining(true)}>Decline</button>
          </>
        )}
      </div>
      <p className="ct-meta" style={{ marginTop: 8 }}>Your answer is saved with the date and time and appears in your consent history in Settings.</p>
    </section>
  );
}
