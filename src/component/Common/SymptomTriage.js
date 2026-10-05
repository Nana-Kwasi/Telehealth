import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, AlertTriangle, ArrowRight, Loader } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * "I'm not sure where to start" — a level-of-care suggestion before booking.
 *
 * The server decides the level, and its pattern-based safety layer outranks the
 * model there, so an emergency cannot be talked down into a routine
 * appointment. This component's job is to not undo that: when the answer says
 * `canBookOnline: false` it shows the emergency guidance and does NOT offer a
 * booking button.
 *
 * It recommends a level of care and a specialty. It never names a condition,
 * and the disclaimer from the server is always shown.
 */
export default function SymptomTriage() {
  const navigate = useNavigate();
  const [text, setText]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  const assess = async () => {
    if (!text.trim()) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await api('/api/v1/ai/triage', { method: 'POST', body: { complaint: text } });
      if (!res?.ok) { setError(res?.message || 'That could not be assessed.'); return; }
      setResult(res);
    } catch (e) {
      setError(e?.message || 'That could not be assessed.');
    } finally {
      setBusy(false);
    }
  };

  const tone = result ? (TONES[result.tone] || TONES.neutral) : null;

  return (
    <section style={S.card}>
      <header style={S.head}>
        <span style={S.icon}><Stethoscope size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <h2 style={S.title}>Not sure where to start?</h2>
          <p style={S.sub}>
            Describe what is going on and we will suggest how soon to be seen and
            by whom. This is not a diagnosis.
          </p>
        </div>
      </header>

      <textarea
        style={S.input}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="For example: I've had a sore throat and a mild fever since Tuesday."
      />

      <button
        type="button"
        style={{ ...S.go, ...(busy || !text.trim() ? S.goOff : null) }}
        onClick={assess}
        disabled={busy || !text.trim()}
      >
        {busy ? <Loader size={15} /> : <ArrowRight size={15} />}
        {busy ? 'Checking…' : 'Check where to start'}
      </button>

      {error ? <p style={S.error}>{error}</p> : null}

      {result ? (
        <div style={{ ...S.result, background: tone.bg, borderColor: tone.border }}>
          <strong style={{ ...S.resultTitle, color: tone.text }}>
            {result.tone === 'critical' ? <AlertTriangle size={15} /> : null}
            {result.headline}
          </strong>
          <p style={S.resultReason}>{result.reason}</p>
          <p style={S.resultAction}>{result.action}</p>

          {/* The safety layer's own wording, which is written more carefully
              than anything generated, whenever it fired. */}
          {result.safetyMessage ? (
            <p style={S.safety}>{result.safetyMessage}</p>
          ) : null}

          {/* No booking button when the answer is "go now". Offering an
              appointment beside "seek emergency care" would undo the triage. */}
          {result.canBookOnline ? (
            <button type="button" style={S.book} onClick={() => navigate('/dashboard/appointments')}>
              Book a consultation <ArrowRight size={14} />
            </button>
          ) : (
            <p style={S.emergencyNumber}>
              Emergency number: <strong>{result.emergencyNumber}</strong>
            </p>
          )}

          <p style={S.disclaimer}>{result.disclaimer}</p>
        </div>
      ) : null}
    </section>
  );
}

/* Measured against each block's own background. */
const TONES = {
  critical:  { bg: '#fdeceb', border: '#f3c7c3', text: '#8f1d17' },  /* 7.59:1 */
  attention: { bg: '#fff4e5', border: '#f6e2bd', text: '#8a4b09' },  /* 6.25:1 */
  neutral:   { bg: '#eef2ff', border: '#dbe2fb', text: '#2a3ea8' },  /* 7.98:1 */
  good:      { bg: '#e6f6ec', border: '#c9e9d5', text: '#12602f' },  /* 6.85:1 */
};

const S = {
  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 18,
    padding: '1.1rem 1.2rem', marginBottom: '1rem',
  },
  head: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.85rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, flexShrink: 0, borderRadius: 11,
    background: '#eef2ff', color: '#2a3ea8',
  },
  title: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.84rem', lineHeight: 1.5, color: '#4a5063' },

  input: {
    width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.75rem',
    border: '1px solid #d8dce6', borderRadius: 10, fontSize: '0.86rem',
    fontFamily: 'inherit', lineHeight: 1.5, color: '#2c3040', resize: 'vertical',
  },
  go: {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
    marginTop: '0.65rem', padding: '0.6rem 1rem', borderRadius: 999,
    border: 'none', background: '#2b5ce6', color: '#ffffff',
    fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  goOff: { opacity: 0.5, cursor: 'not-allowed' },

  error: { margin: '0.6rem 0 0', fontSize: '0.8rem', color: '#8f1d17' },

  result: { marginTop: '0.9rem', padding: '0.9rem 1rem', borderRadius: 14, border: '1px solid' },
  resultTitle: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    fontSize: '0.92rem', fontWeight: 800,
  },
  resultReason: { margin: '0.4rem 0 0', fontSize: '0.85rem', lineHeight: 1.55, color: '#2c3040' },
  resultAction: { margin: '0.35rem 0 0', fontSize: '0.85rem', lineHeight: 1.55, fontWeight: 650, color: '#2c3040' },
  safety: {
    margin: '0.6rem 0 0', fontSize: '0.82rem', lineHeight: 1.6,
    color: '#2c3040', whiteSpace: 'pre-line',
  },
  emergencyNumber: { margin: '0.6rem 0 0', fontSize: '0.9rem', color: '#8f1d17' },
  book: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    marginTop: '0.7rem', padding: '0.5rem 0.9rem', borderRadius: 999,
    border: '1px solid #d8dce6', background: '#ffffff', cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 700, color: '#2c3040', fontFamily: 'inherit',
  },
  disclaimer: { margin: '0.7rem 0 0', fontSize: '0.74rem', lineHeight: 1.5, color: '#565c6e' },
};
