import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';

/**
 * Verify a prescription from the patient's QR code or 8-digit code.
 *
 * Desk barcode scanners "type" the QR link into the box and press Enter, so the
 * text box covers them. "Scan with camera" uses the browser's built-in QR
 * detector (Chrome, Edge, Android); where it is missing, the box is the fallback.
 *
 * The server decides everything: a routed prescription opens only for the branch
 * it was sent to; an open one can be taken; a closed one just shows its status.
 * Verifying never dispenses anything.
 */
const RESULT_STYLE = {
  YOURS:             { bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46' },
  OPEN:              { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af' },
  DISPENSED:         { bg: '#f8fafc', border: '#e2e8f0', color: '#334155' },
  TAKEN:             { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
  NOT_YOUR_PHARMACY: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
  REVOKED:           { bg: '#fff7ed', border: '#fed7aa', color: '#9a3412' },
  EXPIRED:           { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
  CANCELLED:         { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
  INVALID:           { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
};

export default function PrescriptionCodeVerify() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  const verify = async (value) => {
    const code = String(value || '').trim();
    if (!code) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api('/api/v1/pharmacy/prescriptions/verify', { method: 'POST', body: { code } }));
    } catch (e) {
      setError(e?.message || 'Could not verify this code.');
    } finally {
      setBusy(false);
    }
  };

  const take = async () => {
    if (!result?.prescriptionId) return;
    setBusy(true);
    try {
      await api(`/api/v1/pharmacy/open-prescriptions/${result.prescriptionId}/take`, { method: 'POST', body: {} });
      navigate(`/dashboard/prescriptions/${result.prescriptionId}`);
    } catch (e) {
      setError(e?.message || 'Could not take this prescription.');
      verify(input);
    } finally {
      setBusy(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks?.().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => {
    if (!scanning) return undefined;
    let cancelled = false;
    let timer = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        // eslint-disable-next-line no-undef
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found?.[0]?.rawValue) {
              const value = found[0].rawValue;
              setInput(value);
              stopCamera();
              verify(value);
              return;
            }
          } catch { /* keep looking */ }
          timer = setTimeout(tick, 300);
        };
        tick();
      } catch {
        setError('Could not open the camera. Type the code instead.');
        stopCamera();
      }
    })();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  useEffect(() => () => stopCamera(), []);

  const style = result ? (RESULT_STYLE[result.result] || RESULT_STYLE.INVALID) : null;
  const meds = result?.prescription?.medications || [];

  return (
    <div className="pharmacy-card" style={{ marginBottom: '1rem', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '1rem 1.1rem' }}>
      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: '#0f172a' }}>Verify prescription</h3>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#64748b' }}>Scan the patient's QR code or type their 8-digit code.</p>
      <form onSubmit={e => { e.preventDefault(); verify(input); }} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input value={input} onChange={e => setInput(e.target.value)} autoComplete="off" inputMode="numeric"
          placeholder="1234 5678 or scan QR" aria-label="Prescription code"
          style={{ flex: 1, minWidth: 180, padding: '0.6rem 0.8rem', borderRadius: 10, border: '1.5px solid #cbd5e1', fontSize: '1rem', fontFamily: 'monospace', letterSpacing: '0.08em' }} />
        <button type="submit" disabled={busy || !input.trim()}
          style={{ padding: '0.6rem 1rem', borderRadius: 10, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
        {canScan && (
          <button type="button" onClick={() => (scanning ? stopCamera() : setScanning(true))}
            style={{ padding: '0.6rem 1rem', borderRadius: 10, border: '1.5px solid #0f766e', background: '#fff', color: '#0f766e', fontWeight: 700, cursor: 'pointer' }}>
            {scanning ? 'Stop camera' : 'Scan with camera'}
          </button>
        )}
      </form>

      {scanning && (
        <video ref={videoRef} muted playsInline
          style={{ marginTop: '0.75rem', width: '100%', maxWidth: 360, borderRadius: 12, background: '#0f172a' }} />
      )}

      {error && <p style={{ margin: '0.6rem 0 0', fontSize: '0.82rem', color: '#b91c1c' }}>{error}</p>}

      {result && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem 0.9rem', borderRadius: 12, background: style.bg, border: `1.5px solid ${style.border}` }}>
          <p style={{ margin: 0, fontWeight: 700, color: style.color, fontSize: '0.88rem' }}>{result.message}</p>
          {result.prescriptionRef && (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>Ref {result.prescriptionRef}</p>
          )}

          {result.result === 'OPEN' && (
            <>
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.1rem', fontSize: '0.82rem', color: '#334155' }}>
                {meds.map((m, i) => (
                  <li key={i}>
                    <strong>{m.name}</strong>{m.strength ? ` ${m.strength}` : ''}
                    {m.quantity ? ` · ${m.quantity}${m.quantityUnit ? ` ${m.quantityUnit}` : ''}` : ''}
                  </li>
                ))}
              </ul>
              {result.prescription?.patientCity && (
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: '#64748b' }}>Patient's city: {result.prescription.patientCity}</p>
              )}
              {result.canTake ? (
                <button type="button" onClick={take} disabled={busy}
                  style={{ padding: '0.5rem 1rem', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Take this prescription
                </button>
              ) : (
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#92400e' }}>Only approved pharmacies can take open prescriptions.</p>
              )}
            </>
          )}

          {result.result === 'YOURS' && (
            <>
              {(result.dispensings || []).some(d => d.quantity != null) && (
                <ul style={{ margin: '0.5rem 0', paddingLeft: '1.1rem', fontSize: '0.82rem', color: '#334155' }}>
                  {result.dispensings.filter(d => d.quantity != null).map(d => (
                    <li key={d.medIndex}>{d.name}: {Number(d.remaining)} of {Number(d.quantity)} left</li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => navigate(`/dashboard/prescriptions/${result.prescriptionId}`)}
                style={{ marginTop: '0.4rem', padding: '0.5rem 1rem', borderRadius: 10, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Open prescription
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
