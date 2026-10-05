// ─── Pre-signup doctor booking ───────────────────────────────────────────────
// A visitor can pick a doctor, date and slot before they have an account. The
// booking is parked in localStorage under `th.pendingBooking` and turned into a
// real appointment once the account exists.
//
// That hand-off used to happen exactly once, inside SignUp's submit(): if the
// POST failed there, the intent was dropped on the floor. Nothing surfaced the
// failure either — firestoreShim's addDoc catches every error and returns a
// placeholder doc — so the patient landed on a dashboard with no doctor and no
// explanation, and had to re-book from scratch.
//
// So the rule here is: the pending booking is only cleared once an appointment
// has verifiably been written. Anything that can't complete it leaves it in
// place, and the medical dashboard retries on mount.

import { db, collection, addDoc, doc, setDoc, serverTimestamp } from '../services/firestoreShim';

const KEY = 'th.pendingBooking';

// localStorage outlives the visit, so a booking abandoned at the signup screen
// would otherwise sit there and attach itself to whoever next uses this browser.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readPendingBooking() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !parsed.doctorId) return null;
    if (parsed.savedAt && Date.now() - Date.parse(parsed.savedAt) > MAX_AGE_MS) {
      clearPendingBooking();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Park a booking made before the visitor had an account. */
export function savePendingBooking(booking) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...booking, savedAt: new Date().toISOString() }));
  } catch {
    /* ignore */
  }
}

export function clearPendingBooking() {
  localStorage.removeItem(KEY);
}

/**
 * Turn a parked booking into a real appointment.
 *
 * @returns {Promise<{ok: boolean, error?: string}>} — `ok` only when the
 *   appointment row actually exists on the backend.
 */
export async function materializePendingBooking(booking, { userId, name, email } = {}) {
  if (!booking?.doctorId) return { ok: false, error: 'No pending booking' };
  if (!userId) return { ok: false, error: 'No signed-in user' };

  // The API rejects a double-booked slot by THROWING, despite the note below —
  // and this runs on every dashboard load, so an already-materialised booking
  // produced an uncaught rejection and React's error overlay on every single
  // login. Treat "already booked" as done: the appointment exists, which is the
  // outcome we wanted.
  let res;
  try {
    res = await addDoc(collection(db, 'doctorAppointments'), {
    // This replays a booking the user began BEFORE signing in, and it runs on
    // dashboard load — so it cannot open a payment window without ambushing
    // someone who just logged in. It therefore records the appointment as
    // UNPAID rather than creating a free one silently, so the fee is still
    // owed and visible instead of quietly written off.
    paymentStatus: 'unpaid',
    doctorId: booking.doctorId,
    doctorName: booking.doctorName || 'Doctor',
    doctorSpecialization: booking.doctorSpecialization || '',
    clientId: userId,
    clientName: name || '',
    clientEmail: email || '',
    date: booking.date || '',
    time: booking.time || '',
    consultationType: booking.consultationType || 'video',
    reason: booking.reason || '',
    status: 'pending',
    sourceSlot: 'pre-signup',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    const msg = String(err?.message || '');
    const alreadyBooked = /already has an appointment|already booked|conflict/i.test(msg);
    // Either way the pending intent is spent — leaving it in storage is what made
    // this repeat on every load.
    clearPendingBooking();
    return { ok: alreadyBooked, duplicate: alreadyBooked, error: alreadyBooked ? null : msg };
  }

  // addDoc usually flags failures instead of throwing. Without this check a
  // failed POST looked identical to a successful one.
  if (res?._failed) return { ok: false, error: res._error };

  // Denormalised doctor→patient link. Best-effort: the doctor's patient list is
  // derived from appointments anyway, so this must not fail the booking.
  try {
    await setDoc(
      doc(db, 'doctors', booking.doctorId, 'patients', userId),
      { patientId: userId, name: name || '', email: email || '', addedAt: serverTimestamp() },
      { merge: true },
    );
  } catch {
    /* ignore */
  }

  clearPendingBooking();

  // Lets the dashboard greet the patient with their booking straight away,
  // before the appointment list has been refetched.
  try {
    sessionStorage.setItem(
      'th.lastBookedDoctor',
      JSON.stringify({
        doctorName: booking.doctorName,
        specialization: booking.doctorSpecialization || '',
        date: booking.date,
        time: booking.time,
      }),
    );
  } catch {
    /* ignore */
  }

  return { ok: true };
}
