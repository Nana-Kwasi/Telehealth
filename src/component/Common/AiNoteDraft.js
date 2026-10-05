import React, { useState, useRef } from 'react';
import { Mic, Square, Sparkles, Loader } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Record a consultation, turn it into text, and draft a SOAP note from it.
 *
 * The draft is handed to the form for the clinician to edit and sign. Nothing
 * is written to the record here — `onDraft` fills fields, it does not save.
 *
 * Two things this deliberately does NOT do:
 *
 *  1. It never writes an Assessment the clinician did not say. The server
 *     leaves that field empty when no assessment was voiced, and an empty field
 *     they must complete is safer than a plausible one they might skim past.
 *
 *  2. It never records without the browser's own permission prompt and a
 *     visible recording state. A consultation recording that could start
 *     quietly would be a consent problem, not a feature.
 */
export default function AiNoteDraft({ clientId, onDraft, disabled }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy]           = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError]         = useState('');

  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const capRef      = useRef(null);

  /**
   * Dictation is capped, deliberately.
   *
   * The audio is sent base64 in a JSON body, and the server's post limit is 2MB
   * — a few minutes of speech exceeds it and fails with nothing that explains
   * why. Stopping at a known point and saying so beats a silent failure at an
   * unpredictable length. This is dictation, not whole-session recording.
   */
  const MAX_SECONDS = 90;

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        // Release the microphone as soon as we stop. A tab that keeps the
        // recording indicator lit after the clinician pressed stop is alarming,
        // and rightly so.
        stream.getTracks().forEach((t) => t.stop());
        await transcribe(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      capRef.current = setTimeout(() => {
        setError(`Dictation stops at ${MAX_SECONDS} seconds — the rest can be typed below.`);
        stopRecording();
      }, MAX_SECONDS * 1000);
    } catch (e) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Microphone access was declined. You can paste or type the conversation instead.'
          : 'This browser could not start recording. You can paste or type the conversation instead.',
      );
    }
  };

  const stopRecording = () => {
    setRecording(false);
    if (capRef.current) { clearTimeout(capRef.current); capRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
  };

  const transcribe = async (blob) => {
    setBusy('Transcribing…');
    try {
      const base64 = await blobToBase64(blob);
      const res = await api('/api/v1/ai/transcribe', {
        method: 'POST',
        body: { audioBase64: base64, mimeType: blob.type || 'audio/webm' },
      });
      // `transcript` is the field; `text` is null on success and carries the
      // safety response when the recording is escalated. Reading `text` here
      // meant a successful transcription never populated anything.
      const said = res?.transcript || '';
      if (said) setTranscript((t) => (t ? `${t}\n${said}` : said));
      else setError(res?.text || 'Nothing could be transcribed from that recording.');
    } catch (e) {
      setError(e?.message || 'The recording could not be transcribed.');
    } finally {
      setBusy('');
    }
  };

  const draft = async () => {
    if (!transcript.trim()) {
      setError('Record or paste the conversation first — there is nothing to draft from.');
      return;
    }
    setBusy('Drafting…'); setError('');
    try {
      const res = await api('/api/v1/ai/clinical-note/draft', {
        method: 'POST',
        body: { subjectId: clientId || null, transcript, noteType: 'soap' },
      });
      if (!res?.ok) {
        setError(res?.message || 'The draft could not be prepared.');
        return;
      }
      onDraft?.({
        subjective: res.draft.subjective || '',
        objective:  res.draft.objective  || '',
        assessment: res.draft.assessment || '',
        plan:       res.draft.plan       || '',
        aiAuditId:  res.aiAuditId || null,
      });
    } catch (e) {
      setError(e?.message || 'The draft could not be prepared.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section style={S.box}>
      <header style={S.head}>
        <span style={S.icon}><Sparkles size={15} /></span>
        <div style={{ minWidth: 0 }}>
          <strong style={S.title}>Draft from the consultation</strong>
          <p style={S.sub}>
            Dictate a summary (up to 90 seconds) or paste what was said. The
            draft fills the fields below for you to edit — nothing is saved
            until you save it, and the assessment is only ever what you said
            yourself.
          </p>
        </div>
      </header>

      <div style={S.actions}>
        {!recording ? (
          <button type="button" style={S.btn} onClick={startRecording} disabled={disabled || !!busy}>
            <Mic size={14} /> Dictate
          </button>
        ) : (
          <button type="button" style={{ ...S.btn, ...S.btnStop }} onClick={stopRecording}>
            <Square size={13} /> Stop
          </button>
        )}

        <button
          type="button"
          style={{ ...S.btn, ...S.btnPrimary, ...(busy || !transcript.trim() ? S.btnOff : null) }}
          onClick={draft}
          disabled={!!busy || !transcript.trim()}
        >
          {busy ? <Loader size={14} /> : <Sparkles size={14} />}
          {busy || 'Draft the note'}
        </button>
      </div>

      {recording ? (
        <p style={S.recording} role="status">● Recording — everyone present should know.</p>
      ) : null}

      <textarea
        style={S.transcript}
        rows={4}
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="The transcript appears here, or paste/type what was said."
      />

      {error ? <p style={S.error}>{error}</p> : null}
    </section>
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* Literals, measured against the surface each sits on. */
const S = {
  box: {
    border: '1px solid #e4e7ee', borderRadius: 14, padding: '0.9rem 1rem',
    background: '#fafbfd', marginBottom: '1rem',
  },
  head: { display: 'flex', gap: '0.65rem', alignItems: 'flex-start' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, flexShrink: 0, borderRadius: 9,
    background: '#eef2ff', color: '#2a3ea8',              /* 7.6:1 */
  },
  title: { fontSize: '0.9rem', fontWeight: 750, color: '#15173a' },
  sub: { margin: '0.2rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' }, /* 6.6:1 */

  actions: { display: 'flex', gap: '0.5rem', margin: '0.8rem 0 0.6rem', flexWrap: 'wrap' },
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.5rem 0.8rem', borderRadius: 9, cursor: 'pointer',
    border: '1px solid #d8dce6', background: '#ffffff',
    fontSize: '0.8rem', fontWeight: 650, color: '#2c3040', fontFamily: 'inherit',
  },
  btnPrimary: { background: '#2b5ce6', borderColor: '#2b5ce6', color: '#ffffff' },
  btnStop:    { background: '#fdeceb', borderColor: '#f3c7c3', color: '#8f1d17' },  /* 7.6:1 */
  btnOff:     { opacity: 0.5, cursor: 'not-allowed' },

  recording: { margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#8f1d17' },
  transcript: {
    width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.7rem',
    border: '1px solid #d8dce6', borderRadius: 9, fontSize: '0.82rem',
    fontFamily: 'inherit', lineHeight: 1.5, color: '#2c3040', resize: 'vertical',
  },
  error: { margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#8f1d17', lineHeight: 1.5 },
};
