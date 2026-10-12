import React, { useEffect, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { api } from '../../services/apiClient';

/**
 * The QR code and 8-digit code a patient shows at a pharmacy, plus what has been
 * dispensed so far. Used by the patient / psychiatry-client Prescriptions screen
 * and by the prescriber's prescription details (doctor and psychiatrist).
 *
 * The QR holds only a link with a random token — no medicines, no name. A
 * pharmacy still has to be signed in to do anything with it.
 *
 * Props:
 *   prescription  the prescription row (id, lifecycleStatus, openToAll, branchName …)
 *   canManage     prescriber view: offers "New code" and "Cancel prescription"
 *   onChanged     called after a cancel / new code so the parent can reload
 */
const LIFECYCLE_LABEL = {
  ISSUED: 'Ready to collect',
  PARTIALLY_DISPENSED: 'Partly dispensed',
  DISPENSED: 'Fully dispensed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const box = { border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '0.9rem 1rem', background: '#fff' };

export default function PrescriptionCodeCard({ prescription, canManage = false, onChanged }) {
  const rx = prescription || {};
  const [code, setCode] = useState(null);
  const [qr, setQr] = useState('');
  const [dispensings, setDispensings] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [smsInfo, setSmsInfo] = useState(null);
  const lifecycle = rx.lifecycleStatus || 'ISSUED';
  const closed = ['DISPENSED', 'CANCELLED', 'EXPIRED'].includes(lifecycle) || !!rx.deliveredAt;

  const load = useCallback(async () => {
    if (!rx.id) return;
    setError('');
    try {
      const c = await api(`/api/v1/medical/prescriptions/${rx.id}/access-code`);
      setCode(c);
      setQr(c?.qrUrl ? await QRCode.toDataURL(c.qrUrl, { margin: 1, width: 180 }) : '');
    } catch (e) {
      setError(e?.message || 'Could not load the collection code.');
    }
    api(`/api/v1/medical/prescriptions/${rx.id}/dispensings`).then(d => setDispensings(Array.isArray(d) ? d : [])).catch(() => {});
    api(`/api/v1/medical/prescriptions/${rx.id}/access-code/sms`).then(setSmsInfo).catch(() => {});
  }, [rx.id]);

  // Re-send the CURRENT code by SMS (no new code is created).
  const textCode = async () => {
    setBusy(true);
    try {
      setSmsInfo(await api(`/api/v1/medical/prescriptions/${rx.id}/access-code/sms`, { method: 'POST' }));
      alert('The code has been sent by SMS.');
    } catch (e) { alert(e?.message || 'Could not send the SMS.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, [load]);

  const reissue = async () => {
    if (!window.confirm('Create a new code? The current code will stop working.')) return;
    setBusy(true);
    try {
      await api(`/api/v1/medical/prescriptions/${rx.id}/access-code/reissue`, { method: 'POST' });
      await load();
      onChanged?.();
    } catch (e) { alert(e?.message || 'Could not create a new code.'); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!window.confirm('Cancel this prescription? Pharmacies will no longer be able to dispense it.')) return;
    setBusy(true);
    try {
      await api(`/api/v1/medical/prescriptions/${rx.id}/cancel`, { method: 'POST', body: {} });
      onChanged?.();
    } catch (e) { alert(e?.message || 'Could not cancel the prescription.'); }
    finally { setBusy(false); }
  };

  const digits = code?.code ? `${code.code.slice(0, 4)} ${code.code.slice(4)}` : '';
  const withQty = dispensings.filter(d => d.quantity != null || d.dispensed > 0 || d.pickedUp);

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>Collect at a pharmacy</strong>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 20,
          background: closed ? '#f1f5f9' : '#ecfdf5', color: closed ? '#475569' : '#047857', border: `1px solid ${closed ? '#e2e8f0' : '#a7f3d0'}` }}>
          {LIFECYCLE_LABEL[lifecycle] || lifecycle}
        </span>
      </div>

      {/* Where it is: open to all, held by a pharmacy, or sent to one branch. */}
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569' }}>
        {rx.openToAll && !rx.pharmacyId && !rx.branchId
          ? 'Open to all NessaHub pharmacies. Show this code at any of them.'
          : rx.openToAll
            ? `Being prepared by ${rx.branchName || rx.pharmacyName || 'a pharmacy'}${rx.holdExpiresAt ? ` · held until ${new Date(rx.holdExpiresAt).toLocaleString()}` : ''}.`
            : (rx.branchName || rx.pharmacyName)
              ? `Sent to ${rx.branchName || rx.pharmacyName}. Show this code there.`
              : 'Not sent to a pharmacy yet.'}
      </p>

      {error && <p style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c' }}>{error}</p>}

      {!closed && code && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {qr && <img src={qr} alt="Prescription QR code" width={140} height={140} style={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />}
          <div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Collection code</p>
            <p style={{ margin: '0.15rem 0', fontFamily: 'monospace', fontSize: '1.6rem', fontWeight: 900, color: '#0c4a6e', letterSpacing: '0.12em' }}>{digits}</p>
            {code.expiresAt && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Valid until {new Date(code.expiresAt).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      )}

      {!closed && smsInfo?.smsAvailable && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem', color: '#475569' }}>
          {smsInfo.patientHasVerifiedPhone ? (
            <>
              <button type="button" className="doctor-btn doctor-btn-outline doctor-btn-sm" disabled={busy} onClick={textCode}>
                {canManage ? 'Text the code to the patient' : 'Text me this code'}
              </button>
              {smsInfo.last && <span>Last SMS: {String(smsInfo.last.status).toLowerCase().replace('_', ' ')} · {new Date(smsInfo.last.created_at).toLocaleString()}</span>}
            </>
          ) : <span>{canManage ? 'The patient has no verified phone for SMS yet.' : 'Verify your phone above to get this code by SMS.'}</span>}
        </div>
      )}

      {withQty.length > 0 && (
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem' }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>Dispensed so far</p>
          {withQty.map(d => (
            <div key={d.medIndex} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', padding: '0.15rem 0' }}>
              <span>{d.name || 'Medicine'}</span>
              <span>
                {d.quantity != null
                  ? `${Number(d.dispensed)} of ${Number(d.quantity)}${d.quantityUnit ? ` ${d.quantityUnit}` : ''}`
                  : (d.pickedUp ? 'Collected' : '—')}
              </span>
            </div>
          ))}
        </div>
      )}

      {canManage && !closed && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="doctor-btn doctor-btn-outline doctor-btn-sm" disabled={busy} onClick={reissue}>New code</button>
          <button type="button" className="doctor-btn doctor-btn-danger doctor-btn-sm" disabled={busy} onClick={cancel}>Cancel prescription</button>
        </div>
      )}
    </div>
  );
}
