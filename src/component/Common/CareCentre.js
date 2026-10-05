import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/apiClient';

/**
 * Medication reminders and follow-up check-ins, for the person receiving care.
 *
 * Two deliberate choices:
 *
 *  1. Recording a MISSED dose is as easy as recording a taken one, and neither
 *     is styled as a failure. An adherence log people avoid because it scolds
 *     them is worse than no log.
 *
 *  2. Nothing here offers advice about a missed dose. What to do next is a
 *     prescribing decision, and the screen says so rather than guessing.
 */
export default function CareCentre({ userId }) {
  const [reminders, setReminders] = useState([]);
  const [doses, setDoses]         = useState([]);
  const [followups, setFollowups] = useState([]);
  const [scripts, setScripts]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [message, setMessage]     = useState('');
  const [adding, setAdding]       = useState(false);
  const [form, setForm]           = useState({ prescriptionId: '', times: ['08:00'] });
  const [answers, setAnswers]     = useState({});
  const [plans, setPlans]         = useState([]);
  const [urgent, setUrgent]       = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [r, d, f, p] = await Promise.all([
        api('/api/v1/care/reminders').catch(() => []),
        api('/api/v1/care/doses').catch(() => []),
        api('/api/v1/care/followups').catch(() => []),
        api('/api/v1/care/followup-plans').catch(() => []),
      ]);
      setPlans(Array.isArray(p) ? p : []);
      setReminders(Array.isArray(r) ? r : []);
      setDoses(Array.isArray(d) ? d : []);
      setFollowups(Array.isArray(f) ? f : []);
      if (userId) {
        const s = await api(`/api/v1/medical/prescriptions/patient/${userId}`).catch(() => []);
        setScripts(Array.isArray(s) ? s : (s?.items || []));
      }
    } catch (e) {
      setError(e.message || 'Could not load your care information.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const recordDose = async (id, status) => {
    setMessage(''); setError('');
    try {
      const res = await api(`/api/v1/care/doses/${id}`, { method: 'POST', body: { status } });
      setMessage(res.message);
      load();
    } catch (e) { setError(e.message || 'Could not record that.'); }
  };

  const answerFollowUp = async (id, weekly = false) => {
    const a = answers[id] || {};
    const scales = weekly ? WEEKLY_FIELDS.filter((w) => a[w.key] !== undefined) : [];
    if (!a.response && a.severity === undefined && !scales.length
        && a.sleepHours === undefined && !a.medication && !a.events) {
      setError(weekly ? 'Answer at least one question.' : 'Add a short answer or a rating.'); return;
    }
    setMessage(''); setError(''); setUrgent('');
    try {
      const body = weekly
        ? {
            response: a.response || null,
            answers: {
              ...Object.fromEntries(scales.map((w) => [w.key, a[w.key]])),
              ...(a.sleepHours !== undefined && a.sleepHours !== '' ? { sleepHours: Number(a.sleepHours) } : {}),
              ...(a.medication ? { medication: a.medication } : {}),
              ...(a.events ? { events: a.events } : {}),
            },
          }
        : { response: a.response || null, severity: a.severity ?? null };
      const res = await api(`/api/v1/care/followups/${id}`, { method: 'POST', body });
      // A safety concern is not a "thanks, sent" moment. It is shown as the
      // crisis guidance it is, and stays until they leave the page.
      if (res.escalated) setUrgent(res.message); else setMessage(res.message);
      load();
    } catch (e) { setError(e.message || 'Could not send that.'); }
  };

  const setAttendance = async (id, attending) => {
    setMessage(''); setError('');
    try {
      const res = await api(`/api/v1/care/followup-plans/${id}/attendance`, {
        method: 'POST', body: { attending },
      });
      setMessage(res.message);
      load();
    } catch (e) { setError(e.message || 'Could not send that.'); }
  };

  const createReminder = async () => {
    if (!form.prescriptionId) { setError('Choose a medication first.'); return; }
    setMessage(''); setError('');
    try {
      await api('/api/v1/care/reminders', {
        method: 'POST',
        body: { prescriptionId: form.prescriptionId, timesOfDay: form.times.filter(Boolean) },
      });
      setMessage('Reminder set.');
      setAdding(false);
      setForm({ prescriptionId: '', times: ['08:00'] });
      load();
    } catch (e) { setError(e.message || 'Could not set that reminder.'); }
  };

  const stopReminder = async (id) => {
    try { await api(`/api/v1/care/reminders/${id}`, { method: 'DELETE' }); setMessage('Reminder stopped.'); load(); }
    catch (e) { setError(e.message || 'Could not stop that reminder.'); }
  };

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading…</div>;

  return (
    <div style={{ padding: '1.5rem', maxWidth: 820 }}>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.35rem' }}>My care</h1>
      <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.9rem' }}>
        Medication reminders and check-ins from your care team.
      </p>

      {urgent ? (
        <div style={{ background: '#fff7ed', border: '2px solid #fdba74', borderRadius: 12,
                      padding: '1rem', marginBottom: '1rem', whiteSpace: 'pre-wrap',
                      color: '#7c2d12', fontSize: '0.9rem', lineHeight: 1.6 }}>{urgent}</div>
      ) : null}
      {error   ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      {/* ── Check-ins first: someone is waiting on these ── */}
      {followups.length ? (
        <section style={{ marginBottom: '1.75rem' }}>
          <h2 style={h2}>From your care team</h2>
          {followups.map((f) => {
            const a = answers[f.id] || {};
            if (f.kind === 'weekly_checkin') {
              return (
                <WeeklyCheckIn key={f.id} prompt={f.prompt} a={a}
                  set={(patch) => setAnswers({ ...answers, [f.id]: { ...a, ...patch } })}
                  send={() => answerFollowUp(f.id, true)} />
              );
            }
            return (
              <div key={f.id} style={{ ...card, borderLeft: '3px solid #1d4ed8', marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.6rem' }}>
                  {f.prompt}
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                  {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
                    <button key={n}
                      onClick={() => setAnswers({ ...answers, [f.id]: { ...a, severity: n } })}
                      title={`${n} out of 10`}
                      style={{
                        width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem',
                        border: a.severity === n ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                        background: a.severity === n ? '#dbeafe' : '#fff',
                        color: a.severity === n ? '#1e40af' : '#475569', fontWeight: 600,
                      }}>{n}</button>
                  ))}
                </div>
                <textarea rows={2} placeholder="Anything you'd like to add? (optional)"
                  value={a.response || ''}
                  onChange={(e) => setAnswers({ ...answers, [f.id]: { ...a, response: e.target.value } })}
                  style={input} />
                <button onClick={() => answerFollowUp(f.id)} style={{ ...primary, marginTop: '0.6rem' }}>
                  Send to my care team
                </button>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* ── Follow-ups your clinician planned ── */}
      {plans.length ? (
        <section style={{ marginBottom: '1.75rem' }}>
          <h2 style={h2}>Upcoming follow-ups</h2>
          {plans.map((p) => (
            <div key={p.id} style={{ ...card, marginBottom: '0.6rem', display: 'flex',
                                     justifyContent: 'space-between', alignItems: 'center',
                                     gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  {new Date(`${p.due_on}T00:00:00`).toLocaleDateString(undefined,
                    { weekday: 'short', day: 'numeric', month: 'short' })}
                  {p.clinician_name ? ` · ${p.clinician_name}` : ''}
                </div>
                {p.reason ? <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{p.reason}</div> : null}
              </div>
              {p.attending === null || p.attending === undefined ? (
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => setAttendance(p.id, true)} style={primary}>I'll be there</button>
                  <button onClick={() => setAttendance(p.id, false)} style={ghost}>I can't make it</button>
                </div>
              ) : (
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>
                  {p.attending ? 'Confirmed' : "You said you can't make it"}
                </span>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {/* ── Doses awaiting an answer ── */}
      {doses.filter((d) => d.status === 'pending').length ? (
        <section style={{ marginBottom: '1.75rem' }}>
          <h2 style={h2}>Did you take these?</h2>
          {doses.filter((d) => d.status === 'pending').map((d) => (
            <div key={d.id} style={{ ...card, marginBottom: '0.6rem', display: 'flex',
                                     justifyContent: 'space-between', alignItems: 'center',
                                     gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{d.medication} {d.dosage}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Due {new Date(d.due_at).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={() => recordDose(d.id, 'taken')} style={primary}>Taken</button>
                {/* Equal weight, on purpose. */}
                <button onClick={() => recordDose(d.id, 'missed')} style={ghost}>Missed</button>
                <button onClick={() => recordDose(d.id, 'skipped')} style={ghost}>Skipped</button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* ── Reminders ── */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={h2}>Medication reminders</h2>
          <button onClick={() => { setAdding(!adding); setError(''); }} style={ghost}>
            {adding ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {adding ? (
          <div style={{ ...card, marginBottom: '0.75rem' }}>
            <label style={label}>Which medication?</label>
            <select style={input} value={form.prescriptionId}
              onChange={(e) => setForm({ ...form, prescriptionId: e.target.value })}>
              <option value="">Choose from your prescriptions…</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>{s.medication} {s.dosage || ''}</option>
              ))}
            </select>
            {scripts.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: '#9a3412', marginTop: '0.4rem' }}>
                You have no prescriptions on record. Reminders are created from a prescription so
                they always match what you were actually prescribed.
              </div>
            ) : null}

            <label style={{ ...label, marginTop: '0.9rem' }}>What times of day?</label>
            {form.times.map((t, i) => (
              <input key={i} type="time" value={t} style={{ ...input, marginBottom: '0.4rem' }}
                onChange={(e) => {
                  const times = [...form.times]; times[i] = e.target.value;
                  setForm({ ...form, times });
                }} />
            ))}
            <button style={ghost} onClick={() => setForm({ ...form, times: [...form.times, '20:00'] })}>
              + Another time
            </button>
            <div>
              <button onClick={createReminder} style={{ ...primary, marginTop: '0.8rem' }}>
                Set reminder
              </button>
            </div>
          </div>
        ) : null}

        {reminders.filter((r) => r.active).length === 0 ? (
          <div style={{ ...card, color: '#64748b' }}>No reminders set.</div>
        ) : reminders.filter((r) => r.active).map((r) => (
          <div key={r.id} style={{ ...card, marginBottom: '0.6rem', display: 'flex',
                                   justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{r.medication} {r.dosage}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {String(r.times_of_day).replace(/[{}]/g, '').split(',').join(' · ')}
              </div>
            </div>
            <button onClick={() => stopReminder(r.id)} style={ghost}>Stop</button>
          </div>
        ))}
      </section>
    </div>
  );
}

/** The weekly questions. Each is optional: a partial answer is still an answer. */
const WEEKLY_FIELDS = [
  { key: 'mood',    label: 'Mood',    low: 'Very low', high: 'Very good' },
  { key: 'anxiety', label: 'Anxiety', low: 'None',     high: 'Severe' },
  { key: 'stress',  label: 'Stress',  low: 'None',     high: 'Severe' },
  { key: 'energy',  label: 'Energy',  low: 'Exhausted', high: 'Full of energy' },
];

function WeeklyCheckIn({ prompt, a, set, send }) {
  return (
    <div style={{ ...card, borderLeft: '3px solid #7c3aed', marginBottom: '0.75rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>{prompt}</div>
      <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.8rem' }}>
        Your weekly check-in. Answer what you like — every question is optional.
      </div>
      {WEEKLY_FIELDS.map((w) => (
        <div key={w.key} style={{ marginBottom: '0.7rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
            <strong>{w.label}</strong>
            <span style={{ color: '#64748b' }}>0 {w.low} · 10 {w.high}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
              <button key={n} onClick={() => set({ [w.key]: n })} title={`${n} out of 10`}
                style={{
                  width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem',
                  border: a[w.key] === n ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                  background: a[w.key] === n ? '#ede9fe' : '#fff',
                  color: a[w.key] === n ? '#5b21b6' : '#475569', fontWeight: 600,
                }}>{n}</button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
        <div>
          <label style={label}>Sleep (hours a night)</label>
          <input type="number" min="0" max="24" step="0.5" style={{ ...input, width: 110 }}
            value={a.sleepHours ?? ''} onChange={(e) => set({ sleepHours: e.target.value })} />
        </div>
        <div>
          <label style={label}>Medication this week</label>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {[['yes', 'Taken'], ['no', 'Missed some'], ['na', 'Not on any']].map(([v, t]) => (
              <button key={v} onClick={() => set({ medication: v })}
                style={{ ...ghost, padding: '0.45rem 0.75rem',
                         ...(a.medication === v ? { borderColor: '#7c3aed', background: '#ede9fe', color: '#5b21b6' } : null) }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label style={label}>Anything important happen this week?</label>
      <textarea rows={2} style={input} placeholder="Optional"
        value={a.events || ''} onChange={(e) => set({ events: e.target.value })} />
      <button onClick={send} style={{ ...primary, marginTop: '0.7rem', background: '#6d28d9' }}>
        Send to my therapist
      </button>
    </div>
  );
}

function Banner({ tone, children }) {
  const ok = tone === 'ok';
  return (
    <div style={{
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      color: ok ? '#166534' : '#991b1b',
      padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem',
    }}>{children}</div>
  );
}

const card    = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' };
const h2      = { fontSize: '1rem', margin: '0 0 0.7rem' };
const label   = { display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.3rem' };
const input   = { width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.87rem', boxSizing: 'border-box', fontFamily: 'inherit' };
const primary = { background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '0.5rem 1.1rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' };
const ghost   = { background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8,
                  padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' };
