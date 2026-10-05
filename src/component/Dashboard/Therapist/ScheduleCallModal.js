import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, User, Search } from 'lucide-react';
import { api, getStoredUserId } from '../../../services/apiClient';

/**
 * Book a session from the dashboard calendar.
 *
 * Clicking a day used to navigate to `/dashboard/schedule` — a route that does
 * not exist on the therapist dashboard, so the therapist landed on a blank
 * page. Mobile has always opened a modal here; this is the same flow, with the
 * same payload.
 *
 * Three things the payload gets right because mobile learned them the hard way
 * and the comments there record it:
 *
 *  - `scheduledTime` is the field the endpoint requires. `scheduledAt` fails
 *    validation and the booking is silently rejected.
 *  - `therapistId` must be sent. Without it the row is written with
 *    therapist_id NULL and the calendar — which queries ?therapistId={uid} —
 *    can never find the call that was just created.
 *  - A past date/time is refused here as well as on the server, so the error
 *    arrives before the round trip.
 */
export default function ScheduleCallModal({ open, initialDate, onClose, onScheduled }) {
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [query, setQuery]       = useState('');

  const [clientId, setClientId] = useState('');
  const [date, setDate]         = useState('');
  const [time, setTime]         = useState('09:00');
  const [duration, setDuration] = useState('30');
  const [notes, setNotes]       = useState('');

  // Today in the USER's timezone. toISOString() is UTC and rolls the date over
  // in the evening for anyone east of Greenwich, which would let "today" be
  // rejected as past.
  const todayLocal = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setDate(initialDate || todayLocal);
    setLoading(true);
    (async () => {
      try {
        const rows = await api('/api/v1/therapy-management/clients').catch(() => []);
        const list = Array.isArray(rows) ? rows : (rows?.items || []);
        setClients(list);
      } catch (e) {
        setError(e?.message || 'Could not load your clients.');
      } finally { setLoading(false); }
    })();
  }, [open, initialDate, todayLocal]);

  // Escape closes; the page behind must not scroll.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const nameOf = (c) => c.fullName || c.name || c.displayName || c.email || 'Client';
  const chosen = clients.find((c) => (c.id || c.userId || c.clientId) === clientId);

  const visible = clients.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || `${nameOf(c)} ${c.email || ''}`.toLowerCase().includes(q);
  });

  const submit = async () => {
    setError('');
    if (!clientId) { setError('Choose a client for this session.'); return; }

    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) { setError('Choose a valid date and time.'); return; }
    if (when <= new Date()) {
      setError('That time has already passed. Pick a future date and time.');
      return;
    }

    setSaving(true);
    try {
      const therapistId = await getStoredUserId();
      if (!therapistId) throw new Error('Your session expired. Please sign in again.');

      await api('/api/v1/scheduled-calls', {
        method: 'POST',
        body: {
          therapistId,
          createdBy: therapistId,
          status: 'scheduled',
          clientId,
          channel: 'video',
          scheduledTime: when.toISOString(),
          durationMinutes: parseInt(duration, 10) || 30,
          notes: notes || '',
          metadataJson: JSON.stringify({
            clientName: chosen ? nameOf(chosen) : null,
            status: 'scheduled',
          }),
        },
      });
      onScheduled?.();
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not schedule that session.');
    } finally { setSaving(false); }
  };

  const prettyDate = (() => {
    const d = new Date(`${date}T00:00`);
    return Number.isNaN(d.getTime()) ? '' :
      d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  })();

  return (
    <div style={S.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Schedule a session">
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <div>
            <h2 style={S.title}>Schedule a session</h2>
            {prettyDate ? <p style={S.sub}>{prettyDate}</p> : null}
          </div>
          <button style={S.iconBtn} onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>

        <div style={S.body}>
          {error ? <div style={S.error}>{error}</div> : null}

          <label style={S.label}><User size={13} /> Client</label>
          {loading ? (
            <p style={S.muted}>Loading your clients…</p>
          ) : chosen ? (
            <div style={S.chosen}>
              <span>{nameOf(chosen)}</span>
              <button style={S.chosenX} onClick={() => setClientId('')} aria-label="Change client">
                <X size={12} />
              </button>
            </div>
          ) : (
            <>
              <div style={S.searchWrap}>
                <Search size={14} style={S.searchIcon} />
                <input
                  style={{ ...S.input, paddingLeft: '2rem' }}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your clients…"
                />
              </div>
              <div style={S.clientBox}>
                {visible.length === 0 ? (
                  <p style={S.muted}>No client matches that.</p>
                ) : visible.slice(0, 40).map((c) => {
                  const id = c.id || c.userId || c.clientId;
                  return (
                    <button key={id} style={S.clientRow} onClick={() => { setClientId(id); setQuery(''); }}>
                      <span style={S.clientName}>{nameOf(c)}</span>
                      {c.email ? <span style={S.clientEmail}>{c.email}</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={S.row2}>
            <div>
              <label style={S.label}><Calendar size={13} /> Date</label>
              <input style={S.input} type="date" value={date} min={todayLocal}
                     onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label style={S.label}><Clock size={13} /> Time</label>
              <input style={S.input} type="time" value={time}
                     onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <label style={S.label}>Duration</label>
          <div style={S.chips}>
            {['30', '45', '60', '90'].map((d) => (
              <button key={d} style={duration === d ? S.chipOn : S.chip} onClick={() => setDuration(d)}>
                {d} min
              </button>
            ))}
          </div>

          <label style={{ ...S.label, marginTop: '0.9rem' }}>Notes (optional)</label>
          <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
                    value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything to prepare for this session" />
        </div>

        <div style={S.foot}>
          <button style={clientId && !saving ? S.primary : S.primaryOff}
                  disabled={!clientId || saving} onClick={submit}>
            {saving ? 'Scheduling…' : 'Schedule session'}
          </button>
          <button style={S.ghost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1500, display: 'flex',
             alignItems: 'center', justifyContent: 'center', padding: '1.25rem',
             background: 'rgba(16,22,48,0.45)', backdropFilter: 'blur(6px)',
             WebkitBackdropFilter: 'blur(6px)' },
  panel: { display: 'flex', flexDirection: 'column', width: 'min(480px, 100%)',
           maxHeight: '88vh', borderRadius: 22, overflow: 'hidden', background: '#fff',
           boxShadow: '0 28px 80px rgba(16,22,48,0.36)' },
  head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: '1rem', padding: '1.1rem 1.2rem', borderBottom: '1px solid #edeff4', flexShrink: 0 },
  title: { margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f1424' },
  sub: { margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#6b7283' },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.1rem 1.2rem' },
  foot: { display: 'flex', gap: '0.6rem', padding: '0.9rem 1.2rem',
          borderTop: '1px solid #edeff4', flexShrink: 0 },
  iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
             border: 'none', borderRadius: 8, background: '#f1f3f8', color: '#454b5c',
             cursor: 'pointer', flexShrink: 0 },

  label: { display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem',
           fontWeight: 700, color: '#2b3142', marginBottom: '0.35rem', marginTop: '0.9rem' },
  input: { width: '100%', padding: '0.6rem 0.7rem', border: '1.5px solid #d8dce6',
           borderRadius: 10, fontSize: '0.87rem', color: '#0f1424', background: '#fff',
           boxSizing: 'border-box' },
  muted: { margin: '0.3rem 0', fontSize: '0.83rem', color: '#6b7283' },

  searchWrap: { position: 'relative' },
  searchIcon: { position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)',
                color: '#9aa0b2', pointerEvents: 'none' },
  clientBox: { marginTop: '0.5rem', maxHeight: 190, overflowY: 'auto',
               border: '1px solid #e4e7ee', borderRadius: 10, padding: '0.3rem' },
  clientRow: { display: 'flex', flexDirection: 'column', gap: '0.1rem', width: '100%',
               textAlign: 'left', padding: '0.5rem 0.6rem', border: 'none', borderRadius: 8,
               background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' },
  clientName: { fontSize: '0.86rem', fontWeight: 650, color: '#16203a' },
  clientEmail: { fontSize: '0.73rem', color: '#6b7283' },

  chosen: { display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.45rem 0.55rem 0.45rem 0.85rem', borderRadius: 999,
            background: '#eff4ff', color: '#1a3ea8', fontSize: '0.85rem', fontWeight: 700 },
  chosenX: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
             border: 'none', borderRadius: '50%', background: '#1a3ea8', color: '#fff',
             cursor: 'pointer', padding: 0 },

  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' },
  chips: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  chip: { padding: '0.38rem 0.8rem', borderRadius: 999, border: '1.5px solid #d8dce6',
          background: '#fff', color: '#4a5163', fontSize: '0.8rem', fontWeight: 650,
          cursor: 'pointer', fontFamily: 'inherit' },
  chipOn: { padding: '0.38rem 0.8rem', borderRadius: 999, border: '1.5px solid #1d4ed8',
            background: '#eff4ff', color: '#1a3ea8', fontSize: '0.8rem', fontWeight: 750,
            cursor: 'pointer', fontFamily: 'inherit' },

  error: { padding: '0.65rem 0.8rem', borderRadius: 10, background: '#fef2f2',
           border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.83rem',
           lineHeight: 1.5, marginBottom: '0.4rem' },

  primary: { padding: '0.7rem 1.3rem', border: 'none', borderRadius: 11, background: '#1d4ed8',
             color: '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer',
             fontFamily: 'inherit' },
  primaryOff: { padding: '0.7rem 1.3rem', border: 'none', borderRadius: 11, background: '#1d4ed8',
                color: '#fff', fontSize: '0.88rem', fontWeight: 700, opacity: 0.4,
                cursor: 'not-allowed', fontFamily: 'inherit' },
  ghost: { padding: '0.7rem 1.3rem', border: '1.5px solid #d8dce6', borderRadius: 11,
           background: '#fff', color: '#2b3142', fontSize: '0.88rem', fontWeight: 700,
           cursor: 'pointer', fontFamily: 'inherit' },
};
