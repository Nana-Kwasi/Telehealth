import React, { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';

/**
 * Verify the phone number used for SMS (prescription codes, SMS requests).
 * Hidden entirely while SMS is not set up on NessaHub.
 */
const input = { padding: '0.5rem 0.65rem', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.88rem' };
const btn = { padding: '0.5rem 0.9rem', borderRadius: 10, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' };

export default function PhoneForSms({ onVerified, embedded = false }) {
  const [status, setStatus] = useState(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api('/api/v1/me/phone').then(s => { setStatus(s); if (s?.suggestedPhone) setPhone(s.suggestedPhone); }).catch(() => {});
  }, []);

  if (!status?.smsAvailable) return null;

  const start = async () => {
    setBusy(true); setError('');
    try { const r = await api('/api/v1/me/phone/verify/start', { method: 'POST', body: { phone } }); setSentTo(r.sentTo); }
    catch (e) { setError(e?.message || 'Could not send the code.'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError('');
    try { const st = await api('/api/v1/me/phone/verify/confirm', { method: 'POST', body: { code } }); setStatus(st); setSentTo(''); setCode(''); setEditing(false); onVerified?.(st); }
    catch (e) { setError(e?.message || 'Could not verify the code.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={embedded ? { fontSize: '0.85rem' } : { background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: 12, padding: '0.75rem 0.9rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
      {status.verified && !editing ? (
        <span>📱 Prescription codes and updates are texted to <strong>{status.phone}</strong>.{' '}
          <button type="button" onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: '#0f766e', fontWeight: 700, cursor: 'pointer' }}>Change</button>
        </span>
      ) : sentTo ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Enter the 6-digit code sent to {sentTo}:</span>
          <input style={{ ...input, width: 110, letterSpacing: '0.2em' }} inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />
          <button type="button" style={btn} disabled={busy || code.length < 6} onClick={confirm}>Verify</button>
          <button type="button" onClick={() => setSentTo('')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}>Use another number</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Get your prescription codes by SMS:</span>
          <input style={input} placeholder="024 123 4567" value={phone} onChange={e => setPhone(e.target.value)} />
          <button type="button" style={btn} disabled={busy || !phone.trim()} onClick={start}>Send code</button>
        </div>
      )}
      {error && <p style={{ margin: '0.4rem 0 0', color: '#b91c1c' }}>{error}</p>}
    </div>
  );
}
