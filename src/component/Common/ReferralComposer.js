import React, { useState, useEffect } from 'react';
import { Share2, Sparkles, Loader, Send } from 'lucide-react';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Prepare a referral: the clinician states who and why, and the packet the
 * receiving clinician needs is assembled from the record.
 *
 * The reason is required and is the clinician's own. Without it there is
 * nothing to select the record against, and the server refuses — deciding that
 * someone needs a specialist is not a thing to generate.
 */
export default function ReferralComposer({ role = 'DOCTOR' }) {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patientId: '', specialty: '', reason: '' });
  const [packet, setPacket] = useState(null);
  const [proposed, setProposed] = useState(null);
  const [auditId, setAuditId] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const assemble = async () => {
    setBusy('Assembling…'); setError(''); setDone('');
    try {
      const res = await api('/api/v1/care-plans/referrals/draft', {
        method: 'POST',
        body: { patientId: form.patientId || null, specialty: form.specialty, reason: form.reason },
      });
      if (!res?.ok) { setError(res?.message || 'The referral could not be assembled.'); return; }
      setPacket(res.packet);
      setProposed(JSON.stringify(res.packet));
      setAuditId(res.aiAuditId || null);
    } catch (e) {
      setError(e?.message || 'The referral could not be assembled.');
    } finally { setBusy(''); }
  };

  const save = async (submit) => {
    setBusy(submit ? 'Submitting…' : 'Saving…'); setError(''); setDone('');
    try {
      const res = await api('/api/v1/care-plans/referrals', {
        method: 'POST',
        body: {
          ...form,
          clinicalSummary: packet?.clinicalSummary || '',
          relevantHistory: packet?.relevantHistory || '',
          currentMedications: packet?.currentMedications || '',
          relevantResults: packet?.relevantResults || '',
          submit,
          aiAssisted: Boolean(auditId),
          aiAuditId: auditId,
          aiEdited: auditId ? JSON.stringify(packet) !== proposed : null,
        },
      });
      setDone(res.status === 'submitted' ? 'Referral submitted.' : 'Saved as a draft.');
    } catch (e) {
      setError(e?.message || 'That could not be saved.');
    } finally { setBusy(''); }
  };

  const field = (key, label, rows = 3) => (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={S.label}>{label}</label>
      <textarea
        style={{ ...S.input, ...S.textarea }}
        rows={rows}
        value={packet?.[key] || ''}
        onChange={(e) => setPacket((p) => ({ ...p, [key]: e.target.value }))}
        placeholder="Nothing on record — add anything the receiving clinician needs."
      />
    </div>
  );

  return (
    <div style={S.page}>
      <header style={S.head}>
        <span style={S.icon}><Share2 size={20} /></span>
        <div>
          <h1 style={S.h1}>Refer a patient</h1>
          <p style={S.lead}>
            You decide who and why. The packet the receiving clinician needs is
            gathered from the record and shown for you to check before it goes.
          </p>
        </div>
      </header>

      <section style={S.card}>
        <label style={S.label}>Patient</label>
        <select style={S.input} value={form.patientId} onChange={(e) => set('patientId', e.target.value)}>
          <option value="">Choose a patient…</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label style={{ ...S.label, marginTop: '0.9rem' }}>Refer to</label>
        <input style={S.input} value={form.specialty} placeholder="e.g. Cardiology"
          onChange={(e) => set('specialty', e.target.value)} />

        <label style={{ ...S.label, marginTop: '0.9rem' }}>Why are you referring?</label>
        <textarea style={{ ...S.input, ...S.textarea }} rows={3} value={form.reason}
          placeholder="e.g. Exertional chest discomfort with a family history of coronary disease; needs specialist assessment."
          onChange={(e) => set('reason', e.target.value)} />
        <p style={S.hint}>
          Required. The record is selected against this, so the packet contains
          what bears on your reason rather than everything on file.
        </p>

        <button type="button"
          style={{ ...S.primary, ...(busy || !form.patientId || !form.reason.trim() ? S.off : null) }}
          onClick={assemble}
          disabled={!!busy || !form.patientId || !form.reason.trim()}>
          {busy === 'Assembling…' ? <Loader size={15} /> : <Sparkles size={15} />}
          {busy === 'Assembling…' ? 'Assembling…' : 'Assemble the packet'}
        </button>
      </section>

      {error ? <p style={S.error}>{error}</p> : null}
      {done ? <p style={S.saved}>{done}</p> : null}

      {packet ? (
        <section style={S.card}>
          <h2 style={S.h2}>The packet</h2>
          {field('clinicalSummary', 'Clinical summary', 4)}
          {field('relevantHistory', 'Relevant history')}
          {field('currentMedications', 'Current medications', 2)}
          {field('relevantResults', 'Relevant results')}

          <div style={S.actions}>
            <button type="button" style={{ ...S.ghost, ...(busy ? S.off : null) }}
              onClick={() => save(false)} disabled={!!busy}>
              Save as draft
            </button>
            <button type="button" style={{ ...S.primary, ...(busy ? S.off : null) }}
              onClick={() => save(true)} disabled={!!busy}>
              <Send size={15} /> Submit referral
            </button>
          </div>
        </section>
      ) : null}
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
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' },
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
