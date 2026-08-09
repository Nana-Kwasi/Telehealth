// ─── NessaHub Web — Auth Service (REST) ──────────────────────────────────────
// Replaces the Firebase auth + Firestore role-resolution layer with calls to
// the Spring Boot backend.  All exported function signatures are identical to
// the previous Firebase version so no component needs to change its imports.

import {
  api,
  API_BASE,
  storeSession,
  clearSession,
  getStoredToken,
  getStoredRefreshToken,
  getStoredUserId,
  getStoredProfile,
  hasActiveSession,
} from '../../services/apiClient';

// ── Internal auth-state observer (mimics Firebase onAuthStateChanged) ─────────

let _authListeners = [];

/**
 * Synthetic "user" object, matching the parts of the Firebase shape screens use.
 *
 * Mostly that is `.uid`, but the video screen also calls `getIdToken()` to
 * re-check the session before joining a call. That method did not exist here, so
 * the call threw and the screen reported it as "Authentication token is invalid.
 * Please log in again." The REST session token stands in for the ID token.
 */
function _makeAuthUser(user) {
  const uid = typeof user === 'string' ? user : user?.uid;
  if (!uid) return null;
  return {
    ...(typeof user === 'object' ? user : {}),
    uid,
    getIdToken: async () => {
      const token = sessionStorage.getItem('nessa.token');
      if (!token) throw new Error('No active session');
      return token;
    },
  };
}

let _authUser = _makeAuthUser(sessionStorage.getItem('nessa.userId'));

function _setAuthUser(user) {
  _authUser = _makeAuthUser(user);
  _authListeners.forEach(cb => cb(_authUser));
}

/**
 * Re-resolve the current user's role/profile and push it to all observers
 * (App.js → session state). Call after a profile edit so dashboards reflect the
 * change without a full page reload.
 */
export function refreshSession() {
  const uid = getStoredUserId();
  if (uid) _setAuthUser({ uid });
}

/**
 * Drop-in for firebase/auth's onAuthStateChanged.
 * Accepts both forms: onAuthStateChanged(callback) and
 * onAuthStateChanged(authObj, callback) so App.js doesn't need to change.
 */
export function onAuthStateChanged(authOrCallback, maybeCallback) {
  const cb = typeof authOrCallback === 'function' ? authOrCallback : maybeCallback;
  _authListeners.push(cb);
  // Immediately fire with current state (mirrors Firebase behaviour)
  cb(_authUser);
  return () => {
    _authListeners = _authListeners.filter(l => l !== cb);
  };
}

// ── Role normalisation ────────────────────────────────────────────────────────
// The backend returns Java enum-flavoured strings for some roles;
// normalise them to the strings the web components expect.

function normaliseRole(raw) {
  if (!raw) return raw;
  const map = {
    home_care_nurse: 'homecare_nurse', // backend uses underscore, web uses camel
    homecare_nurse:  'homecare_nurse',
    client:          'client',
    patient:         'client',         // PATIENT role treated as client on web
    CLIENT:          'client',
    PATIENT:         'client',
  };
  return map[raw] ?? raw.toLowerCase();
}

// ── resolveRole ───────────────────────────────────────────────────────────────
// Called by App.js after onAuthStateChanged fires with a user object.

export async function resolveRole(uid) {
  try {
    const data = await api(`/api/v1/auth/mobile/resolve-role/${uid}`, {
      authenticated: hasActiveSession(), // use token if available, else public
    });
    if (!data || data.role === 'guest') return { role: 'guest', profile: null };

    const role    = normaliseRole(data.role);
    // `uid` is the Firebase-era identifier a lot of shared components still read
    // (VideoCall does `user.uid` throughout). resolve-role only returns `id`, so
    // without this alias those screens saw `undefined` and silently rendered
    // empty — the therapist Video Call page showed "No clients assigned yet" and
    // "No scheduled calls yet" even with an assigned client and a booked call.
    const rawProfile = data.profile || {};
    const profile = { ...rawProfile, role, uid: rawProfile.uid || rawProfile.id || uid };

    // Account status check — mirror the Firebase version's blocked-status logic
    const blockedStatuses = ['inactive', 'discharged', 'on_hold', 'suspended', 'disabled'];
    if (blockedStatuses.includes(String(profile.status || '').toLowerCase())) {
      const status = String(profile.status).toLowerCase();
      const msgs = {
        inactive:   'Your account has been deactivated. Please contact support for assistance.',
        discharged: 'Your account has been discharged. Please contact support for assistance.',
        on_hold:    'Your account is currently on hold. Please contact support for assistance.',
      };
      throw new Error(msgs[status] || 'Your account is not active. Please contact support for assistance.');
    }

    // Persist refreshed profile so session restore is always up-to-date
    storeSession({ role, profile });
    return { role, profile };
  } catch (err) {
    if (err.message?.includes('not active') || err.message?.includes('deactivated') ||
        err.message?.includes('discharged') || err.message?.includes('on hold')) {
      throw err;
    }
    console.warn('resolveRole failed, falling back to stored session:', err?.message);
    // Fall back to what's in sessionStorage so a network blip doesn't log out the user
    const profile = getStoredProfile();
    const role    = profile?.role || null;
    return { role, profile };
  }
}

// ── findUserByUsernameOrEmail ─────────────────────────────────────────────────

