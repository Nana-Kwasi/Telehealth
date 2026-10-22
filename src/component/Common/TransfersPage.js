import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredUserId } from '../../services/apiClient';
import {
  TRANSFER_STATUS, cancelTransfer, decideTransfer, fmtWhen, getTransfer, listTransfers,
  redirectTransfer, timeLeft, transferSuggestions,
} from '../../services/careTransfers';
import './CareTransfers.css';

const OPEN = ['AWAITING_PATIENT_CONSENT', 'AWAITING_RECIPIENT', 'REJECTED_AWAITING_REASSIGN'];

const EVENT_LABELS = {
  REQUESTED: 'Transfer requested',
  CONSENT_REMINDER: 'Reminder sent to the patient',
  CONSENT_NO_ANSWER: 'Patient has not answered after two reminders',
  PATIENT_CONSENTED: 'Patient gave consent',
  PATIENT_DECLINED: 'Patient declined',
  ACCEPTED: 'Accepted by the receiving clinician',
  REJECTED: 'Declined by the receiving clinician',
  REDIRECTED: 'Sent to another clinician',
  TIMED_OUT: 'No answer within 24 hours',
  REASSIGN_TIMED_OUT: 'No new clinician chosen within 24 hours',
  AUTO_REASSIGNED: 'Reassigned automatically by NessaHub',
  COMPLETED: 'Transfer completed',
  APPOINTMENTS_MOVED: 'Upcoming appointments moved',
  SESSIONS_CANCELLED: 'Upcoming sessions cancelled',
  NO_MATCH: 'No suitable clinician available — NessaHub team alerted',
  CANCELLED: 'Cancelled',
};

/**
 * Transfers for a doctor or therapist (or, with admin, everyone's).
 *
 *   Needs your decision — requests sent to you that the patient consented to
 *   Sent               — your open transfers; choose again after a decline
 *   History            — finished transfers: who went where, and when
 */
