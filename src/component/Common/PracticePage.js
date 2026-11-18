import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_BASE } from '../../services/apiClient';
import { TemplatesPanel } from './Templates';
import './Measures.css';
import './PsychRecord.css';
import './Templates.css';

/*
 * Practice: the clinician's own scheduling rules.
 *  - Policies: cancellation notice and day-before text reminders
 *  - Time off: blocks bookings; can cancel sessions already booked and tell clients
 *  - Waitlist: clients wanting an earlier time, with "offer a slot" (or automatic offers)
 *  - Goals: sessions this week and earnings this month, against the clinician's targets
 *  - Calendar: a subscription link for Google, Outlook or Apple Calendar
 *  - Announcements: one message to many clients
 *  - Templates: the clinician's own note layouts and client forms
 */

const fmtTime = (d) => (d ? new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const toIso = (local) => (local ? new Date(local).toISOString() : '');

export default function PracticePage({ clientsPath = '/api/v1/therapy-management/clients' }) {
  return (
    <div className="ms-wrap" style={{ padding: '1.5rem', maxWidth: 900 }}>
      <h2 style={{ margin: 0 }}>Practice</h2>
      <p className="ms-muted" style={{ margin: 0 }}>Your goals, waitlist, time off, policies, calendar, announcements and templates.</p>
      <Goals />
      <Waitlist clientsPath={clientsPath} />
      <TimeOff />
      <Policies />
      <CalendarSync />
      <Announcements clientsPath={clientsPath} />
      <TemplatesPanel />
    </div>
  );
}

function Policies() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api('/api/v1/practice/settings').then(setS).catch((e) => setError(e?.message || 'Could not load.')); }, []);

  const save = async (patch) => {
    const next = { ...s, ...patch };
    setS(next); setSaved(''); setError('');
    try {
      setS(await api('/api/v1/practice/settings', { method: 'PUT', body: { cancelNoticeHours: next.cancelNoticeHours, smsReminders: next.smsReminders } }));
      setSaved('Saved.');
    } catch (e) { setError(e?.message || 'Could not save.'); }
  };
  const automate = async (patch) => {
    setS({ ...s, ...patch }); setSaved(''); setError('');
    try { setS(await api('/api/v1/practice/settings/automation', { method: 'PUT', body: patch })); setSaved('Saved.'); }
    catch (e) { setError(e?.message || 'Could not save.'); }
  };

  if (!s) return <div className="ms-card">{error || 'Loading…'}</div>;
  return (
    <div className="ms-card">
      <h3 className="ms-title">Session policies</h3>
      <label className="pr-label">Clients must cancel or move a session at least
        <select value={s.cancelNoticeHours ?? ''} onChange={(e) => save({ cancelNoticeHours: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ marginLeft: 8 }}>
          <option value="">NessaHub default{s.platformNoticeHours ? ` (${s.platformNoticeHours} hours)` : ''}</option>
          <option value="24">24 hours</option>
          <option value="48">48 hours</option>
          <option value="72">72 hours</option>
        </select>
        {' '}before it starts.
      </label>
      <p className="ms-muted pr-hint">You can ask for more notice than NessaHub's default, not less. Refunds still follow NessaHub's Refund and Cancellation Policy.</p>
      <label className="pr-check">
        <input type="checkbox" checked={!!s.smsReminders} onChange={(e) => save({ smsReminders: e.target.checked })} />
        Text clients a reminder the day before (to verified numbers; the text does not name you or the service)
      </label>
      <h4 className="tp-sub">Automatic help</h4>
      <label className="pr-check">
        <input type="checkbox" checked={!!s.autoOfferWaitlist} onChange={(e) => automate({ autoOfferWaitlist: e.target.checked })} />
        When a session is cancelled, offer the time to the person who has waited longest on my waitlist
      </label>
      <p className="ms-muted pr-hint">Not offered when the time is less than 3 hours away, inside your time off, or already booked again. One person per freed time.</p>
      <label className="pr-check">
        <input type="checkbox" checked={!!s.voiceReminders} onChange={(e) => automate({ voiceReminders: e.target.checked })} />
        Also phone clients with an automated reminder the day before
      </label>
      <p className="ms-muted pr-hint">
        The call names neither you nor the service, and is never placed between 8 pm and 8 am.
        {!s.voiceAvailable && ' Reminder calls are not switched on for NessaHub yet, so nothing is dialled until they are.'}
      </p>
      {saved && <p className="ms-ok">{saved}</p>}
      {error && <p className="ms-err">{error}</p>}
    </div>
  );
}

