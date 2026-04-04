const { onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();

const db = admin.firestore();

// ── Twilio setup ─────────────────────────────────────────────────────────────

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;

if (!accountSid || !authToken || !apiKey || !apiSecret) {
  console.error("Missing Twilio environment variables. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY, TWILIO_API_SECRET.");
}

const getTwilioClient = () => twilio(accountSid, authToken);
const { AccessToken } = twilio.jwt;
const { VideoGrant } = AccessToken;

// ── Helper: create a Twilio JWT ───────────────────────────────────────────────

function buildTwilioToken(identity, roomName) {
  const token = new AccessToken(accountSid, apiKey, apiSecret, { identity });
  token.addGrant(new VideoGrant({ room: roomName }));
  token.ttl = 3600;
  return token.toJwt();
}

// ── Helper: write a notification document ────────────────────────────────────

async function createNotification({ targetId, type, title, body, meta = {} }) {
  try {
    await db.collection("notifications").add({
      targetId,
      type,
      title,
      body,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...meta,
    });
  } catch (err) {
    console.error("createNotification failed:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTPS CALLABLES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * generateTwilioToken — for therapist / client therapy video calls.
 * Accepts: { roomName, participantName, participantRole }
 */
exports.generateTwilioToken = onCall(async (request) => {
  if (!request.auth) {
    throw new Error("User must be authenticated");
  }

  const { roomName, participantName, participantRole } = request.data;
  const uid = request.auth.uid;

  if (!roomName || !participantName) {
    throw new Error("roomName and participantName are required");
  }

  const jwtToken = buildTwilioToken(participantName, roomName);

  // Log token generation to Firestore (non-blocking)
  db.collection("videoCalls").add({
    uid,
    roomName,
    participantName,
    participantRole: participantRole || "unknown",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  }).catch((err) => console.error("Firestore log error:", err));

  return { token: jwtToken, roomName, participantName };
});

/**
 * generateDoctorToken — for doctor-initiated medical video consultations.
 * Accepts: { roomName, participantName, appointmentId }
 * Creates the Twilio room if it doesn't exist, then returns a JWT.
 */
exports.generateDoctorToken = onCall(async (request) => {
  if (!request.auth) {
    throw new Error("User must be authenticated");
  }

  const { roomName, participantName, appointmentId } = request.data;
  const uid = request.auth.uid;

  if (!roomName || !participantName) {
    throw new Error("roomName and participantName are required");
  }

  // Create the Twilio room (idempotent — fails silently if it already exists)
  try {
    const twilioClient = getTwilioClient();
    await twilioClient.video.v1.rooms.create({
      uniqueName: roomName,
      maxParticipants: 2,
      type: "peer-to-peer",
    });
  } catch (err) {
    // Error code 53113 = room already exists, that's fine
    if (err.code !== 53113) {
      console.warn("Twilio room creation warning:", err.message);
    }
  }

  const jwtToken = buildTwilioToken(participantName, roomName);

  // Log to Firestore
  db.collection("doctorVideoCalls").add({
    uid,
    roomName,
    participantName,
    appointmentId: appointmentId || null,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  }).catch((err) => console.error("Firestore log error:", err));

  return { token: jwtToken, roomName, participantName };
});

/**
 * createVideoRoom — explicitly create a named Twilio room.
 * Accepts: { roomName, maxParticipants? }
 */
exports.createVideoRoom = onCall(async (request) => {
  if (!request.auth) {
    throw new Error("User must be authenticated");
  }

  const { roomName, maxParticipants = 2 } = request.data;
  const uid = request.auth.uid;

  if (!roomName) {
    throw new Error("roomName is required");
  }

  const twilioClient = getTwilioClient();
  const room = await twilioClient.video.v1.rooms.create({
    uniqueName: roomName,
    maxParticipants,
    type: "peer-to-peer",
  });

  await db.collection("videoRooms").doc(roomName).set({
    sid: room.sid,
    name: room.uniqueName,
    status: room.status,
    createdBy: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    maxParticipants,
    participants: [],
  });

  return {
    success: true,
    room: { sid: room.sid, name: room.uniqueName, status: room.status },
  };
});

/**
 * getRoomStatus — fetch live status of a Twilio room.
 * Accepts: { roomName }
 */
exports.getRoomStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new Error("User must be authenticated");
  }

  const { roomName } = request.data;
  if (!roomName) {
    throw new Error("roomName is required");
  }

  const twilioClient = getTwilioClient();
  const room = await twilioClient.video.v1.rooms(roomName).fetch();

  return {
    success: true,
    room: {
      sid: room.sid,
      name: room.uniqueName,
      status: room.status,
      participantsCount: (room.participants || []).length,
      dateCreated: room.dateCreated,
    },
  };
});

/**
 * validateUserAccess — returns the calling user's role from Firestore.
 */
exports.validateUserAccess = onCall(async (request) => {
  if (!request.auth) {
    throw new Error("User must be authenticated");
  }

  const uid = request.auth.uid;
  const email = request.auth.token.email;

  // Check roles in priority order: doctor → therapist → auth (client/admin)
  const [doctorDoc, therapistDoc, authDoc] = await Promise.all([
    db.collection("doctors").doc(uid).get(),
    db.collection("therapists").doc(uid).get(),
    db.collection("auth").doc(uid).get(),
  ]);

  let role = "unknown";
  if (doctorDoc.exists) role = "doctor";
  else if (therapistDoc.exists) role = therapistDoc.data().role || "therapist";
  else if (authDoc.exists) role = authDoc.data().role || "client";

  return { success: true, user: { uid, email, role, verified: true } };
});

// ═══════════════════════════════════════════════════════════════════════════════
// FIRESTORE TRIGGERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * onDoctorAppointmentWrite — fires when a doctorAppointment document is updated.
 *
 * - New booking (status = 'pending') → notify doctor
 * - Confirmed (status changed to 'confirmed') → notify patient
 * - Cancelled (status changed to 'cancelled') → notify patient
 */
exports.onDoctorAppointmentWrite = onDocumentUpdated(
  "doctorAppointments/{appointmentId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!before || !after) return;

    const statusChanged = before.status !== after.status;
    if (!statusChanged) return;

    const { doctorId, clientId, doctorName, date, time, status } = after;

    if (status === "confirmed") {
      await createNotification({
        targetId: clientId,
        type: "appointment",
        title: "Appointment Confirmed",
        body: `Dr. ${doctorName || "Doctor"} confirmed your appointment on ${date} at ${time}.`,
        meta: { appointmentId: event.params.appointmentId, doctorId, date },
      });
    }

    if (status === "cancelled") {
      await createNotification({
        targetId: clientId,
        type: "appointment",
        title: "Appointment Cancelled",
        body: `Your appointment with Dr. ${doctorName || "Doctor"} on ${date} has been cancelled.`,
        meta: { appointmentId: event.params.appointmentId, doctorId, date },
      });
    }

    if (status === "completed") {
      // Prompt patient to leave a review
      await createNotification({
        targetId: clientId,
        type: "review",
        title: "How was your consultation?",
        body: `You had a consultation with Dr. ${doctorName || "Doctor"}. Leave a review to help others.`,
        meta: { appointmentId: event.params.appointmentId, doctorId, date },
      });
    }
  }
);

