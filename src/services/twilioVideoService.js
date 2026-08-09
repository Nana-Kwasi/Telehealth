// ─── twilioVideoService ──────────────────────────────────────────────────────
// Access tokens for Twilio Video, from our own backend.
//
// The web app used to call a Firebase Cloud Function:
//
//   httpsCallable(functions, 'generateTwilioToken')({ roomName, participantName })
//
// That function went away when the app moved off Firebase, so every web video
// call was requesting a token from something that no longer existed. The Spring
// backend already signs proper Access Tokens (VideoGrant, official Twilio Java
// SDK) — this points the web app at it.
//
// Tokens are signed with an API Key SID + Secret, never the Auth Token, and are
// only ever minted server-side: the credentials must not reach the browser.

import { api } from './apiClient';

/**
 * Mint an access token for a room.
 *
 * The backend re-derives the identity from the caller's auth token
 * (TwilioIdentityPolicy), so a client cannot mint a token for someone else by
 * passing a different name.
 *
 * @returns {{ token: string, roomName: string, identity: string, expiresInSeconds: number }}
 */
export async function generateVideoToken({ roomName, participantName, maxParticipants, roomType } = {}) {
  if (!roomName) throw new Error('A room name is required to join a call.');
  if (!participantName) throw new Error('A participant name is required to join a call.');

  const res = await api('/api/v1/video/twilio/generate-token', {
    method: 'POST',
    body: {
      roomName,
      participantName,
      ...(maxParticipants ? { maxParticipants } : {}),
      ...(roomType ? { roomType } : {}),
    },
  });

  if (!res?.token) {
    // The backend throws a descriptive error when Twilio credentials are absent;
    // surface that rather than handing `undefined` to Video.connect(), which
    // fails with an opaque SDK error.
    throw new Error('The video service did not return an access token.');
  }
  return res;
}

/** Create the room up front (optional — connecting also creates it). */
export async function ensureVideoRoom({ roomName, maxParticipants, roomType } = {}) {
  if (!roomName) throw new Error('A room name is required.');
  return api('/api/v1/video/twilio/rooms', {
    method: 'POST',
    body: {
      roomName,
      ...(maxParticipants ? { maxParticipants } : {}),
      ...(roomType ? { roomType } : {}),
    },
  });
}

/**
 * The room name for a scheduled session.
 *
 * `room_name` is null on every existing scheduled call, so both parties have to
 * derive the same name or they connect to different rooms and each sees an empty
 * call. Deriving it from the call id guarantees they match.
 */
export function roomNameForCall(call) {
  if (!call) return null;
  const explicit = call.roomName || call.room_name;
  if (explicit) return explicit;
  return call.id ? `session-${call.id}` : null;
}
