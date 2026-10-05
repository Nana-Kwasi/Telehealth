import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/apiClient';

/**
 * The AI assistant surface, shared by every entry point.
 *
 * Three things this component is deliberate about:
 *
 *  1. Model output is rendered as TEXT, never as HTML. The model is not a
 *     trusted author, and dangerouslySetInnerHTML on generated content is how
 *     you turn a language model into an XSS vector.
 *
 *  2. An escalation (self-harm, emergency, medication) is rendered differently
 *     from an ordinary answer, and carries no "AI-generated" label — that text
 *     was written by people and is not a model output.
 *
 *  3. If the backend reports AI unavailable, the feature says so plainly and
 *     points at the clinician, rather than presenting a broken input box.
 */

const TASK_META = {
  HEALTH_QUESTION: {
    heading: 'NessaHub Assistant',
    lead: 'Ask a general health question. This is educational information, not advice about your own condition.',
    placeholder: 'e.g. What does "hypertension" mean? What should I ask my doctor?',
    cta: 'Ask',
  },
  THERAPY_PREP: {
    heading: 'Prepare for your session',
    lead: 'Write down what is on your mind and this will organise it into a summary you can bring to your clinician.',
    placeholder: 'What has been happening? How long for? How is it affecting your daily life?',
    cta: 'Build my preparation summary',
  },
  SECOND_OPINION_PREP: {
    heading: 'Prepare my case for review',
    lead: 'Describe your situation and this will structure it for the clinician reviewing your case.',
    placeholder: 'Your current diagnosis, symptoms, treatments tried, medications, and what you want answered.',
    cta: 'Structure my case',
  },
  CLINICAL_SUMMARY: {
    heading: 'NessaHub Clinical Assistant',
    lead: 'Generate a briefing from records you already have access to. Verify before use.',
    placeholder: 'What would you like summarised for this patient?',
    cta: 'Generate briefing',
  },
  DOCUMENT_SUMMARY: {
    heading: 'Summarise document',
    lead: 'Paste document text to extract a summary. Always check it against the original.',
    placeholder: 'Paste the document text here…',
    cta: 'Summarise',
  },
  EXPLAIN_INSTRUCTION: {
    heading: 'Explain my instructions',
    lead: 'Paste what your clinician told you and this will restate it in plainer words. It will not change the instruction.',
    placeholder: 'e.g. Continue medication X twice daily and return in two weeks.',
    cta: 'Explain',
  },
};

