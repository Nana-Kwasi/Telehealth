import React, { useCallback, useEffect, useState } from 'react';
import { FileAudio } from 'lucide-react';
import { api } from '../../services/apiClient';
import SessionRecordReview from './SessionRecordReview';
import Paged from './Paged';

/**
 * Every transcribed session the clinician had with this patient: ones still
 * to review first, then saved ones (open to re-read the transcript and the
 * structured record). Shown on the patient / client page. Hidden when none.
 */
export default function PatientTranscripts({ patientId, accent = '#2b5ce6' }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    if (!patientId) return;
    const r = await api(`/api/v1/ai/sessions/patient/${patientId}`).catch(() => []);
    setRows(Array.isArray(r) ? r : []);
  }, [patientId]);
  useEffect(() => { load(); }, [load]);
  if (!rows || !rows.length) return null;
  const toReview = rows.filter((r) => !r.savedAt).length;
  return (
    <section style={S.card} aria-label="Transcribed sessions">
      <header style={S.head}>
        <span style={{ ...S.icon, color: accent }}><FileAudio size={17} /></span>
        <div style={{ flex: 1 }}>
          <h2 style={S.title}>Transcribed sessions ({rows.length}){toReview ? <span style={S.badge}>{toReview} to review</span> : null}</h2>
          <p style={S.sub}>Recorded as text with the patient's consent. Saved ones are in the notes; open any to re-read what was said.</p>
        </div>
      </header>
      <Paged items={rows}>{(rows) => rows.map((r) => (
        <div key={r.id} style={S.row}>
          {open === r.id ? (
            <div style={{ width: '100%' }}><SessionRecordReview id={r.id} onClose={() => setOpen(null)} onSaved={load} /></div>
          ) : (
            <>
              <span style={{ flex: 1 }}>
                <b>{r.kind === 'therapy' ? 'Therapy session' : 'Consultation'}</b> · {new Date(r.visitAt || r.createdAt).toLocaleString()}
                <span style={S.meta}> · {r.segments} part{Number(r.segments) === 1 ? '' : 's'} transcribed</span>
              </span>
              {r.savedAt ? <span style={S.saved}>Saved {new Date(r.savedAt).toLocaleDateString()}</span> : <span style={S.pending}>Not saved</span>}
              <button type="button" style={{ ...S.btn, background: r.savedAt ? '#fff' : accent, color: r.savedAt ? accent : '#fff', border: `1px solid ${accent}` }} onClick={() => setOpen(r.id)}>
                {r.savedAt ? 'View' : 'Review & save'}
              </button>
            </>
          )}
        </div>
      ))}</Paged>
    </section>
  );
}

/** Small chip for an appointment / session row: links to its transcript when there is one. */
export function VisitTranscriptChip({ visitId }) {
  const [t, setT] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!visitId) return;
    api(`/api/v1/ai/sessions/visit/${visitId}`).then(setT).catch(() => setT(null));
  }, [visitId]);
  if (!t || !t.id || !Number(t.segments)) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} style={S.chip}>
        <FileAudio size={12} /> {t.savedAt ? 'Transcript' : 'Transcript · review'}
      </button>
      {open ? (
        <div style={S.overlay} onClick={() => setOpen(false)} role="presentation">
          <div style={S.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Session transcript">
            <SessionRecordReview id={t.id} onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}

const S = {
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 18, padding: '1.1rem 1.2rem', marginBottom: '1rem' },
  head: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.5rem' },
  icon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 11, background: '#eef2ff' },
  title: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#15173a', display: 'flex', alignItems: 'center', gap: 8 },
  badge: { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '0.1rem 0.55rem', fontSize: '0.72rem', fontWeight: 800 },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },
  row: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0', borderTop: '1px solid #f1f2f6', fontSize: '0.86rem', flexWrap: 'wrap' },
  meta: { color: '#64748b', fontSize: '0.78rem' },
  saved: { color: '#166534', fontSize: '0.76rem', fontWeight: 700 },
  pending: { color: '#92400e', fontSize: '0.76rem', fontWeight: 700 },
  btn: { padding: '0.4rem 0.85rem', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', borderRadius: 999, padding: '0.12rem 0.55rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: '#fff', borderRadius: 16, padding: '1.1rem 1.2rem', width: 'min(820px, 100%)', maxHeight: '90vh', overflowY: 'auto' },
};
