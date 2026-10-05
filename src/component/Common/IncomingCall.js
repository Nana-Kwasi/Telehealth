import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { api, getStoredProfile } from '../../services/apiClient';

/**
 * The incoming-call screen, shown anywhere in the app.
 *
 * Before this, a clinician pressing "Call" reached nobody: the original app
 * only showed a call if the patient happened to be on the Video page, and the
 * migration had turned even that into a no-op. Now every signed-in screen
 * checks for a ringing call every few seconds and shows Accept / Decline over
 * whatever the person is doing, with a ring tone. Accept opens the call.
 */
const POLL_MS = 3000;

export default function IncomingCall() {
  const navigate = useNavigate();
  const [call, setCall] = useState(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef(null);
  const dismissedRef = useRef(new Set());

  const poll = useCallback(async () => {
    const rows = await api('/api/v1/calls/incoming').catch(() => null);
    const next = (Array.isArray(rows) ? rows : []).find((c) => !dismissedRef.current.has(c.id)) || null;
    setCall((cur) => (cur?.id === next?.id ? cur : next));
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // A soft two-tone ring while a call is showing. Browsers may block sound
  // until the page has been clicked once; the screen itself still appears.
  useEffect(() => {
    if (!call) return undefined;
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return undefined; }
    audioRef.current = ctx;
    const ring = () => {
      [0, 0.25].forEach((delay, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = i ? 660 : 880; g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.2);
      });
    };
    ring();
    const t = setInterval(ring, 1600);
    return () => { clearInterval(t); try { ctx.close(); } catch { /* closed */ } };
  }, [call]);

  const answer = async (accept) => {
    if (!call) return;
    setBusy(true);
    try {
      const res = await api(`/api/v1/calls/${call.id}/answer`, { method: 'POST', body: { accept } });
      dismissedRef.current.add(call.id);
      setCall(null);
      if (accept && res?.ok) {
        const me = getStoredProfile() || {};
        const myName = me.fullName || me.name || me.email || 'Patient';
        // The call page labels tiles from this; without it the caller shows as a UUID.
        try {
          localStorage.setItem('videoCallInfo', JSON.stringify({
            roomName: res.roomName, targetPerson: res.callerName,
            displayNames: { [call.caller_id]: res.callerName },
          }));
        } catch { /* labels are cosmetic */ }
        navigate(`/video-call/${encodeURIComponent(res.roomName)}/${encodeURIComponent(myName)}`);
      }
    } catch {
      dismissedRef.current.add(call.id);
      setCall(null);
    } finally { setBusy(false); }
  };

  if (!call) return null;
  const who = call.caller_role === 'DOCTOR' ? 'Doctor' : call.caller_role === 'THERAPIST' ? 'Therapist' : 'Clinician';

  return (
    <div style={S.overlay} role="alertdialog" aria-label="Incoming video call">
      <div style={S.card}>
        <div style={S.pulse}><Video size={30} color="#fff" /></div>
        <p style={S.kicker}>Incoming video call</p>
        <h2 style={S.name}>{call.caller_name}</h2>
        <p style={S.sub}>{who} · {call.kind === 'therapy' ? 'Therapy session' : 'Consultation'}</p>
        <div style={S.row}>
          <button type="button" style={{ ...S.round, background: '#dc2626' }} disabled={busy} onClick={() => answer(false)} aria-label="Decline">
            <PhoneOff size={24} color="#fff" />
          </button>
          <button type="button" style={{ ...S.round, background: '#16a34a' }} disabled={busy} onClick={() => answer(true)} aria-label="Accept">
            <Phone size={24} color="#fff" />
          </button>
        </div>
        <div style={S.labels}><span>Decline</span><span>Accept</span></div>
      </div>
      <style>{'@keyframes nhRing{0%{box-shadow:0 0 0 0 rgba(22,163,74,.55)}100%{box-shadow:0 0 0 26px rgba(22,163,74,0)}}'}</style>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  card: { width: '100%', maxWidth: 340, background: '#0f172a', color: '#fff', borderRadius: 24, padding: '1.8rem 1.4rem', textAlign: 'center', boxShadow: '0 30px 70px rgba(0,0,0,0.45)' },
  pulse: { width: 72, height: 72, borderRadius: 999, background: '#16a34a', margin: '0 auto 0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'nhRing 1.4s infinite' },
  kicker: { margin: 0, fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#94a3b8' },
  name: { margin: '0.3rem 0 0.2rem', fontSize: '1.4rem' },
  sub: { margin: 0, fontSize: '0.86rem', color: '#cbd5e1' },
  row: { display: 'flex', justifyContent: 'space-around', marginTop: '1.5rem' },
  round: { width: 64, height: 64, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  labels: { display: 'flex', justifyContent: 'space-around', marginTop: '0.4rem', fontSize: '0.78rem', color: '#cbd5e1' },
};
