import React, { useState, useEffect, useCallback } from 'react';
import { Inbox, AlertTriangle, Check, CalendarClock, X } from 'lucide-react';
import { api } from '../../services/apiClient';
import Paged from './Paged';

/**
 * What has come back and not been read yet, plus the follow-ups planned ahead.
 *
 * Safety flags sort first and are styled as what they are. A flag is set by the
 * server's pattern screen when the answer was written, and the clinician was
 * notified at that moment; if it is still unread after two hours the
 * administrators are told too. Marking it read here is what stops that.
 *
 * Follow-up plans run themselves once made: a reminder four days before, a
 * "will you be there?" the day before, and a check-in on the day whose answer
 * lands back in this queue.
 */
export default function CheckInReviewQueue({ people = [], nameOf = (p) => p.name }) {
  const [queue, setQueue]   = useState([]);
  const [plans, setPlans]   = useState([]);
  const [planFor, setPlanFor] = useState('');
  const [inDays, setInDays] = useState('14');
  const [reason, setReason] = useState('');
  const [note, setNote]     = useState('');

  const load = useCallback(async () => {
    const [q, p] = await Promise.all([
      api('/api/v1/care/review-queue').catch(() => ({ items: [] })),
      api('/api/v1/care/followup-plans').catch(() => []),
    ]);
    setQueue(q?.items || []);
    setPlans(Array.isArray(p) ? p : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    await api(`/api/v1/care/review-queue/${id}/reviewed`, { method: 'POST' }).catch(() => null);
    load();
  };

  const createPlan = async () => {
    if (!planFor) { setNote('Choose a patient first.'); return; }
    setNote('');
    try {
      const res = await api('/api/v1/care/followup-plans', {
        method: 'POST',
        body: { patientId: planFor, inDays: Number(inDays), reason: reason.trim() || null },
      });
      setNote(`Follow-up ${res.updated ? 'moved to' : 'planned for'} ${fmtDay(res.dueOn)}. Reminders are automatic.`);
      setPlanFor(''); setReason('');
      load();
    } catch (e) { setNote(e?.message || 'Could not plan that.'); }
  };

  const cancelPlan = async (id) => {
    await api(`/api/v1/care/followup-plans/${id}`, { method: 'DELETE' }).catch(() => null);
    load();
  };

  return (
    <>
      <section style={S.card} aria-label="Review queue">
        <header style={S.head}>
          <span style={S.icon}><Inbox size={17} /></span>
          <div>
            <h2 style={S.title}>To review{queue.length ? ` (${queue.length})` : ''}</h2>
            <p style={S.sub}>Answered check-ins you have not read yet. Safety flags come first.</p>
          </div>
        </header>
        {queue.length === 0 ? (
          <p style={S.empty}>Nothing waiting — you are up to date.</p>
        ) : <Paged items={queue}>{(queue) => queue.map((f) => (
          <div key={f.id} style={{ ...S.item, ...(f.escalated ? S.flagged : null) }}>
            <div style={S.itemTop}>
              {f.escalated ? (
                <span style={S.flag}><AlertTriangle size={13} /> Safety concern</span>
              ) : null}
              <strong style={S.who}>{f.patient_name || 'Patient'}</strong>
              <span style={S.kind}>{KIND[f.kind] || 'Check-in'}</span>
              <span style={S.when}>{fmtWhen(f.responded_at)}</span>
            </div>
            <p style={S.prompt}>{f.prompt}</p>
            <Answers raw={f.answers} />
            {f.severity != null ? <p style={S.line}><b>Rating:</b> {f.severity}/10</p> : null}
            {f.response ? <p style={S.response}>“{f.response}”</p> : null}
            <button type="button" style={S.read} onClick={() => markRead(f.id)}>
              <Check size={13} /> Mark as read
            </button>
          </div>
        ))}</Paged>}
      </section>

      <section style={S.card} aria-label="Follow-up plans">
        <header style={S.head}>
          <span style={S.icon}><CalendarClock size={17} /></span>
          <div>
            <h2 style={S.title}>Planned follow-ups</h2>
            <p style={S.sub}>
              Reminder 4 days before, confirmation the day before, and a check-in on the day — all automatic.
            </p>
          </div>
        </header>
        <div style={S.form}>
          <select style={S.input} value={planFor} onChange={(e) => setPlanFor(e.target.value)}>
            <option value="">Patient…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}
          </select>
          <select style={{ ...S.input, maxWidth: 140 }} value={inDays} onChange={(e) => setInDays(e.target.value)}>
            {['3', '7', '10', '14', '21', '28', '42', '90'].map((d) => <option key={d} value={d}>in {d} days</option>)}
          </select>
          <input style={S.input} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional), e.g. review blood pressure" />
          <button type="button" style={S.go} onClick={createPlan}>Plan follow-up</button>
        </div>
        {note ? <p style={S.sub}>{note}</p> : null}
        <Paged items={plans}>{(plans) => plans.map((p) => (
          <div key={p.id} style={S.planRow}>
            <strong style={S.who}>{p.patient_name}</strong>
            <span style={S.when}>{fmtDay(p.due_on)}</span>
            <span style={S.kind}>
              {p.attending === true ? 'Confirmed' : p.attending === false ? "Can't attend" : 'Not confirmed yet'}
            </span>
            {p.reason ? <span style={S.reason}>{p.reason}</span> : null}
            <button type="button" style={S.cancel} onClick={() => cancelPlan(p.id)} title="Cancel this follow-up">
              <X size={13} />
            </button>
          </div>
        ))}</Paged>
      </section>
    </>
  );
}

