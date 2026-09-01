// ─── Location updates, broadcast in-page ─────────────────────────────────────
// `profile` is resolved once at login in App.js and handed down as a prop, so a
// location saved in Settings (or captured silently by the dashboard location
// gate) did not reach the card on dashboard home until the next sign-in — the
// patient saw their old city sitting there after explicitly changing it.
//
// This is a one-line publish at every save site and a subscribe wherever the
// location is displayed. It deliberately does NOT re-fetch the profile: the
// saving screen already holds the new values, and a refetch would race the
// PATCH it just issued.

const EVENT = 'nessa:location-updated';
const PROFILE_KEY = 'nessa.profile';

/** Fields that make up a location, in the shapes the profile carries them. */
function locationPatch(source = {}) {
  const {
    country, city, area, region, street,
    ghanaDigitalAddress, address, formattedAddress,
    latitude, longitude,
  } = source;
  const patch = {
    country, city, area, region, street,
    ghanaDigitalAddress, address, formattedAddress,
    latitude, longitude,
  };
  // Drop keys the caller did not supply so a partial save cannot blank a field
  // the profile already knows.
  Object.keys(patch).forEach((k) => {
    if (patch[k] === undefined) delete patch[k];
  });
  patch.locationMeta = { ...patch };
  return patch;
}

/**
 * Announce that the signed-in user's location changed. Also folds the patch into
 * the stored profile so a full page reload keeps the new value instead of
 * reverting to what login resolved.
 */
export function publishLocationUpdate(source) {
  const patch = locationPatch(source);
  try {
    const stored = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || '{}');
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify({
      ...stored,
      ...patch,
      locationMeta: { ...(stored.locationMeta || {}), ...patch.locationMeta },
    }));
  } catch { /* storage full or disabled — the live event below still fires */ }

  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: patch }));
  } catch { /* older browsers without CustomEvent — nothing to refresh */ }
}

/** Run `handler(patch)` on every location save. Returns an unsubscribe fn. */
export function subscribeLocationUpdate(handler) {
  const listener = (e) => handler(e.detail || {});
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Merge a published patch onto a profile, keeping existing values elsewhere. */
export function applyLocationPatch(profile, patch) {
  if (!patch) return profile;
  return {
    ...(profile || {}),
    ...patch,
    locationMeta: { ...(profile?.locationMeta || {}), ...(patch.locationMeta || {}) },
  };
}
