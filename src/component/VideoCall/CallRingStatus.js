import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/apiClient';

/**
 * For the clinician who placed the call: is the patient being rung, did they
 * answer, decline, or not pick up? Before this the caller sat on "Waiting for
 * participant" with no way to know the call had never reached anyone.
 */
export default function CallRingStatus({ roomName }) {
  const [s, setS] = useState(null);
  const [ringing, setRinging] = useState(false);
  const [err, setErr] = useState('');

  const poll = useCallback(async () => {
    const r = await api(`/api/v1/calls/room/${encodeURIComponent(roomName)}`).catch(() => null);
    if (r) setS(r);
  }, [roomName]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [poll]);

  if (!s || s.youAre !== 'caller' || s.status === 'none' || s.status === 'accepted' || s.status === 'cancelled') return null;

  // Errors used to be swallowed here, so a failed re-ring looked like a dead button.
  const ringAgain = async () => {
    setRinging(true);
    setErr('');
    try {
      await api('/api/v1/calls', { method: 'POST', body: { calleeId: s.callee_id, roomName } });
    } catch (e) {
      setErr(e?.message || 'Could not ring again. Please try again.');
    } finally {
      setRinging(false);
      poll();
    }
  };

  const text = s.status === 'ringing' ? `Calling ${s.callee_name}…`
    : s.status === 'declined' ? `${s.callee_name} declined the call.`
    : `${s.callee_name} didn't answer.`;

  return (
    <div style={S.bar} role="status">
      <span>{text}</span>
      {s.status !== 'ringing' ? (
        <button type="button" style={S.btn} onClick={ringAgain} disabled={ringing}>
          {ringing ? 'Calling…' : 'Ring again'}
        </button>
      ) : null}
      {err ? <span style={S.err}>{err}</span> : null}
    </div>
  );
}

const S = {
  bar: { display: 'flex', gap: '0.7rem', alignItems: 'center', justifyContent: 'center', padding: '0.4rem', color: '#fff', fontWeight: 700, fontSize: '0.88rem' },
  err: { color: '#fecaca', fontWeight: 600 },
  btn: { padding: '0.35rem 0.8rem', borderRadius: 999, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' },
};
