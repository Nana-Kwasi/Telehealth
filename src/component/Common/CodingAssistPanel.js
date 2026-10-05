import React, { useState, useEffect, useCallback } from 'react';
import { Tags, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * ICD-10 suggestions from the clinician's own documentation, approved by them.
 *
 * Every suggestion quotes the words that support it, and the server drops any
 * whose quote is not in the note or whose code is not valid WHO ICD-10. A code
 * that names a condition when the note records no diagnosis carries a warning.
 * Only ticked, approved codes are saved — and only those reach a claim.
 */
export default function CodingAssistPanel({ patientId }) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState({});
  const [approved, setApproved] = useState([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!patientId) return;
    const rows = await api(`/api/v1/ai/coding?patientId=${patientId}`).catch(() => []);
    setApproved(Array.isArray(rows) ? rows : []);
  }, [patientId]);
  useEffect(() => { load(); }, [load]);

  const suggest = async () => {
    setBusy('suggest'); setNote(''); setSuggestions([]); setPicked({});
    try {
      const res = await api('/api/v1/ai/coding/suggest', { method: 'POST', body: { patientId, text } });
      if (!res?.ok) { setNote(res?.message || 'Codes could not be suggested.'); return; }
      setSuggestions(res.suggestions || []);
      // Pre-tick only the ones without a warning; a warned code is an active choice.
      setPicked(Object.fromEntries((res.suggestions || []).map((s, i) => [i, !s.warning])));
      setNote((res.suggestions || []).length
        ? `${res.note}${res.droppedUnsupported ? ` ${res.droppedUnsupported} unsupported suggestion(s) were removed.` : ''}`
        : 'Nothing in this note is codeable.');
    } catch (e) { setNote(e?.message || 'Codes could not be suggested.'); } finally { setBusy(''); }
  };

  const approve = async () => {
    const codes = suggestions.filter((_, i) => picked[i]);
    if (!codes.length) { setNote('Tick the codes to approve.'); return; }
    setBusy('approve');
    try {
      const res = await api('/api/v1/ai/coding/approve', { method: 'POST', body: { patientId, codes } });
      setNote(res.message); setSuggestions([]); setText('');
      load();
    } catch (e) { setNote(e?.message || 'Those codes could not be saved.'); } finally { setBusy(''); }
  };

  return (
    <section style={S.card} aria-label="Diagnosis codes">
      <header style={S.head}>
        <span style={S.icon}><Tags size={17} /></span>
        <div>
          <h2 style={S.title}>Diagnosis codes</h2>
          <p style={S.sub}>Paste your note or assessment. Codes are suggested only from what you wrote, for you to approve.</p>
        </div>
      </header>
      <textarea rows={4} style={S.input} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Assessment: moderate depressive episode. Generalised anxiety disorder, ongoing." />
      <button type="button" style={{ ...S.primary, ...(busy || text.trim().length < 20 ? S.off : null) }}
        disabled={!!busy || text.trim().length < 20} onClick={suggest}>
        {busy === 'suggest' ? 'Reading…' : 'Suggest codes'}
      </button>

      {suggestions.map((s, i) => (
        <label key={i} style={{ ...S.row, ...(s.warning ? S.warnRow : null) }}>
          <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} />
          <div style={{ flex: 1 }}>
            <div style={S.code}>{s.code || '—'} <span style={S.desc}>{s.description}</span>
              {s.lookupUrl ? <a href={s.lookupUrl} target="_blank" rel="noreferrer" style={S.link}> check <ExternalLink size={11} /></a> : null}
            </div>
            <div style={S.ev}>“{s.evidence}”</div>
            {s.warning ? <div style={S.warn}><AlertTriangle size={12} /> {s.warning}</div> : null}
          </div>
        </label>
      ))}
      {suggestions.length ? (
        <button type="button" style={{ ...S.primary, ...(busy ? S.off : null) }} disabled={!!busy} onClick={approve}>
          <Check size={14} /> Approve ticked codes
        </button>
      ) : null}
      {note ? <p style={S.sub}>{note}</p> : null}

      {approved.length ? (
        <div style={{ marginTop: '0.8rem' }}>
          <div style={S.label}>On record</div>
          {approved.slice(0, 8).map((a, i) => (
            <div key={i} style={S.recorded}><b>{a.code}</b> {a.description}
              <span style={S.meta}> · {a.clinician} · {new Date(a.created_at).toLocaleDateString()}</span></div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const S = {
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 16, padding: '1rem 1.1rem', marginBottom: '1.25rem' },
  head: { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', marginBottom: '0.6rem' },
  icon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: '#eef2ff', color: '#2a3ea8' },
  title: { margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.3rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', border: '1px solid #d8dce6', borderRadius: 9, fontSize: '0.85rem', fontFamily: 'inherit' },
  primary: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.6rem', padding: '0.5rem 0.95rem', borderRadius: 999, border: 'none', background: '#2b5ce6', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  off: { opacity: 0.5, cursor: 'not-allowed' },
  row: { display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.55rem 0.6rem', marginTop: '0.5rem', borderRadius: 10, border: '1px solid #e9ebf1', cursor: 'pointer' },
  warnRow: { border: '1px solid #f6e2bd', background: '#fffaf2' },
  code: { fontSize: '0.88rem', fontWeight: 800, color: '#15173a' },
  desc: { fontWeight: 600, color: '#2c3040' },
  link: { fontSize: '0.74rem', fontWeight: 600, color: '#2b5ce6', marginLeft: '0.3rem' },
  ev: { fontSize: '0.78rem', color: '#565c6e', fontStyle: 'italic', marginTop: '0.15rem' },
  warn: { display: 'flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.76rem', color: '#8a4b09', marginTop: '0.25rem' },
  label: { fontSize: '0.76rem', fontWeight: 800, color: '#3d4257' },
  recorded: { fontSize: '0.82rem', color: '#2c3040', padding: '0.2rem 0' },
  meta: { color: '#565c6e', fontSize: '0.74rem' },
};
