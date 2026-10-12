import React, { useState, useEffect, useCallback } from 'react';
import { FileAudio } from 'lucide-react';
import { api } from '../../services/apiClient';
import SessionRecordReview from './SessionRecordReview';
import Paged from './Paged';

/**
 * Transcribed sessions whose notes have not been saved yet — for a clinician
 * who closed the call before reviewing. Hidden when there are none.
 */
export default function SessionsToReview() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const r = await api('/api/v1/ai/sessions/unsaved').catch(() => []);
    setRows(Array.isArray(r) ? r : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!rows.length) return null;
  return (
    <section style={S.card} aria-label="Sessions to review">
      <header style={S.head}>
        <span style={S.icon}><FileAudio size={17} /></span>
        <div>
          <h2 style={S.title}>Sessions to review ({rows.length})</h2>
          <p style={S.sub}>Transcribed with the patient's consent. Review the drafted notes and save them to the record.</p>
        </div>
      </header>
      <Paged items={rows}>{(rows) => rows.map((r) => (
        <div key={r.id} style={S.row}>
          {open === r.id ? (
            <div style={{ width: '100%' }}>
              <SessionRecordReview id={r.id} onClose={() => setOpen(null)} onSaved={load} />
            </div>
          ) : (
            <>
              <span style={{ flex: 1 }}><b>{r.patient}</b> · {r.kind === 'therapy' ? 'Therapy session' : 'Consultation'} · {new Date(r.created_at).toLocaleString()}</span>
              <button type="button" style={S.btn} onClick={() => setOpen(r.id)}>Review</button>
            </>
          )}
        </div>
      ))}</Paged>
    </section>
  );
}

const S = {
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 18, padding: '1.1rem 1.2rem', marginBottom: '1rem' },
  head: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.5rem' },
  icon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 11, background: '#eef2ff', color: '#2a3ea8' },
  title: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },
  row: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0', borderTop: '1px solid #f1f2f6', fontSize: '0.86rem' },
  btn: { padding: '0.4rem 0.85rem', borderRadius: 999, border: 'none', background: '#2b5ce6', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
};
