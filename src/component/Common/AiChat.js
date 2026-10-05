import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/apiClient';
import { streamAssist } from '../../services/aiStream';
import AiMarkdown from './AiMarkdown';

/**
 * Conversational AI assistant for the web, matching the mobile surface.
 *
 * Deliberately mirrors mobile: same tasks, same routing, same disclosure, same
 * labels. Someone who reads one and then the other should not find two
 * different sets of promises about what this is.
 *
 * Model output renders as TEXT, never HTML. The model is not a trusted author,
 * and dangerouslySetInnerHTML on generated content turns it into an XSS vector.
 */

const SERVICE_TASK = {
  medical:        { task: 'MEDICAL_INTAKE',      label: 'Medical Consultation' },
  psychiatry:     { task: 'PSYCHIATRY_INTAKE',   label: 'Psychiatry' },
  psychology:     { task: 'PSYCHOLOGY_SUPPORT',  label: 'Psychology & Counseling' },
  second_opinion: { task: 'SECOND_OPINION_PREP', label: 'Second Opinion' },
};

const SUGGESTIONS = [
  'What should I ask my doctor?',
  'Help me prepare for my session',
  'Explain a medical term',
];

/** Clinicians get prompts about their own work. */
const CLINICIAN_SUGGESTIONS = [
  "What's on my schedule?",
  'Who is on my caseload?',
  'Help me structure a consultation note',
];

