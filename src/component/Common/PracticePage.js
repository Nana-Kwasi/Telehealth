import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import './Measures.css';
import './PsychRecord.css';

/*
 * Practice: the clinician's own scheduling rules.
 *  - Policies: cancellation notice and day-before text reminders
 *  - Time off: blocks bookings; can cancel sessions already booked and tell clients
 *  - Waitlist: clients wanting an earlier time, with "offer a slot"
 */

const fmtTime = (d) => (d ? new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const toIso = (local) => (local ? new Date(local).toISOString() : '');

export default function PracticePage({ clientsPath = '/api/v1/therapy-management/clients' }) {
  return (
    <div className="ms-wrap" style={{ padding: '1.5rem', maxWidth: 900 }}>
      <h2 style={{ margin: 0 }}>Practice</h2>
      <p className="ms-muted" style={{ margin: 0 }}>Your waitlist, time off and session policies.</p>
      <Waitlist clientsPath={clientsPath} />
      <TimeOff />
      <Policies />
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
      {saved && <p className="ms-ok">{saved}</p>}
      {error && <p className="ms-err">{error}</p>}
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
                <span className="ms-muted"> · {w.status === 'offered' ? `offered ${fmtTime(w.offered_at)}` : 'waiting'}</span>
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
