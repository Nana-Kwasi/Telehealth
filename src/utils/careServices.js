/**
 * One patient account covers both medical care and therapy.
 *
 * resolve-role reports `profile.services` (the ones this account uses) and
 * `profile.userIntent` (the one used most recently). Which dashboard opens:
 *   1. a flow the person is in the middle of (therapy questionnaire, doctor booking)
 *      — that flow calls chooseService() before landing on /dashboard;
 *   2. otherwise the service they last switched to on this device;
 *   3. otherwise the server's most-recently-used service.
 * The dashboard sidebar's switch (ServiceSwitcher) changes it at any time.
 */

const KEY = (uid) => `nessa.activeService.${uid}`;
export const CARE_SERVICES = ['medical', 'therapy'];

export function getChosenService(uid) {
  if (!uid) return null;
  try { return localStorage.getItem(KEY(uid)); } catch { return null; }
}

export function chooseService(uid, service) {
  if (!uid || !CARE_SERVICES.includes(service)) return;
  try { localStorage.setItem(KEY(uid), service); } catch { /* storage unavailable */ }
}

/** Services this account uses; an older backend without `services` reports one. */
export function accountServices(profile) {
  if (Array.isArray(profile?.services) && profile.services.length) return profile.services;
  const intent = String(profile?.userIntent || '').toLowerCase();
  return CARE_SERVICES.includes(intent) ? [intent] : [];
}

/**
 * Applied to every resolved client profile: the device's choice wins over the
 * server's default, but only for a service the account actually has — or one a
 * flow just started (the backend has no record of it yet).
 */
export function applyChosenService(profile, uid) {
  if (!profile) return profile;
  const chosen = getChosenService(uid || profile.id || profile.uid);
  if (!chosen || String(profile.userIntent || '').toLowerCase() === 'homecare') return profile;
  const services = accountServices(profile);
  return {
    ...profile,
    services: services.includes(chosen) ? services : [...services, chosen],
    userIntent: chosen,
  };
}

// Set while SignUp is finishing a journey for an existing or just-created
// account, so the public /signup route does not bounce the now-signed-in
// person to the dashboard before their intake or booking is saved.
const CONTINUING = 'nessa.continuingJourney';
export function markContinuingJourney(on) {
  try {
    if (on) sessionStorage.setItem(CONTINUING, '1');
    else sessionStorage.removeItem(CONTINUING);
  } catch { /* storage unavailable */ }
}
export function isContinuingJourney() {
  try { return sessionStorage.getItem(CONTINUING) === '1'; } catch { return false; }
}
