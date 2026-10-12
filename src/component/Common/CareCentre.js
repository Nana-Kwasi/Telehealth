import React, { useState, useEffect, useCallback } from 'react';
import { HeartPulse, Pill, CheckCircle2, MessageSquare, Clock, CalendarDays, Bell, Plus, X, Check } from 'lucide-react';
import { api } from '../../services/apiClient';
import './CareCentre.css';

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
export default function CareCentre({ userId, variant = 'medical' }) {
  const variantClass = variant === 'therapy' ? 'cc-therapy' : 'cc-medical';
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

  const activeReminders = reminders.filter((r) => r.active);
  const pendingDoses = doses.filter((d) => d.status === 'pending');
  const todays = doses.filter((d) => sameDay(d.due_at));
  const takenToday = todays.filter((d) => d.status === 'taken').length;
  const timesOf = (r) => (Array.isArray(r.times_of_day) ? r.times_of_day
    : String(r.times_of_day || '').replace(/[{}]/g, '').split(',')).filter(Boolean);

  if (loading) {
    return (
      <div className={`cc-root ${variantClass}`}>
        <div className="cc-hero cc-skeleton" />
        <div className="cc-card cc-skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  return (
    <div className={`cc-root ${variantClass}`}>
      {/* ── Header: what today holds, at a glance ── */}
      <header className="cc-hero">
        <div className="cc-hero-text">
          <span className="cc-hero-icon"><HeartPulse size={22} /></span>
          <div>
            <h1>My Care</h1>
            <p>Medication reminders and check-ins from your care team.</p>
          </div>
        </div>
        <div className="cc-stats">
          <div className="cc-stat"><Pill size={16} /><strong>{activeReminders.length}</strong><span>Active reminders</span></div>
          <div className="cc-stat"><CheckCircle2 size={16} /><strong>{takenToday}/{todays.length}</strong><span>Doses taken today</span></div>
          <div className="cc-stat"><MessageSquare size={16} /><strong>{followups.length}</strong><span>Check-ins waiting</span></div>
        </div>
      </header>

      {urgent ? <div className="cc-urgent">{urgent}</div> : null}
      {error   ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      {/* ── Check-ins first: someone is waiting on these ── */}
      {followups.length ? (
        <Section icon={MessageSquare} title="From your care team" count={followups.length}>
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
              <div key={f.id} className="cc-item cc-item-accent">
                <div className="cc-item-title">{f.prompt}</div>
                <div className="cc-scale">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button key={n} type="button" title={`${n} out of 10`}
                      className={a.severity === n ? 'on' : ''}
                      onClick={() => setAnswers({ ...answers, [f.id]: { ...a, severity: n } })}>{n}</button>
                  ))}
                </div>
                <textarea rows={2} placeholder="Anything you'd like to add? (optional)" className="cc-input"
                  value={a.response || ''}
                  onChange={(e) => setAnswers({ ...answers, [f.id]: { ...a, response: e.target.value } })} />
                <button type="button" className="cc-btn cc-btn-primary" onClick={() => answerFollowUp(f.id)}>
                  Send to my care team
                </button>
              </div>
            );
          })}
        </Section>
      ) : null}

      {/* ── Doses awaiting an answer ── */}
      {pendingDoses.length ? (
        <Section icon={Clock} title="Did you take these?" count={pendingDoses.length}>
          {pendingDoses.map((d) => (
            <div key={d.id} className="cc-item cc-row">
              <span className="cc-time">{new Date(d.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <div className="cc-grow">
                <div className="cc-item-title">{d.medication} <span className="cc-muted">{d.dosage}</span></div>
                <div className="cc-sub">Due {new Date(d.due_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              </div>
              <div className="cc-actions">
                <button type="button" className="cc-btn cc-btn-primary" onClick={() => recordDose(d.id, 'taken')}><Check size={15} /> Taken</button>
                {/* Equal weight, on purpose. */}
                <button type="button" className="cc-btn" onClick={() => recordDose(d.id, 'missed')}>Missed</button>
                <button type="button" className="cc-btn" onClick={() => recordDose(d.id, 'skipped')}>Skipped</button>
              </div>
            </div>
          ))}
        </Section>
      ) : null}

      {/* ── Follow-ups your clinician planned ── */}
      {plans.length ? (
        <Section icon={CalendarDays} title="Upcoming follow-ups" count={plans.length}>
          {plans.map((p) => {
            const d = new Date(`${p.due_on}T00:00:00`);
            return (
              <div key={p.id} className="cc-item cc-row">
                <span className="cc-date">
                  <em>{d.toLocaleDateString(undefined, { month: 'short' })}</em>
                  <strong>{d.getDate()}</strong>
                </span>
                <div className="cc-grow">
                  <div className="cc-item-title">
                    {d.toLocaleDateString(undefined, { weekday: 'long' })}{p.clinician_name ? ` · ${p.clinician_name}` : ''}
                  </div>
                  {p.reason ? <div className="cc-sub">{p.reason}</div> : null}
                </div>
                {p.attending === null || p.attending === undefined ? (
                  <div className="cc-actions">
                    <button type="button" className="cc-btn cc-btn-primary" onClick={() => setAttendance(p.id, true)}>I'll be there</button>
                    <button type="button" className="cc-btn" onClick={() => setAttendance(p.id, false)}>I can't make it</button>
                  </div>
                ) : (
                  <span className={`cc-tag ${p.attending ? 'ok' : ''}`}>
                    {p.attending ? 'Confirmed' : "You can't make it"}
                  </span>
                )}
              </div>
            );
          })}
        </Section>
      ) : null}

      {/* ── Reminders ── */}
      <Section
        icon={Bell}
        title="Medication reminders"
        count={activeReminders.length}
        action={(
          <button type="button" className={`cc-btn ${adding ? '' : 'cc-btn-primary'}`} onClick={() => { setAdding(!adding); setError(''); }}>
            {adding ? 'Cancel' : <><Plus size={15} /> Add reminder</>}
          </button>
        )}
      >
        {adding ? (
          <div className="cc-item cc-form">
            <label className="cc-label">Which medication?</label>
            <select className="cc-input" value={form.prescriptionId}
              onChange={(e) => setForm({ ...form, prescriptionId: e.target.value })}>
              <option value="">Choose from your prescriptions…</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>{s.medication} {s.dosage || ''}</option>
              ))}
            </select>
            {scripts.length === 0 ? (
              <p className="cc-warn">
                You have no prescriptions on record. Reminders are created from a prescription so
                they always match what you were actually prescribed.
              </p>
            ) : null}

            <label className="cc-label">What times of day?</label>
            <div className="cc-times">
              {form.times.map((t, i) => (
                <span key={i} className="cc-time-input">
                  <Clock size={14} />
                  <input type="time" value={t}
                    onChange={(e) => {
                      const times = [...form.times]; times[i] = e.target.value;
                      setForm({ ...form, times });
                    }} />
                  {form.times.length > 1 ? (
                    <button type="button" aria-label="Remove this time"
                      onClick={() => setForm({ ...form, times: form.times.filter((_, j) => j !== i) })}><X size={13} /></button>
                  ) : null}
                </span>
              ))}
              <button type="button" className="cc-btn cc-btn-soft" onClick={() => setForm({ ...form, times: [...form.times, '20:00'] })}>
                <Plus size={14} /> Another time
              </button>
            </div>
            <button type="button" className="cc-btn cc-btn-primary cc-btn-wide" onClick={createReminder}>
              <Bell size={15} /> Set reminder
            </button>
            <p className="cc-sub">You'll get each reminder in the app and by email.</p>
          </div>
        ) : null}

        {activeReminders.length === 0 && !adding ? (
          <div className="cc-empty">
            <span><Pill size={26} /></span>
            <strong>No reminders yet</strong>
            <p>Set one from your prescriptions and we'll remind you at the times you choose.</p>
          </div>
        ) : (
          <div className="cc-grid">
            {activeReminders.map((r) => (
              <div key={r.id} className="cc-item cc-reminder">
                <div className="cc-row">
                  <span className="cc-pill-icon"><Pill size={18} /></span>
                  <div className="cc-grow">
                    <div className="cc-item-title">{r.medication}</div>
                    {r.dosage ? <div className="cc-sub">{r.dosage}</div> : null}
                  </div>
                </div>
                <div className="cc-chips">
                  {timesOf(r).map((t) => <span key={t} className="cc-chip"><Clock size={12} /> {t}</span>)}
                </div>
                <button type="button" className="cc-stop" onClick={() => stopReminder(r.id)}>Stop reminder</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function sameDay(iso) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function Section({ icon: Icon, title, count, action, children }) {
  return (
    <section className="cc-section">
      <div className="cc-section-head">
        <span className="cc-section-icon"><Icon size={17} /></span>
        <h2>{title}</h2>
        {count ? <span className="cc-count">{count}</span> : null}
        {action ? <div className="cc-section-action">{action}</div> : null}
      </div>
      {children}
    </section>
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
    <div className="cc-item cc-item-accent">
      <div className="cc-item-title">{prompt}</div>
      <p className="cc-sub" style={{ margin: '0.15rem 0 0.9rem' }}>
        Your weekly check-in. Answer what you like — every question is optional.
      </p>
      {WEEKLY_FIELDS.map((w) => (
        <div key={w.key} className="cc-weekly-row">
          <div className="cc-weekly-label">
            <strong>{w.label}</strong>
            <span>0 {w.low} · 10 {w.high}</span>
          </div>
          <div className="cc-scale">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button key={n} type="button" title={`${n} out of 10`} className={a[w.key] === n ? 'on' : ''}
                onClick={() => set({ [w.key]: n })}>{n}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="cc-weekly-extra">
        <div>
          <label className="cc-label">Sleep (hours a night)</label>
          <input type="number" min="0" max="24" step="0.5" className="cc-input" style={{ width: 120 }}
            value={a.sleepHours ?? ''} onChange={(e) => set({ sleepHours: e.target.value })} />
        </div>
        <div>
          <label className="cc-label">Medication this week</label>
          <div className="cc-actions">
            {[['yes', 'Taken'], ['no', 'Missed some'], ['na', 'Not on any']].map(([v, t]) => (
              <button key={v} type="button" className={`cc-btn ${a.medication === v ? 'cc-btn-on' : ''}`}
                onClick={() => set({ medication: v })}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      <label className="cc-label">Anything important happen this week?</label>
      <textarea rows={2} className="cc-input" placeholder="Optional"
        value={a.events || ''} onChange={(e) => set({ events: e.target.value })} />
      <button type="button" className="cc-btn cc-btn-primary" onClick={send}>Send to my therapist</button>
    </div>
  );
}

function Banner({ tone, children }) {
  return <div className={`cc-banner ${tone === 'ok' ? 'ok' : 'err'}`}>{children}</div>;
}
