// ─── Chat Service (REST + polling) ────────────────────────────────────────────
// Replaces Firebase real-time chat with REST + polling.
// Components import from here; polling interval can be adjusted per screen.

import { api, getStoredUserId } from './apiClient';

// ── Chat threads ──────────────────────────────────────────────────────────────

export async function getOrCreateThread(participantA, participantB, channel = 'client-therapist') {
  // Try to find existing thread first
  const threads = await api(`/api/v1/care/chats/threads?userId=${participantA}`) || [];
  const existing = threads.find(t =>
    (t.participantA === participantB || t.participantB === participantB)
  );
  if (existing) return existing;
  return api('/api/v1/care/chats/threads', {
    method: 'POST',
    body: { channel, participantA, participantB },
  });
}

export async function getUserThreads(userId) {
  return api(`/api/v1/care/chats/threads?userId=${userId}`) || [];
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getThreadMessages(threadId, limit = 300) {
  return api(`/api/v1/care/chats/threads/${threadId}/messages?limit=${limit}`) || [];
}

export async function sendMessage(threadId, body, messageType = 'text') {
  const senderId = getStoredUserId();
  return api(`/api/v1/care/chats/threads/${threadId}/messages`, {
    method: 'POST',
    body: { senderId, body, messageType },
  });
}

// ── Staff chat (therapist ↔ therapist) ────────────────────────────────────────

export async function getStaffMessages(threadKey, limit = 300) {
  return api(`/api/v1/realtime/staff-chat/messages?threadKey=${encodeURIComponent(threadKey)}&limit=${limit}`) || [];
}

export async function sendStaffMessage(threadKey, message, messageType = 'text') {
  const senderId = getStoredUserId();
  return api('/api/v1/realtime/staff-chat/messages', {
    method: 'POST',
    body: { threadKey, senderId, message, messageType },
  });
}

// ── Presence + typing ─────────────────────────────────────────────────────────

export async function setPresence(userId, status, meta) {
  return api(`/api/v1/realtime/presence/${userId}`, {
    method: 'PUT',
    body: { status, metadataJson: meta ? JSON.stringify(meta) : null },
  }).catch(() => {});
}

export async function setTyping(threadId, isTyping) {
  return api('/api/v1/realtime/typing', {
    method: 'POST',
    body: { threadId, isTyping },
  }).catch(() => {});
}

// ── Polling helper ────────────────────────────────────────────────────────────
// Returns a cleanup function. Calls onMessages(messages) every intervalMs.

export function pollMessages(threadId, onMessages, intervalMs = 4000) {
  let cancelled = false;
  const fetch = async () => {
    if (cancelled) return;
    try {
      const msgs = await getThreadMessages(threadId);
      if (!cancelled) onMessages(msgs);
    } catch { /* ignore */ }
  };
  fetch();
  const id = setInterval(fetch, intervalMs);
  return () => { cancelled = true; clearInterval(id); };
}

export function pollStaffMessages(threadKey, onMessages, intervalMs = 4000) {
  let cancelled = false;
  const fetch = async () => {
    if (cancelled) return;
    try {
      const msgs = await getStaffMessages(threadKey);
      if (!cancelled) onMessages(msgs);
    } catch { /* ignore */ }
  };
  fetch();
  const id = setInterval(fetch, intervalMs);
  return () => { cancelled = true; clearInterval(id); };
}