export default function AiAssistant({ task = 'HEALTH_QUESTION', subjectId, consultationId,
                                      onAccept, showReviewActions = false }) {
  const meta = TASK_META[task] || TASK_META.HEALTH_QUESTION;

  const [status, setStatus]   = useState(null);
  const [input, setInput]     = useState('');
  const [result, setResult]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [edited, setEdited]   = useState('');
  const [editing, setEditing] = useState(false);
  const lastRequest = useRef('');

  useEffect(() => {
    (async () => {
      try { setStatus(await api('/api/v1/ai/status')); }
      catch { setStatus({ available: false }); }
    })();
  }, []);

  const send = async (override) => {
    const message = (override ?? input).trim();
    if (!message) { setError('Please write something first.'); return; }
    lastRequest.current = message;
    setBusy(true); setError(''); setResult(null); setEditing(false);
    try {
      const res = await api('/api/v1/ai/assist', {
        method: 'POST',
        body: {
          task,
          message,
          subjectId: subjectId || null,
          consultationId: consultationId || null,
          documentText: task === 'DOCUMENT_SUMMARY' ? message : null,
        },
      });
      setResult(res);
      setEdited(res.text || '');
      if (res.remainingRequests !== undefined) {
        setStatus((s) => ({ ...s, remainingRequests: res.remainingRequests }));
      }
    } catch (e) {
      setError(e.message || 'The assistant could not be reached.');
    } finally {
      setBusy(false);
    }
  };

  if (status && !status.available) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: 820 }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>{meta.heading}</h2>
        <div style={{ ...card, background: '#f8fafc', color: '#475569' }}>
          AI assistance is not available on this deployment. Please continue with your
          healthcare professional.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{meta.heading}</h2>
        <span style={{ background: '#eef2ff', color: '#3730a3', borderRadius: 999,
                       padding: '2px 10px', fontSize: '0.7rem', fontWeight: 800,
                       letterSpacing: '0.04em' }}>AI</span>
      </div>
      <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.9rem' }}>{meta.lead}</p>

      {/* Disclosure — shown before anyone types, not hidden behind a link. */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af',
                    borderRadius: 10, padding: '0.8rem 1rem', fontSize: '0.82rem',
                    lineHeight: 1.55, marginBottom: '1rem' }}>
        This assistant provides AI-generated health information and support. It does not replace a
        licensed healthcare professional. For diagnosis or treatment decisions, consult a qualified
        healthcare professional. Do not rely on it for emergencies — call{' '}
        <strong>{status?.emergencyNumber || '112'}</strong> or go to the nearest emergency facility.
        {status?.model ? (
          <div style={{ marginTop: '0.5rem', opacity: 0.85 }}>
            Powered by <code>{status.model}</code>
            {status.medicallyTuned === false ? ' — a general-purpose model, not medically tuned.' : '.'}
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca',
                      color: '#991b1b', marginBottom: '1rem' }}>{error}</div>
      ) : null}

      <textarea
        rows={task === 'DOCUMENT_SUMMARY' ? 10 : 5}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={meta.placeholder}
        style={{ width: '100%', padding: '0.75rem 0.9rem', border: '1px solid #cbd5e1',
                 borderRadius: 10, fontSize: '0.9rem', boxSizing: 'border-box',
                 fontFamily: 'inherit', lineHeight: 1.5 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
        <button onClick={() => send()} disabled={busy}
          style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8,
                   padding: '0.65rem 1.3rem', fontWeight: 600, cursor: 'pointer',
                   opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Working…' : meta.cta}
        </button>
        {status?.remainingRequests !== undefined ? (
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            {status.remainingRequests} requests left this hour
          </span>
        ) : null}
      </div>

      {result ? (
        <div style={{ marginTop: '1.5rem' }}>
          {result.escalated ? (
            /* Written by people, not the model — styled as guidance, and given
               no "AI-generated" label because it is not AI-generated. */
            <div style={{ background: '#fff7ed', border: '2px solid #fdba74', borderRadius: 12,
                          padding: '1.25rem' }}>
              <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: '0.5rem' }}>
                Please read this
              </div>
              <PlainText text={result.text} color="#7c2d12" />
            </div>
          ) : !result.ok ? (
            <div style={{ ...card, background: '#f8fafc', color: '#475569' }}>
              <PlainText text={result.text} color="#475569" />
            </div>
          ) : (
            <div style={card}>
              {result.disclaimer ? (
                <div style={{ background: '#fefce8', border: '1px solid #fde68a', color: '#854d0e',
                              borderRadius: 8, padding: '0.55rem 0.8rem', fontSize: '0.78rem',
                              fontWeight: 600, marginBottom: '0.9rem' }}>
                  {result.disclaimer}
                </div>
              ) : null}

              {editing ? (
                <textarea rows={14} value={edited} onChange={(e) => setEdited(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #cbd5e1',
                           borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box',
                           fontFamily: 'inherit', lineHeight: 1.6 }} />
              ) : (
                <PlainText text={edited || result.text} />
              )}

              {/* Clinician review workflow. Nothing reaches the record until a
                  person accepts it. */}
              {showReviewActions ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
                              marginTop: '1.1rem', paddingTop: '0.9rem',
                              borderTop: '1px solid #f1f5f9' }}>
                  <button onClick={() => setEditing(!editing)} style={ghost}>
                    {editing ? 'Done editing' : 'Edit'}
                  </button>
                  <button onClick={() => send(lastRequest.current)} style={ghost} disabled={busy}>
                    Regenerate
                  </button>
                  <button
                    onClick={() => onAccept && onAccept(edited || result.text, result.auditId)}
                    style={{ ...ghost, background: '#166534', color: '#fff', border: 'none' }}>
                    Accept
                  </button>
                  <button onClick={() => { setResult(null); setEdited(''); }}
                    style={{ ...ghost, color: '#991b1b', borderColor: '#fecaca' }}>
                    Reject
                  </button>
                </div>
              ) : null}

              {result.requiresClinicianReview && !showReviewActions ? (
                <div style={{ marginTop: '0.9rem', fontSize: '0.78rem', color: '#64748b' }}>
                  Your clinician will review this before it forms part of your care.
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Render model output as text.
 *
 * Never dangerouslySetInnerHTML: the model is untrusted as an author. Newlines
 * are preserved so structured output (headings, lists) still reads correctly.
 */
function PlainText({ text, color = '#1e293b' }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color,
                  fontSize: '0.9rem', lineHeight: 1.65 }}>
      {text || ''}
    </div>
  );
}

const card = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem',
};

const ghost = {
  background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8,
  padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
};
