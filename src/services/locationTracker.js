// ─── Live location tracker (web) ─────────────────────────────────────────────
//
// The previous code used one-shot `navigator.geolocation.getCurrentPosition()`
// with `{ timeout: 8000, maximumAge: 60000 }`. `maximumAge: 60000` explicitly tells
// the browser "a fix up to 60s old is fine", so a user who had just moved kept
// getting the position from before they moved. `enableHighAccuracy` was also absent
// (defaults to false), so the browser was free to answer from wifi/IP rather than
// GPS. And because it was a one-shot call, nothing updated as the user travelled.
//
// This module keeps a single watchPosition subscription, never accepts a cached
// fix, and only reports positions that represent real movement or a real accuracy
// improvement.

export const DISTANCE_THRESHOLD_M = 30;   // "significant movement" (20–50m band)
const ACCURACY_IMPROVE_FACTOR = 0.5;      // 2x tighter counts as an improvement
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

// maximumAge: 0 is the fix for the stale-location bug — it forbids the browser from
// answering with a cached position.
export const GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30_000,
};

export function metresBetween(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Only real movement or a real accuracy gain is worth a backend call. */
export function shouldSend(prev, next, threshold = DISTANCE_THRESHOLD_M) {
  if (!next) return false;
  if (!prev) return true;
  const moved = metresBetween(prev, next);
  if ((next.latitude !== prev.latitude || next.longitude !== prev.longitude) && moved >= threshold) {
    return true;
  }
  if (
    Number.isFinite(next.accuracy) && Number.isFinite(prev.accuracy)
    && next.accuracy <= prev.accuracy * ACCURACY_IMPROVE_FACTOR
  ) return true;
  return false;
}

function logFix(coords, timestamp, reason) {
  if (process.env.NODE_ENV === 'production') return;
  console.log('[locationTracker]', {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    speed: coords.speed ?? null,
    heading: coords.heading ?? null,
    timestamp: new Date(timestamp).toISOString(),
    ageMs: Date.now() - timestamp,
    // With maximumAge:0 this should always be fresh; if it isn't, the browser or OS
    // is serving a stale fix and that is worth seeing in the log.
    source: Date.now() - timestamp > 5_000 ? 'cached' : 'fresh-gps',
    reason,
  });
}

/**
 * Creates an isolated tracker. Each caller gets its own instance with its own watch
 * id, so a component unmounting can clean up exactly what it started — this is what
 * prevents the duplicate-subscription problem.
 */
export function createLocationTracker({ onFix, onError, threshold = DISTANCE_THRESHOLD_M } = {}) {
  let watchId = null;
  let lastSent = null;
  let retryTimer = null;
  let attempt = 0;
  let stopped = false;

  const clearRetry = () => { clearTimeout(retryTimer); retryTimer = null; };

  function stop() {
    stopped = true;
    clearRetry();
    if (watchId !== null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(watchId);   // release the OS subscription
      watchId = null;
    }
  }

  function scheduleRetry(reason) {
    clearRetry();
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    attempt += 1;
    retryTimer = setTimeout(() => { if (!stopped) start(); }, delay);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[locationTracker] retry in ${delay}ms (${reason})`);
    }
  }

  function handle(pos) {
    attempt = 0;                                   // good fix resets backoff
    const { coords, timestamp } = pos;
    const next = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? null,
      speed: coords.speed ?? null,
      heading: coords.heading ?? null,
      // Device fix time, so the backend can reject out-of-order updates.
      gpsTimestamp: new Date(timestamp).toISOString(),
    };
    const send = shouldSend(lastSent, next, threshold);
    logFix(coords, timestamp, send ? 'sending' : 'skipped (no significant change)');
    if (!send) return;
    lastSent = next;
    try { onFix?.(next); } catch { /* consumer errors must not kill the watch */ }
  }

  function handleError(err) {
    // 1 PERMISSION_DENIED · 2 POSITION_UNAVAILABLE · 3 TIMEOUT
    const reason = err?.code === 1 ? 'permission-denied'
      : err?.code === 2 ? 'position-unavailable'
      : err?.code === 3 ? 'timeout' : 'unknown';
    try { onError?.({ code: err?.code, reason, message: err?.message }); } catch { /* ignore */ }
    // A denial won't fix itself by retrying; the visibility listener re-starts once
    // the user grants it. Transient GPS failures do retry, with backoff.
    if (err?.code !== 1) scheduleRetry(reason);
  }

  function start() {
    stopped = false;
    if (!navigator?.geolocation) {
      onError?.({ code: null, reason: 'unsupported', message: 'Geolocation unavailable' });
      return false;
    }
    // Drop any previous watch first — restarting without this is how duplicate
    // subscriptions accumulate on re-render.
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    watchId = navigator.geolocation.watchPosition(handle, handleError, GEO_OPTIONS);
    return true;
  }

  /**
   * Re-start when the tab becomes visible or the network changes. Browsers suspend
   * watches in background tabs, and a network change can switch the underlying
   * position provider, leaving the watch alive but never firing again.
   */
  function attachLifecycle() {
    const onVisible = () => { if (document.visibilityState === 'visible') start(); };
    window.addEventListener('online', start);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', start);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }

  return { start, stop, attachLifecycle, reset: () => { lastSent = null; } };
}

/** Current permission state without prompting, where the browser supports it. */
export async function getPermissionState() {
  if (!navigator?.geolocation) return 'unsupported';
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const s = await navigator.permissions.query({ name: 'geolocation' });
    return s.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown';
  }
}
