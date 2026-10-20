import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/apiClient';

/**
 * Check a patient in with their lab/scan code — the centre's counterpart of the
 * pharmacy's "Verify prescription". Desk scanners type the QR link and press
 * Enter, so the box covers them; "Scan with camera" uses the browser's QR
 * detector where it exists.
 *
 * The server decides: a valid code for an order at this centre checks the
 * patient in (needed before collecting a sample, starting or reporting); any
 * other code gets a reason and no patient details.
 */
const TONE = {
  CHECKED_IN: ['#ecfdf5', '#a7f3d0', '#065f46'],
  COMPLETED: ['#f8fafc', '#e2e8f0', '#334155'],
  NOT_YOUR_CENTRE: ['#fffbeb', '#fde68a', '#92400e'],
  PRESCRIPTION_CODE: ['#fffbeb', '#fde68a', '#92400e'],
  REVOKED: ['#fff7ed', '#fed7aa', '#9a3412'],
};
const BAD = ['#fef2f2', '#fecaca', '#991b1b'];

export default function DiagCheckIn({ onCheckedIn }) {
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
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await api('/api/v1/diagnostics/operations/check-in', { method: 'POST', body: { code } });
      setResult(r);
      if (r?.result === 'CHECKED_IN') { setInput(''); onCheckedIn?.(r.orderId); }
    } catch (e) {
      setError(e?.message || 'Could not check this code.');
    } finally { setBusy(false); }
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
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found?.[0]?.rawValue) { const v = found[0].rawValue; stopCamera(); verify(v); return; }
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

  const [bg, border, color] = result ? (TONE[result.result] || BAD) : [];
  const o = result?.order;

  return (
    <div className="dx-card" style={{ marginBottom: '0.8rem' }}>
      <div className="dx-card-head"><h2 className="dx-card-title">Check in a patient</h2></div>
      <p className="dx-card-hint" style={{ margin: '0 0 0.6rem' }}>Scan the patient’s QR code or type their 8-digit code. You need this before collecting a sample, starting a scan or entering a result.</p>
      <form onSubmit={e => { e.preventDefault(); verify(input); }} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input className="dx-input" value={input} onChange={e => setInput(e.target.value)} autoComplete="off" inputMode="numeric"
          placeholder="1234 5678 or scan QR" aria-label="Check-in code"
          style={{ flex: '1 1 200px', fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.08em' }} />
        <button type="submit" className="dx-btn dx-btn--primary" disabled={busy || !input.trim()}>{busy ? 'Checking…' : 'Check in'}</button>
        {canScan && <button type="button" className="dx-btn" onClick={() => (scanning ? stopCamera() : setScanning(true))}>{scanning ? 'Stop camera' : 'Scan with camera'}</button>}
      </form>
      {scanning && <video ref={videoRef} muted playsInline style={{ marginTop: '0.75rem', width: '100%', maxWidth: 360, borderRadius: 12, background: '#0f172a' }} />}
      {error && <p style={{ margin: '0.6rem 0 0', fontSize: '0.82rem', color: '#b91c1c' }}>{error}</p>}
      {result && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem 0.9rem', borderRadius: 12, background: bg, border: `1.5px solid ${border}` }}>
          <p style={{ margin: 0, fontWeight: 700, color, fontSize: '0.88rem' }}>{result.message}</p>
          {o && (
            <div style={{ marginTop: '0.5rem', display: 'grid', gap: 4, fontSize: '0.84rem', color: '#0f172a' }}>
              <div><b>{o.patientName || 'Patient'}</b> — check the name against their ID.</div>
              <div>{o.testType || 'Test'}{o.orderCode ? <span className="dx-card-hint" style={{ fontFamily: 'monospace' }}> · {o.orderCode}</span> : null}</div>
              {o.doctorName && <div className="dx-card-hint">Ordered by {o.doctorName}</div>}
              {o.notes && <div className="dx-card-hint">Note: {o.notes}</div>}
              <div style={{ marginTop: 4 }}><button type="button" className="dx-btn dx-btn--sm dx-btn--primary" onClick={() => navigate(`/dashboard/orders/${o.id}`)}>Open order</button></div>
            </div>
          )}
          {result.otherOpenOrders?.length > 0 && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.8rem' }}>
              <b>Other tests for this patient here</b> — each has its own code:
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                {result.otherOpenOrders.map(x => <li key={x.id}>{x.testType || 'Test'}{x.checkedIn ? ' · checked in' : ''}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
