import React, { useState, useEffect } from 'react';
import { FileSignature, Sparkles, Printer, FolderInput, Loader } from 'lucide-react';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Letters, medical certificates, discharge instructions and appointment
 * summaries — drafted from what the clinician writes, never beyond it.
 *
 * The draft lands in an editable box. Anything the clinician did not supply is
 * left as a [BRACKETED] placeholder rather than invented, and the server will
 * not file a document that still has one. Printing and filing are the
 * clinician's acts; nothing is sent to the patient from here.
 */
const KINDS = [
  { kind: 'letter', title: 'Letter', hint: 'Who it is to and what it should say, e.g. “To the employer: confirm weekly sessions on Tuesdays…”' },
  { kind: 'medical_certificate', title: 'Medical certificate', hint: 'The dates they are unfit and the reason you want stated.' },
  { kind: 'discharge_instructions', title: 'Discharge instructions', hint: 'What to do at home, medicines as prescribed, warning signs, follow-up.' },
  { kind: 'appointment_summary', title: 'Appointment summary', hint: 'What was discussed and agreed in the appointment.' },
];

export default function AdminDocComposer({ role = 'DOCTOR' }) {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [kind, setKind] = useState('letter');
  const [details, setDetails] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      const me = getStoredUserId();
      const rows = role === 'DOCTOR'
        ? await api('/api/v1/doctors/me/patients').catch(() => [])
        : await api('/api/v1/therapy-management/clients').catch(() => []);
      const list = (Array.isArray(rows) ? rows : [])
        .filter((p) => role === 'DOCTOR' || !p.therapistId || String(p.therapistId) === String(me));
      setPatients(list.map((p) => ({ id: p.id, name: p.fullName || p.name || p.email || 'Unnamed' })));
    })();
  }, [role]);

  const current = KINDS.find((k) => k.kind === kind);

  const draft = async () => {
    if (!patientId) { setNote('Choose a patient first.'); return; }
    if (!details.trim()) { setNote('Write the details first — the draft only uses what you write.'); return; }
    setBusy('draft'); setNote('');
    try {
      const res = await api('/api/v1/ai/admin-docs/draft', {
        method: 'POST', body: { kind, patientId, details },
      });
      if (!res?.ok) { setNote(res?.message || 'The draft could not be prepared.'); return; }
      setText(res.text);
      setNote(/\[[A-Za-z ]{3,}\]/.test(res.text)
        ? 'Fill in the [BRACKETED] parts — they were not in your details.'
        : 'Read it through and edit before printing or filing.');
    } catch (e) {
      setNote(e?.message || 'The draft could not be prepared.');
    } finally { setBusy(''); }
  };

  const fileIt = async () => {
    setBusy('file'); setNote('');
    try {
      const res = await api('/api/v1/ai/admin-docs/file', {
        method: 'POST', body: { kind, patientId, title: current.title, text },
      });
      setNote(res?.message || 'Filed.');
    } catch (e) {
      setNote(e?.message || 'That could not be filed.');
    } finally { setBusy(''); }
  };

  /** Print just the document, in a clean window. */
  const print = () => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return;
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    w.document.write(`<!doctype html><title>${current.title}</title>
      <body style="font:14px/1.6 Georgia,serif;padding:48px;white-space:pre-wrap;color:#111">${esc}</body>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div style={S.page}>
      <header style={S.head}>
        <span style={S.icon}><FileSignature size={20} /></span>
        <div>
          <h1 style={S.h1}>Documents</h1>
          <p style={S.lead}>
            Letters, certificates, discharge instructions and appointment summaries, drafted from your
            own details. Nothing is added that you did not write.
          </p>
        </div>
      </header>

      <section style={S.card}>
        <div style={S.kinds}>
          {KINDS.map((k) => (
            <button key={k.kind} type="button" onClick={() => setKind(k.kind)}
              style={{ ...S.kind, ...(kind === k.kind ? S.kindOn : null) }}>{k.title}</button>
          ))}
        </div>
        <label style={S.label}>Patient
          <select style={S.input} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Choose…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={S.label}>Your details
          <textarea rows={4} style={S.input} value={details} placeholder={current.hint}
            onChange={(e) => setDetails(e.target.value)} />
        </label>
        <button type="button" style={{ ...S.primary, ...(busy ? S.off : null) }} disabled={!!busy} onClick={draft}>
          {busy === 'draft' ? <Loader size={15} /> : <Sparkles size={15} />} Draft {current.title.toLowerCase()}
        </button>
      </section>

      {text ? (
        <section style={S.card}>
          <label style={S.label}>{current.title} — edit freely
            <textarea rows={14} style={{ ...S.input, fontFamily: 'Georgia, serif', lineHeight: 1.6 }}
              value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div style={S.actions}>
            <button type="button" style={S.ghost} onClick={print}><Printer size={15} /> Print</button>
            <button type="button" style={{ ...S.primary, marginTop: 0, ...(busy ? S.off : null) }}
              disabled={!!busy} onClick={fileIt}>
              <FolderInput size={15} /> File to patient's record
            </button>
          </div>
          <p style={S.hint}>AI-drafted from your details. You are the author — check every line.</p>
        </section>
      ) : null}
      {note ? <p style={S.note}>{note}</p> : null}
    </div>
  );
}

const S = {
  page: { padding: '1.5rem', maxWidth: 820, margin: '0 auto' },
  head: { display: 'flex', gap: '0.85rem', alignItems: 'flex-start', marginBottom: '1.25rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44,
    flexShrink: 0, borderRadius: 14, background: '#eef2ff', color: '#2a3ea8',
  },
  h1: { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#15173a' },
  lead: { margin: '0.2rem 0 0', fontSize: '0.87rem', lineHeight: 1.55, color: '#565c6e' },
  card: { background: '#fff', border: '1px solid #e4e7ee', borderRadius: 18, padding: '1.1rem 1.2rem', marginBottom: '1rem' },
  kinds: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' },
  kind: {
    padding: '0.4rem 0.8rem', borderRadius: 999, border: '1px solid #d8dce6', background: '#fff',
    fontSize: '0.8rem', fontWeight: 700, color: '#565c6e', cursor: 'pointer', fontFamily: 'inherit',
  },
  kindOn: { background: '#15173a', borderColor: '#15173a', color: '#fff' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 750, color: '#3d4257', marginTop: '0.6rem' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', border: '1px solid #d8dce6',
    borderRadius: 9, fontSize: '0.86rem', fontFamily: 'inherit', color: '#2c3040', background: '#fff', fontWeight: 400,
  },
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.8rem',
    padding: '0.6rem 1rem', borderRadius: 999, border: 'none', background: '#2b5ce6', color: '#fff',
    fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  ghost: {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.6rem 1rem', borderRadius: 999,
    border: '1px solid #d8dce6', background: '#fff', color: '#2c3040', fontSize: '0.84rem', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  off: { opacity: 0.5, cursor: 'not-allowed' },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' },
  hint: { margin: '0.6rem 0 0', fontSize: '0.76rem', color: '#565c6e' },
  note: { fontSize: '0.84rem', color: '#2c3040' },
};
