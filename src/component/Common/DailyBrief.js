import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sunrise, ArrowRight } from 'lucide-react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * "What needs me today", on the clinician's own dashboard.
 *
 * Every number here is counted by the server in SQL. The one-line summary is
 * the only model-written part, it is written over those same counted figures,
 * and the card renders in full when the model says nothing at all — so a
 * missing sentence costs a little polish, never a fact.
 *
 * Each line is a button, because a count you cannot act on is just an anxiety
 * generator: "3 unsigned notes" should take you to the notes.
 */
export default function DailyBrief({ role }) {
  const navigate = useNavigate();
  const [brief, setBrief]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api('/api/v1/ai/daily-brief');
        if (!cancelled) setBrief(d);
      } catch {
        if (!cancelled) setBrief(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || !brief) return null;

  // Anything counted as zero is not worth a line of its own — the summary
  // already says the day is clear. A wall of zeroes reads as a to-do list.
  const actionable = (brief.items || []).filter((i) => typeof i.count === 'number' && i.count > 0);
  const nothing = actionable.length === 0;

  return (
    <section style={S.card} aria-label="Today's brief">
      <header style={S.head}>
        <span style={S.icon}><Sunrise size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <h2 style={S.title}>Today's brief</h2>
          <p style={S.sub}>
            {brief.summary
              || (nothing
                ? 'Nothing is waiting on you right now.'
                : 'Here is what is waiting on you.')}
          </p>
        </div>
      </header>

      {!nothing ? (
        <div style={S.rows}>
          <Paged items={actionable}>{(actionable) => actionable.map((i) => (
            <button
              key={i.key}
              type="button"
              style={S.row}
              onClick={() => navigate(i.link)}
            >
              <span style={{ ...S.count, ...(TONES[i.tone] || TONES.neutral) }}>{i.count}</span>
              <span style={S.label}>{i.label}</span>
              <ArrowRight size={14} style={{ flexShrink: 0, color: '#5b6170' }} />
            </button>
          ))}</Paged>
        </div>
      ) : null}
    </section>
  );
}

/* Measured on the row background (#f7f8fa). */
const TONES = {
  neutral:   { background: '#eef2ff', color: '#2a3ea8' },   /* 7.06:1 */
  attention: { background: '#fff4e5', color: '#8a4b09' },   /* 6.20:1 */
  good:      { background: '#e6f6ec', color: '#12602f' },   /* 6.72:1 */
};

const S = {
  card: {
    background: '#ffffff',
    border: '1px solid #e4e7ee',
    borderRadius: 18,
    padding: '1.1rem 1.2rem',
    marginBottom: '1rem',
  },
  head: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, flexShrink: 0, borderRadius: 11,
    background: '#fff4e5', color: '#8a4b09',
  },
  title: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.85rem', lineHeight: 1.5, color: '#4a5063' }, /* 8.1:1 */

  rows: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.9rem' },
  row: {
    display: 'inline-flex', alignItems: 'center', gap: '0.55rem',
    padding: '0.5rem 0.75rem',
    border: '1px solid #e9ebf1', borderRadius: 999,
    background: '#f7f8fa', cursor: 'pointer', fontFamily: 'inherit',
  },
  count: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 22, height: 22, padding: '0 0.35rem',
    borderRadius: 999, fontSize: '0.78rem', fontWeight: 800,
  },
  label: { fontSize: '0.82rem', fontWeight: 600, color: '#2c3040' },  /* 11.4:1 */
};
