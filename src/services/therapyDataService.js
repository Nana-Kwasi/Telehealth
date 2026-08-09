// ─── Therapy Data Service (REST) ─────────────────────────────────────────────
// Central service module for all therapy, scheduling, client, and therapist
// data operations. Components import from here instead of Firebase directly.
// All functions are async and throw on unrecoverable errors.

import { api, getStoredUserId } from './apiClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => getStoredUserId();

// ── Therapist profile ─────────────────────────────────────────────────────────

export async function getTherapistProfile(therapistId) {
  return api(`/api/v1/therapists/${therapistId}`);
}

export async function updateTherapistProfile(therapistId, data) {
  return api(`/api/v1/therapists/${therapistId}`, { method: 'PATCH', body: data });
}

// ── Therapist → client assignments ───────────────────────────────────────────

export async function getAssignedClients(therapistId) {
  return api(`/api/v1/therapy-management/assignments?therapistId=${therapistId}`) || [];
}

export async function getAllTherapists() {
  return api('/api/v1/therapists', { authenticated: false }) || [];
}

// ── Client profile ────────────────────────────────────────────────────────────

export async function getClientProfile(clientId) {
  try {
    return await api(`/api/v1/clients/${clientId}`);
  } catch {
    return null;
  }
}

export async function updateClientProfile(clientId, data) {
  return api(`/api/v1/clients/${clientId}`, { method: 'PATCH', body: data });
}

export async function createClientProfile(data) {
  return api('/api/v1/clients', { method: 'POST', body: data });
}

// Get extended auth profile (userIntent, coupleId, metadataJson, etc.)
export async function getAuthProfile(userId) {
  try {
    return await api(`/api/v1/auth/${userId}`);
  } catch {
    return null;
  }
}

// ── Scheduled calls (therapy sessions) ───────────────────────────────────────

export async function getScheduledCalls({ therapistId, clientId } = {}) {
  const params = new URLSearchParams();
  if (therapistId) params.set('therapistId', therapistId);
  if (clientId)    params.set('clientId',    clientId);
  const qs = params.toString();
  return api(`/api/v1/scheduled-calls${qs ? `?${qs}` : ''}`) || [];
}

export async function createScheduledCall(data) {
  return api('/api/v1/scheduled-calls', { method: 'POST', body: data });
}

export async function updateScheduledCall(callId, data) {
  return api(`/api/v1/scheduled-calls/${callId}`, { method: 'PATCH', body: data });
}

export async function deleteScheduledCall(callId) {
  return api(`/api/v1/scheduled-calls/${callId}`, { method: 'DELETE' });
}

// ── Therapy notes ─────────────────────────────────────────────────────────────

export async function getTherapyNotes(clientId) {
  return api(`/api/v1/clients/${clientId}/therapy-notes`) || [];
}

export async function createTherapyNote(clientId, data) {
  return api(`/api/v1/clients/${clientId}/therapy-notes`, { method: 'POST', body: data });
}

// Therapist-level notes (broader, not per-client)
export async function getTherapistNotes(therapistId) {
  return api(`/api/v1/therapist-notes?therapistId=${therapistId}`) || [];
}

export async function createTherapistNote(data) {
  return api('/api/v1/therapist-notes', { method: 'POST', body: data });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(targetId) {
  return api(`/api/v1/notifications?targetId=${targetId}`) || [];
}

export async function markNotificationRead(notificationId) {
  return api('/api/v1/therapy-management/notifications/read', {
    method: 'POST',
    body:   { notificationId },
  });
}

// ── Mood tracking ─────────────────────────────────────────────────────────────

export async function logMoodEntry(clientId, data) {
  return api(`/api/v1/clients/${clientId}/mood`, { method: 'POST', body: { clientId, ...data } });
}

export async function getMoodEntries(clientId) {
  return api(`/api/v1/clients/${clientId}/mood`) || [];
}

// ── Auth account operations ───────────────────────────────────────────────────

export async function changePassword(userId, currentPassword, newPassword) {
  return api('/api/v1/auth/password-change', {
    method: 'POST',
    body:   { userId, currentPassword, newPassword },
  });
}

export async function changeEmail(userId, currentPassword, newEmail) {
  return api('/api/v1/auth/email-change', {
    method: 'POST',
    body:   { userId, currentPassword, newEmail },
  });
}

export async function deleteAccount(password) {
  const userId = uid();
  return api('/api/v1/auth/account/delete', {
    method: 'POST',
    body:   { password },
  });
}

// ── Utility: resolve client ID from stored session or auth profile ─────────────

export async function resolveClientId() {
  // Try localStorage first (set during onboarding)
  const local = localStorage.getItem('th.clientId');
  if (local) return local;
  // Fall back to auth profile metadataJson
  const storedUid = uid();
  if (!storedUid) return null;
  try {
    const authDoc = await getAuthProfile(storedUid);
    if (authDoc?.metadataJson) {
      const meta = JSON.parse(authDoc.metadataJson);
      if (meta?.clientId) {
        localStorage.setItem('th.clientId', meta.clientId);
        return meta.clientId;
      }
    }
    // Last resort: use the user ID itself as the client ID
    return storedUid;
  } catch {
    return storedUid;
  }
}
