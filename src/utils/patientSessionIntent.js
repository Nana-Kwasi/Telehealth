import { resolveDashboardHub } from './dashboardHub';

/**
 * Resolves which patient product line is active so navbar, redirects, and
 * localStorage do not leak home-care into therapy/couple/teen flows.
 */

export function getStoredUserIntent() {
  return String(localStorage.getItem('userIntent') || '').toLowerCase();
}

export function setUserIntent(intent) {
  if (intent) localStorage.setItem('userIntent', intent);
  else localStorage.removeItem('userIntent');
}

/** Call when starting therapy, teen, couples, or medical — not home care. */
export function beginTherapySession(therapyType = 'therapy') {
  localStorage.removeItem('th.medicalSkip');
  localStorage.removeItem('th.pendingBooking');
  setUserIntent(therapyType === 'couples' ? 'therapy' : therapyType || 'therapy');
}

export function beginHomeCareSession() {
  setUserIntent('homecare');
}

export function beginMedicalSession() {
  setUserIntent('medical');
}

export function clearPatientSessionIntent() {
  localStorage.removeItem('userIntent');
}

/**
 * Effective intent for UI routing — path + profile override stale localStorage.
 */
export function getActivePatientIntent(profile, pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  const path = pathname || '';
  if (path.startsWith('/couple') || profile?.therapyType === 'couples' || localStorage.getItem('th.coupleId')) {
    return 'therapy';
  }
  if (path.startsWith('/teen')) return 'therapy';
  if (path.startsWith('/home-care')) return 'homecare';
  if (path.startsWith('/medical') || path.startsWith('/doctors')) return 'medical';
  const stored = getStoredUserIntent();
  const fromProfile = String(profile?.userIntent || '').toLowerCase();
  return fromProfile || stored || 'therapy';
}

export function isHomeCarePatientIntent(profile, pathname) {
  return getActivePatientIntent(profile, pathname) === 'homecare';
}

export function resolvePatientHub({ profile, pathname }) {
  return (
    resolveDashboardHub({ role: 'client', profile, pathname }) || {
      label: 'Dashboard',
      path: '/dashboard',
    }
  );
}
