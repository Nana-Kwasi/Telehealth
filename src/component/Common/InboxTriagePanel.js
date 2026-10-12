import React, { useState, useEffect, useCallback } from 'react';
import { Inbox, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * Unread messages, sorted by how soon they need attention.
 *
 * The sorting happens on the server, where the pattern-based safety screen
 * outranks the model — a message containing emergency language is urgent
 * whatever the model made of it.
 *
 * The message text is always shown alongside its category. A clinician should
 * be reading what the patient wrote, not a label something else assigned to it;
 * the category decides the ORDER, not whether they see it.
 */
export default function InboxTriagePanel({ onOpen }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ran, setRan] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const res = await api('/api/v1/ops/inbox/triage');
      if (!res?.ok) { setError(res?.message || 'Your inbox could not be sorted.'); return; }
      setData(res);
      setRan(true);
    } catch (e) {
      setError(e?.message || 'Your inbox could not be sorted.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { /* sorted on request: it costs a model call per message */ }, []);

  const order = data?.order || ['URGENT', 'CLINICAL', 'ADMIN'];
  const sorted = [...(data?.results || [])]
    .sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band));

  return (
    <section style={S.card}>
      <header style={S.head}>
        <span style={S.icon}><Inbox size={17} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={S.title}>Sort my unread messages</h2>
          <p style={S.sub}>
            Puts what needs you now at the top. It sorts only — nothing is
            answered, read or closed for you.
          </p>
        </div>
        <button type="button" style={{ ...S.go, ...(busy ? S.off : null) }} onClick={load} disabled={busy}>
          <RefreshCw size={14} /> {busy ? 'Sorting…' : ran ? 'Sort again' : 'Sort'}
        </button>
      </header>

      {error ? <p style={S.error}>{error}</p> : null}

      {ran && sorted.length === 0 && !error ? (
        <p style={S.empty}>Nothing unread. Your inbox is clear.</p>
      ) : null}

      <Paged items={sorted}>{(sorted) => sorted.map((m) => {
        const tone = TONES[m.tone] || TONES.neutral;
        return (
          <button
            key={m.id}
            type="button"
            style={{ ...S.row, borderColor: tone.border, background: tone.bg }}
            onClick={() => onOpen?.(m)}
          >
            <span style={S.rowTop}>
              <span style={{ ...S.band, color: tone.text }}>
                {m.tone === 'critical' ? <AlertTriangle size={13} /> : null}
                {m.label}
              </span>
              <span style={S.from}>{m.from || 'Unknown sender'}</span>
            </span>
            <span style={S.preview}>{m.preview}</span>
            <span style={S.why}>{m.reason}</span>
          </button>
        );
      })}</Paged>
    </section>
  );
}

/* Measured against each row's own background. */
const TONES = {
  critical:  { bg: '#fdeceb', border: '#f3c7c3', text: '#8f1d17' },  /* 7.59:1 */
  attention: { bg: '#fff4e5', border: '#f6e2bd', text: '#8a4b09' },  /* 6.25:1 */
  neutral:   { bg: '#f7f8fa', border: '#e9ebf1', text: '#3d4257' },  /* 9.1:1  */
};

const S = {
  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 18,
    padding: '1.1rem 1.2rem', marginBottom: '1rem',
  },
  head: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.6rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, flexShrink: 0, borderRadius: 11,
    background: '#eef2ff', color: '#2a3ea8',
  },
  title: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.82rem', lineHeight: 1.5, color: '#565c6e' },
  go: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0,
    padding: '0.5rem 0.85rem', borderRadius: 999, border: '1px solid #d8dce6',
    background: '#ffffff', fontSize: '0.8rem', fontWeight: 700,
    color: '#2c3040', cursor: 'pointer', fontFamily: 'inherit',
  },
  off: { opacity: 0.5, cursor: 'not-allowed' },

  row: {
    display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '100%',
    textAlign: 'left', padding: '0.7rem 0.85rem', marginTop: '0.5rem',
    border: '1px solid', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  rowTop: { display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' },
  band: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.74rem', fontWeight: 800 },
  from: { fontSize: '0.8rem', fontWeight: 700, color: '#15173a' },
  preview: { fontSize: '0.84rem', lineHeight: 1.5, color: '#2c3040' },
  why: { fontSize: '0.74rem', color: '#565c6e', fontStyle: 'italic' },

  error: { fontSize: '0.82rem', color: '#8f1d17', margin: '0.5rem 0 0' },
  empty: { fontSize: '0.85rem', color: '#565c6e', margin: '0.5rem 0 0' },
};
