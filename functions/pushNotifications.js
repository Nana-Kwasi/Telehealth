const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const db = admin.firestore();

async function collectPushTokens(targetId) {
  const tokens = new Set();
  const collections = ["homeCareNurses", "auth", "admins", "therapists"];
  for (const col of collections) {
    const snap = await db.collection(col).doc(targetId).get();
    if (!snap.exists) continue;
    const data = snap.data();
    (data.pushTokens || []).forEach((t) => tokens.add(t));
    if (data.fcmToken) tokens.add(data.fcmToken);
  }
  return [...tokens].filter(Boolean);
}

exports.onNotificationCreatedPush = onDocumentCreated(
  "notifications/{notifId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.targetId) return;

    const tokens = await collectPushTokens(data.targetId);
    if (!tokens.length) return;

    const message = {
      notification: {
        title: data.title || "NessaHub",
        body: data.body || "",
      },
      data: {
        type: String(data.type || ""),
        ...(data.meta || {}),
      },
    };

    const fcmTokens = tokens.filter((t) => !t.startsWith("ExponentPushToken"));
    if (fcmTokens.length) {
      try {
        await admin.messaging().sendEachForMulticast({
          tokens: fcmTokens,
          ...message,
        });
      } catch (err) {
        console.error("FCM multicast failed:", err);
      }
    }

    const expoTokens = tokens.filter((t) => t.startsWith("ExponentPushToken"));
    if (expoTokens.length) {
      try {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            expoTokens.map((to) => ({
              to,
              title: message.notification.title,
              body: message.notification.body,
              data: message.data,
            })),
          ),
        });
      } catch (err) {
        console.error("Expo push failed:", err);
      }
    }
  },
);
