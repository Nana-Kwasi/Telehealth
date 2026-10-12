import React, { useState, useEffect } from 'react';
import { ListChecks } from 'lucide-react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * What is missing from this record — allergies never asked, consultations
 * without a note, orders with no result, prescriptions with no dose.
 *
 * Rule-based on the server, no model: every line here is checkably true. A
 * model asked "what's missing?" would produce plausible gaps, and a clinician
 * cannot tell an invented gap from a real one at a glance.
 *
 * Renders nothing when the record is complete — a "nothing missing" card on
 * every patient is noise.
 */
export default function RecordGapsPanel({ patientId }) {
  const [gaps, setGaps] = useState(null);

  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    api(`/api/v1/ai/records/gaps?patientId=${patientId}`)
      .then((d) => { if (!cancelled) setGaps(d?.gaps || []); })
      .catch(() => { if (!cancelled) setGaps([]); });
    return () => { cancelled = true; };
  }, [patientId]);

  if (!gaps || gaps.length === 0) return null;

  return (
    <section style={S.card} aria-label="Gaps in this record">
      <header style={S.head}>
        <span style={S.icon}><ListChecks size={17} /></span>
        <div>
          <h2 style={S.title}>Gaps in this record</h2>
          <p style={S.sub}>Checked against the record itself — each one is something actually missing.</p>
        </div>
      </header>
      <Paged items={gaps}>{(gaps) => gaps.map((g) => (
        <div key={g.key} style={S.row}>
          <span style={{ ...S.dot, background: LEVEL[g.level] || LEVEL.low }} aria-hidden />
          <div>
            <div style={S.gapTitle}>{g.title}</div>
            <div style={S.detail}>{g.detail}</div>
          </div>
        </div>
      ))}</Paged>
    </section>
  );
}

const LEVEL = { high: '#b42318', medium: '#b54708', low: '#667085' };

const S = {
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 16, padding: '1rem 1.1rem', marginBottom: '1.25rem' },
  head: { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', marginBottom: '0.5rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
    flexShrink: 0, borderRadius: 10, background: '#fff4e5', color: '#8a4b09',
  },
  title: { margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },
  row: { display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.45rem 0', borderTop: '1px solid #f1f2f6' },
  dot: { width: 8, height: 8, borderRadius: 999, marginTop: '0.4rem', flexShrink: 0 },
  gapTitle: { fontSize: '0.86rem', fontWeight: 700, color: '#15173a' },
  detail: { fontSize: '0.78rem', color: '#565c6e' },
};