export default function AiChat({ clinician = false, embedded = false }) {
  // `embedded` = rendered inside the floating panel rather than as a page.
  // The page version centres itself in a wide column; inside a 440px panel
  // that same padding and max-width leave the composer cramped.
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [status, setStatus]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [service, setService]   = useState(null);
  // The structured intake, once the person asks for one. Kept so a booking
  // made later in this conversation carries it to the clinician.
  const [intake, setIntake]     = useState(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);

  // ── Voice ──────────────────────────────────────────────────────────────
  // Speak a request ("book me a therapy session tomorrow afternoon", "show me
  // today's patients"); it is transcribed and sent as if typed, so the same
  // tools, proposals and confirmation cards apply. Replies can be read aloud
  // with the browser's own speech — nothing extra leaves the device for that.
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(() => {
    try { return localStorage.getItem('nessa.ai.speak') === '1'; } catch { return false; }
  });
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const capRef = useRef(null);
  const spokenRef = useRef(-1);

  useEffect(() => {
    (async () => {
      try { setStatus(await api('/api/v1/ai/status')); }
      catch { setStatus({ available: false }); }
      finally { setLoading(false); }
    })();
  }, []);

  /**
   * Re-read the quota after a send.
   *
   * The counter was fetched once on mount and never again, so it displayed the
   * same number for the whole session no matter how many questions had been
   * asked — it looked like a live figure and was not one.
   */
  const refreshQuota = async () => {
    try {
      const fresh = await api('/api/v1/ai/status');
      setStatus((prev) => ({ ...(prev || {}), ...fresh }));
    } catch {
      /* leave the last known value rather than blanking it */
    }
  };

  /**
   * Follow the conversation only while the reader is already at the bottom.
   *
   * Auto-scrolling on every streamed token means scrolling up to re-read
   * something drags you straight back down.
   */
  const atBottomRef = useRef(true);
  const threadRef = useRef(null);

  const scrollToEnd = useCallback((force = false) => {
    if (!force && !atBottomRef.current) return;
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  const onScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < 80;
  }, []);

  /**
   * Route WITHOUT blocking the reply.
   *
   * Awaiting this before streaming meant two round-trips before a single word
   * appeared. It now runs in the background and applies from the next message.
   * Skipped for very short messages — "hi" carries no intent worth a call.
   */
  const routeServiceInBackground = (message) => {
    if (clinician || service) return;
    if (message.trim().length < 15) return;
    (async () => {
    try {
      const r = await api('/api/v1/ai/assist', {
        method: 'POST', body: { task: 'INTENT_ROUTING', message },
      });
      const raw = (r?.text || '').replace(/^```(json)?/i, '').replace(/```/g, '').trim();
      const picked = JSON.parse(raw)?.service;
      if (SERVICE_TASK[picked]) setService(picked);
    } catch {
      // routing is a convenience; the chat still works without it
    }
    })();
  };

  /**
   * Read a document the patient uploads.
   *
   * This is a separate endpoint, not a chat turn with a picture attached. The
   * reason is the boundary: the document path extracts what a page SAYS and is
   * forbidden from saying what it MEANS. Folding it into the ordinary chat turn
   * would put an image in front of a prompt that is allowed to reason freely.
   */
  const attachDocument = async (file) => {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      window.alert('That file is too large. Please use a photo under 6MB.');
      return;
    }

    const label = `Read this document: ${file.name}`;
    setMessages((m) => [...m, { role: 'user', content: label },
                               { role: 'assistant', content: '', pending: true }]);
    setBusy(true);
    scrollToEnd(true);

    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        // Strip the data: prefix — the API wants the payload, not the URL.
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('That file could not be read.'));
        r.readAsDataURL(file);
      });

      const res = await api('/api/v1/ai/document/analyze', {
        method: 'POST',
        body: { imageBase64: base64, mimeType: file.type || 'image/jpeg' },
      });

      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: 'assistant',
          content: res?.text || 'That document could not be read.',
          pending: false,
          documentNote: res?.ok ? res.disclaimer : null,
        };
        return next;
      });
    } catch (e) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: 'assistant',
          content: e?.message || 'That document could not be read. Try a clearer photo.',
          pending: false,
        };
        return next;
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const MAX_VOICE_SECONDS = 45;

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        // Release the microphone the moment recording stops.
        stream.getTracks().forEach((t) => t.stop());
        await transcribeAndSend(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      capRef.current = setTimeout(stopVoice, MAX_VOICE_SECONDS * 1000);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', ok: false, content:
        e?.name === 'NotAllowedError'
          ? 'Microphone access was declined. You can type your question instead.'
          : 'This browser could not start recording. You can type your question instead.' }]);
    }
  };

  const stopVoice = () => {
    setRecording(false);
    if (capRef.current) { clearTimeout(capRef.current); capRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
  };

  const transcribeAndSend = async (blob) => {
    setVoiceBusy(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const res = await api('/api/v1/ai/transcribe', {
        method: 'POST', body: { audioBase64: base64, mimeType: blob.type || 'audio/webm' },
      });
      // A recording that trips the safety screen comes back as the crisis
      // response in `text`, with no transcript — shown, never sent on.
      if (res?.transcript) send(res.transcript);
      else if (res?.text) setMessages((m) => [...m, { role: 'assistant', content: res.text, escalated: !!res.escalated }]);
      else setMessages((m) => [...m, { role: 'assistant', ok: false, content: 'Nothing could be heard in that recording.' }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', ok: false, content: e?.message || 'The recording could not be transcribed.' }]);
    } finally {
      setVoiceBusy(false);
    }
  };

  const toggleSpeak = () => {
    setSpeakReplies((on) => {
      const next = !on;
      try { localStorage.setItem('nessa.ai.speak', next ? '1' : '0'); } catch { /* per-viewer nicety only */ }
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  };

  // Read each finished reply once, as plain words (markdown symbols stripped).
  useEffect(() => {
    if (!speakReplies || !window.speechSynthesis) return;
    const i = messages.length - 1;
    const last = messages[i];
    if (!last || last.role !== 'assistant' || last.streaming || !last.content || spokenRef.current === i) return;
    spokenRef.current = i;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(
      last.content.replace(/[*_#`>|-]+/g, ' ').replace(/\s+/g, ' ').slice(0, 1200)));
  }, [messages, speakReplies]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;

    const mine = { role: 'user', content: message };
    const history = [...messages, mine]
      .filter((m) => !m.escalated && m.ok !== false && m.content)
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-8, -1);

    setMessages((m) => [...m, mine, { role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setBusy(true);
    atBottomRef.current = true;   // they just sent something; follow it
    scrollToEnd(true);

    const patchLast = (patch) =>
      setMessages((m) => {
        const next = [...m];
        const i = next.length - 1;
        if (i >= 0 && next[i].role === 'assistant') next[i] = { ...next[i], ...patch };
        return next;
      });

    // CLINICIAN_ASSISTANT, not CLINICAL_SUMMARY: the latter is gated behind a
    // medically-tuned model and blocked clinicians entirely.
    const task = clinician
      ? 'CLINICIAN_ASSISTANT'
      : (SERVICE_TASK[service]?.task || 'HEALTH_QUESTION');

    routeServiceInBackground(message);

    await streamAssist({
      body: { task, message, history },
      onChunk: (piece) =>
        setMessages((m) => {
          const next = [...m];
          const i = next.length - 1;
          if (i >= 0 && next[i].role === 'assistant') {
            next[i] = { ...next[i], content: (next[i].content || '') + piece };
          }
          return next;
        }),
      onEscalation: (p) => { patchLast({ content: p.text, escalated: true, streaming: false }); setBusy(false); },
      onRefusal:    (p) => { patchLast({ content: p.text, ok: false, streaming: false }); setBusy(false); },
      // Finished answer failed output screening — discard what was shown.
      onRetract:    (p) => { patchLast({ content: p.text, ok: false, streaming: false }); setBusy(false); },
      onDone:       (p) => {
        patchLast({
          disclaimer: p?.disclaimer || null,
          streaming: false,
          proposal: p?.proposal || null,   // a suggested booking; nothing exists yet
        });
        setBusy(false); scrollToEnd(); refreshQuota();
      },
      onError:      (e) => {
        patchLast({ content: e?.message || 'The assistant could not be reached.', ok: false, streaming: false });
        setBusy(false);
        // Also on failure: hitting the cap IS an error, and the count is the
        // thing that explains it.
        refreshQuota();
      },
    });
  };

  /**
   * Create the booking the person just confirmed.
   *
   * Sends only the time and reason: the clinician is re-derived server-side
   * from their own care team, so this cannot book with someone else's. It lands
   * as a request the clinician approves, not a confirmed slot.
   */
  const confirmBooking = async (index, proposal) => {
    setMessages((m) => {
      const next = [...m];
      if (next[index]) next[index] = { ...next[index], booking: 'sending' };
      return next;
    });
    try {
      const res = await api('/api/v1/ai/booking/confirm', {
        method: 'POST',
        // A prepared intake rides along in the booking notes, so the
        // clinician reads it before the appointment rather than re-asking.
        // proposalId: the server confirms exactly what it proposed (a booking,
        // a reschedule or a cancellation) — the time and clinician are not
        // re-sent and cannot be altered here.
        body: proposal.proposalId
          ? { proposalId: proposal.proposalId,
              reason: proposal.kind === 'book' ? withIntake(proposal.reason, intake) : null }
          : { whenIso: proposal.whenIso, reason: withIntake(proposal.reason, intake) },
      });
      setMessages((m) => {
        const next = [...m];
        if (next[index]) next[index] = { ...next[index], booking: 'done', bookingMessage: res.message };
        return next;
      });
    } catch (e) {
      setMessages((m) => {
        const next = [...m];
        if (next[index]) {
          next[index] = { ...next[index], booking: 'failed',
            bookingMessage: e?.message || 'That could not be booked. Please try again.' };
        }
        return next;
      });
    }
  };

  /**
   * Organise what the person has said so far into an intake for the clinician.
   *
   * Only their own words are sent — the assistant's replies are not intake.
   * Nothing is saved: the summary is shown back to them first, and only travels
   * to the clinician inside a booking they confirm.
   */
  const prepareIntake = async () => {
    const said = messages.filter((m) => m.role === 'user' && m.content).map((m) => m.content);
    if (said.length === 0) return;
    setIntakeBusy(true);
    try {
      const res = await api('/api/v1/ai/intake/structure', {
        method: 'POST', body: { conversation: said.join('\n') },
      });
      if (res?.ok && res.fields) {
        setIntake(res.fields);
        setMessages((m) => [...m, { role: 'assistant', intake: res.fields,
          safetyFlag: res.safetyFlag, safetyMessage: res.safetyMessage }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant',
          content: res?.message || 'Your summary could not be prepared just now.' }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant',
        content: 'Your summary could not be prepared just now.' }]);
    } finally {
      setIntakeBusy(false);
    }
  };

  const declineBooking = (index) => {
    setMessages((m) => {
      const next = [...m];
      if (next[index]) next[index] = { ...next[index], booking: 'declined' };
      return next;
    });
  };

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading…</div>;

  if (status && !status.available) {
    return (
      <div style={{ padding: '2rem', maxWidth: 780 }}>
        <div style={{ ...card, color: '#475569' }}>
          AI assistance is not available on this deployment. Please continue with your
          healthcare professional.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: embedded ? '0.9rem' : '1.5rem',
      maxWidth: embedded ? 'none' : 820,
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}>
      {/* The floating panel puts this same title in its own header, so
          repeating it inside the body just eats vertical space. */}
      {!embedded ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>
            {clinician ? 'NessaHub Clinical Assistant' : 'NessaHub Assistant'}
          </h1>
          <span style={{ background: '#eef2ff', color: '#3730a3', borderRadius: 999,
                         padding: '2px 10px', fontSize: '0.7rem', fontWeight: 800 }}>AI</span>
        </div>
      ) : null}

      <div style={{ background: 'rgba(80,70,189,0.07)', borderRadius: 10, padding: '0.7rem 0.9rem',
                    fontSize: '0.78rem', lineHeight: 1.55, color: '#475569', marginBottom: '1rem' }}>
        {clinician ? (
          <>AI-generated. Verify anything clinical before acting on it. This assistant does not
            diagnose, prescribe or interpret investigations.</>
        ) : (
          <>AI-generated health information. This does not replace a licensed healthcare
            professional. In an emergency call <strong>{status?.emergencyNumber || '112'}</strong>.</>
        )}
      </div>

      {service && SERVICE_TASK[service] ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'rgba(80,70,189,0.10)', borderRadius: 8,
                      padding: '0.45rem 0.75rem', marginBottom: '0.9rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4338ca' }}>
            Preparing for: {SERVICE_TASK[service].label}
          </span>
          <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {(service === 'medical' || service === 'psychiatry')
            && messages.some((m) => m.role === 'user') ? (
            <button onClick={prepareIntake} disabled={intakeBusy || busy}
              style={{ background: '#fff', border: '1px solid rgba(67,56,202,0.35)', borderRadius: 999,
                       padding: '0.25rem 0.65rem', cursor: intakeBusy ? 'wait' : 'pointer',
                       fontSize: '0.74rem', color: '#4338ca', fontWeight: 700, fontFamily: 'inherit' }}>
              {intakeBusy ? 'Preparing…' : intake ? 'Update my summary' : 'Prepare a summary for my doctor'}
            </button>
          ) : null}
          <button onClick={() => setService(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
                     fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Change</button>
          </span>
        </div>
      ) : null}

      <div ref={threadRef} onScroll={onScroll}
           style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {messages.length === 0 ? (
          <div style={{ padding: '1rem 0' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.4rem' }}>How can I help?</div>
            <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.9rem' }}>
              {clinician
                ? 'Ask about your schedule, your caseload, terminology, or help structuring your notes.'
                : 'Ask about a health topic, a medical term, or what to raise with your clinician.'}
            </div>
            {(clinician ? CLINICIAN_SUGGESTIONS : SUGGESTIONS).map((sug) => (
              <button key={sug} onClick={() => send(sug)}
                style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                         border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.7rem 0.9rem',
                         marginBottom: '0.45rem', background: '#fff', fontSize: '0.88rem' }}>
                {sug}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
                <div style={{ background: '#1d4ed8', color: '#fff', borderRadius: 16,
                              borderBottomRightRadius: 5, padding: '0.6rem 0.9rem',
                              fontSize: '0.92rem', lineHeight: 1.5 }}>{m.content}</div>
              </div>
            );
          }
          if (m.intake) {
            return <IntakeCard key={i} fields={m.intake}
              safetyFlag={m.safetyFlag} safetyMessage={m.safetyMessage} />;
          }
          if (m.escalated) {
            return (
              <div key={i} style={{ background: '#fff7ed', border: '2px solid #fdba74',
                                    borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: '0.4rem' }}>
                  Please read this
                </div>
                <div style={{ whiteSpace: 'pre-wrap', color: '#7c2d12', fontSize: '0.9rem',
                              lineHeight: 1.6 }}>{m.content}</div>
              </div>
            );
          }
          return (
            <div key={i} style={{ maxWidth: '92%' }}>
              {m.disclaimer ? (
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#854d0e',
                              marginBottom: '0.35rem' }}>{m.disclaimer}</div>
              ) : null}
              {(m.streaming || m.pending) && !m.content ? (
                /* `pending` is the document-reading path. It used to be checked
                   nowhere, so uploading an image showed no indicator at all —
                   the screen simply sat there for the ten-odd seconds the read
                   takes, which reads as a hang. */
                <ThinkingLine reading={m.pending} />
              ) : (
                <div>
                  <AiMarkdown text={m.content} />
                  {m.streaming ? <span style={{ color: '#1d4ed8', fontWeight: 700 }}>▍</span> : null}
                </div>
              )}

              {m.proposal && !m.booking ? (
                <div style={{ marginTop: '0.9rem', border: '1px solid rgba(29,78,216,0.30)',
                              background: 'rgba(29,78,216,0.05)', borderRadius: 12, padding: '1rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                    {m.proposal.kind === 'cancel' ? 'Cancel this appointment?'
                      : m.proposal.kind === 'reschedule' ? 'Move this appointment?'
                      : 'Confirm this appointment?'}
                  </div>
                  <div style={{ fontSize: '0.87rem', color: '#334155', lineHeight: 1.7 }}>
                    <div>{clinician ? 'Patient' : 'With'}&nbsp;&nbsp;<strong>{m.proposal.clinicianName}</strong></div>
                    <div>When&nbsp;&nbsp;<strong>{m.proposal.whenLabel}</strong></div>
                    {m.proposal.reason ? <div>About&nbsp;&nbsp;{m.proposal.reason}</div> : null}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.6rem' }}>
                    {m.proposal.kind === 'cancel' ? 'Nothing has changed yet. It is cancelled when you confirm.'
                      : clinician ? 'Nothing is booked yet. It is booked when you confirm.'
                      : `Nothing is booked yet. ${m.proposal.clinicianName} will confirm the request.`}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
                    <button onClick={() => confirmBooking(i, m.proposal)}
                      style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8,
                               padding: '0.55rem 1.2rem', fontWeight: 700, cursor: 'pointer' }}>
                      Confirm
                    </button>
                    <button onClick={() => declineBooking(i)}
                      style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1',
                               borderRadius: 8, padding: '0.55rem 1.1rem', fontWeight: 600,
                               cursor: 'pointer' }}>
                      Not now
                    </button>
                  </div>
                </div>
              ) : null}

              {m.booking === 'sending' ? (
                <div style={bookingNote}>Sending your request…</div>
              ) : m.booking === 'done' ? (
                <div style={{ ...bookingNote, color: '#166534', fontStyle: 'normal' }}>
                  ✓ {m.bookingMessage}
                </div>
              ) : m.booking === 'failed' ? (
                <div style={{ ...bookingNote, color: '#991b1b' }}>{m.bookingMessage}</div>
              ) : null}
              {m.documentNote ? (
                <div style={{ ...bookingNote, color: '#92400e', background: '#fffbeb',
                              border: '1px solid #fde68a', borderRadius: 8,
                              padding: '0.5rem 0.7rem' }}>
                  {m.documentNote}
                </div>
              ) : null}
              {m.booking === 'declined' ? (
                <div style={bookingNote}>No appointment was booked.</div>
              ) : null}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end',
                    borderTop: '1px solid #e2e8f0', paddingTop: '0.85rem', marginTop: '0.85rem' }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => attachDocument(e.target.files?.[0])} />
        <button onClick={recording ? stopVoice : startVoice} disabled={(busy || voiceBusy) && !recording}
          title={recording ? 'Stop and send' : 'Speak your request'}
          aria-label={recording ? 'Stop recording' : 'Speak your request'} aria-pressed={recording}
          style={{ background: recording ? '#dc2626' : '#f1f5f9', color: recording ? '#fff' : '#334155',
                   border: '1px solid ' + (recording ? '#dc2626' : '#cbd5e1'), borderRadius: 12,
                   padding: '0.75rem 0.9rem', fontSize: '1.05rem', lineHeight: 1,
                   cursor: 'pointer', opacity: (busy || voiceBusy) && !recording ? 0.4 : 1 }}>
          {voiceBusy ? '…' : recording ? '■' : '\u{1F3A4}'}
        </button>
        <button onClick={toggleSpeak} aria-pressed={speakReplies}
          title={speakReplies ? 'Stop reading replies aloud' : 'Read replies aloud'}
          aria-label="Read replies aloud"
          style={{ background: speakReplies ? '#e0e7ff' : '#f1f5f9', color: '#334155',
                   border: '1px solid ' + (speakReplies ? '#818cf8' : '#cbd5e1'), borderRadius: 12,
                   padding: '0.75rem 0.9rem', fontSize: '1.05rem', lineHeight: 1, cursor: 'pointer' }}>
          {speakReplies ? '\u{1F50A}' : '\u{1F508}'}
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          title="Upload a lab report, prescription or discharge summary — photo or PDF"
          aria-label="Upload a document"
          style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1',
                   borderRadius: 12, padding: '0.75rem 0.9rem', fontSize: '1.05rem',
                   cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.4 : 1,
                   lineHeight: 1 }}>
          &#128206;
        </button>
        <textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={clinician ? 'Ask anything…' : 'Ask a health question…'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          style={{ flex: 1, padding: '0.7rem 0.9rem', border: '1px solid #cbd5e1',
                   borderRadius: 12, fontSize: '0.92rem', fontFamily: 'inherit',
                   resize: 'none', boxSizing: 'border-box' }} />
        <button onClick={() => send()} disabled={!input.trim() || busy}
          style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 12,
                   padding: '0.75rem 1.2rem', fontWeight: 700, cursor: 'pointer',
                   opacity: !input.trim() || busy ? 0.4 : 1 }}>
          {busy ? '…' : 'Send'}
        </button>
      </div>
      {/* Only once it is worth knowing. At the full allowance this was a
          permanent reminder of a quota nobody was close to; the old #94a3b8
          also measured 2.56:1 on white, well under the 4.5:1 floor. */}
      {typeof status?.remainingRequests === 'number' && status.remainingRequests <= 20 ? (
        <div style={{
          fontSize: '0.72rem',
          textAlign: 'center',
          marginTop: '0.5rem',
          color: status.remainingRequests === 0 ? '#9a3708' : '#5b6170',   /* 7.18:1 / 6.20:1 */
          fontWeight: status.remainingRequests === 0 ? 700 : 500,
        }}>
          {status.remainingRequests === 0
            ? 'Hourly AI limit reached — this resets at the top of the hour.'
            : `${status.remainingRequests} AI requests left this hour`}
        </div>
      ) : null}
    </div>
  );
}

