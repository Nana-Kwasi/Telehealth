import React, { useState, useEffect } from 'react';
import { Share2, Sparkles, Loader, Send, Check, CheckCircle2, User, Stethoscope, ClipboardList, FileText, History, Pill, FlaskConical, Save, Mail, X, Inbox } from 'lucide-react';
import { api, getStoredUserId } from '../../services/apiClient';
import './ReferralComposer.css';
import Paged from './Paged';

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
  const [history, setHistory] = useState(null);
  const [received, setReceived] = useState(null);
  const [listTab, setListTab] = useState('sent');
  // Where it goes: a clinician on NessaHub, or an outside email address.
  const [sendMode, setSendMode] = useState('clinician');
  const [recipient, setRecipient] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    if (sendMode !== 'clinician' || recipient) return undefined;
    const t = setTimeout(() => {
      api(`/api/v1/care-plans/referrals/recipients?q=${encodeURIComponent(search.trim())}`)
        .then((d) => setMatches(Array.isArray(d) ? d : []))
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, sendMode, recipient]);

  const loadHistory = async () => {
    const [rows, inbox] = await Promise.all([
      api('/api/v1/care-plans/referrals').catch(() => []),
      api('/api/v1/care-plans/referrals/received').catch(() => []),
    ]);
    setHistory(Array.isArray(rows) ? rows : []);
    setReceived(Array.isArray(inbox) ? inbox : []);
  };
  useEffect(() => { loadHistory(); }, []);

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
      if (!res?.ok) { writeManually(res?.message); return; }
      setPacket(res.packet);
      setProposed(JSON.stringify(res.packet));
      setAuditId(res.aiAuditId || null);
    } catch (e) {
      writeManually(e?.message);
    } finally { setBusy(''); }
  };

  // "Write it directly" needs somewhere to write: open an empty packet so the
  // referral can still be checked, saved and sent without the assistant.
  const writeManually = (why) => {
    setError(`${why && !/write it directly/i.test(why) ? `${why} ` : ''}The packet could not be gathered automatically, so fill it in below and continue.`);
    setPacket((p) => p || { clinicalSummary: '', relevantHistory: '', currentMedications: '', relevantResults: '' });
    setProposed('');
    setAuditId(null);
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
          recipientId: sendMode === 'clinician' ? recipient?.id || null : null,
          recipientEmail: sendMode === 'email' ? recipientEmail.trim() || null : null,
          recipientName: sendMode === 'email' ? recipientName.trim() || null : null,
        },
      });
      const toWho = sendMode === 'clinician' ? recipient?.name : (recipientName.trim() || recipientEmail.trim());
      setDone(res.status === 'submitted' ? `Referral sent to ${toWho}. A copy is in your email.` : 'Saved as a draft.');
      loadHistory();
    } catch (e) {
      setError(e?.message || 'That could not be saved.');
    } finally { setBusy(''); }
  };

  const field = (key, label, Icon, rows = 3) => (
    <div className="rf-field">
      <label className="rf-label"><Icon size={14} /> {label}</label>
      <textarea
        className="rf-input"
        rows={rows}
        value={packet?.[key] || ''}
        onChange={(e) => setPacket((p) => ({ ...p, [key]: e.target.value }))}
        placeholder="Nothing on record — add anything the receiving clinician needs."
      />
    </div>
  );

  const nameOf = (id) => patients.find((p) => String(p.id) === String(id))?.name || 'Patient';
  const step = done ? 3 : packet ? 2 : 1;
  const ready = form.patientId && form.reason.trim();

  return (
    <div className={`rf-page ${role === 'THERAPIST' ? 'rf-therapy' : ''}`}>
      <header className="rf-hero">
        <span className="rf-hero-icon"><Share2 size={22} /></span>
        <div>
          <h1>Refer a patient</h1>
          <p>
            You decide who and why. The packet the receiving clinician needs is
            gathered from the record and shown for you to check before it goes.
          </p>
        </div>
      </header>

      <ol className="rf-steps" aria-label="Steps">
        {['Who and why', 'Check the packet', 'Save or submit'].map((t, i) => (
          <li key={t} className={step > i + 1 ? 'done' : step === i + 1 ? 'on' : ''}>
            <span>{step > i + 1 ? <Check size={13} /> : i + 1}</span>{t}
          </li>
        ))}
      </ol>

      <section className="rf-card">
        <div className="rf-grid">
          <div>
            <label className="rf-label"><User size={14} /> Patient</label>
            <select className="rf-input" value={form.patientId} onChange={(e) => set('patientId', e.target.value)}>
              <option value="">Choose a patient…</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="rf-label"><Stethoscope size={14} /> Refer to</label>
            <input className="rf-input" value={form.specialty} placeholder="e.g. Cardiology"
              onChange={(e) => set('specialty', e.target.value)} />
          </div>
        </div>
        <div className="rf-chips">
          {(role === 'THERAPIST' ? THERAPY_SPECIALTIES : MEDICAL_SPECIALTIES).map((sp) => (
            <button key={sp} type="button" className={form.specialty === sp ? 'on' : ''} onClick={() => set('specialty', sp)}>{sp}</button>
          ))}
        </div>

        <label className="rf-label"><ClipboardList size={14} /> Why are you referring?</label>
        <textarea className="rf-input" rows={3} value={form.reason}
          placeholder="e.g. Exertional chest discomfort with a family history of coronary disease; needs specialist assessment."
          onChange={(e) => set('reason', e.target.value)} />
        <p className="rf-hint">
          Required. The record is selected against this, so the packet contains
          what bears on your reason rather than everything on file.
        </p>

        <button type="button" className="rf-btn rf-btn-primary" onClick={assemble} disabled={!!busy || !ready}>
          {busy === 'Assembling…' ? <Loader size={15} className="rf-spin" /> : <Sparkles size={15} />}
          {busy === 'Assembling…' ? 'Assembling…' : packet ? 'Assemble again' : 'Assemble the packet'}
        </button>
      </section>

      {error ? <p className="rf-msg err">{error}</p> : null}
      {done ? <p className="rf-msg ok"><CheckCircle2 size={16} /> {done}</p> : null}

      {packet ? (
        <section className="rf-card">
          <div className="rf-card-head">
            <h2>The packet</h2>
            <span className="rf-badge">For {nameOf(form.patientId)}{form.specialty ? ` · ${form.specialty}` : ''}</span>
          </div>
          <p className="rf-hint" style={{ marginTop: 0 }}>Gathered from the record. Read it, and edit anything before it goes.</p>
          {field('clinicalSummary', 'Clinical summary', FileText, 4)}
          {field('relevantHistory', 'Relevant history', History)}
          {field('currentMedications', 'Current medications', Pill, 2)}
          {field('relevantResults', 'Relevant results', FlaskConical)}

          <div className="rf-sendto">
            <label className="rf-label" style={{ marginTop: 0 }}><Send size={14} /> Send to</label>
            <div className="rf-toggle" role="tablist">
              <button type="button" className={sendMode === 'clinician' ? 'on' : ''} onClick={() => setSendMode('clinician')}>
                <Stethoscope size={14} /> Clinician on NessaHub
              </button>
              <button type="button" className={sendMode === 'email' ? 'on' : ''} onClick={() => setSendMode('email')}>
                <Mail size={14} /> Email address
              </button>
            </div>
            {sendMode === 'clinician' ? (
              recipient ? (
                <div className="rf-picked">
                  <span className="rf-avatar">{(recipient.name || '?').charAt(0)}</span>
                  <div><strong>{recipient.name}</strong><small>{recipient.role === 'DOCTOR' ? 'Doctor' : 'Therapist'}</small></div>
                  <button type="button" onClick={() => { setRecipient(null); setSearch(''); }} aria-label="Change"><X size={15} /></button>
                </div>
              ) : (
                <>
                  <input className="rf-input" placeholder="Search doctors and therapists by name…" value={search}
                    onChange={(e) => setSearch(e.target.value)} />
                  <div className="rf-matches">
                    <Paged items={matches}>{(matches) => matches.map((m) => (
                      <button key={m.id} type="button" onClick={() => setRecipient(m)}>
                        <span className="rf-avatar">{(m.name || '?').charAt(0)}</span>
                        <span>{m.name}</span>
                        <small>{m.role === 'DOCTOR' ? 'Doctor' : 'Therapist'}</small>
                      </button>
                    ))}</Paged>
                    {matches.length === 0 ? <p className="rf-hint">No clinicians match that name.</p> : null}
                  </div>
                </>
              )
            ) : (
              <div className="rf-grid">
                <input className="rf-input" type="email" placeholder="specialist@hospital.com" value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)} />
                <input className="rf-input" placeholder="Their name (optional)" value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)} />
              </div>
            )}
            <p className="rf-hint">On submit, they get the full packet by email{sendMode === 'clinician' ? ' and in their NessaHub referrals' : ''}; you get a copy.</p>
          </div>

          <div className="rf-actions">
            <button type="button" className="rf-btn" onClick={() => save(false)} disabled={!!busy}>
              <Save size={15} /> Save as draft
            </button>
            <button type="button" className="rf-btn rf-btn-primary" onClick={() => save(true)}
              disabled={!!busy || (sendMode === 'clinician' ? !recipient : !recipientEmail.trim())}>
              <Send size={15} /> Submit referral
            </button>
          </div>
        </section>
      ) : null}

      <section className="rf-card">
        <div className="rf-card-head">
          <h2>Referrals</h2>
          <div className="rf-toggle rf-toggle-sm" role="tablist">
            <button type="button" className={listTab === 'sent' ? 'on' : ''} onClick={() => setListTab('sent')}>
              Sent{history?.length ? ` · ${history.length}` : ''}
            </button>
            <button type="button" className={listTab === 'received' ? 'on' : ''} onClick={() => setListTab('received')}>
              Received{received?.length ? ` · ${received.length}` : ''}
            </button>
          </div>
        </div>
        {(listTab === 'sent' ? history : received) === null ? <div className="rf-skeleton" /> : null}
        {(listTab === 'sent' ? history : received)?.length === 0 ? (
          <div className="rf-empty">
            <span><Share2 size={24} /></span>
            <strong>{listTab === 'sent' ? 'No referrals yet' : 'Nothing referred to you yet'}</strong>
            <p>{listTab === 'sent' ? 'Referrals you save or submit will be listed here.' : 'When a colleague refers a patient to you, it appears here.'}</p>
          </div>
        ) : null}
        {listTab === 'sent' ? (history || []).map((r) => (
          <div key={r.id} className="rf-row">
            <span className="rf-row-icon"><Share2 size={16} /></span>
            <div className="rf-row-body">
              <strong>{r.patient_name || nameOf(r.patient_id)}{r.specialty ? ` → ${r.specialty}` : ''}</strong>
              <span>{r.recipient_name || r.recipient_email ? `To ${r.recipient_name || r.recipient_email} · ` : ''}{r.reason}</span>
            </div>
            <div className="rf-row-meta">
              <span className={`rf-status ${r.status}`}>{r.status === 'submitted' ? 'Sent' : 'Draft'}</span>
              <small>{new Date(r.submitted_at || r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
            </div>
          </div>
        )) : (received || []).map((r) => (
          <details key={r.id} className="rf-received">
            <summary className="rf-row">
              <span className="rf-row-icon"><Inbox size={16} /></span>
              <div className="rf-row-body">
                <strong>{r.patient_name || 'Patient'}{r.specialty ? ` → ${r.specialty}` : ''}</strong>
                <span>From {r.referrer_name || 'a colleague'} · {r.reason}</span>
              </div>
              <div className="rf-row-meta">
                <small>{new Date(r.submitted_at || r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
              </div>
            </summary>
            <div className="rf-received-body">
              {[['Reason', r.reason], ['Clinical summary', r.clinical_summary], ['Relevant history', r.relevant_history],
                ['Current medications', r.current_medications], ['Relevant results', r.relevant_results]]
                .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><h4>{k}</h4><p>{v}</p></div>
                ))}
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}

const MEDICAL_SPECIALTIES = ['Cardiology', 'Dermatology', 'Endocrinology', 'Gastroenterology', 'Neurology', 'Orthopaedics', 'Psychiatry'];
const THERAPY_SPECIALTIES = ['Psychiatry', 'Psychology', 'Couples therapy', 'Addiction services', 'Family therapy', 'GP / primary care'];

/** One entry per person: a patient with six appointments is still one patient. */
function dedupe(list) {
  const seen = new Map();
  for (const p of list) {
    if (p.id && !seen.has(p.id)) seen.set(p.id, p);
  }
  return [...seen.values()];
}
