import React, { useState, useEffect, useCallback } from 'react';
import { CalendarHeart, ArrowUp, ArrowDown, Minus, AlertTriangle } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Weekly check-ins for one client: the switch, and what came back this week.
 *
 * Off until the therapist turns it on for this client. Every figure is the
 * client's own 0-10 self-rating averaged over the week, compared with the week
 * before; the paragraph is written over those figures and the client's own
 * words, never in place of them, and is labelled as such.
 *
 * Direction is neutral in colour on purpose: anxiety going up is bad, mood
 * going up is good, and colouring the arrow would be the screen judging.
 */
export default function WeeklyCheckInPanel({ clientId }) {
  const [enabled, setEnabled] = useState(null);
  const [data, setData]       = useState(null);
  const [busy, setBusy]       = useState(false);
  const [note, setNote]       = useState('');

  const load = useCallback(async () => {
    if (!clientId) return;
    const s = await api(`/api/v1/care/weekly-checkins/${clientId}`).catch(() => null);
    setEnabled(Boolean(s?.enabled));
    const d = await api(`/api/v1/care/weekly-checkins/${clientId}/summary`).catch(() => null);
    setData(d);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    setBusy(true); setNote('');
    try {
      const res = await api(`/api/v1/care/weekly-checkins/${clientId}`, {
        method: 'PUT', body: { enabled: !enabled },
      });
      setEnabled(Boolean(res?.enabled));
      setNote(res?.message || '');
    } catch (e) {
      setNote(e?.message || 'That could not be changed.');
    } finally { setBusy(false); }
  };

  if (enabled === null) return null;
  const answered = data?.answeredThisWeek || 0;

  return (
    <section style={S.card} aria-label="Weekly check-ins">
      <header style={S.head}>
        <span style={S.icon}><CalendarHeart size={17} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={S.title}>Weekly check-ins</h2>
          <p style={S.sub}>
            Mood, anxiety, stress, sleep, energy, medication and major events — asked once a week.
          </p>
        </div>
        <button type="button" onClick={toggle} disabled={busy} aria-pressed={enabled}
          style={{ ...S.toggle, ...(enabled ? S.on : null) }}>
          {enabled ? 'On' : 'Off'}
        </button>
      </header>
      {note ? <p style={S.sub}>{note}</p> : null}

      {data?.flagged ? (
        <p style={S.flag}><AlertTriangle size={14} /> A check-in this week was flagged — see your review queue.</p>
      ) : null}

      {answered > 0 ? (
        <>
          <div style={S.grid}>
            {(data.measures || []).filter((m) => m.value != null).map((m) => {
              const Arrow = m.direction === 'up' ? ArrowUp : m.direction === 'down' ? ArrowDown : Minus;
              return (
                <div key={m.key} style={S.tile}>
                  <span style={S.label}>{m.label}</span>
                  <span style={S.value}>{m.value}</span>
                  {m.previous != null ? (
                    <span style={S.prev}><Arrow size={11} /> from {m.previous}</span>
                  ) : <span style={S.prev}>no answer last week</span>}
                </div>
              );
            })}
          </div>
          <p style={S.line}>
            Medication: {data.medication?.taken || 0} taken · {data.medication?.missed || 0} missed
          </p>
          {(data.events || []).map((e, i) => <p key={i} style={S.quote}>“{e}”</p>)}
          {data.summary ? (
            <div style={S.summary}>
              <p style={S.summaryText}>{data.summary}</p>
              <p style={S.summaryNote}>AI-written from the figures and words above. The answers are the record.</p>
            </div>
          ) : null}
        </>
      ) : (
        <p style={S.sub}>
          {enabled ? 'No answer yet this week.' : 'Turn this on to send this client a short check-in each week.'}
        </p>
      )}
    </section>
  );
}

const S = {
  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 16,
    padding: '1rem 1.1rem', marginBottom: '1.25rem',
  },
  head: { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', marginBottom: '0.5rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
    flexShrink: 0, borderRadius: 10, background: '#f3efff', color: '#5b21b6',
  },
  title: { margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },
  toggle: {
    padding: '0.35rem 0.9rem', borderRadius: 999, border: '1px solid #d8dce6', background: '#fff',
    fontSize: '0.78rem', fontWeight: 800, color: '#565c6e', cursor: 'pointer', fontFamily: 'inherit',
  },
  on: { background: '#5b21b6', borderColor: '#5b21b6', color: '#fff' },
  flag: {
    display: 'flex', alignItems: 'center', gap: '0.35rem', margin: '0.5rem 0',
    fontSize: '0.82rem', fontWeight: 700, color: '#8f1d17',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem', marginTop: '0.6rem' },
  tile: {
    display: 'flex', flexDirection: 'column', gap: '0.1rem', padding: '0.6rem 0.7rem',
    borderRadius: 11, background: '#f7f8fa', border: '1px solid #e9ebf1',
  },
  label: { fontSize: '0.72rem', fontWeight: 650, color: '#565c6e' },
  value: { fontSize: '1.2rem', fontWeight: 800, color: '#15173a' },
  prev: { display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: '#565c6e' },
  line: { margin: '0.6rem 0 0', fontSize: '0.82rem', color: '#2c3040' },
  quote: { margin: '0.35rem 0 0', fontSize: '0.84rem', lineHeight: 1.55, color: '#2c3040', fontStyle: 'italic' },
  summary: { marginTop: '0.7rem', padding: '0.7rem 0.85rem', borderRadius: 11, background: '#f6f3ff' },
  summaryText: { margin: 0, fontSize: '0.84rem', lineHeight: 1.6, color: '#2c3040' },
  summaryNote: { margin: '0.35rem 0 0', fontSize: '0.7rem', color: '#565c6e' },
};
