const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();

const accountSid = "ACba1f95d400d160c1d0b18ba4e003ae98";
const authToken = "a4a50462c4709da9463f6ad0b28d8620";
const apiKey = "SK606d563b2c39e7948fd67306bd61e29e";
const apiSecret = "OaEKGayQTvxRhyiUgyyZNabPUXKIWVOS";

const client = twilio(accountSid, authToken);
const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

exports.generateTwilioToken = onCall(async (request) => {
  try {
    console.log('generateTwilioToken called with data:', request.data);
    console.log('Context auth:', request.auth);
    console.log('Function version: 2.0.0 - v2 syntax enabled');
    
    if (!request.auth) {
      throw new Error("User must be authenticated");
    }

    const {roomName, participantName, participantRole} = request.data;
    const uid = request.auth.uid;
    
    console.log('Extracted data:', { roomName, participantName, participantRole, uid });

    if (!roomName || !participantName) {
      throw new Error("Room name and participant name are required");
    }

    console.log('Creating Twilio token with:', { accountSid, apiKey, apiSecret });
    
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: participantName,
    });

    const videoGrant = new VideoGrant({
      room: roomName,
    });

    token.addGrant(videoGrant);
    token.ttl = 3600;

    console.log('Token created, attempting to save to Firestore...');
    
    try {
      await admin.firestore().collection("videoCalls").add({
        uid,
        roomName,
        participantName,
        participantRole,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        tokenGenerated: true,
      });
      console.log('Successfully saved to Firestore');
    } catch (firestoreError) {
      console.error('Firestore error:', firestoreError);
      // Continue even if Firestore fails - the token is still valid
    }

    const jwtToken = token.toJwt();
    console.log('JWT token generated successfully, length:', jwtToken.length);

    return {
      token: jwtToken,
      roomName,
      participantName,
    };
  } catch (error) {
    console.error("Error generating Twilio token:", error);
    console.error("Error stack:", error.stack);
    throw new Error(`Failed to generate token: ${error.message}`);
  }
});

// exports.createVideoRoom = functions.https.onCall(async (data, context) => {
//   try {
//     if (!context.auth) {
//       throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
//     }

//     const {roomName, maxParticipants = 2} = data;
//     const uid = context.auth.uid;

//     if (!roomName) {
//       throw new functions.https.HttpsError("invalid-argument", "Room name is required");
//     }

//     const room = await client.video.rooms.create({
//       uniqueName: roomName,
//       maxParticipants,
//       type: "peer-to-peer",
//     });

//     await admin.firestore().collection("videoRooms").doc(roomName).set({
//       sid: room.sid,
//       name: room.uniqueName,
//       status: room.status,
//       createdBy: uid,
//       createdAt: admin.firestore.FieldValue.serverTimestamp(),
//       maxParticipants,
//       participants: [],
//     });

//     return {
//       success: true,
//       room: {
//         sid: room.sid,
//         name: room.uniqueName,
//         status: room.status,
//       },
//     };
//   } catch (error) {
//     console.error("Error creating video room:", error);
//     throw new functions.https.HttpsError("internal", "Failed to create room");
//   }
// });

// exports.getRoomStatus = functions.https.onCall(async (data, context) => {
//   try {
//     if (!context.auth) {
//       throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
//     }

//     const {roomName} = data;

//     if (!roomName) {
//       throw new functions.https.HttpsError("invalid-argument", "Room name is required");
//     }

//     const room = await client.video.rooms(roomName).fetch();

//     return {
//       success: true,
//       room: {
//         sid: room.sid,
//         name: room.uniqueName,
//         status: room.status,
//         participantsCount: room.participantsCount,
//         dateCreated: room.dateCreated,
//       },
//     };
//   } catch (error) {
//     console.error("Error getting room status:", error);
//     throw new functions.https.HttpsError("internal", "Failed to get room status");
//   }
// });

