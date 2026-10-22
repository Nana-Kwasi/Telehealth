import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/apiClient';
import { CONSULT_TYPES, fieldsFor, fromProfile, missingFields, profileUrl, toStorage } from '../../constants/clinicianProfile';
import './ClinicianProfileForm.css';

/**
 * Every field of a doctor's or therapist's professional profile — the ones
 * matching reads — in one form. Used by the super admin (User Management) and by
 * clinicians on their own Settings, so anything Profile Completeness lists can be
 * filled in and saved from either place.
 *
 * Props: kind ('doctor' | 'therapist'), userId, onSaved(profile) optional,
 * title optional, intro optional.
 */
export default function ClinicianProfileForm({ kind, userId, onSaved, title, intro }) {
  const [catalog, setCatalog] = useState(null);
  const [values, setValues] = useState(null);
  const [meta, setMeta] = useState({});
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    setValues(null); setError('');
    Promise.all([
      api('/api/v1/care-catalog', { authenticated: false }).catch(() => ({})),
      api(profileUrl(kind, userId)).catch(() => ({})),
    ]).then(([cat, profile]) => {
      if (!live) return;
      const { values: v, meta: m } = fromProfile(kind, profile || {});
      setCatalog(cat || {});
      setValues(v);
      setSaved(v);
      setMeta(m);
    });
    return () => { live = false; };
  }, [kind, userId]);

  const fields = fieldsFor(kind);
  const sections = useMemo(() => [...new Set(fields.map((f) => f.section))], [fields]);
  const missing = useMemo(() => (values ? missingFields(kind, values, catalog || {}) : []), [kind, values, catalog]);
  const missingKeys = useMemo(() => new Set(missing.map((m) => m.key)), [missing]);
  const dirty = values && saved && JSON.stringify(values) !== JSON.stringify(saved);

  if (!values) return <div className="cpf cpf-loading">Loading professional profile…</div>;

  const set = (key, val) => { setValues((v) => ({ ...v, [key]: val })); setOk(''); };
  const options = (f) => {
    const raw = Array.isArray(f.options) ? f.options : (catalog?.[f.options] || []);
    return raw.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  };

  const save = async () => {
    setBusy(true); setError(''); setOk('');
    try {
      const body = toStorage(kind, values, meta, catalog || {});
      const res = await api(profileUrl(kind, userId), { method: 'PATCH', body });
      const next = JSON.parse(body.metadataJson);
      setMeta(next);
      setSaved(values);
      setOk(missing.length ? `Saved. ${missing.length} item${missing.length === 1 ? '' : 's'} still needed for matching.` : 'Saved. This profile is complete for matching.');
      if (onSaved) onSaved(res);
    } catch (e) {
      setError(e.message || 'Could not save the profile.');
    } finally {
      setBusy(false);
    }
  };

  const control = (f) => {
    const v = values[f.key];
    const id = `cpf-${kind}-${f.key}`;
    switch (f.type) {
      case 'textarea':
        return <textarea id={id} rows={3} value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
      case 'number':
        return <input id={id} type="number" inputMode="decimal" min={f.min} max={f.max} value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
      case 'date':
        return <input id={id} type="date" value={v} onChange={(e) => set(f.key, e.target.value)} />;
      case 'select': {
        const opts = options(f);
        const known = opts.some((o) => String(o.value).toLowerCase() === String(v).toLowerCase());
        return (
          <select id={id} value={known ? opts.find((o) => String(o.value).toLowerCase() === String(v).toLowerCase()).value : v} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Choose…</option>
            {!known && v ? <option value={v}>{v} (not on the list)</option> : null}
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      }
      case 'multi': {
        const opts = options(f);
        const chosen = new Set(v.map((x) => String(x).toLowerCase()));
        return (
          <div className="cpf-chips" role="group" aria-labelledby={`${id}-label`}>
            {opts.map((o) => {
              const on = chosen.has(String(o.value).toLowerCase());
              return (
                <button key={o.value} type="button" className={`cpf-chip${on ? ' on' : ''}`} aria-pressed={on}
                  onClick={() => set(f.key, on ? v.filter((x) => String(x).toLowerCase() !== String(o.value).toLowerCase()) : [...v, o.value])}>
                  {on ? '✓ ' : ''}{o.label}
                </button>
              );
            })}
          </div>
        );
      }
      case 'list':
        return <input id={id} value={v.join(', ')} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value.split(',').map((s) => s.trimStart()))} />;
      case 'bool':
        return (
          <div className="cpf-seg" role="radiogroup" aria-labelledby={`${id}-label`}>
            {[[true, 'Yes'], [false, 'No']].map(([val, label]) => (
              <button key={label} type="button" role="radio" aria-checked={v === val} className={v === val ? 'on' : ''} onClick={() => set(f.key, val)}>{label}</button>
            ))}
          </div>
        );
      case 'consultTypes':
        return (
          <div className="cpf-chips" role="group" aria-labelledby={`${id}-label`}>
            {CONSULT_TYPES.map((o) => (
              <button key={o.value} type="button" className={`cpf-chip${v[o.value] ? ' on' : ''}`} aria-pressed={!!v[o.value]}
                onClick={() => set(f.key, { ...v, [o.value]: !v[o.value] })}>
                {v[o.value] ? '✓ ' : ''}{o.label}
              </button>
            ))}
          </div>
        );
      default:
        return <input id={id} value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  const wide = (f) => ['textarea', 'multi', 'consultTypes'].includes(f.type);
  const shown = missing.slice(0, showAll ? missing.length : 4);

  return (
    <div className="cpf">
      <div className="cpf-head">
        <div>
          <h3>{title || 'Professional profile'}</h3>
          <p>{intro || 'Patients are matched to clinicians from these details. Fields marked * are required.'}</p>
        </div>
        <span className={`cpf-status ${missing.length ? 'warn' : 'good'}`}>
          {missing.length ? `${missing.length} to complete` : 'Complete for matching'}
        </span>
      </div>

      {missing.length ? (
        <div className="cpf-missing" role="status">
          <strong>Still needed</strong>
          <ul>{shown.map((m) => <li key={m.key + m.text}><button type="button" onClick={() => document.getElementById(`cpf-${kind}-${m.key}`)?.focus()}>{m.text}</button></li>)}</ul>
          {missing.length > 4 ? <button type="button" className="cpf-more" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show fewer' : `Show all ${missing.length}`}</button> : null}
        </div>
      ) : null}

      {sections.map((s) => (
        <fieldset key={s} className="cpf-section">
          <legend>{s}</legend>
          <div className="cpf-grid">
            {fields.filter((f) => f.section === s).map((f) => (
              <div key={f.key} className={`cpf-field${wide(f) ? ' wide' : ''}${missingKeys.has(f.key) ? ' needs' : ''}`}>
                <label id={`cpf-${kind}-${f.key}-label`} htmlFor={`cpf-${kind}-${f.key}`}>{f.label}{f.required ? <span aria-hidden="true"> *</span> : null}</label>
                {control(f)}
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      {error ? <div className="cpf-alert error">{error}</div> : null}
      {ok ? <div className="cpf-alert ok">{ok}</div> : null}

      <div className="cpf-actions">
        <button type="button" className="cpf-btn primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save professional profile'}</button>
        {dirty ? <button type="button" className="cpf-btn" disabled={busy} onClick={() => { setValues(saved); setError(''); }}>Discard changes</button> : null}
      </div>
    </div>
  );
}
