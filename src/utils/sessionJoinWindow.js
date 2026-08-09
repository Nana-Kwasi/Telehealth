// ─── sessionJoinWindow ───────────────────────────────────────────────────────
// When a scheduled session can actually be joined.
//
// The Join button used to render for every `scheduled` call regardless of date,
// so a session booked for next week looked joinable today. A session opens a few
// minutes early (people arrive before the hour) and stays open until a while
// after it was due to end, so an overrunning call is never cut off.

/** Minutes before the start time that the room opens. Matches mobile's rule. */
export const JOIN_OPENS_MINUTES_BEFORE = 15;

/** Minutes after the scheduled end that the room stays joinable. */
export const JOIN_GRACE_MINUTES_AFTER = 30;

const MIN = 60 * 1000;

/**
 * The scheduled start, as a Date. `scheduledTime` is the API field.
 *
 * It can arrive as an ISO string or as a Firestore-style Timestamp (the shim
 * still hands those back in places) — `new Date(timestampObject)` is an Invalid
 * Date, which silently made every session look unschedulable.
 */
export function sessionStart(session) {
  const raw = session?.scheduledTime || session?.scheduledAt || session?.startsAt;
  if (!raw) return null;

  if (typeof raw?.toDate === 'function') {
    const d = raw.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof raw?.seconds === 'number') return new Date(raw.seconds * 1000);

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @returns {{
 *   canJoin: boolean, opensAt: Date|null, closesAt: Date|null,
 *   state: 'early'|'open'|'ended'|'unknown', waitLabel: string
 * }}
 */
export function getJoinWindow(session, now = new Date()) {
  const start = sessionStart(session);
  if (!start) return { canJoin: false, opensAt: null, closesAt: null, state: 'unknown', waitLabel: '' };

  const duration = Number(session?.durationMinutes) || 30;
  const opensAt = new Date(start.getTime() - JOIN_OPENS_MINUTES_BEFORE * MIN);
  const closesAt = new Date(start.getTime() + (duration + JOIN_GRACE_MINUTES_AFTER) * MIN);

  if (now < opensAt) {
    return { canJoin: false, opensAt, closesAt, state: 'early', waitLabel: formatWait(opensAt - now) };
  }
  if (now > closesAt) {
    return { canJoin: false, opensAt, closesAt, state: 'ended', waitLabel: '' };
  }
  return { canJoin: true, opensAt, closesAt, state: 'open', waitLabel: '' };
}

/** "in 3 days" / "in 4 hrs" / "in 12 min" — how long until the room opens. */
function formatWait(ms) {
  const mins = Math.max(1, Math.round(ms / MIN));
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hr${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
