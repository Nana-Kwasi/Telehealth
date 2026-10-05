// ─── NessaHub Web — REST API Client ──────────────────────────────────────────
// Central fetch wrapper for the Spring Boot backend.
// Session is kept in sessionStorage (tab-scoped, no cross-tab bleed — appropriate
// for a healthcare app where each browser tab is an independent session).

// The backend runs on the same machine that serves this page, whose LAN address
// changes every time it rejoins a network — a personal hotspot hands out a
// different 172.20.10.x lease on each connect. A hardcoded literal here meant
// every reconnect silently broke the whole dashboard: requests time out, the
// `loading` flags never clear, and every card sits on "Loading…" forever.
//
// window.location.hostname is that same machine by definition — localhost when
// opened locally, the LAN IP when opened from a phone on the network — so the
// base URL re-derives itself instead of needing an edit.
const API_PORT = 8085;

function resolveApiBase() {
  if (process.env.REACT_APP_API_BASE) return process.env.REACT_APP_API_BASE;
  // Opened through the HTTPS call tunnel (phones need HTTPS for the camera):
  // call the API on the same address — the dev server forwards /api (setupProxy.js).
  // A plain http://host:8085 call from an https page would be blocked as mixed content.
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') return '';
  const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'localhost';
  return `http://${host}:${API_PORT}`;
}

export const API_BASE = resolveApiBase();

const KEYS = {
  token:        'nessa.token',
  refreshToken: 'nessa.refreshToken',
  userId:       'nessa.userId',
  role:         'nessa.role',
  profile:      'nessa.profile',
};

// ── Accessors ─────────────────────────────────────────────────────────────────

export const getStoredToken        = () => sessionStorage.getItem(KEYS.token);
export const getStoredRefreshToken = () => sessionStorage.getItem(KEYS.refreshToken);
export const getStoredUserId       = () => sessionStorage.getItem(KEYS.userId);
export const getStoredRole         = () => sessionStorage.getItem(KEYS.role);
export const hasActiveSession      = () => !!getStoredToken();

export function getStoredProfile() {
  const raw = sessionStorage.getItem(KEYS.profile);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// ── Writers ───────────────────────────────────────────────────────────────────

export function storeSession({ token, refreshToken, userId, role, profile } = {}) {
  if (token)        sessionStorage.setItem(KEYS.token,        token);
  if (refreshToken) sessionStorage.setItem(KEYS.refreshToken, refreshToken);
  if (userId)       sessionStorage.setItem(KEYS.userId,       String(userId));
  if (role)         sessionStorage.setItem(KEYS.role,         String(role));
  if (profile)      sessionStorage.setItem(KEYS.profile,      JSON.stringify(profile));
}

export function clearSession() {
  Object.values(KEYS).forEach(k => sessionStorage.removeItem(k));
  // Also clear legacy keys used by existing components
  sessionStorage.removeItem('previousSession');
  sessionStorage.removeItem('sessionId');
  sessionStorage.removeItem('loginTime');
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function attemptTokenRefresh() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) { clearSession(); return null; }
    const data = await res.json();
    sessionStorage.setItem(KEYS.token, data.token);
    if (data.refreshToken) sessionStorage.setItem(KEYS.refreshToken, data.refreshToken);
    return data.token;
  } catch {
    return null;
  }
}

/**
 * Refresh the access token from outside api().
 *
 * The SSE stream cannot go through api() — it needs the raw ReadableStream
 * body, not parsed JSON — so it reads the token itself. Without this it had no
 * way to recover from an expired token: every ordinary request refreshed and
 * carried on, while the stream alone 401'd and reported "the assistant could
 * not be reached". The assistant was reachable; the request was unauthenticated.
 */
export async function refreshAccessToken() {
  return attemptTokenRefresh();
}

// ── Core request helper ───────────────────────────────────────────────────────

export async function api(
  path,
  { method = 'GET', body, authenticated = true, _retry = true } = {},
) {
  const token = authenticated ? getStoredToken() : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && _retry && authenticated) {
    const newToken = await attemptTokenRefresh();
    if (newToken) return api(path, { method, body, authenticated, _retry: false });
    // Refresh failed → the session is dead. Clear it and bounce to login so the
    // user isn't trapped on a dashboard that 401s every request.
    clearSession();
    // Only bounce to login if there WAS a session to expire. Public pages (home,
    // questionnaire, doctor search) load useSystemConfig, which reads an
    // admin-only endpoint — for a logged-out visitor that 401s, and redirecting
    // on it made every public page bounce straight to /login. The caller's
    // `.catch()` cannot prevent this because the redirect fires before the throw.
    if (token && typeof window !== 'undefined' && !/\/login$/.test(window.location.pathname)) {
      window.location.assign('/login');
    }
    throw new Error('Session expired. Please sign in again.');
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return null;

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      msg = err.error || err.message || msg;
    } catch { /* ignore */ }
    // Dev-only visibility: the firestoreShim swallows failures with
    // `.catch(() => [])`, so path/typo mismatches are otherwise silent. Surface
    // every non-2xx in development so they're caught immediately, not in prod.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[api] ${method} ${path} → ${res.status}: ${msg}`);
    }
    throw new Error(msg);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── File upload (R2 presigned flow) ───────────────────────────────────────────
// Mirrors the mobile uploadFile(): create session → PUT bytes → complete.
// Returns the public URL of the stored object (or '' if it can't be resolved).
export async function uploadFile(file, { domain = 'general', fileName, ownerId, withMeta = false } = {}) {
  const owner = ownerId || getStoredUserId();
  const name  = fileName || file?.name || `upload-${Date.now()}`;
  const mime  = file?.type || 'application/octet-stream';
  const session = await api('/api/v1/files/upload-session', {
    method: 'POST',
    body: { ownerId: owner, domain, fileName: name, mimeType: mime, fileSize: file?.size ?? null },
  });
  const uploadUrl = session?.uploadUrl;
  // The byte PUT is best-effort: if the R2 presigned PUT is blocked (e.g. the
  // bucket's CORS isn't configured for this origin) we still finalize the file
  // record so the calling flow (e.g. doctor onboarding) is not aborted by a
  // missing avatar.
  if (uploadUrl) {
    try {
      if (/^https?:\/\//i.test(uploadUrl)) {
        await fetch(uploadUrl, { method: 'PUT', headers: mime ? { 'Content-Type': mime } : {}, body: file });
      } else {
        const token = getStoredToken();
        await fetch(`${API_BASE}${uploadUrl}`, {
          method: 'PUT',
          headers: { ...(mime ? { 'Content-Type': mime } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: file,
        });
      }
    } catch (e) {
      console.warn('[uploadFile] byte upload failed (continuing):', e?.message);
    }
  }
  await api('/api/v1/files/complete', {
    method: 'POST',
    body: { fileId: session?.fileId, publicUrl: session?.publicUrl },
  }).catch(() => {});
  // Local (Postgres) files come back as a relative path → make it absolute so the
  // browser/<img> hits the backend, not the web origin. R2 urls are already absolute.
  const url = session?.publicUrl || '';
  const absolute = url && url.startsWith('/') ? `${API_BASE}${url}` : url;
  // `withMeta` is for callers that need the file id too (document
  // classification works on the stored file). Everyone else keeps the URL.
  return withMeta ? { url: absolute, fileId: session?.fileId } : absolute;
}