export default function TransfersPage({ role = 'DOCTOR', admin = false }) {
  const me = getStoredUserId();
  const isDoctor = role === 'DOCTOR';
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState('incoming');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listTransfers(admin).then(setRows).catch((e) => { setRows([]); setError(e.message); });
  }, [admin]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const list = rows || [];
    if (admin) {
      return {
        incoming: list.filter((t) => OPEN.includes(t.status)),
        sent: [],
        history: list.filter((t) => !OPEN.includes(t.status)),
      };
    }
    return {
      incoming: list.filter((t) => t.status === 'AWAITING_RECIPIENT' && t.toClinicianId === me),
      sent: list.filter((t) => t.fromClinicianId === me && OPEN.includes(t.status)),
      history: list.filter((t) => !OPEN.includes(t.status) || (t.status !== 'AWAITING_RECIPIENT' && t.toClinicianId === me)),
    };
  }, [rows, me, admin]);

  useEffect(() => {
    if (rows && tab === 'incoming' && groups.incoming.length === 0 && groups.sent.length > 0) setTab('sent');
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = admin
    ? [['incoming', 'In progress'], ['history', 'History']]
    : [['incoming', 'Needs your decision'], ['sent', 'Sent'], ['history', 'History']];

  return (
    <div className="ct-page">
      <div className="ct-head">
        <h2>{admin ? 'Patient transfers' : 'Transfers'}</h2>
        <p>
          {admin
            ? 'Every transfer between clinicians, with consent and decisions.'
            : `Hand ${isDoctor ? 'patients' : 'clients'} over to another ${isDoctor ? 'doctor' : 'therapist'}, and answer requests sent to you. Requests not answered within 24 hours are reassigned automatically.`}
        </p>
      </div>
      <div className="ct-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ct-tab${tab === k ? ' is-active' : ''}`} onClick={() => setTab(k)}>
            {label}
            {k !== 'history' && groups[k].length > 0 ? <span className="ct-tab-count">{groups[k].length}</span> : null}
          </button>
        ))}
      </div>
      {error ? <div className="ct-error">{error}</div> : null}
      {rows === null ? <div className="ct-empty">Loading…</div> : (
        <div className="ct-list">
          {groups[tab].length === 0 ? <div className="ct-empty">{
            tab === 'incoming' ? (admin ? 'No transfers in progress.' : 'No transfer requests are waiting for you.')
              : tab === 'sent' ? 'You have no transfers in progress.' : 'No finished transfers yet.'
          }</div> : groups[tab].map((t) => (
            <TransferRow key={t.id} t={t} me={me} admin={admin} isDoctor={isDoctor}
              expanded={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function TransferRow({ t, me, admin, isDoctor, expanded, onToggle, onChanged }) {
  const status = TRANSFER_STATUS[t.status] || { label: t.status, tone: 'muted' };
  const iAmSender = t.fromClinicianId === me;
  const iAmRecipient = t.toClinicianId === me;
  const title = iAmRecipient && t.status !== 'COMPLETED'
    ? `${t.patientName} — from ${t.fromName}`
    : iAmSender || admin
      ? `${t.patientName} → ${t.toName || 'not yet chosen'}`
      : `${t.patientName} — from ${t.fromName}`;

  let line;
  if (t.status === 'COMPLETED') {
    line = iAmSender
      ? `Transferred to ${t.toName} on ${fmtWhen(t.completedAt)}${t.autoReassigned ? ' (reassigned automatically)' : ''}`
      : `Transferred to ${iAmRecipient ? 'you' : t.toName} from ${t.fromName} on ${fmtWhen(t.completedAt)}${t.autoReassigned ? ' (automatic match)' : ''}`;
  } else if (t.status === 'AWAITING_RECIPIENT') {
    line = `${iAmRecipient ? 'Your decision' : 'Decision'} due · ${timeLeft(t.deadlineAt)}`;
  } else if (t.status === 'REJECTED_AWAITING_REASSIGN') {
    line = `Choose another clinician · ${timeLeft(t.deadlineAt)}`;
  } else {
    line = `Requested ${fmtWhen(t.createdAt)}`;
  }

  return (
    <div className="ct-card">
      <div className="ct-card-row">
        <div>
          <h3>{title}</h3>
          <p className="ct-meta">{t.reasonLabel}{t.neededSpecialty ? ` · needs ${t.neededSpecialty}` : ''}{t.neededFormat ? ` · ${t.neededFormat} therapy` : ''}</p>
          <p className="ct-meta">{line}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {t.urgency === 'urgent' ? <span className="ct-badge urgent">Urgent</span> : null}
          <span className={`ct-badge ${status.tone}`}>{status.label}</span>
        </div>
      </div>
      <button type="button" className="ct-btn ghost" onClick={onToggle}>{expanded ? 'Hide details' : 'View details'}</button>
      {expanded ? <TransferDetail id={t.id} me={me} admin={admin} isDoctor={isDoctor} onChanged={onChanged} /> : null}
    </div>
  );
}

function TransferDetail({ id, me, admin, isDoctor, onChanged }) {
  const navigate = useNavigate();
  const [t, setT] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [choosing, setChoosing] = useState(false);
  const [options, setOptions] = useState([]);
  const [pick, setPick] = useState('');

  const load = useCallback(() => { getTransfer(id).then(setT).catch((e) => setMsg({ ok: '', err: e.message })); }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!choosing || !t) return;
    transferSuggestions({
      patientId: t.patientId,
      specialty: t.neededSpecialty || undefined,
      format: t.neededFormat || undefined,
      focus: t.neededFocus ? String(t.neededFocus).split(',').filter(Boolean) : [],
    }).then((rows) => {
      const excluded = new Set(String(t.triedClinicianIds || '').split(',').concat([t.toClinicianId]).filter(Boolean));
      setOptions(rows.filter((r) => !excluded.has(r.id)));
    }).catch(() => setOptions([]));
  }, [choosing, t]);

  if (!t) return <p className="ct-meta">{msg.err || 'Loading…'}</p>;

  const act = async (fn, okText) => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try { await fn(); setMsg({ ok: okText, err: '' }); load(); onChanged?.(); }
    catch (e) { setMsg({ ok: '', err: e.message || 'That did not work.' }); }
    finally { setBusy(false); }
  };

  const iAmRecipient = t.toClinicianId === me && t.status === 'AWAITING_RECIPIENT';
  const iAmSender = t.fromClinicianId === me;
  const section = (label, text) => (text ? <div className="ct-section"><h4>{label}</h4><p>{text}</p></div> : null);

  return (
    <div>
      {section('Reason', [t.reasonLabel, t.reasonDetails].filter(Boolean).join(' — '))}
      {section('Clinical summary', t.clinicalSummary)}
      {section('Current medications', t.currentMedications)}
      {section('Open issues and follow-ups', t.activeIssues)}
      {section('Handover notes', t.handoverNotes)}
      {t.aiAssisted ? <p className="ct-meta" style={{ marginTop: 6 }}>Summary drafted with AI and reviewed by {t.fromName}.</p> : null}
      {section('Patient consent', t.consentStatus === 'GIVEN'
        ? `Given ${fmtWhen(t.consentDecidedAt)}${t.consentPlatform ? ` on ${t.consentPlatform === 'web' ? 'the website' : t.consentPlatform === 'ios' ? 'the iPhone app' : 'the Android app'}` : ''}.`
        : t.consentStatus === 'DECLINED'
          ? `Declined ${fmtWhen(t.consentDecidedAt)}${t.consentDeclineReason ? ` — “${t.consentDeclineReason}”` : ''}.`
          : 'Waiting for the patient.')}
      {section('Receiving clinician’s note', t.recipientDecisionNote)}
      {t.events?.length ? (
        <div className="ct-section">
          <h4>Timeline</h4>
          <ul className="ct-timeline">
            {t.events.map((e, i) => (
              <li key={i}><time>{fmtWhen(e.created_at)}</time>{EVENT_LABELS[e.event] || e.event}{e.actor_name ? ` — ${e.actor_name}` : ''}{e.detail && !['REQUESTED'].includes(e.event) ? `: ${e.detail}` : ''}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {iAmRecipient ? (
        <div className="ct-section">
          <h4>Your decision</h4>
          <p className="ct-meta" style={{ marginBottom: 8 }}>
            The patient consented to you reading their record while you decide. Decide within {timeLeft(t.deadlineAt)}.
          </p>
          <button type="button" className="ct-btn" style={{ marginBottom: 10 }}
            onClick={() => navigate(isDoctor ? `/dashboard/patients/${t.patientId}` : `/dashboard/clients/${t.patientId}`)}>
            Open the patient's record
          </button>
          <div className="ct-field">
            <label htmlFor={`note-${t.id}`}>Note (required to decline)</label>
            <textarea id={`note-${t.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="ct-actions">
            <button type="button" className="ct-btn primary" disabled={busy} onClick={() => act(() => decideTransfer(t.id, true, note), 'Accepted — the patient is now in your care.')}>Accept patient</button>
            <button type="button" className="ct-btn danger" disabled={busy || !note.trim()} onClick={() => act(() => decideTransfer(t.id, false, note), 'Declined. The referring clinician has been told.')}>Decline</button>
          </div>
        </div>
      ) : null}

      {(iAmSender || admin) && ['AWAITING_PATIENT_CONSENT', 'AWAITING_RECIPIENT', 'REJECTED_AWAITING_REASSIGN'].includes(t.status) ? (
        <div className="ct-section">
          {iAmSender && ['AWAITING_RECIPIENT', 'REJECTED_AWAITING_REASSIGN'].includes(t.status) ? (
            choosing ? (
              <div className="ct-pick">
                <div className="ct-pick-group">Choose another {isDoctor ? 'doctor' : 'therapist'}</div>
                {options.length === 0 ? <span className="ct-meta">No other matching clinician is available right now.</span> : options.map((o) => (
                  <button type="button" key={o.id} className={`ct-option${pick === o.id ? ' is-on' : ''}`} onClick={() => setPick(o.id)}>
                    <div><strong>{isDoctor ? `Dr. ${o.name}` : o.name}</strong><span>{o.specialization || o.professionalType || ''}{o.reasons?.length ? ` · ${o.reasons.join(' · ')}` : ''}</span></div>
                    <span className="ct-score">{o.score}%</span>
                  </button>
                ))}
                <div className="ct-actions">
                  <button type="button" className="ct-btn primary" disabled={!pick || busy} onClick={() => act(() => redirectTransfer(t.id, pick), 'Sent. They have 24 hours to accept.')}>Send to this clinician</button>
                  <button type="button" className="ct-btn" onClick={() => setChoosing(false)}>Back</button>
                </div>
              </div>
            ) : (
              <div className="ct-actions">
                <button type="button" className="ct-btn primary" onClick={() => setChoosing(true)}>
                  {t.status === 'REJECTED_AWAITING_REASSIGN' ? 'Choose another clinician' : 'Send to someone else instead'}
                </button>
              </div>
            )
          ) : null}
          <div className="ct-actions">
            <button type="button" className="ct-btn danger" disabled={busy} onClick={() => act(() => cancelTransfer(t.id, 'Cancelled by the referring clinician'), 'Transfer cancelled.')}>Cancel transfer</button>
          </div>
        </div>
      ) : null}

      {msg.ok ? <div className="ct-ok" style={{ marginTop: 10 }}>{msg.ok}</div> : null}
      {msg.err ? <div className="ct-error" style={{ marginTop: 10 }}>{msg.err}</div> : null}
    </div>
  );
}
