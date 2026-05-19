import { beginHomeCareSession, isHomeCarePatientIntent as isHomeCareIntent } from './patientSessionIntent';

/** Whether the session should use the home-care patient hub (not therapy dashboard). */
export function isHomeCarePatientIntent(profile, pathname) {
  return isHomeCareIntent(profile, pathname);
}

export function ensureHomeCareIntent() {
  beginHomeCareSession();
}

export function homeCarePatientLandingPath() {
  return '/home-care';
}
