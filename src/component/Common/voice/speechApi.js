import { API_BASE, getStoredToken, refreshAccessToken } from '../../../services/apiClient';

/**
 * The two voice calls. Both go through the server, which holds the provider key and screens
 * what was said; the browser never talks to the speech provider itself.
 */

async function authed(path, init) {
  const send = (token) => fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let res = await send(getStoredToken());
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await send(fresh);
  }
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(body?.message || `Voice request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/** @returns {Promise<{ text, confidence, escalated, safetyText }>} */
export async function transcribe(wav, { snapshot = false } = {}) {
  const form = new FormData();
  form.append('audio', wav, 'speech.wav');
  form.append('language', 'en');
  if (snapshot) form.append('snapshot', 'true');
  const r = await authed('/api/v1/ai/voice/transcribe', { method: 'POST', body: form });
  return {
    text: r?.transcript || '',
    confidence: typeof r?.confidence === 'number' ? r.confidence : null,
    escalated: !!r?.escalated,
    safetyText: r?.text || null,
  };
}

/** @returns {Promise<{ bytes: ArrayBuffer, marks: [number, number][] }>} marks: [char offset, seconds] */
export async function speak(text) {
  const r = await authed('/api/v1/ai/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const bin = atob(r.audioBase64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { bytes: bytes.buffer, marks: Array.isArray(r.marks) ? r.marks : [] };
}

export async function voiceAvailable() {
  try {
    const r = await authed('/api/v1/ai/voice/status', { method: 'GET' });
    return !!r?.available;
  } catch {
    return false;
  }
}
