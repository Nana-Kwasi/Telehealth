import React, { useEffect, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { api } from '../../services/apiClient';
import { normalizeDiagnosticOrderStatus } from '../../utils/diagnosticOrderStatus';

/**
 * The QR code and 8-digit check-in code a patient shows at a lab or scan
 * centre. Lab/scan twin of PrescriptionCodeCard. Used on the patient / client
 * Lab & Scan page and in the ordering doctor's or therapist's order details.
 *
 * The QR holds only a link with a random token — never the test or the name.
 * The centre must be signed in to check anyone in with it.
 *
 * Props:
 *   order      the order row (id, status, centerType, branchName/centerName, checkedInAt)
 *   canManage  ordering clinician: offers "New code"
 */
const asDate = (v) => (v?.toDate ? v.toDate() : v?.seconds ? new Date(v.seconds * 1000) : new Date(v));
const box = { border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '0.9rem 1rem', background: '#fff' };

export default function DiagnosticCodeCard({ order, canManage = false }) {
  const o = order || {};
  const [code, setCode] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [smsInfo, setSmsInfo] = useState(null);
  const status = normalizeDiagnosticOrderStatus(o.status);
  const closed = ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status);
  const isScan = String(o.centerType || o.diagnosticType || '').toLowerCase().includes('scan');
  const where = o.branchName || o.centerName || (isScan ? 'the scan centre' : 'the lab');

  const load = useCallback(async () => {
    if (!o.id || closed) return;
    setError('');
    try {
      const c = await api(`/api/v1/diagnostics/operations/orders/${o.id}/access-code`);
      setCode(c);
      setQr(c?.qrUrl ? await QRCode.toDataURL(c.qrUrl, { margin: 1, width: 180 }) : '');
    } catch (e) {
      setError(e?.message || 'Could not load the check-in code.');
    }
    api(`/api/v1/diagnostics/operations/orders/${o.id}/access-code/sms`).then(setSmsInfo).catch(() => {});
  }, [o.id, closed]);

  useEffect(() => { load(); }, [load]);

  const textCode = async () => {
    setBusy(true);
    try {
      setSmsInfo(await api(`/api/v1/diagnostics/operations/orders/${o.id}/access-code/sms`, { method: 'POST' }));
      alert('The code has been sent by SMS.');
    } catch (e) { alert(e?.message || 'Could not send the SMS.'); }
    finally { setBusy(false); }
  };

  const reissue = async () => {
    if (!window.confirm('Create a new code? The current code will stop working.')) return;
    setBusy(true);
    try {
      await api(`/api/v1/diagnostics/operations/orders/${o.id}/access-code/reissue`, { method: 'POST' });
      await load();
    } catch (e) { alert(e?.message || 'Could not create a new code.'); }
    finally { setBusy(false); }
  };

  if (closed) return null;
  const digits = code?.code ? `${code.code.slice(0, 4)} ${code.code.slice(4)}` : '';

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>Check in at {isScan ? 'the scan centre' : 'the lab'}</strong>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 20,
          background: o.checkedInAt ? '#ecfdf5' : '#eff6ff', color: o.checkedInAt ? '#047857' : '#1e40af',
          border: `1px solid ${o.checkedInAt ? '#a7f3d0' : '#bfdbfe'}` }}>
          {o.checkedInAt ? `Checked in ${asDate(o.checkedInAt).toLocaleDateString()}` : 'Not checked in yet'}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569' }}>
        {canManage
          ? `The patient shows this code at ${where}. Staff scan it or type it to check them in before the test.`
          : `Show this code at ${where}. Staff scan it or type it to check you in. Bring your ID too.`}
      </p>
      {error && <p style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c' }}>{error}</p>}
      {code && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {qr && <img src={qr} alt="Test check-in QR code" width={140} height={140} style={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />}
          <div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Check-in code</p>
            <p style={{ margin: '0.15rem 0', fontFamily: 'monospace', fontSize: '1.6rem', fontWeight: 900, color: isScan ? '#4c1d95' : '#065f46', letterSpacing: '0.12em' }}>{digits}</p>
          </div>
        </div>
      )}
      {smsInfo?.smsAvailable && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem', color: '#475569' }}>
          {smsInfo.patientHasVerifiedPhone ? (
            <>
              <button type="button" className="doctor-btn doctor-btn-outline doctor-btn-sm" disabled={busy} onClick={textCode}>
                {canManage ? 'Text the code to the patient' : 'Text me this code'}
              </button>
              {smsInfo.last && <span>Last SMS: {String(smsInfo.last.status).toLowerCase().replace('_', ' ')} · {new Date(smsInfo.last.created_at).toLocaleString()}</span>}
            </>
          ) : <span>{canManage ? 'The patient has no verified phone for SMS yet.' : 'Verify your phone in Settings to get this code by SMS.'}</span>}
        </div>
      )}
      {canManage && (
        <div>
          <button type="button" className="doctor-btn doctor-btn-outline doctor-btn-sm" disabled={busy} onClick={reissue}>New code</button>
        </div>
      )}
    </div>
  );
}