function Goals() {
  const [g, setG] = useState(null);
  const [edit, setEdit] = useState(false);
  const [target, setTarget] = useState('');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
  const load = () => api('/api/v1/practice/goals').then((r) => { setG(r); setTarget(r.weeklySessionTarget ?? ''); setGoal(r.monthlyIncomeGoal ?? ''); }).catch((e) => setError(e?.message || 'Could not load.'));
  useEffect(() => { load(); }, []);
  const save = async () => {
    setError('');
    try {
      const r = await api('/api/v1/practice/goals', { method: 'PUT', body: { weeklySessionTarget: target === '' ? null : Number(target), monthlyIncomeGoal: goal === '' ? null : Number(goal) } });
      setG(r); setEdit(false);
    } catch (e) { setError(e?.message || 'Could not save.'); }
  };
  if (!g) return <div className="ms-card">{error || 'Loading…'}</div>;
  const money = (n) => `GH₵ ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (a, b) => (b ? Math.min(100, Math.round((Number(a) / Number(b)) * 100)) : 0);
  return (
    <div className="ms-card">
      <h3 className="ms-title">This week and this month</h3>
      <div className="tp-stats">
        <div className="tp-stat">
          <span className="ms-muted">Sessions this week</span>
          <strong>{g.sessionsThisWeek}{g.weeklySessionTarget ? ` of ${g.weeklySessionTarget}` : ''}</strong>
          {g.weeklySessionTarget ? <div className="tp-bar" role="progressbar" aria-valuenow={pct(g.sessionsThisWeek, g.weeklySessionTarget)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct(g.sessionsThisWeek, g.weeklySessionTarget)}%` }} /></div> : null}
        </div>
        <div className="tp-stat">
          <span className="ms-muted">Active clients</span>
          <strong>{g.activeClients}</strong>
        </div>
        <div className="tp-stat">
          <span className="ms-muted">Earned this month</span>
          <strong>{money(g.earnedThisMonth)}</strong>
          {g.monthlyIncomeGoal ? <>
            <div className="tp-bar" role="progressbar" aria-valuenow={pct(g.earnedThisMonth, g.monthlyIncomeGoal)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct(g.earnedThisMonth, g.monthlyIncomeGoal)}%` }} /></div>
            <span className="ms-muted" style={{ fontSize: '0.78rem' }}>Goal {money(g.monthlyIncomeGoal)}</span>
          </> : null}
          <span className="ms-muted" style={{ display: 'block', fontSize: '0.78rem' }}>Last month {money(g.earnedLastMonth)}</span>
        </div>
      </div>
      <p className="ms-muted pr-hint">Earnings are what you receive after NessaHub's commission and any refunds. Weeks run Monday to Sunday.</p>
      {edit ? (
        <div className="pr-row">
          <label>Sessions a week <input type="number" min={1} max={100} value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: '5rem' }} /></label>
          <label>Monthly income goal (GH₵) <input type="number" min={1} value={goal} onChange={(e) => setGoal(e.target.value)} style={{ width: '8rem' }} /></label>
          <button className="ms-btn" onClick={save}>Save</button>
          <button className="ms-link" onClick={() => setEdit(false)}>Cancel</button>
        </div>
      ) : <div className="ms-actions" style={{ justifyContent: 'flex-start' }}><button className="ms-link" onClick={() => setEdit(true)}>Set my goals</button></div>}
      {error && <p className="ms-err">{error}</p>}
    </div>
  );
}

function CalendarSync() {
  const [st, setSt] = useState(null);
  const [path, setPath] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(e?.message || 'Could not do that.'); } };
  useEffect(() => {
    api('/api/v1/practice/settings').then((r) => {
      setSt(r);
      if (r.calendarOn) api('/api/v1/practice/calendar', { method: 'POST', body: {} }).then((x) => setPath(x.path)).catch(() => {});
    }).catch((e) => setError(e?.message || 'Could not load.'));
  }, []);
  const url = path ? `${API_BASE}${path}` : '';
  const webcal = url.replace(/^https?:/, 'webcal:');
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_) { /* clipboard blocked */ } };
  if (!st) return <div className="ms-card">{error || 'Loading…'}</div>;
  return (
    <div className="ms-card">
      <h3 className="ms-title">Calendar sync</h3>
      <p className="ms-muted pr-hint">See your NessaHub sessions in Google, Outlook or Apple Calendar. It is one way: make changes in NessaHub, and your calendar updates within a few hours.</p>
      {!path ? (
        <button className="ms-btn" onClick={() => run(async () => { const r = await api('/api/v1/practice/calendar', { method: 'POST', body: {} }); setPath(r.path); setSt({ ...st, calendarOn: true }); })}>Get my calendar link</button>
      ) : (
        <>
          <p className="tp-link">{url}</p>
          <div className="ms-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="ms-btn" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            <a className="ms-link" href={webcal}>Open in Apple Calendar or Outlook</a>
          </div>
          <ul className="ms-muted" style={{ fontSize: '0.85rem', paddingLeft: '1.2rem' }}>
            <li>Google Calendar: Other calendars › + › From URL, then paste the link.</li>
            <li>Outlook: Add calendar › Subscribe from web, then paste the link.</li>
            <li>Apple Calendar: File › New Calendar Subscription, then paste the link.</li>
          </ul>
          <label className="pr-check">
            <input type="checkbox" checked={!!st.calendarShowInitials} onChange={(e) => run(async () => setSt(await api('/api/v1/practice/calendar', { method: 'PUT', body: { showInitials: e.target.checked } })))} />
            Show clients' initials (otherwise each event just says “NessaHub session”)
          </label>
          <p className="ms-muted pr-hint">Anyone with this link can see your session times. If it gets shared by mistake, make a new one: the old link stops working.</p>
          <div className="ms-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="ms-link" onClick={() => run(async () => { const r = await api('/api/v1/practice/calendar', { method: 'POST', body: { regenerate: true } }); setPath(r.path); })}>Make a new link</button>
            <button className="ms-link" onClick={() => run(async () => { setSt(await api('/api/v1/practice/calendar', { method: 'DELETE' })); setPath(''); })}>Turn off</button>
          </div>
        </>
      )}
      {error && <p className="ms-err">{error}</p>}
    </div>
  );
}

function Announcements({ clientsPath }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState([]);
  const [text, setText] = useState(false);
  const [clients, setClients] = useState([]);
  const [sent, setSent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const load = () => api('/api/v1/practice/announcements').then((l) => setSent(Array.isArray(l) ? l : [])).catch(() => {});
  useEffect(() => {
    load();
    api(clientsPath).then((rows) => setClients((Array.isArray(rows) ? rows : []).map((c) => ({ id: c.id, name: c.fullName || c.name || c.email || 'Client' })))).catch(() => {});
  }, [clientsPath]);
  const send = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api('/api/v1/practice/announcements', { method: 'POST', body: { title, body, clientIds: everyone ? null : picked, sendText: text } });
      setMsg(`Sent to ${r.recipients} client${r.recipients === 1 ? '' : 's'}${text ? `, with ${r.texts} text${r.texts === 1 ? '' : 's'}` : ''}.`);
      setTitle(''); setBody(''); setPicked([]); load();
    } catch (e) { setError(e?.message || 'Could not send.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="ms-card">
      <h3 className="ms-title">Announcements</h3>
      <p className="ms-muted pr-hint">One message to many clients, for practice news such as a closure or a change of hours. Up to 5 a day.</p>
      <label className="pr-label">Title<input className="pr-full" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Closed on Friday" /></label>
      <label className="pr-label">Message<textarea rows={3} className="pr-full" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} /></label>
      <div className="pr-row">
        <label className="pr-check"><input type="radio" checked={everyone} onChange={() => setEveryone(true)} /> All my clients</label>
        <label className="pr-check"><input type="radio" checked={!everyone} onChange={() => setEveryone(false)} /> Choose clients</label>
      </div>
      {!everyone && (
        <div className="tp-options" style={{ maxHeight: 180, overflowY: 'auto' }}>
          {clients.map((c) => (
            <label key={c.id} className="pr-check tp-opt">
              <input type="checkbox" checked={picked.includes(c.id)} onChange={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} /> {c.name}
            </label>
          ))}
        </div>
      )}
      <label className="pr-check" style={{ display: 'flex', marginTop: '0.5rem' }}>
        <input type="checkbox" checked={text} onChange={(e) => setText(e.target.checked)} /> Also text them that there is a new message (the text does not include the message)
      </label>
      {msg && <p className="ms-ok">{msg}</p>}
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions">
        <button className="ms-btn" onClick={send} disabled={busy || !title.trim() || !body.trim() || (!everyone && picked.length === 0)}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
      {sent.length > 0 && (
        <ul className="ms-pending">
          {sent.map((a) => <li key={a.id}><span><strong>{a.title}</strong><span className="ms-muted"> · {fmtTime(a.created_at)} · {a.recipient_count} client{a.recipient_count === 1 ? '' : 's'}</span></span></li>)}
        </ul>
      )}
    </div>
  );
}

function TimeOff() {
  const [list, setList] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [clashes, setClashes] = useState(null);
  const [cancel, setCancel] = useState(true);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => { api('/api/v1/practice/time-off').then((l) => setList(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setClashes(null);
    if (!from || !to || new Date(to) <= new Date(from)) return;
    const q = new URLSearchParams({ startsAt: toIso(from), endsAt: toIso(to) });
    api(`/api/v1/practice/time-off/clashes?${q}`).then(setClashes).catch(() => setClashes(null));
  }, [from, to]);

  const add = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api('/api/v1/practice/time-off', {
        method: 'POST', body: { startsAt: toIso(from), endsAt: toIso(to), reason, cancelSessions: cancel, notifyClients: notify },
      });
      setMsg(`Time off saved.${r.cancelled ? ` ${r.cancelled} session${r.cancelled === 1 ? '' : 's'} cancelled.` : ''}`
        + `${r.refundsRequested ? ` NessaHub will refund ${r.refundsRequested} paid session${r.refundsRequested === 1 ? '' : 's'} in full.` : ''}`
        + `${r.stillBooked ? ` ${r.stillBooked} session${r.stillBooked === 1 ? ' is' : 's are'} still booked in that time.` : ''}`);
      setFrom(''); setTo(''); setReason(''); load();
    } catch (e) { setError(e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await api(`/api/v1/practice/time-off/${id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e?.message || 'Could not remove.'); }
  };

  return (
    <div className="ms-card">
      <h3 className="ms-title">Time off</h3>
      <p className="ms-muted pr-hint">No one can book you during time off, through any booking screen or the assistant.</p>
      <div className="pr-row">
        <label>From <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <input placeholder="Reason (only you see it)" value={reason} onChange={(e) => setReason(e.target.value)} className="pr-grow" />
      </div>
      {clashes && clashes.length > 0 && (
        <div className="pr-gaps" style={{ marginTop: '0.75rem', display: 'block' }}>
          <strong>{clashes.length} session{clashes.length === 1 ? ' is' : 's are'} already booked in this time:</strong>
          <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem' }}>
            {clashes.map((c) => <li key={c.id}>{fmtTime(c.at)} · {c.client_name || 'Client'}{c.paid ? ' · paid' : ''}</li>)}
          </ul>
          <label className="pr-check"><input type="checkbox" checked={cancel} onChange={(e) => setCancel(e.target.checked)} /> Cancel these sessions (paid ones are refunded in full)</label><br />
          <label className="pr-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={!cancel} /> Tell the clients in the app and by text</label>
        </div>
      )}
      {msg && <p className="ms-ok">{msg}</p>}
      {error && <p className="ms-err">{error}</p>}
      <div className="ms-actions">
        <button className="ms-btn" onClick={add} disabled={busy || !from || !to}>{busy ? 'Saving…' : 'Add time off'}</button>
      </div>
      {list.length > 0 && (
        <ul className="ms-pending">
          {list.map((t) => (
            <li key={t.id}>
              <span>{fmtTime(t.starts_at)} to {fmtTime(t.ends_at)}{t.reason ? ` · ${t.reason}` : ''}{t.cancelled_count ? ` · ${t.cancelled_count} cancelled` : ''}</span>
              <button className="ms-link" onClick={() => remove(t.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Waitlist({ clientsPath }) {
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [times, setTimes] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => { api('/api/v1/practice/waitlist').then((l) => setList(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  useEffect(() => {
    load();
    api(clientsPath).then((rows) => setClients((Array.isArray(rows) ? rows : []).map((c) => ({ id: c.id, name: c.fullName || c.name || c.email || 'Client' }))))
      .catch(() => setClients([]));
  }, [load, clientsPath]);

  const act = async (fn) => { setError(''); try { await fn(); load(); } catch (e) { setError(e?.message || 'Could not do that.'); } };

  return (
    <div className="ms-card">
      <h3 className="ms-title">Waitlist</h3>
      <div className="pr-row">
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
          <option value="">Choose a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Preferred times, e.g. weekday mornings" value={times} onChange={(e) => setTimes(e.target.value)} className="pr-grow" />
        <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="ms-btn" disabled={!clientId} onClick={() => act(async () => {
          await api('/api/v1/practice/waitlist', { method: 'POST', body: { clientId, preferredTimes: times, note } });
          setClientId(''); setTimes(''); setNote('');
        })}>Add</button>
      </div>
      {error && <p className="ms-err">{error}</p>}
      {list.length === 0 ? <p className="ms-muted" style={{ marginTop: '0.75rem' }}>No one is waiting.</p> : (
        <ul className="ms-pending">
          {list.map((w) => (
            <li key={w.id}>
              <span>
                <strong>{w.client_name}</strong>{w.preferred_times ? ` · ${w.preferred_times}` : ''}{w.note ? ` · ${w.note}` : ''}
                <span className="ms-muted"> · {w.status === 'offered' ? (w.offered_slot ? `offered the time ${fmtTime(w.offered_slot)}` : `offered a slot ${fmtTime(w.offered_at)}`) : 'waiting'}</span>
              </span>
              <span>
                <button className="ms-link" onClick={() => act(() => api(`/api/v1/practice/waitlist/${w.id}/offer`, { method: 'POST', body: {} }))}>Offer a slot</button>
                <button className="ms-link" onClick={() => act(() => api(`/api/v1/practice/waitlist/${w.id}/close`, { method: 'POST', body: { status: 'booked' } }))}>Booked</button>
                <button className="ms-link" onClick={() => act(() => api(`/api/v1/practice/waitlist/${w.id}/close`, { method: 'POST', body: { status: 'removed' } }))}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Add to waitlist" from a client's page. */
export function AddToWaitlistButton({ clientId, style }) {
  const [state, setState] = useState('');
  const add = async () => {
    try { await api('/api/v1/practice/waitlist', { method: 'POST', body: { clientId } }); setState('Added to your waitlist.'); }
    catch (e) { setState(e?.message || 'Could not add.'); }
  };
  return (
    <>
      <button onClick={add} style={style}>Add to waitlist</button>
      {state && <span style={{ fontSize: '0.8rem', color: '#475569', alignSelf: 'center' }}>{state}</span>}
    </>
  );
}

/** A one-line summary of the clinician's goals for the home screen; links to the Practice page. */
export function GoalsStrip({ to = '/dashboard/practice' }) {
  const [g, setG] = useState(null);
  useEffect(() => { api('/api/v1/practice/goals').then(setG).catch(() => setG(null)); }, []);
  if (!g) return null;
  const money = (n) => `GH₵ ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <Link to={to} className="ms-card" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', textDecoration: 'none', color: 'inherit', padding: '0.75rem 1rem' }}
      aria-label="My practice goals">
      <span><span className="ms-muted">Sessions this week </span><strong>{g.sessionsThisWeek}{g.weeklySessionTarget ? ` / ${g.weeklySessionTarget}` : ''}</strong></span>
      <span><span className="ms-muted">Active clients </span><strong>{g.activeClients}</strong></span>
      <span><span className="ms-muted">Earned this month </span><strong>{money(g.earnedThisMonth)}{g.monthlyIncomeGoal ? ` / ${money(g.monthlyIncomeGoal)}` : ''}</strong></span>
    </Link>
  );
}
