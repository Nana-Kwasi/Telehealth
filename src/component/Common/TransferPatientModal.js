import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  careCatalog, draftTransferSummary, requestTransfer, transferReasons, transferSuggestions,
} from '../../services/careTransfers';
import './CareTransfers.css';

/**
 * The transfer form a doctor or therapist fills in to hand a patient over.
 *
 * The receiving clinician decides from this form, so every part that matters is
 * required: the reason, the specialty (or kind of therapy) needed, and a clinical
 * summary. "Draft with AI" writes a first summary from the record for the
 * clinician to check — it is never sent unedited without them seeing it.
 * Suggestions come from the same matching patients see, best match first.
 */
export default function TransferPatientModal({ open, onClose, onSent, patient, role = 'DOCTOR' }) {
  const isDoctor = role === 'DOCTOR';
  const [catalog, setCatalog] = useState(null);
  const [reasons, setReasons] = useState({});
  const [form, setForm] = useState({
    reason: '', reasonDetails: '', urgency: 'routine',
    neededSpecialty: '', neededFormat: 'individual', neededFocus: [],
    clinicalSummary: '', currentMedications: '', activeIssues: '', handoverNotes: '',
  });
  const [toId, setToId] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [ai, setAi] = useState({ busy: false, used: false, auditId: null, message: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [sending, setSending] = useState(false);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  useEffect(() => {
    if (!open) return;
    careCatalog().then(setCatalog).catch(() => setCatalog(null));
    transferReasons().then((r) => setReasons(r || {})).catch(() => setReasons({}));
  }, [open]);

  // Suggestions follow what the patient needs.
  useEffect(() => {
    if (!open || !patient?.id) return undefined;
    if (isDoctor && !form.neededSpecialty) { setSuggestions([]); return undefined; }
    let cancelled = false;
    setLoadingSuggestions(true);
    const t = setTimeout(() => {
      transferSuggestions({
        patientId: patient.id,
        specialty: isDoctor ? form.neededSpecialty : undefined,
        format: isDoctor ? undefined : form.neededFormat,
        focus: isDoctor ? [] : form.neededFocus,
      })
        .then((rows) => { if (!cancelled) setSuggestions(rows); })
        .catch(() => { if (!cancelled) setSuggestions([]); })
        .finally(() => { if (!cancelled) setLoadingSuggestions(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, patient?.id, isDoctor, form.neededSpecialty, form.neededFormat, form.neededFocus]);

  const groups = useMemo(() => ({
    best: suggestions.filter((s) => s.tier === 'best'),
    close: suggestions.filter((s) => s.tier === 'close'),
    other: suggestions.filter((s) => s.tier === 'other'),
  }), [suggestions]);

  if (!open) return null;

  const draft = async () => {
    if (!form.reason) { setErrors((e) => ({ ...e, reason: 'Choose the reason first — the summary is written for it.' })); return; }
    setAi({ busy: true, used: ai.used, auditId: ai.auditId, message: '' });
    try {
      const r = await draftTransferSummary({
        patientId: patient.id, reason: form.reason, reasonDetails: form.reasonDetails,
        needed: isDoctor ? form.neededSpecialty : form.neededFormat,
      });
      if (!r?.ok) { setAi({ busy: false, used: ai.used, auditId: ai.auditId, message: r?.message || 'Could not draft the summary.' }); return; }
      setForm((f) => ({
        ...f,
        clinicalSummary: r.draft.clinicalSummary || f.clinicalSummary,
        currentMedications: r.draft.currentMedications || f.currentMedications,
        activeIssues: r.draft.activeIssues || f.activeIssues,
      }));
      setAi({ busy: false, used: true, auditId: r.aiAuditId || null, message: 'Drafted from the record — check and edit it before sending.' });
    } catch (e) {
      setAi({ busy: false, used: ai.used, auditId: ai.auditId, message: e.message || 'Could not draft the summary.' });
    }
  };

  const validate = () => {
    const e = {};
    if (!form.reason) e.reason = 'Choose a reason';
    if (form.reason === 'other' && !form.reasonDetails.trim()) e.reasonDetails = 'Describe the reason';
    if (isDoctor && !form.neededSpecialty) e.neededSpecialty = 'Choose the specialty the patient needs';
    if (!isDoctor && !form.neededFormat) e.neededFormat = 'Choose the kind of therapy';
    if (form.clinicalSummary.trim().length < 30) e.clinicalSummary = 'Write a clinical summary of at least a few sentences';
    if (!toId) e.toId = 'Choose who should take over';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setServerError('');
    if (!validate()) return;
    setSending(true);
    try {
      const t = await requestTransfer({
        patientId: patient.id, toClinicianId: toId, ...form,
        neededSpecialty: isDoctor ? form.neededSpecialty : null,
        neededFormat: isDoctor ? null : form.neededFormat,
        neededFocus: isDoctor ? [] : form.neededFocus,
        aiAssisted: ai.used, aiAuditId: ai.auditId,
      });
      onSent?.(t);
      onClose();
    } catch (e) {
      setServerError(e.message || 'The transfer could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const field = (key, label, input, hint) => (
    <div className={`ct-field${errors[key] ? ' has-error' : ''}`}>
      <label htmlFor={`ct-${key}`}>{label}</label>
      {input}
      {hint ? <small>{hint}</small> : null}
      {errors[key] ? <span className="ct-field-error">{errors[key]}</span> : null}
    </div>
  );

  const option = (s) => (
    <button type="button" key={s.id} className={`ct-option${toId === s.id ? ' is-on' : ''}`} onClick={() => { setToId(s.id); setErrors((e) => ({ ...e, toId: undefined })); }}>
      <div>
        <strong>{isDoctor ? `Dr. ${s.name}` : s.name}</strong>
        <span>
          {isDoctor ? s.specialization : (s.professionalType || 'Therapist')}
          {s.yearsExperience ? ` · ${s.yearsExperience} yrs` : ''}
          {s.reasons?.length ? ` · ${s.reasons.join(' · ')}` : ''}
        </span>
      </div>
      <span className="ct-score">{s.score}%</span>
    </button>
  );

  return (
    <div className="ct-overlay" role="dialog" aria-modal="true" aria-labelledby="ct-title">
      <div className="ct-modal">
        <div className="ct-modal-head">
          <div>
            <h2 id="ct-title">Transfer {patient?.name || 'patient'}</h2>
            <p className="ct-meta">
              {patient?.name || 'The patient'} is asked to consent first. The {isDoctor ? 'doctor' : 'therapist'} you choose then has 24 hours to accept;
              after that NessaHub reassigns to the best available match.
            </p>
          </div>
          <button type="button" className="ct-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="ct-form" onSubmit={submit} noValidate>
          <div className="ct-grid">
            {field('reason', 'Reason for transfer *', (
              <select id="ct-reason" value={form.reason} onChange={(e) => set('reason', e.target.value)}>
                <option value="">Choose…</option>
                {Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            ))}
            {field('urgency', 'Urgency *', (
              <select id="ct-urgency" value={form.urgency} onChange={(e) => set('urgency', e.target.value)}>
                <option value="routine">Routine</option>
                <option value="soon">Soon (within days)</option>
                <option value="urgent">Urgent</option>
              </select>
            ))}
          </div>
          {field('reasonDetails', form.reason === 'other' ? 'Describe the reason *' : 'More about the reason', (
            <textarea id="ct-reasonDetails" value={form.reasonDetails} onChange={(e) => set('reasonDetails', e.target.value)} />
          ))}

          {isDoctor ? field('neededSpecialty', 'Specialty the patient needs *', (
            <select id="ct-neededSpecialty" value={form.neededSpecialty} onChange={(e) => set('neededSpecialty', e.target.value)}>
              <option value="">Choose…</option>
              {(catalog?.doctorSpecialties || []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ), 'Used to suggest doctors and, if needed, to reassign automatically.') : (
            <>
              {field('neededFormat', 'Kind of therapy needed *', (
                <select id="ct-neededFormat" value={form.neededFormat} onChange={(e) => set('neededFormat', e.target.value)}>
                  {(catalog?.careFormats || []).filter((f) => f.value !== 'couples').map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              ))}
              {field('neededFocus', 'Areas the new therapist should cover', (
                <div className="ct-chips">
                  {(catalog?.therapyFocus || []).map((f) => {
                    const on = form.neededFocus.includes(f.value);
                    return (
                      <button type="button" key={f.value} className={`ct-chip${on ? ' is-on' : ''}`} aria-pressed={on}
                        onClick={() => set('neededFocus', on ? form.neededFocus.filter((x) => x !== f.value) : [...form.neededFocus, f.value])}>
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              ), 'Leave empty to use the client\'s questionnaire answers.')}
            </>
          )}

          <div className="ct-actions" style={{ marginTop: 0 }}>
            <button type="button" className="ct-btn" onClick={draft} disabled={ai.busy}>
              <Sparkles size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {ai.busy ? 'Drafting from the record…' : 'Draft summary with AI'}
            </button>
            {ai.message ? <span className="ct-meta" style={{ alignSelf: 'center' }}>{ai.message}</span> : null}
          </div>

          {field('clinicalSummary', 'Clinical summary for the receiving clinician *', (
            <textarea id="ct-clinicalSummary" style={{ minHeight: 120 }} value={form.clinicalSummary} onChange={(e) => set('clinicalSummary', e.target.value)} />
          ))}
          <div className="ct-grid">
            {field('currentMedications', 'Current medications', (
              <textarea id="ct-currentMedications" value={form.currentMedications} onChange={(e) => set('currentMedications', e.target.value)} />
            ))}
            {field('activeIssues', 'Open issues, pending results, follow-ups', (
              <textarea id="ct-activeIssues" value={form.activeIssues} onChange={(e) => set('activeIssues', e.target.value)} />
            ))}
          </div>
          {field('handoverNotes', 'Anything else for the new clinician', (
            <textarea id="ct-handoverNotes" value={form.handoverNotes} onChange={(e) => set('handoverNotes', e.target.value)} />
          ))}

          {field('toId', `Who should take over? *`, (
            <div className="ct-pick">
              {isDoctor && !form.neededSpecialty ? <span className="ct-meta">Choose the specialty first to see matching doctors.</span> : null}
              {loadingSuggestions ? <span className="ct-meta">Finding the best matches…</span> : null}
              {!loadingSuggestions && groups.best.length > 0 && <div className="ct-pick-group">Best matches</div>}
              {groups.best.map(option)}
              {!loadingSuggestions && groups.close.length > 0 && <div className="ct-pick-group">Close matches</div>}
              {groups.close.map(option)}
              {!loadingSuggestions && groups.best.length + groups.close.length === 0 && groups.other.length > 0 && (
                <><div className="ct-pick-group">Other available clinicians</div>{groups.other.map(option)}</>
              )}
              {!loadingSuggestions && suggestions.length === 0 && (!isDoctor || form.neededSpecialty)
                ? <span className="ct-meta">No available clinician matches yet. Try another specialty or kind of therapy.</span> : null}
            </div>
          ))}

          {serverError ? <div className="ct-error">{serverError}</div> : null}

          <div className="ct-actions">
            <button type="submit" className="ct-btn primary" disabled={sending}>{sending ? 'Sending…' : 'Send for patient consent'}</button>
            <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