exports.generateTwilioToken = onCall(async (request) => {
  try {
    console.log('generateTwilioToken called with data:', request.data);
    console.log('Context auth:', request.auth);
    console.log('Function version: 2.0.0 - v2 syntax enabled');
    
    if (!request.auth) {
      throw new Error("User must be authenticated");
    }

    const {roomName, participantName, participantRole} = request.data;
    const uid = request.auth.uid;
    
    console.log('Extracted data:', { roomName, participantName, participantRole, uid });

    if (!roomName || !participantName) {
      throw new Error("Room name and participant name are required");
    }

    console.log('Creating Twilio token with:', { accountSid, apiKey, apiSecret });
    
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: participantName,
    });

    const videoGrant = new VideoGrant({
      room: roomName,
    });

    token.addGrant(videoGrant);
    token.ttl = 3600;

    console.log('Token created, attempting to save to Firestore...');
    
    try {
      await admin.firestore().collection("videoCalls").add({
        uid,
        roomName,
        participantName,
        participantRole,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        tokenGenerated: true,
      });
      console.log('Successfully saved to Firestore');
    } catch (firestoreError) {
      console.error('Firestore error:', firestoreError);
      // Continue even if Firestore fails - the token is still valid
    }

    const jwtToken = token.toJwt();
    console.log('JWT token generated successfully, length:', jwtToken.length);

    return {
      token: jwtToken,
      roomName,
      participantName,
    };
  } catch (error) {
    console.error("Error generating Twilio token:", error);
    console.error("Error stack:", error.stack);
    throw new Error(`Failed to generate token: ${error.message}`);
  }
});

exports.createVideoRoom = onCall(async (request) => {
  try {
    console.log('createVideoRoom called');
    
    if (!request.auth) {
      throw new Error("User must be authenticated");
    }

    const { roomName, maxParticipants = 2 } = request.data;
    const uid = request.auth.uid;

    if (!roomName) {
      throw new Error("Room name is required");
    }

    console.log('Creating Twilio room:', roomName);

    const room = await client.video.rooms.create({
      uniqueName: roomName,
      maxParticipants,
      type: "peer-to-peer",
    });

    console.log('Twilio room created:', room.sid);

    // Save room info to Firestore
    await admin.firestore().collection("videoRooms").doc(roomName).set({
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
      room: {
        sid: room.sid,
        name: room.uniqueName,
        status: room.status,
      },
    };
  } catch (error) {
    console.error("Error creating video room:", error);
    throw new Error(`Failed to create room: ${error.message}`);
  }
});

exports.getRoomStatus = onCall(async (request) => {
  try {
    console.log('getRoomStatus called');
    
    if (!request.auth) {
      throw new Error("User must be authenticated");
    }

    const { roomName } = request.data;

    if (!roomName) {
      throw new functions.https.HttpsError("invalid-argument", "Room name is required");
    }

    console.log('Fetching room status for:', roomName);

    const room = await client.video.rooms(roomName).fetch();

    return {
      success: true,
      room: {
        sid: room.sid,
        name: room.uniqueName,
        status: room.status,
        participantsCount: room.participantsCount || 0,
        dateCreated: room.dateCreated,
      },
    };
  } catch (error) {
    console.error("Error getting room status:", error);
    throw new Error(`Failed to get room status: ${error.message}`);
  }
});

// Helper function to validate user permissions (optional)
exports.validateUserAccess = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new Error("User must be authenticated");
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;
    
    // Get user role from Firestore
    const userDoc = await admin.firestore().collection('auth').doc(uid).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError("not-found", "User profile not found");
    }

    const userData = userDoc.data();
    
    return {
      success: true,
      user: {
        uid,
        email,
        role: userData.role,
        verified: true
      }
    };

  } catch (error) {
    console.error("Error validating user access:", error);
    throw new Error(`Failed to validate user access: ${error.message}`);
  }
});