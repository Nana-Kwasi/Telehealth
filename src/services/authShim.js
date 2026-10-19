// ─── firebase/auth REST Shim ─────────────────────────────────────────────────
// Drop-in replacement for the firebase/auth named exports the web components use:
//   onAuthStateChanged, signOut, getAuth, signInWithEmailAndPassword,
//   createUserWithEmailAndPassword, updatePassword, updateEmail,
//   reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail
//
// Components keep their exact call patterns; the data flows through the Spring
// Boot backend (via apiClient + authService) instead of Firebase.
//
// Usage: change the import source only, e.g.
//   import { onAuthStateChanged, signOut } from '../../services/authShim';

import {
  api,
  getStoredUserId,
  getStoredProfile,
  getStoredRole,
} from './apiClient';
import {
  onAuthStateChanged as _onAuthStateChanged,
  performLogout,
  signInWithEmailOrUsername,
  completeRegistrationSession,
} from '../component/Auth/authService';

// ── Synthetic `auth` instance with a Firebase-shaped currentUser ──────────────
// Components read auth.currentUser.{uid,email,displayName,emailVerified}. We
// derive those from the stored session/profile.

function buildCurrentUser() {
  const uid = getStoredUserId();
  if (!uid) return null;
  const profile = getStoredProfile() || {};
  return {
    uid,
    email: profile.email || null,
    displayName: profile.fullName || profile.name || profile.displayName || null,
    emailVerified: profile.emailVerified ?? true,
    photoURL: profile.photoURL || profile.avatarUrl || null,
    role: getStoredRole() || profile.role || null,
    // Methods some components call directly on the user object:
    async getIdToken() { return sessionStorage.getItem('nessa.token'); },
    async reload() { /* no-op: session is already current */ },
  };
}

export const auth = {
  _isShim: true,
  get currentUser() { return buildCurrentUser(); },
  // Firebase v8 method style: auth.onAuthStateChanged(cb). Several screens still
  // call it that way (the client Messages screen, coupleTherapyService) rather
  // than the v9 onAuthStateChanged(auth, cb) function. Without it the call threw
  // "auth.onAuthStateChanged is not a function" and took the whole screen down —
  // which is why the client's Messages page rendered a runtime-error overlay
  // instead of the conversation.
  onAuthStateChanged(cb) { return _onAuthStateChanged(cb); },
};

// A "secondary" auth instance — used by admin onboarding flows that, in Firebase,
// created accounts on a secondary app so the admin's own session was untouched.
export const secondaryAuth = { _isShim: true, _secondary: true, get currentUser() { return null; } };

export function getAuth(appArg) {
  // getAuth(secondaryApp) → secondary; getAuth() / getAuth(defaultApp) → primary.
  if (appArg && appArg._secondary) return secondaryAuth;
  return auth;
}

// ── Auth-state observer ───────────────────────────────────────────────────────
export const onAuthStateChanged = _onAuthStateChanged;

// ── Sign out ──────────────────────────────────────────────────────────────────
// Secondary-app sign-out (admin onboarding creates an account on a secondary app
// then "signs it out") must NOT clear the admin's session — that account never
// became the active session. Only a primary-app signOut performs a real logout.
export async function signOut(authArg) {
  if (authArg && authArg._secondary) return;
  return performLogout();
}

// ── Sign in ───────────────────────────────────────────────────────────────────
export async function signInWithEmailAndPassword(_authArg, email, password) {
  const { role, profile } = await signInWithEmailOrUsername(email, password);
  return { user: buildCurrentUser() || { uid: getStoredUserId(), email, role, ...profile } };
}

// ── Register ──────────────────────────────────────────────────────────────────
// Mirrors createUserWithEmailAndPassword(authArg, email, password) and replicates
// Firebase's primary-vs-secondary-app behaviour:
//   • primary auth (self sign-up): the new account becomes the active session.
//   • secondary auth (admin onboarding): session-neutral — the admin stays signed in.
export async function createUserWithEmailAndPassword(authArg, email, password, displayName, role, phone) {
  // The backend register requires fullName + role; Firebase's signature doesn't
  // carry them, so send sensible defaults. Admin staff-onboarding promotes the
  // role afterwards (firestoreShim does this when the staff profile is written).
  //
  // `displayName` is a shim-only 4th argument (Firebase ignores extra args, so
  // this stays call-compatible). Sign-up screens collect a Full name — without
  // passing it through, every self-registered account was stored as the email's
  // local-part ("amina.osei.qa" instead of "Amina Osei") and every screen that
  // reads users.full_name showed that instead of the name the user typed.
  const fullName =
    (typeof displayName === 'string' && displayName.trim())
      || String(email || '').split('@')[0]
      || 'New User';
  // `role` is a shim-only 5th argument. The backend derives the account's intent
  // from it (PATIENT → medical, CLIENT → therapy) and resolve-role reports that
  // back, so a medical booking signed up as CLIENT landed on the therapy
  // dashboard instead of the medical one. Mobile already picks the role this way.
  const regRole = typeof role === 'string' && role.trim() ? role.trim().toUpperCase() : 'CLIENT';
  const data = await api('/api/v1/auth/register', {
    method: 'POST',
    // Admin onboarding (secondary app) sends the admin's sign-in, so it still works
    // while public sign-ups are paused in System Config.
    authenticated: !!(authArg && authArg._secondary),
    // Phone is captured on the signup forms; without sending it here the users
    // row had none and the admin user-detail screen showed an empty Phone for
    // every account.
    body: { email, password, fullName, role: regRole, ...(phone ? { phone } : {}) },
  });
  const uid = data?.userId || data?.user?.uid || data?.id;
  if (!authArg || !authArg._secondary) {
    // Primary app → establish the session for the newly-created user.
    try { await completeRegistrationSession(data); } catch { /* best-effort */ }
  }
  return { user: { uid, email } };
}

