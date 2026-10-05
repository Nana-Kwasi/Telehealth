import React, { useState, useEffect } from 'react';
import { ClipboardList, Sparkles, Loader, Check, Eye } from 'lucide-react';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Write a care plan: the clinician's instructions in, a structured plan out,
 * and nothing reaches the patient until the clinician approves it.
 *
 * The draft endpoint organises what the clinician wrote — it adds no dose, no
 * duration and no caution of its own — and this screen makes the approval step
 * a deliberate act rather than a checkbox on a save. Saving without approving
 * keeps the plan as a draft the patient cannot see, and the server enforces
 * that regardless of what this sends.
 */
export default function CarePlanComposer({ role = 'DOCTOR' }) {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState('');
  const [proposed, setProposed] = useState(null);   // what the model returned, for edit detection
  const [auditId, setAuditId] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [topic, setTopic] = useState('');
  const [explainNote, setExplainNote] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const me = getStoredUserId();
        if (role === 'THERAPIST') {
          const rows = await api(`/api/v1/therapy-management/assignments?therapistId=${me}`);
          const list = (Array.isArray(rows) ? rows : [])
            .filter((a) => String(a.status || 'active').toLowerCase() === 'active');
          setPatients(dedupe(list.map((a) => ({
            id: a.clientId, name: a.clientName || a.clientEmail || 'Client',
          }))));
          return;
        }
        // Appointments, not the roster: doctor_patient_roster_v2 is empty in
        // practice, and appointments is also what the server authorises a draft
        // against — so the list can only offer patients the draft will accept.
        const appts = await api(`/api/v1/medical/appointments/doctor/${me}`);
        setPatients(dedupe((Array.isArray(appts) ? appts : []).map((a) => ({
          id: a.patientId, name: a.patientName || a.patient_name || 'Patient',
        }))));
      } catch {
        setPatients([]);
      }
    })();
  }, [role]);

  const draft = async () => {
    if (!instructions.trim()) { setError('Write what the patient should do first.'); return; }
    setBusy('Organising…'); setError(''); setSaved('');
    try {
      const res = await api('/api/v1/care-plans/draft', {
        method: 'POST',
        body: { patientId: patientId || null, instructions },
      });
      if (!res?.ok) { setError(res?.message || 'The plan could not be prepared.'); return; }
      setPlan(res.plan);
      setProposed(JSON.stringify(res.plan));
      setSummary(res.plan.patientSummary || '');
      setAuditId(res.aiAuditId || null);
    } catch (e) {
      setError(e?.message || 'The plan could not be prepared.');
    } finally {
      setBusy('');
    }
  };

  /**
   * Plainer wording for the patient. Either restates the summary (the clinician
   * stays the author) or adds an explanation of a topic — which the server only
   * writes from the clinic's approved material, and refuses otherwise rather
   * than improvising. The result lands in the editable box, never straight to
   * the patient.
   */
  const explain = async (mode) => {
    const body = mode === 'topic'
      ? { topic: topic.trim(), patientId: patientId || null }
      : { clinicianText: summary, patientId: patientId || null };
    if (mode === 'topic' ? !body.topic : !summary.trim()) return;
    setBusy(mode === 'topic' ? 'Explaining…' : 'Simplifying…'); setExplainNote('');
    try {
      const res = await api('/api/v1/care-plans/explain', { method: 'POST', body });
      if (!res?.ok) { setExplainNote(res?.message || 'That could not be done right now.'); return; }
      if (mode === 'topic') {
        setSummary((s) => `${s.trim()}\n\nAbout ${body.topic}: ${res.text}`.trim());
        setTopic('');
      } else {
        setSummary(res.text);
      }
      setExplainNote('Updated — read it through before approving.');
    } catch (e) {
      setExplainNote(e?.message || 'That could not be done right now.');
    } finally {
      setBusy('');
    }
  };

  const save = async (approve) => {
    if (!patientId) { setError('Choose the patient this plan is for.'); return; }
    setBusy(approve ? 'Approving…' : 'Saving…'); setError(''); setSaved('');
    try {
      const current = { ...(plan || {}), patientSummary: summary };
      const res = await api('/api/v1/care-plans', {
        method: 'POST',
        body: {
          patientId,
          instructions,
          planJson: JSON.stringify(current),
          patientSummary: summary,
          visibleToPatient: approve,
          approve,
          aiAssisted: Boolean(auditId),
          aiAuditId: auditId,
          // Edited when what is being saved differs from what was proposed.
          aiEdited: auditId ? JSON.stringify(current) !== proposed : null,
        },
      });
      setSaved(res.status === 'active'
        ? 'Approved. The patient can now see their plan.'
        : 'Saved as a draft. The patient cannot see it yet.');
    } catch (e) {
      setError(e?.message || 'That could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const setItem = (key, idx, field, value) => {
    setPlan((p) => {
      const next = { ...p };
      const list = [...(next[key] || [])];
      list[idx] = { ...list[idx], [field]: value };
      next[key] = list;
      return next;
    });
  };

  const setLine = (key, idx, value) => {
    setPlan((p) => {
      const next = { ...p };
      const list = [...(next[key] || [])];
      list[idx] = value;
      next[key] = list;
      return next;
    });
  };

  return (
    <div style={S.page}>
      <header style={S.head}>
        <span style={S.icon}><ClipboardList size={20} /></span>
        <div>
          <h1 style={S.h1}>Care plan</h1>
          <p style={S.lead}>
            Write what the patient should do and this organises it. Nothing
            reaches them until you approve it.
          </p>
        </div>
      </header>

      <section style={S.card}>
        <label style={S.label}>Patient</label>
        <select style={S.input} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          <option value="">Choose a patient…</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label style={{ ...S.label, marginTop: '0.9rem' }}>Your instructions</label>
        <textarea
          style={{ ...S.input, ...S.textarea }}
          rows={5}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Amlodipine 5mg once daily in the morning. Thirty minutes walking, five days a week. Check BP at home twice weekly. Repeat kidney function before the next visit. Review in four weeks."
        />
        <p style={S.hint}>
          Only what you write here is used. Anything you leave out — a dose, a
          frequency, a date — is left out of the plan rather than filled in.
        </p>

        <button
          type="button"
          style={{ ...S.primary, ...(busy || !instructions.trim() ? S.off : null) }}
          onClick={draft}
          disabled={!!busy || !instructions.trim()}
        >
          {busy === 'Organising…' ? <Loader size={15} /> : <Sparkles size={15} />}
          {busy === 'Organising…' ? 'Organising…' : 'Organise into a plan'}
        </button>
      </section>

      {error ? <p style={S.error}>{error}</p> : null}
      {saved ? <p style={S.saved}>{saved}</p> : null}

      {plan ? (
        <>
          <section style={S.card}>
            <h2 style={S.h2}>The plan</h2>

            <Group title="Medications">
              {(plan.medications || []).map((m, i) => (
                <div key={i} style={S.row3}>
                  <input style={S.input} value={m.what || ''} placeholder="what"
                    onChange={(e) => setItem('medications', i, 'what', e.target.value)} />
                  <input style={S.input} value={m.when || ''} placeholder="when"
                    onChange={(e) => setItem('medications', i, 'when', e.target.value)} />
                  <input style={S.input} value={m.notes || ''} placeholder="notes"
                    onChange={(e) => setItem('medications', i, 'notes', e.target.value)} />
                </div>
              ))}
            </Group>

            <Group title="Activities">
              {(plan.activities || []).map((a, i) => (
                <div key={i} style={S.row2}>
                  <input style={S.input} value={a.what || ''} placeholder="what"
                    onChange={(e) => setItem('activities', i, 'what', e.target.value)} />
                  <input style={S.input} value={a.when || ''} placeholder="when"
                    onChange={(e) => setItem('activities', i, 'when', e.target.value)} />
                </div>
              ))}
            </Group>

            <Group title="To monitor">
              {(plan.monitoring || []).map((t, i) => (
                <input key={i} style={{ ...S.input, marginBottom: '0.4rem' }} value={t}
                  onChange={(e) => setLine('monitoring', i, e.target.value)} />
              ))}
            </Group>

            <Group title="Tests">
              {(plan.tests || []).map((t, i) => (
                <input key={i} style={{ ...S.input, marginBottom: '0.4rem' }} value={t}
                  onChange={(e) => setLine('tests', i, e.target.value)} />
              ))}
            </Group>

            <label style={S.label}>Follow-up</label>
            <input style={S.input} value={plan.followUp || ''}
              onChange={(e) => setPlan((p) => ({ ...p, followUp: e.target.value }))} />
          </section>

          <section style={S.card}>
            <h2 style={S.h2}><Eye size={15} style={{ verticalAlign: '-2px' }} /> What the patient will read</h2>
            <textarea
              style={{ ...S.input, ...S.textarea }}
              rows={5}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <p style={S.hint}>
              This is the only part the patient sees. Read it as they will.
            </p>

            <div style={S.explainRow}>
              <button type="button" style={{ ...S.ghost, marginTop: 0, ...(busy ? S.off : null) }}
                onClick={() => explain('restate')} disabled={!!busy || !summary.trim()}>
                Plainer words
              </button>
              <input style={{ ...S.input, flex: 1, minWidth: 160 }} value={topic}
                placeholder="Explain a topic, e.g. hypertension"
                onChange={(e) => setTopic(e.target.value)} />
              <button type="button" style={{ ...S.ghost, marginTop: 0, ...(busy ? S.off : null) }}
                onClick={() => explain('topic')} disabled={!!busy || !topic.trim()}>
                Add explanation
              </button>
            </div>
            {explainNote ? <p style={S.hint}>{explainNote}</p> : null}

            <div style={S.actions}>
              <button type="button" style={{ ...S.ghost, ...(busy ? S.off : null) }}
                onClick={() => save(false)} disabled={!!busy}>
                Save as draft
              </button>
              <button type="button" style={{ ...S.primary, ...(busy ? S.off : null) }}
                onClick={() => save(true)} disabled={!!busy}>
                <Check size={15} /> Approve and share with patient
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Group({ title, children }) {
  const list = React.Children.toArray(children);
  if (!list.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={S.label}>{title}</label>
      {children}
    </div>
  );
}

/** One entry per person: a patient with six appointments is still one patient. */
function dedupe(list) {
  const seen = new Map();
  for (const p of list) {
    if (p.id && !seen.has(p.id)) seen.set(p.id, p);
  }
  return [...seen.values()];
}

const S = {
  page: { padding: '1.5rem', maxWidth: 820, margin: '0 auto' },
  head: { display: 'flex', gap: '0.85rem', alignItems: 'flex-start', marginBottom: '1.25rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, flexShrink: 0, borderRadius: 14,
    background: '#eef2ff', color: '#2a3ea8',
  },
  h1: { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#15173a' },
  h2: { margin: '0 0 0.9rem', fontSize: '1rem', fontWeight: 800, color: '#15173a' },
  lead: { margin: '0.2rem 0 0', fontSize: '0.87rem', lineHeight: 1.55, color: '#565c6e' },

  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 18,
    padding: '1.1rem 1.2rem', marginBottom: '1rem',
  },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: 750, color: '#3d4257', marginBottom: '0.35rem' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem',
    border: '1px solid #d8dce6', borderRadius: 9, fontSize: '0.85rem',
    fontFamily: 'inherit', color: '#2c3040', background: '#ffffff',
  },
  textarea: { lineHeight: 1.55, resize: 'vertical' },
  hint: { margin: '0.4rem 0 0', fontSize: '0.76rem', lineHeight: 1.5, color: '#565c6e' },

  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' },

  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.9rem', flexWrap: 'wrap' },
  explainRow: { display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap', alignItems: 'center' },
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
    marginTop: '0.8rem', padding: '0.6rem 1rem', borderRadius: 999,
    border: 'none', background: '#2b5ce6', color: '#ffffff',
    fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  ghost: {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
    marginTop: '0.8rem', padding: '0.6rem 1rem', borderRadius: 999,
    border: '1px solid #d8dce6', background: '#ffffff', color: '#2c3040',
    fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  off: { opacity: 0.5, cursor: 'not-allowed' },

  error: { fontSize: '0.84rem', color: '#8f1d17', margin: '0 0 0.8rem' },
  saved: { fontSize: '0.84rem', color: '#12602f', margin: '0 0 0.8rem', fontWeight: 650 },
};
