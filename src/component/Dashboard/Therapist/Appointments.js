// ─── Therapist Appointments ──────────────────────────────────────────────────
// The therapist's side of scheduled calls, mirroring the medical patient's
// appointments page: requests waiting for an answer, the confirmed agenda, and
// past sessions — with accept, decline, reschedule and cancel.
//
// Everything writes through the same `scheduledCalls` store the calendar and
// video pages read, so confirming here updates those too. No screen keeps its
// own copy of the state.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppointmentRiskPanel from '../../Common/AppointmentRiskPanel';
import { auth, db, collection, query, where, getDocs, doc, updateDoc } from '../../../services/firestoreShim';
import { Calendar, Clock, Check, X, RefreshCw } from 'lucide-react';
import ActionButton from '../../Common/ActionButton';
import './Appointments.css';

const FILTERS = [
  { id: 'requests', label: 'Requests' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' },
];

/** Scheduled times arrive as ISO strings; older rows may carry a Timestamp. */
function callDate(call) {
  const raw = call?.scheduledTime || call?.scheduledAt || call?.startsAt;
  if (!raw) return null;
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtWhen(call) {
  const d = callDate(call);
  if (!d) return 'Date not set';
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const isPending = (c) => String(c?.status || '').toLowerCase() === 'pending';
const isDead = (c) => ['declined', 'cancelled'].includes(String(c?.status || '').toLowerCase());

/** Local YYYY-MM-DDTHH:mm for the datetime-local input (never UTC). */
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TherapistAppointments() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('requests');
  const [error, setError] = useState('');

  const [rescheduleCall, setRescheduleCall] = useState(null);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');

  const therapistId = auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!therapistId) return;
    try {
      const snap = await getDocs(query(
        collection(db, 'scheduledCalls'),
        where('therapistId', '==', therapistId),
      ));
      setCalls(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError('');
    } catch (e) {
      setError(e?.message || 'Could not load appointments.');
    } finally {
      setLoading(false);
    }
  }, [therapistId]);

  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const filtered = useMemo(() => {
    const list = [...calls].sort((a, b) => (callDate(b)?.getTime() || 0) - (callDate(a)?.getTime() || 0));
    switch (activeFilter) {
      case 'requests':
        return list.filter(isPending);
      case 'upcoming':
        return list
          .filter((c) => !isPending(c) && !isDead(c) && (callDate(c)?.getTime() || 0) >= now)
          .sort((a, b) => (callDate(a)?.getTime() || 0) - (callDate(b)?.getTime() || 0));
      case 'past':
        return list.filter((c) => !isPending(c) && (callDate(c)?.getTime() || 0) < now);
      default:
        return list;
    }
  }, [calls, activeFilter, now]);

  const pendingCount = useMemo(() => calls.filter(isPending).length, [calls]);

  const patchCall = async (call, body) => {
    await updateDoc(doc(db, 'scheduledCalls', call.id), { ...body, updatedBy: therapistId });
    // Re-read rather than patching state locally: the same call has to move on the
    // calendar and video pages too, and those read the server.
    await load();
  };

  const respond = async (call, accept) => {
    await patchCall(call, { status: accept ? 'scheduled' : 'declined' });
  };

  const openReschedule = (call) => {
    const d = callDate(call) || new Date(Date.now() + 3600000);
    setRescheduleCall(call);
    setRescheduleAt(toLocalInput(d));
    setRescheduleNotes(call.notes || '');
  };

  const submitReschedule = async () => {
    if (!rescheduleCall) return;
    const when = new Date(rescheduleAt);
    if (Number.isNaN(when.getTime())) { setError('Choose a valid date and time.'); return; }
    if (when <= new Date()) { setError('A session cannot be moved into the past.'); return; }
    await patchCall(rescheduleCall, {
      scheduledTime: when.toISOString(),
      notes: rescheduleNotes,
      // Offering a time also confirms the request — the client asked for a
      // session and the therapist is answering with a slot.
      status: 'scheduled',
    });
    setRescheduleCall(null);
    setError('');
  };

  if (loading) return <div className="ta-loading">Loading appointments…</div>;

  return (
    <div className="ta-page">
      {/* Which of these is worth a reminder, and why. Hides itself when
          nothing is worth chasing. */}
      <AppointmentRiskPanel />

      <div className="ta-header">
        <div>
          <h1>Appointments</h1>
          <p>Confirm session requests, reschedule, and keep your calendar accurate.</p>
        </div>
        <button type="button" className="ta-refresh" onClick={load} title="Refresh">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="ta-error">{error}</div>}

      <div className="ta-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`ta-filter ${activeFilter === f.id ? 'is-active' : ''}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
            {f.id === 'requests' && pendingCount > 0 && (
              <span className="ta-badge">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="ta-empty">
          <Calendar size={34} />
          <h3>{activeFilter === 'requests' ? 'No session requests' : 'Nothing here yet'}</h3>
          <p>
            {activeFilter === 'requests'
              ? 'When a client books a session it appears here for you to confirm.'
              : 'Sessions you schedule or confirm will show up here.'}
          </p>
        </div>
      ) : (
        <div className="ta-list">
          {filtered.map((call) => {
            const pending = isPending(call);
            const status = String(call.status || 'scheduled').toLowerCase();
            return (
              <div key={call.id} className={`ta-card ${pending ? 'is-pending' : ''}`}>
                <div className="ta-card-main">
                  <div className="ta-card-who">
                    <strong>{call.clientName || 'Client'}</strong>
                    <span className={`ta-status ta-status--${status}`}>{status.toUpperCase()}</span>
                  </div>
                  <div className="ta-card-when">
                    <Clock size={14} /> {fmtWhen(call)}
                    <span className="ta-dot">·</span>
                    {call.durationMinutes || call.duration || 30} min
                  </div>
                  {call.notes && <p className="ta-card-notes">{call.notes}</p>}
                </div>

                <div className="ta-card-actions">
                  {pending ? (
                    <>
                      <ActionButton variant="secondary" onClick={() => respond(call, false)}>
                        <X size={14} /> Decline
                      </ActionButton>
                      <ActionButton variant="secondary" onClick={() => openReschedule(call)}>
                        Propose time
                      </ActionButton>
                      <ActionButton onClick={() => respond(call, true)}>
                        <Check size={14} /> Accept
                      </ActionButton>
                    </>
                  ) : (
                    <>
                      <ActionButton variant="secondary" onClick={() => patchCall(call, { status: 'cancelled' })}>
                        Cancel
                      </ActionButton>
                      <ActionButton onClick={() => openReschedule(call)}>
                        Reschedule
                      </ActionButton>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rescheduleCall && (
        <div className="ta-modal-overlay" onClick={() => setRescheduleCall(null)}>
          <div className="ta-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h2>{isPending(rescheduleCall) ? 'Propose a time' : 'Reschedule session'}</h2>
              <button type="button" className="ta-close" onClick={() => setRescheduleCall(null)}>×</button>
            </div>
            <p className="ta-modal-sub">{rescheduleCall.clientName || 'Client'}</p>

            <label className="ta-label" htmlFor="ta-when">Date &amp; time</label>
            <input
              id="ta-when"
              type="datetime-local"
              className="ta-input"
              value={rescheduleAt}
              onChange={(e) => setRescheduleAt(e.target.value)}
            />

            <label className="ta-label" htmlFor="ta-notes">Notes</label>
            <textarea
              id="ta-notes"
              className="ta-input ta-textarea"
              value={rescheduleNotes}
              onChange={(e) => setRescheduleNotes(e.target.value)}
              placeholder="Optional notes…"
            />

            <div className="ta-modal-actions">
              <ActionButton variant="secondary" onClick={() => setRescheduleCall(null)}>Close</ActionButton>
              <ActionButton onClick={submitReschedule}>Save</ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
