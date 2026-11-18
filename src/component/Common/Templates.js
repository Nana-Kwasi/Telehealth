import React, { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import * as HI from '@healthicons/react';
import EmptyState, { IconHeading } from './EmptyState';
import './Measures.css';
import './PsychRecord.css';
import './Templates.css';

/*
 * The clinician's own templates.
 *  - TemplatesPanel: list, build and edit note templates and client forms (Practice page)
 *  - TemplateFields: renders a template's fields for filling in (notes and client forms)
 *  - TemplateNoteModal: write a clinical note with a note template (client page)
 *  - AnswersView: a submitted form, read-only
 */

export const FIELD_TYPES = [
  ['short', 'Short answer'],
  ['long', 'Paragraph'],
  ['choice', 'One choice'],
  ['multi', 'Several choices'],
  ['scale', 'Scale 0 to 10'],
  ['yesno', 'Yes or no'],
  ['date', 'Date'],
  ['heading', 'Section heading'],
];

const newField = (type = 'short') => ({
  id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  type, label: '', required: false, options: type === 'choice' || type === 'multi' ? ['', ''] : undefined,
});

export function TemplatesPanel() {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/api/v1/templates').then((l) => setList(Array.isArray(l) ? l : [])).catch((e) => { setList([]); setError(e?.message || 'Could not load.'); });
  useEffect(() => { load(); }, []);

  if (editing) return <TemplateBuilder initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  const notes = (list || []).filter((t) => t.kind === 'note');
  const forms = (list || []).filter((t) => t.kind === 'form');
  const archive = async (id) => { try { await api(`/api/v1/templates/${id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e?.message || 'Could not delete.'); } };
  const Row = ({ t }) => (
    <li key={t.id}>
      <span><strong>{t.name}</strong><span className="ms-muted"> · {t.fields.filter((f) => f.type !== 'heading').length} questions</span></span>
      <span>
        <button className="ms-link" onClick={() => setEditing(t)}>Edit</button>
        <button className="ms-link" onClick={() => archive(t.id)}>Delete</button>
      </span>
    </li>
  );
  return (
    <div className="ms-card">
      <IconHeading icon={HI.HealthWorkerForm} tone="violet">Templates</IconHeading>
      <p className="ms-muted pr-hint">Build your own note layouts, and forms for clients to fill in. Send forms from a client's page with “Share forms”.</p>
      {error && <p className="ms-err">{error}</p>}
      {list === null ? <p className="ms-muted">Loading…</p> : (
        <>
          <p className="tp-sub">Note templates</p>
          {notes.length === 0 ? <EmptyState compact icon={HI.PrescriptionDocument} tone="violet" title="No note templates yet">Make your own note layout once and reuse it.</EmptyState> : <ul className="ms-pending">{notes.map((t) => <Row key={t.id} t={t} />)}</ul>}
          <p className="tp-sub">Client forms</p>
          {forms.length === 0 ? <EmptyState compact icon={HI.HealthWorkerForm} tone="teal" title="No client forms yet">Build a form for clients to fill in before their first session.</EmptyState> : <ul className="ms-pending">{forms.map((t) => <Row key={t.id} t={t} />)}</ul>}
        </>
      )}
      <div className="ms-actions">
        <button className="ms-btn" onClick={() => setEditing({ kind: 'note', name: '', description: '', fields: [newField('long')] })}>New note template</button>
        <button className="ms-btn" onClick={() => setEditing({ kind: 'form', name: '', description: '', fields: [newField('short')] })}>New client form</button>
      </div>
    </div>
  );
}

function TemplateBuilder({ initial, onClose, onSaved }) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [fields, setFields] = useState(() => (initial.fields || []).map((f) => ({ ...f, options: f.options ? [...f.options] : f.options })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  const set = (i, patch) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i, d) => setFields((fs) => { const n = [...fs]; const j = i + d; if (j < 0 || j >= n.length) return fs; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const changeType = (i, type) => set(i, { type, options: type === 'choice' || type === 'multi' ? (fields[i].options?.length ? fields[i].options : ['', '']) : undefined });

  const save = async () => {
    setBusy(true); setError('');
    const body = { kind: initial.kind, name, description, fields: fields.map((f) => ({ ...f, options: f.options ? f.options.filter((o) => o.trim()) : undefined })) };
    try {
      await api(initial.id ? `/api/v1/templates/${initial.id}` : '/api/v1/templates', { method: initial.id ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };

  return (
    <div className="ms-card">
      <h3 className="ms-title">{initial.id ? 'Edit' : 'New'} {initial.kind === 'note' ? 'note template' : 'client form'}</h3>
      {initial.id && initial.kind === 'form' && <p className="ms-muted pr-hint">Changes apply to forms you send from now on. Answers already sent keep the questions the client saw.</p>}
      <label className="pr-label">Name<input className="pr-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
      <label className="pr-label">Description (optional)<input className="pr-full" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></label>
      <div className="ms-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="ms-link" onClick={() => setPreview(!preview)}>{preview ? 'Back to editing' : 'Preview'}</button>
      </div>
      {preview ? (
        <div className="tp-preview"><TemplateFields fields={fields.filter((f) => f.label.trim())} answers={{}} onChange={() => {}} /></div>
      ) : fields.map((f, i) => (
        <div key={f.id} className="tp-field">
          <div className="pr-row">
            <select value={f.type} onChange={(e) => changeType(i, e.target.value)} aria-label="Type">
              {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input className="pr-grow" placeholder={f.type === 'heading' ? 'Section title' : 'Question'} value={f.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={300} />
            {f.type !== 'heading' && (
              <label className="pr-check"><input type="checkbox" checked={!!f.required} onChange={(e) => set(i, { required: e.target.checked })} /> Required</label>
            )}
            <button className="ms-link" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>↑</button>
            <button className="ms-link" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === fields.length - 1}>↓</button>
            <button className="ms-link" onClick={() => setFields(fields.filter((_, j) => j !== i))} aria-label="Remove">Remove</button>
          </div>
          {(f.type === 'choice' || f.type === 'multi') && (
            <div className="tp-options">
              {f.options.map((o, k) => (
                <div key={k} className="pr-row">
                  <input className="pr-grow" placeholder={`Option ${k + 1}`} value={o} maxLength={120}
                    onChange={(e) => set(i, { options: f.options.map((x, m) => (m === k ? e.target.value : x)) })} />
                  {f.options.length > 2 && <button className="ms-link" onClick={() => set(i, { options: f.options.filter((_, m) => m !== k) })}>×</button>}
                </div>
              ))}
              {f.options.length < 20 && <button className="ms-link" onClick={() => set(i, { options: [...f.options, ''] })}>Add option</button>}
            </div>
          )}
        </div>
      ))}
      {!preview && fields.length < 40 && (
        <div className="ms-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="ms-link" onClick={() => setFields([...fields, newField('short')])}>+ Add a question</button>
          <button className="ms-link" onClick={() => setFields([...fields, newField('heading')])}>+ Add a section heading</button>
        </div>
      )}
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions">
        <button className="ms-link" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="ms-btn" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

/** Inputs for a template's fields. answers: { [fieldId]: value }. */
export function TemplateFields({ fields, answers, onChange }) {
  const set = (id, v) => onChange({ ...answers, [id]: v });
  return (
    <div className="tp-fields">
      {fields.map((f) => {
        if (f.type === 'heading') return <h4 key={f.id} className="tp-heading">{f.label}</h4>;
        const v = answers[f.id];
        const label = <span className="tp-q">{f.label}{f.required && <span className="tp-req" aria-label="required"> *</span>}</span>;
        return (
          <div key={f.id} className="tp-item">
            {f.type === 'short' && <label className="pr-label">{label}<input className="pr-full" value={v || ''} maxLength={300} onChange={(e) => set(f.id, e.target.value)} /></label>}
            {f.type === 'long' && <label className="pr-label">{label}<textarea rows={4} className="pr-full" value={v || ''} maxLength={5000} onChange={(e) => set(f.id, e.target.value)} /></label>}
            {f.type === 'date' && <label className="pr-label">{label}<input type="date" value={v || ''} onChange={(e) => set(f.id, e.target.value)} /></label>}
            {f.type === 'choice' && (
              <fieldset className="tp-set"><legend>{label}</legend>
                {f.options.map((o) => <label key={o} className="pr-check tp-opt"><input type="radio" name={f.id} checked={v === o} onChange={() => set(f.id, o)} /> {o}</label>)}
              </fieldset>
            )}
            {f.type === 'multi' && (
              <fieldset className="tp-set"><legend>{label}</legend>
                {f.options.map((o) => {
                  const cur = Array.isArray(v) ? v : [];
                  return <label key={o} className="pr-check tp-opt"><input type="checkbox" checked={cur.includes(o)} onChange={() => set(f.id, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])} /> {o}</label>;
                })}
              </fieldset>
            )}
            {f.type === 'yesno' && (
              <fieldset className="tp-set"><legend>{label}</legend>
                {['yes', 'no'].map((o) => <label key={o} className="pr-check tp-opt"><input type="radio" name={f.id} checked={v === o} onChange={() => set(f.id, o)} /> {o === 'yes' ? 'Yes' : 'No'}</label>)}
              </fieldset>
            )}
            {f.type === 'scale' && (
              <fieldset className="tp-set"><legend>{label}</legend>
                <div className="tp-scale">
                  {Array.from({ length: 11 }, (_, n) => (
                    <button type="button" key={n} className={`tp-dot ${v === n ? 'on' : ''}`} aria-pressed={v === n} onClick={() => set(f.id, n)}>{n}</button>
                  ))}
                </div>
              </fieldset>
            )}
            {f.help && <p className="ms-muted tp-help">{f.help}</p>}
          </div>
        );
      })}
    </div>
  );
}

export const missingRequired = (fields, answers) => fields.filter((f) => f.type !== 'heading' && f.required).filter((f) => {
  const v = answers[f.id];
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
});

export function AnswersView({ fields, answers }) {
  return (
    <dl className="tp-answers">
      {(fields || []).map((f) => {
        if (f.type === 'heading') return <h4 key={f.id} className="tp-heading">{f.label}</h4>;
        const v = answers?.[f.id];
        return (
          <React.Fragment key={f.id}>
            <dt>{f.label}</dt>
            <dd>{v === undefined || v === null || v === '' ? <span className="ms-muted">No answer</span> : Array.isArray(v) ? v.join(', ') : f.type === 'scale' ? `${v} / 10` : String(v)}</dd>
          </React.Fragment>
        );
      })}
    </dl>
  );
}

export function TemplateNoteModal({ clientId, onClose, onSaved }) {
  const [list, setList] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [answers, setAnswers] = useState({});
  const [visible, setVisible] = useState(false);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/v1/templates?kind=note').then((l) => { const a = Array.isArray(l) ? l : []; setList(a); if (a.length === 1) setTpl(a[0]); })
      .catch((e) => { setList([]); setError(e?.message || 'Could not load your templates.'); });
  }, []);

  const save = async (draft) => {
    const missing = missingRequired(tpl.fields, answers);
    if (!draft && missing.length) { setError(`Answer “${missing[0].label}”.`); return; }
    setBusy(true); setError('');
    try {
      await api(`/api/v1/templates/${tpl.id}/notes`, { method: 'POST', body: { clientId, answers, visibleToClient: visible, isDraft: draft, signature: draft ? null : signature } });
      onSaved && onSaved(); onClose();
    } catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };

  return (
    <div className="pr-modal-back" onClick={onClose}>
      <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Write a note with a template" onClick={(e) => e.stopPropagation()}>
        <h3 className="ms-title">{tpl ? tpl.name : 'Write with my template'}</h3>
        {list === null ? <p className="ms-muted">Loading…</p> : !tpl ? (
          list.length === 0 ? <p className="ms-muted">You have no note templates yet. Make one in My Practice › Templates.</p> : (
            <ul className="ms-pending">{list.map((t) => <li key={t.id}><span>{t.name}</span><button className="ms-btn" onClick={() => setTpl(t)}>Use</button></li>)}</ul>
          )
        ) : (
          <>
            <TemplateFields fields={tpl.fields} answers={answers} onChange={setAnswers} />
            <label className="pr-check" style={{ display: 'flex', margin: '0.75rem 0' }}>
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Let the client see this note
            </label>
            <label className="pr-label">Sign (type your name)<input className="pr-full" value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
          </>
        )}
        {error && <p className="ms-err">{error}</p>}
        <div className="ms-actions">
          <button className="ms-link" onClick={onClose} disabled={busy}>Cancel</button>
          {tpl && <button className="ms-link" onClick={() => save(true)} disabled={busy}>Save draft</button>}
          {tpl && <button className="ms-btn" onClick={() => save(false)} disabled={busy || !signature.trim()}>{busy ? 'Saving…' : 'Sign and save'}</button>}
        </div>
      </div>
    </div>
  );
}