export async function findUserByUsernameOrEmail(identifier) {
  try {
    const res = await api(
      `/api/v1/auth/mobile/find-user?identifier=${encodeURIComponent(identifier)}`,
      { authenticated: false },
    );
    // Backend returns { id, email, source }
    return res ? { id: res.id, email: res.email } : null;
  } catch {
    return null;
  }
}

// ── signInWithEmailOrUsername ─────────────────────────────────────────────────
// Main login entry point — called by Login.js.

export async function signInWithEmailOrUsername(identifier, password) {
  const looksLikeEmail = /@/.test(identifier.trim());
  let email = looksLikeEmail ? identifier.trim() : null;

  // Username path: resolve to email first
  if (!email) {
    const found = await findUserByUsernameOrEmail(identifier.trim());
    if (!found?.email) {
      _logLoginActivity({ identifier, success: false, errorMessage: 'User not found' });
      throw new Error('User not found');
    }
    email = found.email;
  }

  // Authenticate
  let loginData;
  try {
    loginData = await api('/api/v1/auth/login', {
      method:        'POST',
      authenticated: false,
      body:          { email, password },
    });
  } catch (err) {
    _logLoginActivity({ identifier, success: false, errorMessage: err.message });
    throw err;
  }

  const { token, refreshToken, userId, role: rawRole } = loginData;

  // Persist tokens immediately so resolveRole's api() call is authenticated
  storeSession({ token, refreshToken, userId });

  // Resolve full role + profile
  let roleResult;
  try {
    roleResult = await resolveRole(userId);
  } catch (err) {
    // Blocked account — clear partial session and re-throw
    clearSession();
    _logLoginActivity({ userId, role: rawRole, success: false, errorMessage: err.message });
    throw err;
  }

  const { role, profile } = roleResult;

  // Persist complete session
  storeSession({ role, profile });
  sessionStorage.setItem(
    'previousSession',
    JSON.stringify({ userId, role, profile }),
  );

  // Notify observers — App.js will react and set the session state
  _setAuthUser({ uid: userId });

  // Best-effort login activity log
  _logLoginActivity({ userId, role, success: true });

  return { role, profile };
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logUserLogout(userId, userRole, profile) {
  const sessionId  = sessionStorage.getItem('sessionId');
  const loginTime  = sessionStorage.getItem('loginTime');
  if (!sessionId) return;
  const payload = {
    userId:      userId || getStoredUserId(),
    userRole:    userRole || null,
    profile:     profile || null,
    logoutTime:  new Date().toISOString(),
    loginTime:   loginTime || null,
    logoutSource: 'web_app',
    deviceInfo: {
      userAgent: navigator.userAgent,
      platform:  navigator.platform,
      url:       window.location.href,
    },
  };
  api('/api/v1/auth/mobile/logout-logs', {
    method:        'POST',
    authenticated: false,
    body:          payload,
  }).catch(() => {});
}

export async function performLogout({ userId, role, profile } = {}) {
  const uid = userId || getStoredUserId();

  // Log the logout event (best-effort)
  if (uid) {
    await logUserLogout(uid, role, profile).catch(() => {});
  }

  // Revoke tokens on the backend (best-effort — don't block the UX)
  const token        = getStoredToken();
  const refreshToken = getStoredRefreshToken();
  api('/api/v1/auth/logout', {
    method:        'POST',
    authenticated: false,
    body:          { refreshToken },
  }).catch(() => {});

  // Clear couple session if present
  try {
    const { clearCoupleLocalSession } = await import('../../services/coupleTherapyService');
    clearCoupleLocalSession();
  } catch { /* ignore */ }

  clearSession();
  _setAuthUser(null);
}

// ── Post-registration session setup ──────────────────────────────────────────
// Called by SignUp.js after a successful /auth/register call so the app
// enters an authenticated state without requiring a second login round-trip.

export async function completeRegistrationSession(loginData) {
  const { token, refreshToken, userId } = loginData;
  storeSession({ token, refreshToken, userId });
  try {
    const { role, profile } = await resolveRole(userId);
    storeSession({ role, profile });
    sessionStorage.setItem('previousSession', JSON.stringify({ userId, role, profile }));
    _setAuthUser({ uid: userId });
    return { role, profile };
  } catch {
    _setAuthUser({ uid: userId });
    return { role: 'client', profile: { id: userId, role: 'client' } };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _logLoginActivity({ userId, role, success, errorMessage, identifier } = {}) {
  const sessionId = sessionStorage.getItem('sessionId') ||
    `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  if (!sessionStorage.getItem('sessionId')) sessionStorage.setItem('sessionId', sessionId);
  if (success) sessionStorage.setItem('loginTime', new Date().toISOString());

  const payload = {
    userId:      userId || null,
    userRole:    role   || null,
    success:     !!success,
    errorMessage: errorMessage || null,
    loginTime:   new Date().toISOString(),
    loginSource: 'web_app',
    deviceInfo: {
      userAgent:        navigator.userAgent,
      platform:         navigator.platform,
      language:         navigator.language,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
      url:              window.location.href,
      sessionId,
    },
  };

  // Fire-and-forget — never block login on analytics
  api('/api/v1/auth/mobile/login-logs', {
    method:        'POST',
    authenticated: false,
    body:          payload,
  }).catch(() => {});
}