const KIND = {
  weekly_checkin: 'Weekly check-in',
  consult_followup: 'After consultation',
  checkin: 'Check-in',
};

const LABELS = { mood: 'Mood', anxiety: 'Anxiety', stress: 'Stress', energy: 'Energy' };
const MED = { yes: 'taken', no: 'missed some', na: 'not on any' };

/** The weekly answers as a compact line of figures, then their own words. */
function Answers({ raw }) {
  let a = null;
  try { a = raw ? JSON.parse(raw) : null; } catch { a = null; }
  if (!a) return null;
  const figures = Object.keys(LABELS).filter((k) => a[k] != null).map((k) => `${LABELS[k]} ${a[k]}/10`);
  if (a.sleepHours != null) figures.push(`Sleep ${a.sleepHours}h`);
  if (a.medication) figures.push(`Medication ${MED[a.medication] || a.medication}`);
  return (
    <>
      {figures.length ? <p style={S.line}>{figures.join(' · ')}</p> : null}
      {a.events ? <p style={S.response}>“{a.events}”</p> : null}
    </>
  );
}

function fmtWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDay(day) {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined,
    { weekday: 'short', day: 'numeric', month: 'short' });
}

const S = {
  card: {
    background: '#ffffff', border: '1px solid #e4e7ee', borderRadius: 16,
    padding: '1rem 1.1rem', marginBottom: '1rem',
  },
  head: { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', marginBottom: '0.6rem' },
  icon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
    flexShrink: 0, borderRadius: 10, background: '#eef2ff', color: '#2a3ea8',
  },
  title: { margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#15173a' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: '#565c6e' },
  empty: { margin: 0, fontSize: '0.84rem', color: '#565c6e' },

  item: { border: '1px solid #e9ebf1', background: '#f9fafc', borderRadius: 12, padding: '0.75rem 0.9rem', marginTop: '0.5rem' },
  flagged: { border: '2px solid #f3c7c3', background: '#fdf3f2' },
  itemTop: { display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' },
  flag: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.74rem', fontWeight: 800, color: '#8f1d17' },
  who: { fontSize: '0.86rem', color: '#15173a' },
  kind: { fontSize: '0.74rem', fontWeight: 650, color: '#565c6e' },
  when: { fontSize: '0.76rem', color: '#565c6e' },
  prompt: { margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#565c6e' },
  line: { margin: '0.3rem 0 0', fontSize: '0.83rem', color: '#2c3040' },
  response: { margin: '0.3rem 0 0', fontSize: '0.85rem', lineHeight: 1.55, color: '#2c3040', fontStyle: 'italic' },
  read: {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.55rem',
    padding: '0.35rem 0.7rem', borderRadius: 999, border: '1px solid #d8dce6', background: '#fff',
    fontSize: '0.75rem', fontWeight: 700, color: '#2c3040', cursor: 'pointer', fontFamily: 'inherit',
  },

  form: { display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.5rem' },
  input: {
    flex: 1, minWidth: 150, padding: '0.5rem 0.65rem', border: '1px solid #d8dce6', borderRadius: 9,
    fontSize: '0.84rem', fontFamily: 'inherit', color: '#2c3040', background: '#fff',
  },
  go: {
    padding: '0.5rem 0.95rem', borderRadius: 999, border: 'none', background: '#2b5ce6',
    color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  planRow: {
    display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
    padding: '0.5rem 0', borderTop: '1px solid #eef0f4',
  },
  reason: { flex: 1, minWidth: 120, fontSize: '0.78rem', color: '#565c6e' },
  cancel: {
    marginLeft: 'auto', display: 'inline-flex', padding: '0.3rem', borderRadius: 8,
    border: '1px solid #e4e7ee', background: '#fff', color: '#565c6e', cursor: 'pointer',
  },
};
