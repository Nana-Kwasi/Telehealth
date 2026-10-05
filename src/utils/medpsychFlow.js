// ─── medpsychFlow ────────────────────────────────────────────────────────────
// The MedPsych sign-up, held client-side until it is finished.
//
// Nothing about this user reaches the database until they have chosen a
// psychiatrist and paid for the consultation. That is deliberate: a person who
// abandons the flow halfway should leave no orphaned account, no unpaid booking
// and no half-written consent record behind. The backend exposes a single
// transactional commit endpoint for exactly this reason.
//
// The cache lives in sessionStorage rather than React state so a refresh, or the
// payment provider bouncing the browser out and back, does not throw the user
// back to the first step. It is cleared the moment the flow commits or is
// abandoned.
//
// One thing it deliberately does NOT hold for longer than it must: the password.
// It is needed for the final register call, so it has to survive the flow, but
// it is dropped from storage as soon as that call succeeds.

const KEY = 'nessa.medpsych.flow';

/** Every policy that must be ticked. Mirrors MedPsychController.REQUIRED_POLICIES. */
export const REQUIRED_POLICIES = [
  {
    key: 'terms_of_use',
    label: 'Terms of Use',
    summary: 'The rules for using NessaHub, including acceptable use and account responsibilities.',
  },
  {
    key: 'privacy_policy',
    label: 'Privacy Policy',
    summary: 'How your health information is stored, who can see it, and your rights over it.',
  },
  {
    key: 'informed_consent',
    label: 'Informed Consent to Care',
    summary:
      'You understand this is a second opinion and does not replace the care you receive from your current provider.',
  },
  {
    key: 'telehealth_consent',
    label: 'Telehealth Consent',
    summary: 'You consent to being seen remotely by video or audio, and understand its limits.',
  },
];

const EMPTY = {
  step: 'signup',           // signup → intake → therapist → booking → payment → done
  details: null,            // { fullName, email, password, phone }
  acceptedPolicies: [],     // policy keys the user ticked
  policyVersion: '1.0',
  // Which service this flow is for: 'medpsych' (Psychology & Counseling) or
  // 'second_opinion'. Both share these steps, this cache and the commit
  // endpoint; they differ in which intake is collected and what the resulting
  // dashboard shows.
  serviceType: 'medpsych',
  // individual | teen | couples. One value, one place, so nothing downstream
  // re-derives it and drifts.
  therapyType: 'individual',
  intake: null,             // questionnaire answers, cached until commit
  therapist: null,          // { id, name, specialization, photoURL, rate }
  booking: null,            // { scheduledAt, durationMinutes, sessionType, reasonForVisit }
  payment: null,            // { reference, amount, currency }
  startedAt: null,
};

function read() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

function write(next) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage disabled or full. The flow still works within the page; only
    // surviving a refresh is lost, which is better than failing outright.
  }
  return next;
}

export function getFlow() {
  return read();
}

/** Merge a patch into the cached flow. */
export function updateFlow(patch) {
  const current = read();
  return write({
    ...current,
    ...patch,
    startedAt: current.startedAt || new Date().toISOString(),
  });
}

export function clearFlow() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

/** True when every required policy has been ticked. */
export function allPoliciesAccepted(accepted) {
  const set = new Set(accepted || []);
  return REQUIRED_POLICIES.every((p) => set.has(p.key));
}

/**
 * Whether the flow is complete enough to commit.
 * The backend enforces all of this too — this is only so the UI can keep the
 * button disabled rather than letting someone submit and be told no.
 */
export function canCommit(flow) {
  const f = flow || read();
  return Boolean(
    f.details?.fullName
    && f.details?.email
    && f.details?.password
    && allPoliciesAccepted(f.acceptedPolicies)
    && f.therapist?.id
    && f.booking?.scheduledAt
    && f.payment?.reference,
  );
}

/**
 * A couple sign-up commits against its server-side draft, not this flow, so the
 * things `canCommit` insists on are deliberately absent: the password lives on
 * the draft (never in the browser) and consent was captured in the couple
 * intake. What still has to be true is that a therapist, a slot and a real
 * payment reference exist.
 */
export function canCommitCouple(flow) {
  const f = flow || read();
  return Boolean(f.therapist?.id && f.booking?.scheduledAt && f.payment?.reference);
}

/** The payload the commit endpoint expects. */
export function toRegisterPayload(flow) {
  const f = flow || read();
  return {
    fullName: f.details.fullName,
    email: f.details.email,
    password: f.details.password,
    phone: f.details.phone || null,
    acceptedPolicies: f.acceptedPolicies,
    policyVersion: f.policyVersion,
    therapistId: f.therapist.id,
    scheduledAt: f.booking.scheduledAt,
    durationMinutes: f.booking.durationMinutes || 50,
    sessionType: f.booking.sessionType || 'video',
    reasonForVisit: f.booking.reasonForVisit || null,
    paymentReference: f.payment.reference,
    amountPaid: f.payment.amount ?? 0,
    currency: f.payment.currency || 'GHS',
    // Cached with the rest of the flow and only sent at commit time, like
    // everything else here — an abandoned sign-up must leave nothing behind.
    // The server writes these into client_profiles_v2.preferences_json, which
    // is where the assigned psychiatrist's client screen already reads intake.
    intakeAnswers: f.intake || null,
    serviceType: f.serviceType || 'medpsych',
    therapyType: f.therapyType || 'individual',
  };
}