// ── Firebase app bootstrap stubs (firebase/app) ───────────────────────────────
// initializeApp(config, name) returns an app marked secondary when a non-default
// name is supplied (that's how onboarding flows isolated account creation).
export function initializeApp(_config, name) {
  return { _isShim: true, name: name || '[DEFAULT]', _secondary: !!name && name !== '[DEFAULT]' };
}
export function getApps() { return []; }
export function getApp() { return { _isShim: true, name: '[DEFAULT]' }; }

// ── Re-authentication credential plumbing ─────────────────────────────────────
// In Firebase the flow is: cred = EmailAuthProvider.credential(email, pw) →
// reauthenticateWithCredential(user, cred) → updatePassword/updateEmail(user, x).
// The backend password/email-change endpoints require the current password, so
// we stash it from the credential and replay it on the change call.
let _stashedCurrentPassword = null;

export const EmailAuthProvider = {
  credential(email, password) {
    return { _type: 'emailCredential', email, password };
  },
};

export async function reauthenticateWithCredential(_user, credential) {
  _stashedCurrentPassword = credential?.password || null;
  // Validation happens server-side on the subsequent change call.
  return { user: buildCurrentUser() };
}

// ── Update password ───────────────────────────────────────────────────────────
export async function updatePassword(user, newPassword) {
  const userId = user?.uid || getStoredUserId();
  const res = await api('/api/v1/auth/password-change', {
    method: 'POST',
    body: { userId, currentPassword: _stashedCurrentPassword, newPassword },
  });
  _stashedCurrentPassword = null;
  return res;
}

// ── Update email ──────────────────────────────────────────────────────────────
export async function updateEmail(user, newEmail) {
  const userId = user?.uid || getStoredUserId();
  const res = await api('/api/v1/auth/email-change', {
    method: 'POST',
    body: { userId, newEmail, currentPassword: _stashedCurrentPassword },
  });
  _stashedCurrentPassword = null;
  return res;
}

// ── Check existing sign-in methods for an email ───────────────────────────────
// Firebase returned the list of providers for an email (used to detect "already
// registered"). We resolve it from the backend find-user lookup: a hit means a
// password account exists.
export async function fetchSignInMethodsForEmail(_authArg, email) {
  try {
    const found = await api(
      `/api/v1/auth/mobile/find-user?identifier=${encodeURIComponent(email)}`,
      { authenticated: false },
    );
    return found && (found.id || found.email) ? ['password'] : [];
  } catch {
    return [];
  }
}

// ── Email verification ────────────────────────────────────────────────────────
// Email verification is managed server-side. This used to be a no-op that
// reported "sent" without sending anything; it now asks the server to email a
// fresh confirmation link to the signed-in account.
export async function sendEmailVerification(_user) {
  return api('/api/v1/auth/verify-email/resend', { method: 'POST' });
}

// ── Verify-before-update email ────────────────────────────────────────────────
// Firebase sent a confirmation link before applying a new email. The backend
// applies the change directly (validating the current password the component
// stashed via reauthenticateWithCredential), so this mirrors updateEmail.
export async function verifyBeforeUpdateEmail(user, newEmail) {
  return updateEmail(user, newEmail);
}

// ── Password reset ────────────────────────────────────────────────────────────
export async function sendPasswordResetEmail(_authArg, email) {
  return api('/api/v1/auth/password-reset', {
    method: 'POST',
    authenticated: false,
    body: { email },
  });
}

// ── Account deletion (some Settings screens call deleteUser) ──────────────────
export async function deleteUser(user) {
  const password = _stashedCurrentPassword;
  _stashedCurrentPassword = null;
  return api('/api/v1/auth/account/delete', { method: 'POST', body: { password } });
}
