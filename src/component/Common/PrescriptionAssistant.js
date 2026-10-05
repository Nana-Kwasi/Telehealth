import React, { useState, useEffect, useRef } from 'react';
import { Pill, ShieldAlert, Plus, Loader, BookOpen } from 'lucide-react';
import { api } from '../../services/apiClient';

/**
 * Inside the doctor's prescription form: draft orders from plain instructions,
 * and check whatever is in the form against the pharmacist's formulary.
 *
 * The checks are the formulary's, not a model's: interactions (including with
 * the patient's CURRENT medicines), duplicates, and recorded allergies. A drug
 * the formulary does not know is shown as "not checked", and an unreviewed
 * starter rule says so. The doctor decides; nothing here saves a prescription.
 */
const SEVERITY = {
  contraindicated: { bg: '#fdeceb', border: '#f3c7c3', text: '#8f1d17', label: 'Do not combine' },
  major:           { bg: '#fff1e6', border: '#f6d3b5', text: '#8a3b09', label: 'Major' },
  moderate:        { bg: '#fff8e6', border: '#f6e6bd', text: '#7a5b06', label: 'Moderate' },
};

export default function PrescriptionAssistant({ patientId, medications = [], allergies = [], onAddOrders }) {
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState(null);
  const timer = useRef(null);

  const names = medications.map((m) => [m.name, m.strength].filter(Boolean).join(' ').trim()).filter(Boolean);
  const key = `${patientId}|${names.join('|')}`;

  // Re-check the form's medicines as they change, debounced.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!names.length) { setChecks(null); return undefined; }
    timer.current = setTimeout(async () => {
      const res = await api('/api/v1/ai/prescriptions/check', {
        method: 'POST', body: { patientId: patientId || null, medications: names, allergies },
      }).catch(() => null);
      setChecks(res);
    }, 600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const assist = async () => {
    setBusy(true); setError(''); setDraft(null);
    try {
      const res = await api('/api/v1/ai/prescriptions/assist', {
        method: 'POST', body: { patientId: patientId || null, instructions, allergies },
      });
      if (!res?.ok) { setError(res?.message || 'The orders could not be prepared.'); return; }
      setDraft(res);
    } catch (e) { setError(e?.message || 'The orders could not be prepared.'); } finally { setBusy(false); }
  };

  const add = () => {
    onAddOrders?.(draft.orders, draft.patientInstructions);
    setDraft(null); setInstructions('');
  };

  return (
    <div style={S.box}>
      <div style={S.head}><Pill size={15} /> <b>Prescription assistant</b>
        <span style={S.muted}> — drafts from your words; checks against the pharmacy formulary</span></div>
      {!patientId ? <p style={S.muted}>Choose the patient first so their current medicines and allergies are checked.</p> : null}
      <textarea rows={2} style={S.input} value={instructions} onChange={(e) => setInstructions(e.target.value)}
        placeholder="e.g. Amoxicillin 500mg 1 cap TDS x 5 days; paracetamol 1g QDS PRN" />
      <button type="button" style={{ ...S.btn, ...(busy || instructions.trim().length < 4 ? S.off : null) }}
        disabled={busy || instructions.trim().length < 4} onClick={assist}>
        {busy ? <Loader size={14} /> : <Plus size={14} />} {busy ? 'Drafting…' : 'Draft orders'}
      </button>
      {error ? <p style={S.err}>{error}</p> : null}

      {draft ? (
        <div style={S.draft}>
          {draft.orders.map((o, i) => (
            <div key={i} style={S.order}>
              <b>{o.name} {o.strength}</b> · {o.drugForm} · {o.dosage || '—'} · {o.frequency || '—'} · {o.direction}
              {o.duration ? ` · ${o.duration}` : ''}{o.specialInstructions ? ` · ${o.specialInstructions}` : ''}
            </div>
          ))}
          {draft.missing.length ? <div style={S.missing}>Not stated: {draft.missing.join('; ')}</div> : null}
          <Flags data={draft} />
          {draft.patientInstructions ? (
            <div style={S.patient}><b>For the patient:</b> {draft.patientInstructions}</div>
          ) : null}
          <div style={S.row}>
            <button type="button" style={S.btn} onClick={add}><Plus size={14} /> Add to this prescription</button>
            <button type="button" style={S.ghost} onClick={() => setDraft(null)}>Discard</button>
          </div>
          <p style={S.muted}>{draft.note}</p>
        </div>
      ) : null}

      {checks && !draft ? <Flags data={checks} live /> : null}
    </div>
  );
}

function Flags({ data, live }) {
  const flags = data.flags || [];
  return (
    <div style={{ marginTop: '0.5rem' }}>
      {live ? <div style={S.sub}><ShieldAlert size={13} /> Formulary check of this prescription
        {data.currentMedicines?.length ? ` (current medicines: ${data.currentMedicines.join(', ')})` : ''}</div> : null}
      {data.allergyWarning ? <div style={{ ...S.flag, ...tone('moderate') }}>⚠ {data.allergyWarning}</div> : null}
      {flags.map((f, i) => (
        <div key={i} style={{ ...S.flag, ...tone(f.severity) }}>
          <b>{SEVERITY[f.severity]?.label || f.severity}:</b> {f.message}
          {f.advice ? <div>{f.advice}</div> : null}
          {f.source ? <div style={S.source}>{f.source}</div> : null}
        </div>
      ))}
      {data.notChecked?.length ? (
        <div style={S.notChecked}>Not checked — not in the formulary: {data.notChecked.join(', ')}</div>
      ) : null}
      {live && !flags.length && !data.notChecked?.length && !data.allergyWarning
        ? <div style={S.sub}>No interactions, duplicates or allergy conflicts found in the formulary.</div> : null}
      {(data.reference || []).map((r) => (
        <div key={r.drug} style={S.ref}><BookOpen size={12} /> <b>{r.drug}</b> (pharmacist reference{r.reviewed ? '' : ', unreviewed'}): {r.text}</div>
      ))}
    </div>
  );
}

function tone(sev) {
  const t = SEVERITY[sev] || SEVERITY.moderate;
  return { background: t.bg, borderColor: t.border, color: t.text };
}

const S = {
  box: { border: '1.5px solid #dbe2fb', background: '#f7f9ff', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' },
  head: { display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.88rem', color: '#1e3a8a', marginBottom: '0.5rem', flexWrap: 'wrap' },
  muted: { fontSize: '0.76rem', color: '#64748b', margin: '0.3rem 0 0' },
  sub: { display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: '#475569', fontWeight: 600, margin: '0.3rem 0' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', fontFamily: 'inherit' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem', padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: '#1e6bb8', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  ghost: { marginTop: '0.5rem', padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' },
  off: { opacity: 0.5, cursor: 'not-allowed' },
  err: { color: '#991b1b', fontSize: '0.8rem' },
  draft: { marginTop: '0.6rem', borderTop: '1px solid #dbe2fb', paddingTop: '0.6rem' },
  order: { fontSize: '0.82rem', color: '#0f172a', padding: '0.2rem 0' },
  missing: { fontSize: '0.78rem', color: '#7a5b06', margin: '0.35rem 0' },
  patient: { fontSize: '0.8rem', color: '#334155', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.5rem 0.65rem', marginTop: '0.4rem', whiteSpace: 'pre-wrap' },
  row: { display: 'flex', gap: '0.5rem' },
  flag: { fontSize: '0.8rem', border: '1px solid', borderRadius: 8, padding: '0.45rem 0.65rem', marginTop: '0.35rem' },
  source: { fontSize: '0.72rem', opacity: 0.85, marginTop: '0.15rem' },
  notChecked: { fontSize: '0.8rem', color: '#475569', background: '#f1f5f9', borderRadius: 8, padding: '0.45rem 0.65rem', marginTop: '0.35rem' },
  ref: { display: 'flex', gap: '0.3rem', alignItems: 'baseline', fontSize: '0.78rem', color: '#334155', marginTop: '0.3rem' },
};
