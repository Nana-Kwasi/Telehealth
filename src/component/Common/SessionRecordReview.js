import React, { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';

// One drafting request per session. React's dev mode runs this screen's effect
// twice, and each run used to start its own (slow, paid) model call.
const inFlight = new Map();
function finishOnce(id) {
  if (!inFlight.has(id)) {
    const p = api(`/api/v1/ai/sessions/${id}/finish`, { method: 'POST', body: {} })
      .finally(() => setTimeout(() => inFlight.delete(id), 1000));
    inFlight.set(id, p);
  }
  return inFlight.get(id);
}

/**
 * Review a transcribed session before anything enters the record.
 *
 * The draft is built from the transcript only. The clinician edits the note
 * text (and, for therapy, the homework) and saves; until then nothing is in
 * the patient's record. The transcript stays visible so every line of the
 * draft can be checked against what was actually said.
 */
const CONSULT_FIELDS = [
  ['chiefComplaint', 'Chief complaint'], ['symptoms', 'Symptoms'], ['duration', 'Duration'], ['severity', 'Severity'],
  ['medicalHistory', 'Medical history'], ['medications', 'Medications'], ['allergies', 'Allergies'],
  ['examinationFindings', 'Examination findings'], ['assessment', 'Assessment'], ['plan', 'Plan'], ['followUp', 'Follow-up'],
];

function toNote(kind, d) {
  if (!d) return '';
  const val = (v) => (Array.isArray(v) ? v.join(', ') : (v || ''));
  if (kind === 'therapy') {
    return [
      d.summary ? `Summary: ${d.summary}` : '',
      d.progressNote ? `Progress note: ${d.progressNote}` : '',
      d.themes?.length ? `Themes: ${val(d.themes)}` : '',
      d.clientGoals?.length ? `Client goals: ${val(d.clientGoals)}` : '',
      d.followUpPlan ? `Follow-up plan: ${d.followUpPlan}` : '',
      d.riskNotes ? `Risk notes: ${d.riskNotes}` : '',
    ].filter(Boolean).join('\n\n');
  }
  return CONSULT_FIELDS.map(([k, l]) => (val(d[k]) ? `${l}: ${val(d[k])}` : '')).filter(Boolean).join('\n');
}

export default function SessionRecordReview({ id, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [homework, setHomework] = useState([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [busy, setBusy] = useState('loading');
  const [msg, setMsg] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let d = await api(`/api/v1/ai/sessions/${id}`);
        // No draft yet: make one now (this also closes transcription for the session).
        if (!d.draft && !d.savedAt) {
          const f = await finishOnce(id);
          if (!f.ok) setMsg(f.message || 'The record could not be drafted.');
          d = { ...d, transcript: f.transcript || d.transcript, draft: f.draft || null, flags: f.flags };
        }
        if (cancelled) return;
        setData(d);
        setNoteText(toNote(d.kind, d.draft));
        setHomework((d.draft?.homework || []).map((h) => ({ title: h.title || '', instructions: h.instructions || '', dueDate: '' })));
      } catch (e) {
        if (!cancelled) setMsg(e?.message || 'This session could not be loaded.');
      } finally {
        if (!cancelled) setBusy('');
      }
    })();
    return () => { cancelled = true; };
  }, [id, attempt]);

  const save = async () => {
    setBusy('saving'); setMsg('');
    try {
      const res = await api(`/api/v1/ai/sessions/${id}/save`, {
        method: 'POST', body: { noteText, homework: homework.filter((h) => h.title.trim()) },
      });
      setMsg(res.message);
      setData((d) => ({ ...d, savedAt: new Date().toISOString() }));
      onSaved?.();
    } catch (e) { setMsg(e?.message || 'Could not save.'); } finally { setBusy(''); }
  };

  if (busy === 'loading') return <p style={S.muted}>Drafting the session notes from the transcript… this usually takes 1–2 minutes. You can keep this open.</p>;
  if (!data) return <div><p>{msg}</p>{onClose ? <button type="button" style={S.ghost} onClick={onClose}>Close</button> : null}</div>;
  const therapy = data.kind === 'therapy';

  return (
    <div>
      <h3 style={S.h3}>{therapy ? 'Session notes' : 'Consultation record'} — review before saving</h3>
      <p style={S.muted}>Drafted from the transcript only. Nothing is in the record until you save.</p>
      {(data.flags || []).length ? (
        <div style={S.crisis}>Safety-related words were said in this session: {data.flags.map((f) => `“${f.text}”`).join(' ')}</div>
      ) : null}

      {!therapy && data.draft ? (
        <dl style={S.dl}>
          {CONSULT_FIELDS.map(([k, l]) => {
            const v = data.draft[k];
            const t = Array.isArray(v) ? v.join(', ') : v;
            return t ? <React.Fragment key={k}><dt style={S.dt}>{l}</dt><dd style={S.dd}>{t}</dd></React.Fragment> : null;
          })}
        </dl>
      ) : null}

      <label style={S.label}>{therapy ? 'Note' : 'Note to save'} (edit freely)
        <textarea rows={therapy ? 10 : 8} style={S.input} value={noteText} onChange={(e) => setNoteText(e.target.value)}
          disabled={!!data.savedAt} />
      </label>

      {therapy ? (
        <div style={{ marginTop: '0.7rem' }}>
          <div style={S.label}>Homework (sent to the client as worksheets)</div>
          {homework.map((h, i) => (
            <div key={i} style={S.hw}>
              <input style={S.input} value={h.title} placeholder="Title" disabled={!!data.savedAt}
                onChange={(e) => setHomework(homework.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <input style={S.input} value={h.instructions} placeholder="Instructions" disabled={!!data.savedAt}
                onChange={(e) => setHomework(homework.map((x, j) => (j === i ? { ...x, instructions: e.target.value } : x)))} />
              <input type="date" style={S.input} value={h.dueDate} disabled={!!data.savedAt}
                onChange={(e) => setHomework(homework.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} />
              {!data.savedAt ? <button type="button" style={S.ghost} onClick={() => setHomework(homework.filter((_, j) => j !== i))}>Remove</button> : null}
            </div>
          ))}
          {!data.savedAt ? (
            <button type="button" style={S.ghost} onClick={() => setHomework([...homework, { title: '', instructions: '', dueDate: '' }])}>+ Add homework</button>
          ) : null}
        </div>
      ) : null}

      <button type="button" style={{ ...S.link, marginTop: '0.7rem' }} onClick={() => setShowTranscript(!showTranscript)}>
        {showTranscript ? 'Hide transcript' : 'Show transcript'}
      </button>
      {showTranscript ? <pre style={S.transcript}>{data.transcript || 'No transcript.'}</pre> : null}

      {msg ? <p style={S.msg}>{msg}</p> : null}
      {!data.draft && !data.savedAt ? (
        <button type="button" style={S.ghost} onClick={() => { setMsg(''); setBusy('loading'); setAttempt((n) => n + 1); }}>
          Try drafting again
        </button>
      ) : null}
      <div style={S.actions}>
        {onClose ? <button type="button" style={S.ghost} onClick={onClose}>{data.savedAt ? 'Close' : 'Later'}</button> : null}
        {!data.savedAt ? (
          <button type="button" style={S.btn} disabled={busy === 'saving' || !noteText.trim()} onClick={save}>
            {busy === 'saving' ? 'Saving…' : 'Save to record'}
          </button>
        ) : <span style={S.saved}>Saved to the record.</span>}
      </div>
    </div>
  );
}

const S = {
  h3: { margin: '0 0 0.2rem', fontSize: '1.05rem' },
  muted: { fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.6rem' },
  crisis: { background: '#fdeceb', color: '#8f1d17', border: '1px solid #f3c7c3', borderRadius: 10, padding: '0.5rem 0.75rem', fontSize: '0.84rem', marginBottom: '0.6rem' },
  dl: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.25rem 0.8rem', fontSize: '0.85rem', margin: '0 0 0.6rem' },
  dt: { color: '#64748b', fontWeight: 700 },
  dd: { margin: 0 },
  label: { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700, color: '#334155' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.86rem', fontFamily: 'inherit', fontWeight: 400 },
  hw: { display: 'grid', gridTemplateColumns: '1fr 2fr 150px auto', gap: '0.4rem', marginTop: '0.4rem' },
  transcript: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.82rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.6rem', maxHeight: 260, overflowY: 'auto' },
  actions: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.8rem' },
  btn: { padding: '0.5rem 1rem', borderRadius: 999, border: 'none', background: '#2b5ce6', color: '#fff', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' },
  ghost: { padding: '0.45rem 0.85rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' },
  link: { background: 'none', border: 'none', color: '#2b5ce6', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '0.82rem' },
  msg: { fontSize: '0.86rem', color: '#166534' },
  saved: { fontSize: '0.86rem', color: '#166534', fontWeight: 700 },
};
