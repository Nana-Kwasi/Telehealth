// ─── Live Location ───────────────────────────────────────────────────────────
// Keeps the signed-in user's location current. The browser only captures a
// user's location once (at onboarding), so a user who moves still shows their
// original address. This module re-detects the device location whenever the app
// is opened and publishes it so dashboards always reflect where the user is now.
//
// Storage model (non-destructive):
//  • Universal — every role's auth profile carries `metadata.currentLocation`
//    ({ latitude, longitude, address, updatedAt }) via PATCH /api/v1/auth/users/{uid}.
//    This never overwrites a role's registered/onboarded address.
//  • Native — roles that have their own location record (doctor / home-care nurse
//    / patient) also get that record refreshed so existing dashboards update with
//    no display changes required.
//
// All network writes are best-effort: a denied permission or a failed request
// never throws into the caller and never wipes the last known location.

import {
  api,
  getStoredUserId,
  getStoredRole,
  getStoredProfile,
  storeSession,
  hasActiveSession,
} from './apiClient';
import { getBrowserCoords, reverseGeocodeWeb } from '../utils/homeCareGeo';

// Avoid re-detecting on every render/route change — once per minute is plenty
// for "current on open" semantics.
let _lastRunAt = 0;
const MIN_INTERVAL_MS = 60_000;

export async function refreshCurrentLocation({ force = false } = {}) {
  if (!hasActiveSession()) return null;

  const now = Date.now();
  if (!force && now - _lastRunAt < MIN_INTERVAL_MS) return null;
  _lastRunAt = now;

  const coords = await getBrowserCoords();
  // Permission denied / unavailable → keep the last known location untouched.
  if (!coords) return null;

  const address = await reverseGeocodeWeb(coords.latitude, coords.longitude).catch(() => null);
  const uid = getStoredUserId();
  const role = (getStoredRole() || '').toLowerCase();
  const current = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    address: address || null,
    updatedAt: new Date().toISOString(),
  };

  // 1) Universal store on the auth profile metadata (works for every role).
  try {
    const existingMeta = getStoredProfile()?.metadata || {};
    await api(`/api/v1/auth/users/${uid}`, {
      method: 'PATCH',
      body: { metadataJson: JSON.stringify({ ...existingMeta, currentLocation: current }) },
    });
  } catch { /* best-effort */ }

  // 2) Refresh the role's own location record so its dashboard reflects it.
  try {
    if (role === 'doctor') {
      // Fetch-merge-patch so we don't clobber the rest of metadataJson.
      const prof = await api(`/api/v1/doctors/${uid}`).catch(() => null);
      let meta = {};
      try { meta = prof?.metadataJson ? JSON.parse(prof.metadataJson) : {}; } catch { /* ignore */ }
      meta = {
        ...meta,
        latitude: current.latitude,
        longitude: current.longitude,
        geo: { ...(meta.geo || {}), latitude: current.latitude, longitude: current.longitude },
        currentLocation: current,
      };
      await api(`/api/v1/doctors/${uid}`, {
        method: 'PATCH',
        body: { ...(address ? { location: address } : {}), metadataJson: JSON.stringify(meta) },
      });
    } else if (role === 'homecare_nurse') {
      await api(`/api/v1/homecare/nurses/${uid}/location`, {
        method: 'PATCH',
        body: { latitude: current.latitude, longitude: current.longitude },
      });
    } else if (role === 'client') {
      // PATIENT/CLIENT both normalise to 'client' on web. The patient profile
      // PATCH merges loose location fields into its metadata; for a pure therapy
      // client with no patient row this simply no-ops server-side.
      await api(`/api/v1/patients/${uid}`, {
        method: 'PATCH',
        body: { ...(address ? { location: address } : {}), latitude: current.latitude, longitude: current.longitude },
      }).catch(() => {});
    }
  } catch { /* best-effort */ }

  // 3) Reflect the new location in the in-memory session profile immediately so
  //    the current screen can render it without waiting for the next resolveRole.
  try {
    const prof = getStoredProfile() || {};
    storeSession({
      profile: {
        ...prof,
        ...(address ? { location: address } : {}),
        latitude: current.latitude,
        longitude: current.longitude,
        currentLocation: current,
        metadata: { ...(prof.metadata || {}), currentLocation: current },
      },
    });
  } catch { /* ignore */ }

  return current;
}
