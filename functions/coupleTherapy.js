const crypto = require("node:crypto");
const { logger } = require("firebase-functions");
const functionsV1 = require("firebase-functions/v1");
const { HttpsError: V1HttpsError } = require("firebase-functions/v1/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const coupleV1 = functionsV1.region("us-central1");

const db = admin.firestore();

/** Gen2 callables need public invoker or browsers get CORS/preflight failures on Cloud Run. */
const coupleCallable = (handler) =>
  onCall({ region: "us-central1", invoker: "public" }, handler);

const COUPLE_STATUSES = {
  AWAITING_PARTNER_B: "awaiting_partner_b",
  PARTNER_B_IN_PROGRESS: "partner_b_in_progress",
  READY_FOR_THERAPIST: "ready_for_therapist",
  THERAPIST_PENDING_CONFIRM: "therapist_pending_confirm",
  THERAPIST_SELECTED: "therapist_selected",
  ACTIVE: "active",
};

const INVITE_BASE_URL = process.env.COUPLE_INVITE_BASE_URL || "https://nessahub.com/couple/join";

function inviteUrl(token) {
  return `${INVITE_BASE_URL}?token=${token}`;
}

async function queueEmail({ to, subject, html, meta = {} }) {
  if (!to) return;
  await db.collection("emailQueue").add({
    to,
    subject,
    html,
    meta,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function notifyUser(targetId, { type, title, body, meta }) {
  if (!targetId) return;
  await db.collection("notifications").add({
    targetId,
    type,
    title,
    body,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...meta,
  });
}

function assertPartnerCaller(auth, couple, partnerKey) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = auth.uid;
  const partner = couple[partnerKey] || {};
  const existingUid = readPartnerField(couple, partnerKey, "authUid");
  if (existingUid) {
    if (existingUid !== uid) {
      const regEmail = normEmail(partner.email);
      const signedEmail = normEmail(auth.token?.email);
      if (!regEmail || !signedEmail || regEmail !== signedEmail) {
        throw new HttpsError("permission-denied", "Not authorized for this couple record.");
      }
    }
    return { uid, linkNeeded: existingUid !== uid };
  }
  const email = normEmail(auth.token?.email);
  const regEmail = normEmail(partner.email);
  if (regEmail && email && regEmail !== email) {
    throw new HttpsError("permission-denied", "Email does not match couple registration.");
  }
  return { uid, linkNeeded: true };
}

/** Callable responses must be plain JSON (no Firestore Timestamp objects). */
function jsonForClient(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v && typeof v.toDate === "function") {
        try {
          return v.toDate().toISOString();
        } catch {
          return null;
        }
      }
      if (v && typeof v === "object" && typeof v._seconds === "number") {
        return new Date(v._seconds * 1000).toISOString();
      }
      return v;
    }),
  );
}

async function loadAuthProfile(uid) {
  if (!uid) return null;
  const snap = await db.collection("auth").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function normEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/** Decide which partner slot the signed-in user should use for this couple. */
async function resolvePartnerLinkKey(coupleId, couple, auth, claimAs) {
  const uid = auth.uid;
  const email = normEmail(auth.token?.email);
  if (readPartnerField(couple, "partnerA", "authUid") === uid) return "partnerA";
  if (readPartnerField(couple, "partnerB", "authUid") === uid) return "partnerB";
  if (email && normEmail(couple.partnerA?.email) === email) return "partnerA";
  if (email && normEmail(couple.partnerB?.email) === email) return "partnerB";

  return null;
}

const FieldValue = admin.firestore.FieldValue;

/** Legacy bug: set({ "partnerA.authUid": uid }) wrote literal top-level keys, not nested partnerA.authUid. */
const LEGACY_FLAT_PARTNER_FIELDS = [
  "authUid",
  "clientId",
  "linkedAt",
  "name",
  "email",
  "intakeComplete",
  "consentComplete",
  "intakeCompletedAt",
];

function flatPartnerFieldKeys(partnerKey) {
  return LEGACY_FLAT_PARTNER_FIELDS.map((f) => `${partnerKey}.${f}`);
}

function readPartnerField(couple, partnerKey, field) {
  const nested = couple[partnerKey] || {};
  const val = nested[field];
  if (val !== undefined && val !== null && val !== "") return val;
  const flatKey = `${partnerKey}.${field}`;
  if (Object.prototype.hasOwnProperty.call(couple, flatKey)) return couple[flatKey];
  return undefined;
}

function readPartnerBool(couple, partnerKey, field) {
  const val = readPartnerField(couple, partnerKey, field);
  return val === true || val === "true";
}

async function cleanupFlatPartnerKeys(ref, partnerKey) {
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const toDelete = flatPartnerFieldKeys(partnerKey).filter((k) =>
    Object.prototype.hasOwnProperty.call(data, k),
  );
  if (!toDelete.length) return;
  await ref.update(Object.fromEntries(toDelete.map((k) => [k, FieldValue.delete()])));
}

/** Move legacy top-level "partnerA.*" keys into nested partnerA / partnerB objects. */
async function migrateLegacyCouplePartnerFields(ref) {
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const deletes = {};
  const nestedPatches = {};

  for (const partnerKey of ["partnerA", "partnerB"]) {
    const partner = { ...(data[partnerKey] || {}) };
    let changed = false;
    for (const field of LEGACY_FLAT_PARTNER_FIELDS) {
      const flatKey = `${partnerKey}.${field}`;
      if (!Object.prototype.hasOwnProperty.call(data, flatKey)) continue;
      deletes[flatKey] = FieldValue.delete();
      if (partner[field] === undefined || partner[field] === null || partner[field] === "") {
        partner[field] = data[flatKey];
        changed = true;
      }
    }
    if (changed) nestedPatches[partnerKey] = partner;
  }

  if (Object.keys(deletes).length) await ref.update(deletes);
  if (Object.keys(nestedPatches).length) {
    await ref.set({ ...nestedPatches, updatedAt: new Date().toISOString() }, { merge: true });
  }
}

async function updatePartnerFields(ref, partnerKey, fields) {
  const snap = await ref.get();
  const data = snap.data() || {};
  const flatKeys = Object.keys(fields).map((k) => `${partnerKey}.${k}`);
  const toDelete = flatKeys.filter((k) => Object.prototype.hasOwnProperty.call(data, k));
  if (toDelete.length) {
    await ref.update(Object.fromEntries(toDelete.map((k) => [k, FieldValue.delete()])));
  }
  const patch = {
    ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [`${partnerKey}.${k}`, v])),
    updatedAt: new Date().toISOString(),
  };
  await ref.update(patch);
}