/**
 * onDoctorAppointmentCreate — fires when a new doctorAppointment is created.
 * Notifies the doctor of the new booking request.
 */
exports.onDoctorAppointmentCreate = onDocumentCreated(
  "doctorAppointments/{appointmentId}",
  async (event) => {
    const data = event.data.data();
    if (!data) return;

    const { doctorId, clientName, date, time, consultationType } = data;

    await createNotification({
      targetId: doctorId,
      type: "appointment",
      title: "New Appointment Request",
      body: `${clientName || "A patient"} has requested a ${consultationType || "video"} appointment on ${date} at ${time}.`,
      meta: { appointmentId: event.params.appointmentId, date },
    });
  }
);

/**
 * onDoctorReviewCreate — fires when a new doctorReview is created.
 * Recalculates and updates the doctor's averageRating and totalReviews.
 */
exports.onDoctorReviewCreate = onDocumentCreated(
  "doctorReviews/{reviewId}",
  async (event) => {
    const review = event.data.data();
    if (!review?.doctorId || !review?.rating) return;

    const { doctorId } = review;

    try {
      // Fetch all reviews for this doctor
      const reviewsSnap = await db
        .collection("doctorReviews")
        .where("doctorId", "==", doctorId)
        .get();

      const ratings = reviewsSnap.docs.map((d) => d.data().rating || 0);
      const totalReviews = ratings.length;
      const averageRating =
        totalReviews > 0
          ? Math.round((ratings.reduce((s, r) => s + r, 0) / totalReviews) * 10) / 10
          : 0;

      await db.collection("doctors").doc(doctorId).update({
        averageRating,
        totalReviews,
      });

      // Notify the doctor of the new review
      await createNotification({
        targetId: doctorId,
        type: "review",
        title: "New Patient Review",
        body: `A patient left you a ${review.rating}-star review. Your new average is ${averageRating.toFixed(1)}.`,
        meta: { reviewId: event.params.reviewId },
      });

      console.log(`Updated doctor ${doctorId}: avg=${averageRating}, total=${totalReviews}`);
    } catch (err) {
      console.error("onDoctorReviewCreate error:", err);
    }
  }
);

/**
 * onPrescriptionCreate — fires when a new prescription is created.
 * Notifies the patient that a prescription has been issued.
 */
exports.onPrescriptionCreate = onDocumentCreated(
  "prescriptions/{prescriptionId}",
  async (event) => {
    const data = event.data.data();
    if (!data) return;

    const { clientId, doctorName, diagnosis } = data;

    await createNotification({
      targetId: clientId,
      type: "prescription",
      title: "New Prescription Issued",
      body: `Dr. ${doctorName || "Doctor"} issued a prescription for ${diagnosis || "your consultation"}.`,
      meta: { prescriptionId: event.params.prescriptionId },
    });
  }
);