/** A worded waiting state — a spinner says something is happening, words say what. */
/** The booking reason, with the prepared intake appended when there is one. */
function withIntake(reason, fields) {
  if (!fields) return reason;
  const list = (label, xs) => (xs && xs.length ? `${label}: ${xs.join(', ')}` : null);
  const lines = [
    fields.chiefComplaint ? `Main concern: ${fields.chiefComplaint}` : null,
    fields.onset ? `Started: ${fields.onset}` : null,
    list('Symptoms', fields.symptoms),
    list('Medications', fields.medications),
    list('Allergies', fields.allergies),
    list('Conditions', fields.conditions),
    fields.summary || null,
  ].filter(Boolean);
  if (lines.length === 0) return reason;
  return `${reason || 'Requested through the assistant.'}\n\nIntake summary (prepared by the assistant from the patient's own words, unverified):\n${lines.join('\n')}`;
}

/**
 * The structured intake, shown back to the person before anyone else sees it.
 * Missing information is listed so they can add it now rather than in the room.
 */
function IntakeCard({ fields, safetyFlag, safetyMessage }) {
  const rows = [
    ['Main concern', fields.chiefComplaint],
    ['Started', fields.onset],
    ['How long', fields.duration],
    ['Severity', fields.severity],
    ['Symptoms', (fields.symptoms || []).join(', ')],
    ['Medications', (fields.medications || []).join(', ')],
    ['Allergies', (fields.allergies || []).join(', ')],
    ['Conditions', (fields.conditions || []).join(', ')],
  ].filter(([, v]) => v);
  const missing = fields.missingInformation || [];
  const urgent = safetyFlag === 'emergency' || safetyFlag === 'self_harm';
  return (
    <div style={{ maxWidth: '92%', border: '1px solid rgba(67,56,202,0.25)', background: '#f8f7ff',
                  borderRadius: 12, padding: '0.95rem 1rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#854d0e', marginBottom: '0.35rem' }}>
        AI-organised from what you said — check it before it is shared
      </div>
      <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: '0.5rem' }}>Summary for your doctor</div>
      {urgent && safetyMessage ? (
        <div style={{ background: '#fff7ed', border: '2px solid #fdba74', borderRadius: 10,
                      padding: '0.7rem', marginBottom: '0.6rem', whiteSpace: 'pre-wrap',
                      color: '#7c2d12', fontSize: '0.85rem', lineHeight: 1.55 }}>{safetyMessage}</div>
      ) : null}
      {fields.summary ? (
        <p style={{ margin: '0 0 0.55rem', fontSize: '0.88rem', lineHeight: 1.55, color: '#334155' }}>{fields.summary}</p>
      ) : null}
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.84rem', lineHeight: 1.55 }}>
          <span style={{ minWidth: 104, fontWeight: 700, color: '#475569' }}>{k}</span>
          <span style={{ color: '#1e293b' }}>{v}</span>
        </div>
      ))}
      {missing.length ? (
        <div style={{ marginTop: '0.6rem', fontSize: '0.82rem', color: '#475569' }}>
          <strong>Your doctor may also ask:</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
            {missing.map((q, j) => <li key={j}>{q}</li>)}
          </ul>
        </div>
      ) : null}
      <div style={bookingNote}>Nothing has been saved. It is sent only with an appointment you confirm.</div>
    </div>
  );
}

function ThinkingLine({ reading = false }) {
  const PHRASES = reading
    ? ['Reading your document…', 'Working through the page…', 'Checking the values…', 'Almost there…']
    : ['Thinking…', 'Reading your message…', 'Putting that together…', 'Almost there…'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 2600);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                  color: '#64748b', fontSize: '0.88rem', fontStyle: 'italic' }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: '#1d4ed8',
                     display: 'inline-block', opacity: 0.7 }} />
      {PHRASES[i]}
    </div>
  );
}

const bookingNote = { fontSize: '0.8rem', color: '#64748b', marginTop: '0.6rem', fontStyle: 'italic' };

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' };
