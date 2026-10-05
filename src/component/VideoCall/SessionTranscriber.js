import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, getStoredRole } from '../../services/apiClient';
import SessionRecordReview from '../Common/SessionRecordReview';

/**
 * Consented session transcription, inside the call.
 *
 * Clinician: asks; once the patient allows, both microphones are recorded
 * SEPARATELY (their own, and the patient's track from Twilio) in ~60-second
 * pieces, each sent and transcribed as the session runs. Labels therefore come
 * from whose audio it was. A piece that fails to upload is retried; the server
 * keeps text only and discards the audio.
 *
 * Patient: sees the request and chooses Allow or Decline. Either side can stop
 * at any time, and the next piece is refused the moment they do.
 */
// 30 s: text appears sooner. Two speakers × 2 pieces/min against the server's
// 260-piece cap still covers a ~65-minute session.
const PIECE_MS = 30_000;
const POLL_MS = 4_000;

export default function SessionTranscriber({ room, roomName }) {
  const role = String(getStoredRole() || '').toLowerCase();
  const isClinician = role === 'doctor' || role === 'therapist';
  const [state, setState] = useState({ status: 'none' });
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reviewId, setReviewId] = useState(null);
  const [crisis, setCrisis] = useState(false);

  const recordersRef = useRef({});     // speaker -> { recorder, timer, stream }
  const startRef = useRef(0);
  const seqRef = useRef({ clinician: 0, patient: 0 });
  const pendingRef = useRef(new Set());
  const activeRef = useRef(false);

  // ── State from the server (both sides poll) ─────────────────────────────
  const refresh = useCallback(async () => {
    if (!roomName) return;
    const s = await api(`/api/v1/ai/sessions/room/${encodeURIComponent(roomName)}`).catch(() => null);
    if (s) setState(s);
  }, [roomName]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // ── Recording (clinician only) ──────────────────────────────────────────
  const upload = useCallback(async (id, speaker, seq, offsetMs, blob) => {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    // Retried with backoff so a brief network drop does not leave a gap.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const res = await api(`/api/v1/ai/sessions/${id}/segments`, {
          method: 'POST', body: { speaker, seq, offsetMs, audioBase64: base64, mimeType: blob.type || 'audio/webm' },
        });
        if (res?.text) setLines((l) => [...l.slice(-5), { speaker, text: res.text }]);
        if (res?.safetyFlag) setCrisis(true);
        if (res?.ok === false && res?.status && res.status !== 'active') activeRef.current = false;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    setNote('One part of the session could not be sent after several tries; the transcript may have a gap.');
  }, []);

  /** Record one track in self-contained ~60 s pieces (each restart yields a playable file). */
  const recordTrack = useCallback((id, speaker, mediaTrack) => {
    if (!mediaTrack || recordersRef.current[speaker]) return;
    const stream = new MediaStream([mediaTrack]);
    const piece = () => {
      // The patient leaving ends their track; restarting a recorder on it threw
      // an uncaught NotSupportedError over the call. Stop that speaker instead —
      // the clinician's own recording carries on.
      if (!activeRef.current || mediaTrack.readyState === 'ended') { delete recordersRef.current[speaker]; return; }
      const chunks = [];
      let rec;
      try { rec = new MediaRecorder(stream); } catch { delete recordersRef.current[speaker]; return; }
      const offsetMs = Date.now() - startRef.current;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const seq = seqRef.current[speaker]++;
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 2000) {
          const p = upload(id, speaker, seq, offsetMs, blob).finally(() => pendingRef.current.delete(p));
          pendingRef.current.add(p);
        }
        piece();
      };
      try {
        rec.start();
      } catch {
        delete recordersRef.current[speaker];
        return;
      }
      const timer = setTimeout(() => { try { rec.state !== 'inactive' && rec.stop(); } catch { /* ended */ } }, PIECE_MS);
      recordersRef.current[speaker] = { recorder: rec, timer, stream };
    };
    piece();
  }, [upload]);

  const remoteAudioTrack = () => {
    for (const p of room?.participants?.values?.() || []) {
      for (const pub of p.audioTracks.values()) if (pub.track?.mediaStreamTrack) return { track: pub.track.mediaStreamTrack, identity: p.identity };
    }
    return null;
  };

  const startRecording = useCallback((id) => {
    if (activeRef.current || !room) return;
    activeRef.current = true;
    startRef.current = Date.now();
    const local = [...room.localParticipant.audioTracks.values()][0]?.track?.mediaStreamTrack;
    recordTrack(id, 'clinician', local);
    const remote = remoteAudioTrack();
    if (remote) recordTrack(id, 'patient', remote.track);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, recordTrack]);

  /** Stop all recorders; each flushes its last piece. */
  const stopRecording = useCallback(() => {
    activeRef.current = false;
    Object.values(recordersRef.current).forEach(({ recorder, timer }) => {
      clearTimeout(timer);
      try { recorder.state !== 'inactive' && recorder.stop(); } catch { /* ended */ }
    });
  }, []);

  // Begin when the patient allows; pick up the patient's track if they join later.
  useEffect(() => {
    if (!isClinician) return;
    if (state.status === 'active' && state.youAre === 'clinician') {
      startRecording(state.id);
      if (!recordersRef.current.patient) {
        const remote = remoteAudioTrack();
        if (remote) recordTrack(state.id, 'patient', remote.track);
      }
    } else if (activeRef.current && state.status !== 'active') {
      stopRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.id]);

  useEffect(() => () => stopRecording(), [stopRecording]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const request = async () => {
    const patient = [...(room?.participants?.values?.() || [])][0]?.identity;
    if (!patient) { setNote('Wait for the patient to join first.'); return; }
    setBusy(true); setNote('');
    try { await api('/api/v1/ai/sessions/request', { method: 'POST', body: { roomName, patientId: patient } }); await refresh(); }
    catch (e) { setNote(e?.message || 'Could not ask the patient.'); } finally { setBusy(false); }
  };

  const consent = async (allow) => {
    setBusy(true);
    try { await api(`/api/v1/ai/sessions/${state.id}/consent`, { method: 'POST', body: { allow } }); await refresh(); }
    catch (e) { setNote(e?.message || 'That could not be saved.'); } finally { setBusy(false); }
  };

  const stop = async () => {
    stopRecording();
    await api(`/api/v1/ai/sessions/${state.id}/stop`, { method: 'POST' }).catch(() => null);
    refresh();
  };

  const finish = async () => {
    setBusy(true); setNote('Finishing — sending the last part of the session…');
    stopRecording();
    await new Promise((r) => setTimeout(r, 800));            // let the last pieces flush
    await Promise.allSettled([...pendingRef.current]);
    setNote('');
    setBusy(false);
    setReviewId(state.id);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (!state || (!isClinician && state.status === 'none')) return null;
  const st = state.status;

  return (
    <>
      <div style={S.bar} role="status">
        {isClinician ? (
          <>
            {(st === 'none' || st === 'declined' || st === 'stopped' || st === 'finished') && !reviewId ? (
              <>
                {st === 'declined' ? <span style={S.muted}>The patient declined transcription.</span> : null}
                <button type="button" style={S.btn} disabled={busy} onClick={request}>Transcribe session</button>
              </>
            ) : null}
            {st === 'requested' ? <span style={S.muted}>Waiting for the patient to allow transcription…</span> : null}
            {st === 'active' ? (
              <>
                <span style={S.live}>● Transcribing (patient consented)</span>
                <button type="button" style={S.ghost} onClick={stop}>Stop</button>
                <button type="button" style={S.btn} disabled={busy} onClick={finish}>End & draft notes</button>
              </>
            ) : null}
            {(st === 'stopped' || st === 'finished') && state.id && !reviewId ? (
              <button type="button" style={S.ghost} onClick={() => setReviewId(state.id)}>Review session notes</button>
            ) : null}
          </>
        ) : (
          <>
            {st === 'active' ? (
              <>
                <span style={S.live}>● This session is being transcribed</span>
                <button type="button" style={S.ghost} onClick={stop}>Stop transcription</button>
              </>
            ) : st === 'declined' || st === 'stopped' ? <span style={S.muted}>Transcription is off.</span> : null}
          </>
        )}
        {note ? <span style={S.muted}>{note}</span> : null}
      </div>

      {isClinician && crisis ? (
        <div style={S.crisis}>The patient said something about safety or harm — see the transcript.</div>
      ) : null}
      {isClinician && st === 'active' && lines.length ? (
        <div style={S.lines}>
          {lines.map((l, i) => <div key={i}><b>{l.speaker === 'clinician' ? 'You' : 'Patient'}:</b> {l.text}</div>)}
        </div>
      ) : null}

      {/* The patient's choice — nothing is recorded before "Allow". */}
      {!isClinician && st === 'requested' && state.youAre === 'patient' ? (
        <div style={S.overlay}>
          <div style={S.modal}>
            <h3 style={{ margin: '0 0 0.5rem' }}>Allow this session to be transcribed?</h3>
            <p style={S.p}>
              {state.clinician || 'Your clinician'} would like a written transcript of this call to help write
              their notes. Only the text is kept — the audio is not stored. You can stop it at any time.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" style={S.ghost} disabled={busy} onClick={() => consent(false)}>Decline</button>
              <button type="button" style={S.btn} disabled={busy} onClick={() => consent(true)}>Allow</button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewId ? (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 760, maxHeight: '88vh', overflowY: 'auto' }}>
            <SessionRecordReview id={reviewId} onClose={() => setReviewId(null)} />
          </div>
        </div>
      ) : null}
    </>
  );
}

const S = {
  bar: { display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', padding: '0.5rem', color: '#fff' },
  btn: { padding: '0.45rem 0.9rem', borderRadius: 999, border: 'none', background: '#2b5ce6', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' },
  ghost: { padding: '0.45rem 0.9rem', borderRadius: 999, border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' },
  live: { color: '#fca5a5', fontWeight: 800, fontSize: '0.84rem' },
  muted: { fontSize: '0.82rem', color: '#cbd5e1' },
  crisis: { margin: '0 auto 0.5rem', maxWidth: 640, background: '#fdeceb', color: '#8f1d17', border: '1px solid #f3c7c3', borderRadius: 10, padding: '0.5rem 0.8rem', fontWeight: 700, fontSize: '0.85rem' },
  lines: { margin: '0 auto 0.5rem', maxWidth: 640, background: 'rgba(15,23,42,0.75)', color: '#e2e8f0', borderRadius: 10, padding: '0.5rem 0.8rem', fontSize: '0.8rem', lineHeight: 1.5 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: '#fff', color: '#0f172a', borderRadius: 14, padding: '1.2rem 1.3rem', maxWidth: 440, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
  p: { fontSize: '0.9rem', lineHeight: 1.55, color: '#334155' },
};