async function linkPartnerAuthIfNeeded(ref, partnerKey, couple, uid, clientId, authEmail) {
  await migrateLegacyCouplePartnerFields(ref);
  const freshSnap = await ref.get();
  const fresh = freshSnap.exists ? { id: freshSnap.id, ...freshSnap.data() } : couple;
  const partner = fresh[partnerKey] || {};
  const existingUid = readPartnerField(fresh, partnerKey, "authUid");
  const regEmail = normEmail(partner.email);
  const signedEmail = normEmail(authEmail);

  if (existingUid === uid) {
    await cleanupFlatPartnerKeys(ref, partnerKey);
    return;
  }

  if (existingUid && existingUid !== uid) {
    const profile = await loadAuthProfile(uid);
    const canReclaim =
      profile?.coupleId === ref.id &&
      (profile.couplePartnerRole === partnerKey || !profile.couplePartnerRole) ||
      (regEmail && signedEmail && regEmail === signedEmail);
    if (!canReclaim) {
      throw new V1HttpsError("permission-denied", "This partner slot is linked to another account.");
    }
    logger.warn("Reclaiming couple partner authUid", {
      coupleId: ref.id,
      partnerKey,
      previousUid: existingUid,
      newUid: uid,
    });
  }

  await cleanupFlatPartnerKeys(ref, partnerKey);

  const patch = {
    [`${partnerKey}.authUid`]: uid,
    [`${partnerKey}.clientId`]: clientId || partner.clientId || uid,
    [`${partnerKey}.linkedAt`]: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await ref.update(patch);
  } catch (err) {
    logger.warn("linkPartnerAuthIfNeeded update failed, merging partner object", {
      coupleId: ref.id,
      partnerKey,
      message: err?.message,
    });
    await ref.set(
      {
        [partnerKey]: {
          ...partner,
          authUid: uid,
          clientId: clientId || partner.clientId || uid,
          linkedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }
}

async function syncAuthProfileForCouple(uid, coupleId, partnerKey, extra = {}) {
  if (!uid || !coupleId) return;
  await db.collection("auth").doc(uid).set(
    {
      coupleId,
      couplePartnerRole: partnerKey,
      therapyType: "couples",
      userIntent: "therapy",
      updatedAt: new Date().toISOString(),
      ...extra,
    },
    { merge: true },
  );
}

function evaluateCoupleUnlock(couple) {
  return !!(
    readPartnerBool(couple, "partnerA", "intakeComplete") &&
    readPartnerBool(couple, "partnerB", "intakeComplete") &&
    readPartnerBool(couple, "partnerA", "consentComplete") &&
    readPartnerBool(couple, "partnerB", "consentComplete")
  );
}

function hasConsentSection(sections) {
  const c = sections?.consent || {};
  return (
    !!c.signature &&
    c.informedConsent &&
    c.confidentialityAgreement &&
    c.cancellationPolicy &&
    c.emergencyProtocol
  );
}

function parseAvailability(prefs) {
  const days = prefs?.availabilityDays || [];
  const windows = prefs?.availabilityWindows || [];
  return { days, windows };
}

function availabilityOverlaps(aPrefs, bPrefs) {
  const a = parseAvailability(aPrefs);
  const b = parseAvailability(bPrefs);
  if (!a.days.length || !b.days.length) return true;
  const sharedDays = a.days.filter((d) => b.days.includes(d));
  if (!sharedDays.length) return false;
  if (!a.windows.length || !b.windows.length) return true;
  return a.windows.some((w) => b.windows.includes(w));
}

async function refreshCoupleStatus(coupleId, { notifyUnlock = true } = {}) {
  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const couple = snap.data();
  const unlocked = evaluateCoupleUnlock(couple);
  const updates = { updatedAt: new Date().toISOString() };

  if (unlocked && couple.status !== COUPLE_STATUSES.THERAPIST_SELECTED) {
    updates.status = COUPLE_STATUSES.READY_FOR_THERAPIST;
    updates.therapistSelectionUnlocked = true;
    if (!couple.therapistUnlockedAt) updates.therapistUnlockedAt = new Date().toISOString();
  } else if (couple.partnerA?.intakeComplete && !couple.partnerB?.intakeComplete) {
    updates.status = COUPLE_STATUSES.AWAITING_PARTNER_B;
    updates.therapistSelectionUnlocked = false;
  }

  await ref.set(updates, { merge: true });
  const next = { ...couple, ...updates, id: coupleId };

  if (notifyUnlock && unlocked && !couple.therapistSelectionUnlocked) {
    const msg = "Your intake is complete — you can now browse therapists together.";
    await notifyUser(next.partnerA?.authUid, {
      type: "couple_therapist_unlocked",
      title: "Therapist selection unlocked",
      body: msg,
      meta: { coupleId },
    });
    await notifyUser(next.partnerB?.authUid, {
      type: "couple_therapist_unlocked",
      title: "Therapist selection unlocked",
      body: msg,
      meta: { coupleId },
    });
    await queueEmail({
      to: next.partnerA?.email,
      subject: "Therapist selection is now unlocked",
      html: `<p>${msg}</p>`,
      meta: { coupleId, type: "couple_unlocked" },
    });
    await queueEmail({
      to: next.partnerB?.email,
      subject: "Therapist selection is now unlocked",
      html: `<p>${msg}</p>`,
      meta: { coupleId, type: "couple_unlocked" },
    });
  }

  return next;
}

async function sendPartnerInviteEmail(couple, coupleId) {
  const url = couple.partnerB?.inviteUrl || inviteUrl(couple.partnerB?.inviteToken);
  const partnerAName = couple.partnerA?.name || "Your partner";
  const platformName = "NessaHub";
  const html = `
    <p>Hello ${couple.partnerB?.name || ""},</p>
    <p><strong>${partnerAName}</strong> has started couples therapy on <strong>${platformName}</strong> and invited you to join them.</p>
    <p>To move forward, create your own account and complete a short <strong>private</strong> intake form. Your answers are completely confidential — ${partnerAName} will not see what you write.</p>
    <p><a href="${url}">Create your account and start intake</a></p>
  `;
  await queueEmail({
    to: couple.partnerB?.email,
    subject: `${partnerAName} invited you to couples therapy on ${platformName}`,
    html,
    meta: { coupleId, type: "couple_partner_invite" },
  });
  await refSetInviteSent(coupleId);
  return url;
}

async function refSetInviteSent(coupleId) {
  await db.collection("couples").doc(coupleId).set(
    {
      "partnerB.inviteSentAt": new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

exports.createCoupleRegistration = coupleCallable(async (request) => {
  const { relationshipType, partnerA, partnerB } = request.data || {};
  if (!relationshipType || !partnerA?.email || !partnerB?.email) {
    throw new HttpsError("invalid-argument", "relationshipType and both partner emails are required.");
  }
  if (String(partnerA.email).toLowerCase() === String(partnerB.email).toLowerCase()) {
    throw new HttpsError("invalid-argument", "Partner emails must be different.");
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const coupleRef = db.collection("couples").doc();

  const coupleData = {
    therapyType: "couples",
    relationshipType,
    status: COUPLE_STATUSES.AWAITING_PARTNER_B,
    therapistSelectionUnlocked: false,
    paymentComplete: false,
    therapistId: null,
    therapistProposal: null,
    partnerA: {
      name: partnerA.name || "",
      email: String(partnerA.email).toLowerCase(),
      intakeComplete: false,
      consentComplete: false,
      role: "partnerA",
    },
    partnerB: {
      name: partnerB.name || "",
      email: String(partnerB.email).toLowerCase(),
      inviteToken,
      inviteSentAt: null,
      intakeComplete: false,
      consentComplete: false,
      role: "partnerB",
      inviteUrl: inviteUrl(inviteToken),
    },
    createdAt: now,
    updatedAt: now,
    reminderSentAt: null,
    sevenDayAlertSentAt: null,
  };

  await coupleRef.set(coupleData);
  await db.collection("coupleInvites").doc(inviteToken).set({
    coupleId: coupleRef.id,
    partnerBEmail: coupleData.partnerB.email,
    createdAt: now,
    usedAt: null,
  });

  await sendPartnerInviteEmail(coupleData, coupleRef.id);

  return { coupleId: coupleRef.id, inviteToken, inviteUrl: inviteUrl(inviteToken) };
});

async function runLinkCouplePartnerAccount(data, auth) {
  const { coupleId, partnerKey, clientId, name } = data || {};
  if (!coupleId || !["partnerA", "partnerB"].includes(partnerKey)) {
    throw new V1HttpsError("invalid-argument", "coupleId and partnerKey required.");
  }

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new V1HttpsError("not-found", "Couple not found.");
  const couple = snap.data();
  const partner = couple[partnerKey] || {};
  const email = auth.token?.email?.toLowerCase();
  const profile = await loadAuthProfile(auth.uid);
  const profileMatch = profile?.coupleId === coupleId;

  if (partner.authUid && partner.authUid !== auth.uid && !profileMatch) {
    throw new V1HttpsError("permission-denied", "This partner slot is linked to another account.");
  }
  if (partner.email && email && partner.email !== email && !profileMatch) {
    throw new V1HttpsError(
      "permission-denied",
      `Email does not match couple registration (expected ${partner.email}).`,
    );
  }

  await linkPartnerAuthIfNeeded(
    ref,
    partnerKey,
    couple,
    auth.uid,
    clientId || auth.uid,
    auth.token?.email,
  );
  if (name && name !== partner.name) {
    await ref.update({ [`${partnerKey}.name`]: name });
  }

  await syncAuthProfileForCouple(auth.uid, coupleId, partnerKey, {
    email: email || profile?.email,
    name: name || partner.name || profile?.name,
  });

  return { success: true };
}

exports.linkCouplePartnerAccount = coupleV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new V1HttpsError("unauthenticated", "Authentication required.");
  return runLinkCouplePartnerAccount(data, context.auth);
});

/** Couple doc where this email is partner A or B (ignores stale client coupleId hints). */
async function findCoupleByPartnerEmail(email) {
  const normalized = normEmail(email);
  const aSnap = await db.collection("couples").where("partnerA.email", "==", normalized).limit(1).get();
  if (!aSnap.empty) {
    return { coupleId: aSnap.docs[0].id, partnerKey: "partnerA" };
  }
  const bSnap = await db.collection("couples").where("partnerB.email", "==", normalized).limit(1).get();
  if (!bSnap.empty) {
    return { coupleId: bSnap.docs[0].id, partnerKey: "partnerB" };
  }
  return null;
}

/** Find couple by email + link auth profile (fixes 403 when localStorage has stale coupleId). */
async function runClaimCoupleSession(data, auth) {
  const email = normEmail(auth.token?.email);
  if (!email) {
    throw new V1HttpsError("failed-precondition", "Your account must have an email address.");
  }

  const hintId = data?.coupleId || null;
  const emailMatch = await findCoupleByPartnerEmail(email);

  let coupleId = hintId;
  let partnerKey = null;

  if (emailMatch) {
    coupleId = emailMatch.coupleId;
    partnerKey = emailMatch.partnerKey;
  } else {
    return { linked: false, reason: "no_couple_for_email", signedInEmail: email };
  }

  if (!coupleId) {
    return { linked: false, reason: "no_couple_for_email", signedInEmail: email };
  }

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new V1HttpsError("not-found", "Couple not found");
  await migrateLegacyCouplePartnerFields(ref);
  const refreshedSnap = await ref.get();
  const couple = { id: refreshedSnap.id, ...refreshedSnap.data() };

  const claimAs = data?.claimAs === "partnerB" ? "partnerB" : "partnerA";
  partnerKey =
    partnerKey ||
    (await resolvePartnerLinkKey(coupleId, couple, auth, claimAs)) ||
    (normEmail(couple.partnerA?.email) === email
      ? "partnerA"
      : normEmail(couple.partnerB?.email) === email
        ? "partnerB"
        : null);

  if (!partnerKey) {
    return {
      linked: false,
      reason: "email_mismatch",
      signedInEmail: email,
      partnerAEmail: couple.partnerA?.email || null,
      partnerBEmail: couple.partnerB?.email || null,
    };
  }

  await linkPartnerAuthIfNeeded(ref, partnerKey, couple, auth.uid, auth.uid, email);
  await syncAuthProfileForCouple(auth.uid, coupleId, partnerKey, { email });

  const refreshed = await ref.get();
  const latest = { id: refreshed.id, ...refreshed.data() };
  const partner = latest[partnerKey] || {};

  const linkedUid = readPartnerField(latest, partnerKey, "authUid");
  if (linkedUid !== auth.uid) {
    return {
      linked: false,
      reason: "link_failed",
      signedInEmail: email,
      partnerAEmail: latest.partnerA?.email || null,
      partnerBEmail: latest.partnerB?.email || null,
    };
  }

  return {
    linked: true,
    coupleId,
    partnerRole: partnerKey,
    registeredEmail: partner.email || email,
    intakeComplete: readPartnerBool(latest, partnerKey, "intakeComplete"),
    consentComplete: readPartnerBool(latest, partnerKey, "consentComplete"),
    otherPartnerName:
      partnerKey === "partnerA" ? latest.partnerB?.name || "" : latest.partnerA?.name || "",
    inviteUrl: latest.partnerB?.inviteUrl || null,
    partnerAIntakeComplete: readPartnerBool(latest, "partnerA", "intakeComplete"),
    partnerBIntakeComplete: readPartnerBool(latest, "partnerB", "intakeComplete"),
    therapistSelectionUnlocked: !!latest.therapistSelectionUnlocked,
    paymentComplete: !!latest.paymentComplete,
    therapistId: latest.therapistId || null,
    coupleStatus: latest.status || null,
  };
}

exports.claimCoupleSession = coupleV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new V1HttpsError("unauthenticated", "Authentication required.");
  try {
    return await runClaimCoupleSession(data, context.auth);
  } catch (err) {
    if (err instanceof V1HttpsError) throw err;
    logger.error("claimCoupleSession failed", err);
    throw new V1HttpsError("internal", err.message || "Could not claim couple session");
  }
});

exports.getCoupleInviteByToken = coupleCallable(async (request) => {
  const { token } = request.data || {};
  if (!token) throw new HttpsError("invalid-argument", "token is required");

  const inviteSnap = await db.collection("coupleInvites").doc(token).get();
  if (!inviteSnap.exists) throw new HttpsError("not-found", "Invalid or expired invitation.");

  const { coupleId, partnerBEmail } = inviteSnap.data();
  const coupleSnap = await db.collection("couples").doc(coupleId).get();
  if (!coupleSnap.exists) throw new HttpsError("not-found", "Couple registration not found.");

  const couple = coupleSnap.data();
  return {
    coupleId,
    partnerBEmail,
    partnerBName: couple.partnerB?.name || "",
    partnerAName: couple.partnerA?.name || "",
    relationshipType: couple.relationshipType,
    status: couple.status,
    inviteUrl: couple.partnerB?.inviteUrl || inviteUrl(token),
  };
});

exports.sendCouplePartnerInvitation = coupleCallable(async (request) => {
  const { coupleId } = request.data || {};
  if (!coupleId) throw new HttpsError("invalid-argument", "coupleId is required");

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Couple not found");

  const url = await sendPartnerInviteEmail(snap.data(), coupleId);
  return { success: true, inviteUrl: url };
});

async function runSaveCouplePartnerIntake(data, auth) {
  const { coupleId, partnerKey, sectionId, sectionData } = data || {};
  if (!coupleId || !partnerKey || !sectionId) {
    throw new V1HttpsError("invalid-argument", "coupleId, partnerKey, and sectionId are required.");
  }
  if (!["partnerA", "partnerB"].includes(partnerKey)) {
    throw new V1HttpsError("invalid-argument", "Invalid partnerKey.");
  }

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new V1HttpsError("not-found", "Couple not found");

  const couple = snap.data();
  const { uid, linkNeeded } = assertPartnerCaller(auth, couple, partnerKey);
  if (linkNeeded) {
    await linkPartnerAuthIfNeeded(ref, partnerKey, couple, uid, uid, auth.token?.email);
  }

  const privateRef = ref.collection("private").doc(partnerKey);
  const privateSnap = await privateRef.get();
  const sections = privateSnap.exists ? privateSnap.data().sections || {} : {};
  sections[sectionId] = sectionData || {};

  const meta = { partnerKey, sections, updatedAt: new Date().toISOString() };
  if (sectionId === "sensitive") {
    meta.sensitive = true;
    meta.therapistOnly = true;
  }

  await privateRef.set(meta, { merge: true });
  return { success: true };
}

exports.saveCouplePartnerIntake = coupleV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new V1HttpsError("unauthenticated", "Authentication required.");
  return runSaveCouplePartnerIntake(data, context.auth);
});

async function runCompleteCouplePartnerIntake(data, auth) {
  const { coupleId, partnerKey, sections: sectionsPayload } = data || {};
  if (!coupleId || !["partnerA", "partnerB"].includes(partnerKey)) {
    throw new V1HttpsError("invalid-argument", "coupleId and partnerKey required.");
  }

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new V1HttpsError("not-found", "Couple not found");

  const coupleData = snap.data();
  const { uid, linkNeeded } = assertPartnerCaller(auth, coupleData, partnerKey);
  if (linkNeeded) {
    await linkPartnerAuthIfNeeded(ref, partnerKey, coupleData, uid, uid, auth.token?.email);
  }

  const privateRef = ref.collection("private").doc(partnerKey);
  if (sectionsPayload && typeof sectionsPayload === "object") {
    await privateRef.set(
      {
        partnerKey,
        sections: sectionsPayload,
        therapistOnly: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  const privateSnap = await privateRef.get();
  const sections = privateSnap.exists ? privateSnap.data().sections || {} : {};
  const hasConsent = hasConsentSection(sections);

  await updatePartnerFields(ref, partnerKey, {
    intakeComplete: true,
    consentComplete: hasConsent,
    intakeCompletedAt: new Date().toISOString(),
  });

  if (auth.uid) {
    await db
      .collection("auth")
      .doc(auth.uid)
      .set({ coupleIntakeComplete: true, updatedAt: new Date().toISOString() }, { merge: true });
  }

  const coupleBefore = snap.data();
  if (partnerKey === "partnerB") {
    const inviteToken = coupleBefore.partnerB?.inviteToken;
    if (inviteToken) {
      await db.collection("coupleInvites").doc(inviteToken).set({ usedAt: new Date().toISOString() }, { merge: true });
    }
    await notifyUser(coupleBefore.partnerA?.authUid, {
      type: "couple_partner_b_complete",
      title: "Partner intake complete",
      body: `${coupleBefore.partnerB?.name || "Your partner"} completed their private intake.`,
      meta: { coupleId },
    });
    await queueEmail({
      to: coupleBefore.partnerA?.email,
      subject: "Your partner completed their intake",
      html: `<p>${coupleBefore.partnerB?.name || "Your partner"} has completed their private intake form.</p>`,
      meta: { coupleId, type: "partner_b_complete" },
    });
  }

  const couple = await refreshCoupleStatus(coupleId);

  if (couple.partnerA?.intakeComplete && couple.partnerB?.intakeComplete) {
    await queueEmail({
      to: couple.partnerA?.email,
      subject: "Couple intake complete",
      html: "<p>Both partners have completed intake. You can browse therapists when consent is signed.</p>",
      meta: { coupleId, type: "couple_intake_complete" },
    });
    await queueEmail({
      to: couple.partnerB?.email,
      subject: "Couple intake complete",
      html: "<p>Both partners have completed intake.</p>",
      meta: { coupleId, type: "couple_intake_complete" },
    });
  }

  const partner = couple[partnerKey] || {};
  return {
    therapistSelectionUnlocked: !!couple.therapistSelectionUnlocked,
    status: couple.status,
    inviteUrl: couple.partnerB?.inviteUrl,
    partnerEmail: partner.email,
    partnerName: partner.name,
    partnerAIntakeComplete:
      partnerKey === "partnerA" ? true : !!couple.partnerA?.intakeComplete,
    partnerBIntakeComplete:
      partnerKey === "partnerB" ? true : !!couple.partnerB?.intakeComplete,
    paymentComplete: !!couple.paymentComplete,
    therapistId: couple.therapistId || null,
  };
}

exports.completeCouplePartnerIntake = coupleV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new V1HttpsError("unauthenticated", "Authentication required.");
  return runCompleteCouplePartnerIntake(data, context.auth);
});

exports.getCoupleMatchedTherapists = coupleCallable(async (request) => {
  const { coupleId } = request.data || {};
  if (!coupleId) throw new HttpsError("invalid-argument", "coupleId required");

  const coupleSnap = await db.collection("couples").doc(coupleId).get();
  if (!coupleSnap.exists) throw new HttpsError("not-found", "Couple not found");
  const couple = coupleSnap.data();
  if (!evaluateCoupleUnlock(couple)) {
    throw new HttpsError("failed-precondition", "Therapist selection is locked.");
  }

  const [aSnap, bSnap] = await Promise.all([
    db.collection("couples").doc(coupleId).collection("private").doc("partnerA").get(),
    db.collection("couples").doc(coupleId).collection("private").doc("partnerB").get(),
  ]);
  const aPrefs = aSnap.data()?.sections?.preferences || {};
  const bPrefs = bSnap.data()?.sections?.preferences || {};
  const overlapOk = availabilityOverlaps(aPrefs, bPrefs);

  let therapistsRef = db.collection("therapists");
  let snapshot = await therapistsRef.get();
  if (snapshot.empty) {
    therapistsRef = db.collection("therapistt");
    snapshot = await therapistsRef.get();
  }

  const therapists = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => {
      const type = (t.type || t.specialization || "").toLowerCase();
      return type.includes("couple") || type.includes("couples") || type.includes("relationship");
    })
    .map((t) => {
      let score = 50;
      const genderA = aPrefs.therapistGenderPref;
      const genderB = bPrefs.therapistGenderPref;
      const tg = (t.gender || "").toLowerCase();
      if (genderA && genderA !== "No preference" && tg === genderA.toLowerCase()) score += 8;
      if (genderB && genderB !== "No preference" && tg === genderB.toLowerCase()) score += 8;
      if (t.yearsExperience) score += Math.min(t.yearsExperience, 20) * 0.5;
      return { ...t, matchScore: Math.round(score) };
    })
    .sort((x, y) => y.matchScore - x.matchScore);

  return { therapists, availabilityOverlap: overlapOk };
});

exports.proposeCoupleTherapist = coupleCallable(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const { coupleId, therapistId, therapistName } = request.data || {};
  if (!coupleId || !therapistId) throw new HttpsError("invalid-argument", "coupleId and therapistId required.");

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Couple not found");
  const couple = snap.data();
  if (!evaluateCoupleUnlock(couple)) {
    throw new HttpsError("failed-precondition", "Complete intake and consent first.");
  }
  if (!couple.paymentComplete) {
    throw new HttpsError("failed-precondition", "Complete couple payment before selecting a therapist.");
  }

  const uid = request.auth.uid;
  const proposedBy = couple.partnerA?.authUid === uid ? "partnerA" : couple.partnerB?.authUid === uid ? "partnerB" : null;
  if (!proposedBy) throw new HttpsError("permission-denied", "Not a member of this couple.");

  const proposal = {
    therapistId,
    therapistName: therapistName || "",
    proposedBy,
    proposedAt: new Date().toISOString(),
    status: "pending",
  };

  await ref.set(
    {
      therapistProposal: proposal,
      status: COUPLE_STATUSES.THERAPIST_PENDING_CONFIRM,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  const otherKey = proposedBy === "partnerA" ? "partnerB" : "partnerA";
  const other = couple[otherKey] || {};
  await notifyUser(other.authUid, {
    type: "couple_therapist_proposed",
    title: "Confirm your therapist",
    body: `Your partner selected ${therapistName || "a therapist"}. Please confirm to continue.`,
    meta: { coupleId, therapistId },
  });
  await queueEmail({
    to: other.email,
    subject: "Please confirm your couple therapist",
    html: `<p>Your partner selected <strong>${therapistName || "a therapist"}</strong>. Open the app to confirm.</p>`,
    meta: { coupleId, type: "therapist_proposed" },
  });

  return { success: true, proposal };
});

exports.confirmCoupleTherapist = coupleCallable(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const { coupleId, accept } = request.data || {};
  if (!coupleId) throw new HttpsError("invalid-argument", "coupleId required.");

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Couple not found");
  const couple = snap.data();
  const proposal = couple.therapistProposal;
  if (!proposal || proposal.status !== "pending") {
    throw new HttpsError("failed-precondition", "No pending therapist proposal.");
  }

  const uid = request.auth.uid;
  const confirmer = couple.partnerA?.authUid === uid ? "partnerA" : couple.partnerB?.authUid === uid ? "partnerB" : null;
  if (!confirmer || confirmer === proposal.proposedBy) {
    throw new HttpsError("permission-denied", "Only the other partner can confirm.");
  }

  if (!accept) {
    await ref.set(
      { therapistProposal: null, status: COUPLE_STATUSES.READY_FOR_THERAPIST, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return { success: true, declined: true };
  }

  await ref.set(
    {
      therapistId: proposal.therapistId,
      therapistName: proposal.therapistName,
      therapistProposal: { ...proposal, status: "confirmed", confirmedBy: confirmer, confirmedAt: new Date().toISOString() },
      status: COUPLE_STATUSES.THERAPIST_SELECTED,
      therapistSelectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  const payload = {
    therapyType: "couples",
    coupleId,
    therapistId: proposal.therapistId,
    assignedTherapistId: proposal.therapistId,
    assignedTherapistName: proposal.therapistName,
    status: "active",
    updatedAt: new Date().toISOString(),
  };

  for (const key of ["partnerA", "partnerB"]) {
    const clientId = couple[key]?.clientId;
    if (clientId) await db.collection("clients").doc(clientId).set(payload, { merge: true });
  }

  await db.collection("therapists").doc(proposal.therapistId).collection("clients").doc(coupleId).set(
    { coupleId, therapyType: "couples", assignedAt: new Date().toISOString() },
    { merge: true },
  );

  const msg = `You are matched with ${proposal.therapistName || "your therapist"}.`;
  for (const key of ["partnerA", "partnerB"]) {
    await notifyUser(couple[key]?.authUid, {
      type: "couple_therapist_assigned",
      title: "Therapist confirmed",
      body: msg,
      meta: { coupleId, therapistId: proposal.therapistId },
    });
    await queueEmail({
      to: couple[key]?.email,
      subject: "Your couple therapist is confirmed",
      html: `<p>${msg}</p>`,
      meta: { coupleId, type: "therapist_confirmed" },
    });
  }

  return { success: true, therapistId: proposal.therapistId };
});

exports.markCouplePaymentComplete = coupleCallable(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const { coupleId, plan } = request.data || {};
  if (!coupleId) throw new HttpsError("invalid-argument", "coupleId required");

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Couple not found");
  const couple = snap.data();
  if (!evaluateCoupleUnlock(couple)) {
    throw new HttpsError("failed-precondition", "Complete both partners intake and consent first.");
  }

  await ref.set(
    {
      paymentComplete: true,
      subscriptionPlan: plan || "standard",
      paymentCompletedAt: new Date().toISOString(),
      paymentCompletedBy: request.auth.uid,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return { success: true };
});

async function runGetCoupleDashboard(data, auth) {
    let { coupleId, claimAs } = data || {};
    if (!coupleId) throw new V1HttpsError("invalid-argument", "coupleId required");

    const uid = auth.uid;
    const profile = await loadAuthProfile(uid);
    if (profile?.coupleId && profile.coupleId !== coupleId) {
      coupleId = profile.coupleId;
    }
    if (!claimAs && profile?.couplePartnerRole) {
      claimAs = profile.couplePartnerRole === "partnerB" ? "partnerB" : "partnerA";
    }

    const claimed = await runClaimCoupleSession({ coupleId, claimAs }, auth);
    if (!claimed.linked) {
      const email = normEmail(auth.token?.email);
      throw new V1HttpsError(
        "permission-denied",
        claimed.reason === "email_mismatch" && email
          ? `Sign in with the email used at couple registration (Partner A: ${claimed.partnerAEmail || "—"}, Partner B: ${claimed.partnerBEmail || "—"}). You are signed in as ${email}.`
          : "Not linked to this couple. Sign in with the email you used at registration.",
      );
    }

    coupleId = claimed.coupleId;
    const ref = db.collection("couples").doc(coupleId);
    const snap = await ref.get();
    if (!snap.exists) throw new V1HttpsError("not-found", "Couple not found");
    const couple = { id: snap.id, ...snap.data() };

    const partnerKey = claimed.partnerRole === "partnerB" ? "partnerB" : "partnerA";
    const isA = partnerKey === "partnerA";
    const otherKey = isA ? "partnerB" : "partnerA";
    const other = couple[otherKey] || {};
    const proposal = couple.therapistProposal
      ? {
          therapistId: couple.therapistProposal.therapistId || null,
          therapistName: couple.therapistProposal.therapistName || "",
          proposedBy: couple.therapistProposal.proposedBy || null,
          status: couple.therapistProposal.status || null,
        }
      : null;

    return jsonForClient({
      couple: {
        id: couple.id,
        status: couple.status,
        relationshipType: couple.relationshipType,
        therapistSelectionUnlocked: !!couple.therapistSelectionUnlocked,
        paymentComplete: !!couple.paymentComplete,
        therapistId: couple.therapistId || null,
        therapistName: couple.therapistName || null,
        therapistProposal: proposal,
        partnerA: {
          name: couple.partnerA?.name || readPartnerField(couple, "partnerA", "name") || "",
          intakeComplete: readPartnerBool(couple, "partnerA", "intakeComplete"),
          consentComplete: readPartnerBool(couple, "partnerA", "consentComplete"),
        },
        partnerB: {
          name: couple.partnerB?.name || readPartnerField(couple, "partnerB", "name") || "",
          intakeComplete: readPartnerBool(couple, "partnerB", "intakeComplete"),
          consentComplete: readPartnerBool(couple, "partnerB", "consentComplete"),
        },
      },
      myRole: partnerKey,
      otherPartnerName: other.name || "",
      waitingForPartner: !other.intakeComplete,
      inviteUrl: couple.partnerB?.inviteUrl || null,
    });
}

exports.getCoupleDashboard = coupleV1.https.onCall(async (data, context) => {
  try {
    if (!context.auth) throw new V1HttpsError("unauthenticated", "Authentication required.");
    return await runGetCoupleDashboard(data, context.auth);
  } catch (err) {
    if (err instanceof V1HttpsError) throw err;
    logger.error("getCoupleDashboard failed", err);
    throw new V1HttpsError("internal", err.message || "Failed to load couple dashboard");
  }
});

exports.getCoupleCaseForTherapist = coupleCallable(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const { coupleId } = request.data || {};
  if (!coupleId) throw new HttpsError("invalid-argument", "coupleId required");

  const coupleSnap = await db.collection("couples").doc(coupleId).get();
  if (!coupleSnap.exists) throw new HttpsError("not-found", "Couple not found");
  const couple = { id: coupleSnap.id, ...coupleSnap.data() };

  if (couple.therapistId !== request.auth.uid) {
    const tDoc = await db.collection("therapists").doc(request.auth.uid).get();
    if (!tDoc.exists) throw new HttpsError("permission-denied", "Not assigned to this couple.");
  }

  const [aSnap, bSnap] = await Promise.all([
    db.collection("couples").doc(coupleId).collection("private").doc("partnerA").get(),
    db.collection("couples").doc(coupleId).collection("private").doc("partnerB").get(),
  ]);

  const aSections = aSnap.data()?.sections || {};
  const bSections = bSnap.data()?.sections || {};

  return {
    couple: {
      id: couple.id,
      relationshipType: couple.relationshipType,
      status: couple.status,
      partnerA: couple.partnerA,
      partnerB: couple.partnerB,
      relationshipShared: null,
    },
    partnerAIntake: aSections,
    partnerBIntake: bSections,
    relationshipComparison: {
      satisfactionA: aSections.relationship?.relationshipSatisfaction,
      satisfactionB: bSections.relationship?.relationshipSatisfaction,
      objectivesA: aSections.relationship?.treatmentObjectives,
      objectivesB: bSections.relationship?.treatmentObjectives,
    },
  };
});

exports.remindPendingCouplePartner = onSchedule(
  { schedule: "every 12 hours", timeZone: "Africa/Accra" },
  async () => {
    const now = Date.now();
    const cutoff48 = now - 48 * 60 * 60 * 1000;
    const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;

    const snap = await db.collection("couples").where("therapyType", "==", "couples").get();

    for (const docSnap of snap.docs) {
      const couple = docSnap.data();
      if (couple.partnerB?.intakeComplete) continue;

      const created = Date.parse(couple.createdAt || 0);
      const inviteSent = Date.parse(couple.partnerB?.inviteSentAt || couple.createdAt || 0);

      if (inviteSent && inviteSent <= cutoff48) {
        const lastReminder = couple.reminderSentAt ? Date.parse(couple.reminderSentAt) : 0;
        if (!lastReminder || now - lastReminder > 47 * 60 * 60 * 1000) {
          const url = couple.partnerB?.inviteUrl || inviteUrl(couple.partnerB?.inviteToken);
          await queueEmail({
            to: couple.partnerB?.email,
            subject: "Reminder: complete your private couple therapy intake",
            html: `<p>Please complete your confidential intake: <a href="${url}">${url}</a></p>`,
            meta: { coupleId: docSnap.id, type: "couple_partner_reminder_48h" },
          });
          await notifyUser(couple.partnerB?.authUid, {
            type: "couple_reminder",
            title: "Complete your intake",
            body: "Your partner is waiting for you to complete your private intake form.",
            meta: { coupleId: docSnap.id },
          });
          await docSnap.ref.set({ reminderSentAt: new Date().toISOString() }, { merge: true });
        }
      }

      if (created && created <= cutoff7d && !couple.sevenDayAlertSentAt) {
        await notifyUser(couple.partnerA?.authUid, {
          type: "couple_partner_slow",
          title: "Partner has not completed intake",
          body: `${couple.partnerB?.name || "Your partner"} has not finished after 7 days. You can resend the invitation.`,
          meta: { coupleId: docSnap.id, canResendInvite: true },
        });
        await queueEmail({
          to: couple.partnerA?.email,
          subject: "Your partner has not completed couple therapy intake",
          html: `<p>It has been 7 days since you invited ${couple.partnerB?.name || "your partner"}. You can resend their invitation from the app.</p>`,
          meta: { coupleId: docSnap.id, type: "couple_7day_alert" },
        });
        await docSnap.ref.set({ sevenDayAlertSentAt: new Date().toISOString() }, { merge: true });
      }
    }
  },
);

exports.notifyCoupleTherapistAssigned = coupleCallable(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const { coupleId, therapistId, therapistName } = request.data || {};
  if (!coupleId || !therapistId) throw new HttpsError("invalid-argument", "coupleId and therapistId required.");

  const ref = db.collection("couples").doc(coupleId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Couple not found");
  const couple = snap.data();
  const body = `You have been matched with ${therapistName || "a therapist"}.`;

  await notifyUser(couple.partnerA?.authUid, { type: "couple_therapist_assigned", title: "Therapist assigned", body, meta: { coupleId, therapistId } });
  await notifyUser(couple.partnerB?.authUid, { type: "couple_therapist_assigned", title: "Therapist assigned", body, meta: { coupleId, therapistId } });

  return { success: true };
});
