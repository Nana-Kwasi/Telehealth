const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const db = admin.firestore();

const PACKAGE_DURATIONS = ["weekly", "monthly", "yearly"];

function accraTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function notify({ targetId, type, title, body, meta = {} }) {
  if (!targetId) return;
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
    console.error("homeCare notify failed:", err);
  }
}

exports.onHomeCareBookingCreated = onDocumentCreated(
  "homeCareBookings/{bookingId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    if (data.bookingType === "emergency" && !data.nurseId) {
      const RADIUS_KM = 25;
      const plat = data.latitude ?? data.patientLatitude;
      const plng = data.longitude ?? data.patientLongitude;

      let nurses = await db
        .collection("homeCareNurses")
        .where("accountStatus", "==", "approved")
        .where("presenceStatus", "==", "online")
        .limit(50)
        .get();

      if (plat != null && plng != null) {
        const haversine = (lat1, lng1, lat2, lng2) => {
          const R = 6371;
          const dLat = ((lat2 - lat1) * Math.PI) / 180;
          const dLng = ((lng2 - lng1) * Math.PI) / 180;
          const x =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
              Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
        };
        nurses = {
          docs: nurses.docs.filter((doc) => {
            const n = doc.data();
            const nlat = n.latitude;
            const nlng = n.longitude;
            if (nlat == null || nlng == null) return true;
            return haversine(plat, plng, nlat, nlng) <= RADIUS_KM;
          }),
        };
      }
      await Promise.all(
        nurses.docs.map((doc) =>
          notify({
            targetId: doc.id,
            type: "homecare_emergency",
            title: "Emergency home-care request",
            body: `${data.careType || "Care"} at ${data.address || "see app"}`,
            meta: { bookingId: event.params.bookingId },
          }),
        ),
      );
      return;
    }

    if (data.nurseId) {
      await notify({
        targetId: data.nurseId,
        type: "homecare_booking",
        title: "New home-care request",
        body: `${data.patientName || "A patient"} requested ${data.careType || "care"}.`,
        meta: { bookingId: event.params.bookingId },
      });
    }
  },
);

exports.onHomeCareBookingUpdated = onDocumentUpdated(
  "homeCareBookings/{bookingId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after) return;

    if (before.status !== after.status && after.status === "accepted" && after.patientId) {
      await notify({
        targetId: after.patientId,
        type: "homecare_accepted",
        title: "Nurse accepted your request",
        body: `${after.nurseName || "Your nurse"} will contact you shortly.`,
        meta: { bookingId: event.params.bookingId },
      });
    }

    if (before.status !== after.status && after.status === "completed" && after.patientId) {
      const ended = after.packageClosureReason === "period_end";
      await notify({
        targetId: after.patientId,
        type: "homecare_completed",
        title: ended ? "Care period ended" : "Visit completed",
        body: ended
          ? `Your ${after.durationType || "package"} plan reached its end date. Extend in booking details if care should continue.`
          : "View your visit summary and leave feedback.",
        meta: { bookingId: event.params.bookingId },
      });
    }
  },
);

exports.closeExpiredHomeCarePackages = onSchedule(
  {
    schedule: "27 5 * * *",
    timeZone: "Africa/Accra",
    region: "us-central1",
    retryCount: 0,
  },
  async () => {
    const today = accraTodayYmd();
    const snap = await db
      .collection("homeCareBookings")
      .where("status", "==", "ongoing")
      .limit(400)
      .get();
    let closed = 0;
    for (const docSnap of snap.docs) {
      const d = docSnap.data();
      if (!PACKAGE_DURATIONS.includes(d.durationType)) continue;
      if (!d.endDate || d.endDate >= today) continue;
      await docSnap.ref.update({
        status: "completed",
        packageClosureReason: "period_end",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (d.nurseId) {
        await db
          .collection("homeCareNurses")
          .doc(d.nurseId)
          .update({
            presenceStatus: "online",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          .catch(() => {});
      }
      closed++;
    }
    console.log(`closeExpiredHomeCarePackages: closed ${closed} bookings (today=${today})`);
  },
);

exports.extendHomeCarePackage = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in to extend a care plan.");
    }
    const bookingId = request.data?.bookingId;
    const newEndDate = request.data?.newEndDate;
    const nextDuration = request.data?.durationType ?? null;
    if (!bookingId || typeof bookingId !== "string") {
      throw new HttpsError("invalid-argument", "bookingId required");
    }
    if (!newEndDate || typeof newEndDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(newEndDate.trim())) {
      throw new HttpsError("invalid-argument", "newEndDate (YYYY-MM-DD) required");
    }
    const end = newEndDate.trim();
    const ref = db.collection("homeCareBookings").doc(bookingId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Booking not found");
    const b = snap.data();

    if (b.patientId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Only the patient can extend this plan.");
    }
    if (!PACKAGE_DURATIONS.includes(b.durationType)) {
      throw new HttpsError("failed-precondition", "Only weekly, monthly, or yearly plans can be extended.");
    }
    if (b.status !== "completed") {
      throw new HttpsError(
        "failed-precondition",
        'Plan must be completed before extension. If it is still "ongoing", refresh or wait for automatic closure.',
      );
    }
    const prevEnd = String(b.endDate || "");
    if (!prevEnd) throw new HttpsError("failed-precondition", "Booking has no previous end date.");
    if (end <= prevEnd) throw new HttpsError("invalid-argument", "New end date must be after the previous period end.");
    if (nextDuration && !PACKAGE_DURATIONS.includes(nextDuration)) {
      throw new HttpsError("invalid-argument", "Invalid duration type.");
    }

    await ref.update({
      status: "ongoing",
      endDate: end,
      ...(nextDuration ? { durationType: nextDuration } : {}),
      packageClosureReason: admin.firestore.FieldValue.delete(),
      completedAt: admin.firestore.FieldValue.delete(),
      extensions: admin.firestore.FieldValue.arrayUnion({
        at: new Date().toISOString(),
        patientUid: request.auth.uid,
        previousEndDate: prevEnd,
        newEndDate: end,
        durationType: nextDuration || b.durationType,
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (b.nurseId) {
      await notify({
        targetId: b.nurseId,
        type: "homecare_extended",
        title: "Patient extended care plan",
        body: `${b.patientName || "A patient"} extended the plan end date to ${end}.`,
        meta: { bookingId },
      });
    }

    return { ok: true };
  },
);

exports.onHomeCareComplaintCreated = onDocumentCreated(
  "homeCareComplaints/{complaintId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const admins = await db.collection("admins").limit(20).get();
    const targets = admins.docs.map((d) => d.id);
    if (!targets.length && data.nurseId) {
      targets.push(data.nurseId);
    }
    await Promise.all(
      targets.map((targetId) =>
        notify({
          targetId,
          type: "homecare_complaint",
          title: "Home-care complaint filed",
          body: data.nature || "New complaint",
          meta: { complaintId: event.params.complaintId },
        }),
      ),
    );
  },
);
