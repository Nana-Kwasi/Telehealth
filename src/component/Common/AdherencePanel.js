import React, { useState, useEffect } from 'react';
import { Pill } from 'lucide-react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * How a patient has actually been taking their medication.
 *
 * Doses were being logged and nobody was reading them. This shows the pattern
 * to the clinician who can act on it.
 *
 * It reports; it does not advise. What to do about missed doses is a
 * prescribing decision, and there is deliberately no suggestion here — only
 * what the patient recorded.
 */
export default function AdherencePanel({ patientId, days = 30 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api(`/api/v1/ops/adherence/${patientId}?days=${days}`);
        if (!cancelled) setRows(res?.medications || []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, days]);

  // Nothing logged is not the same as perfect adherence, so the card stays away
  // rather than showing an encouraging empty state.
  if (loading || rows.length === 0) return null;

  return (
    <section style={S.card}>
      <header style={S.head}>
        <span style={S.icon}><Pill size={16} /></span>
        <div style={{ minWidth: 0 }}>
          <h3 style={S.title}>Medication, last {days} days</h3>
          <p style={S.sub}>What they recorded themselves.</p>
        </div>
      </header>

      <Paged items={rows}>{(rows) => rows.map((m) => {
        const total = (m.taken || 0) + (m.missed || 0) + (m.skipped || 0);
        const pct = total ? Math.round(((m.taken || 0) / total) * 100) : 0;
        const concerning = (m.missed || 0) >= 3;
        return (
          <div key={m.medication} style={S.row}>
            <div style={S.rowTop}>
              <span style={S.med}>{m.medication}</span>
              <span style={{ ...S.pct, color: concerning ? '#8a4b09' : '#12602f' }}>
                {pct}% taken
              </span>
            </div>
            <div style={S.bar}>
              <span style={{ ...S.barFill, width: `${pct}%`,
                background: concerning ? '#b45309' : '#1f8a4c' }} />
            </div>
            <div style={S.counts}>
              {m.taken || 0} taken · {m.missed || 0} missed
              {m.skipped ? ` · ${m.skipped} skipped` : ''}
            </div>
          </div>
        );
      })}</Paged>
    </section>
  );
}

const S = {
  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 16,
    padding: '1rem 1.1rem', marginBottom: '1rem',
  },
  head: { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', marginBottom: '0.7rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, flexShrink: 0, borderRadius: 10,
    background: '#eef2ff', color: '#2a3ea8',
  },
  title: { margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.1rem 0 0', fontSize: '0.76rem', color: '#565c6e' },

  row: { marginTop: '0.7rem' },
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'baseline' },
  med: { fontSize: '0.84rem', fontWeight: 700, color: '#2c3040' },
  pct: { fontSize: '0.78rem', fontWeight: 800 },
  bar: {
    height: 6, borderRadius: 999, background: '#eef0f5',
    overflow: 'hidden', margin: '0.3rem 0 0.25rem',
  },
  barFill: { display: 'block', height: '100%', borderRadius: 999 },
  counts: { fontSize: '0.74rem', color: '#565c6e' },
};
